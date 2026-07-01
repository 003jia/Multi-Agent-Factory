import { randomUUID } from "node:crypto";
import type {
  ApplyRecord,
  Assignment,
  CostTier,
  GeneratedArtifact,
  ModelTier,
  PatchSet,
  ProjectWorkspace,
  QualityTier,
  ReviewFinding,
  Subagent,
  Task,
  WorkItem
} from "../src/types.js";
import { FactoryRepository } from "./db.js";
import {
  assignWorkItems,
  buildCanvasGraph,
} from "./mockAgents.js";
import { chooseModelTier } from "./modelRouter.js";
import type { AgentEngine } from "./agents/engine.js";
import { listProjectContextFiles, scanProjectWorkspace } from "./projectWorkspace.js";
import {
  applyPatchSetToProject,
  createPatchSetFromArtifact,
  verifyPatchSetInSandbox
} from "./runtime/projectPatch.js";
import { AppError } from "./errors.js";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 10)}`;

export class WorkflowService {
  private taskLocks = new Set<string>();

  constructor(private repo: FactoryRepository, private engine: AgentEngine) {}

  setEngine(engine: AgentEngine) {
    this.engine = engine;
  }

  snapshot(taskId?: string) {
    return this.repo.snapshot(taskId);
  }

  scanProject(rootPath: string): ProjectWorkspace {
    return this.repo.upsertProject(scanProjectWorkspace(rootPath));
  }

  projectContext(projectId: string) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new AppError("NOT_FOUND", "项目不存在", 404);
    return {
      project,
      files: listProjectContextFiles(project.rootPath)
    };
  }

  async createTask(input: { title: string; prompt: string; complexity: number; projectId?: string | null; selectedFiles?: string[]; constraints?: string }) {
    const timestamp = now();
    const project = this.repo.getProject(input.projectId);
    const task: Task = {
      id: id("task"),
      projectId: project?.id ?? null,
      title: input.title.trim(),
      prompt: input.prompt.trim(),
      selectedFiles: sanitizeList(input.selectedFiles),
      constraints: input.constraints?.trim() ?? "",
      complexity: clamp(input.complexity, 1, 10),
      stage: "requirements_review",
      validationState: "pending",
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.repo.createTask(task);
    this.repo.saveRequirements({
      id: id("doc"),
      taskId: task.id,
      kind: "requirements",
      content: await this.engine.generateRequirements(task),
      feedback: "",
      confirmed: false,
      createdAt: timestamp
    });
    return this.repo.getBundle(task.id);
  }

  async updateRequirements(taskId: string, content: string, feedback: string) {
    const task = this.requireTask(taskId);
    if (task.stage !== "requirements_review") throw new AppError("INVALID_STAGE", "当前阶段不能修改需求文档", 409);
    if (feedback.trim()) {
      this.repo.saveRequirements({
        id: id("doc"),
        taskId,
        kind: "requirements",
        content: await this.engine.regenerateRequirements(task, feedback, content),
        feedback,
        confirmed: false,
        createdAt: now()
      });
    } else {
      this.repo.updateRequirements(taskId, content, feedback, false);
    }
    this.repo.updateTaskStage(taskId, "requirements_review", feedback ? "running" : "pending");
    return this.repo.getBundle(taskId);
  }

  async confirmRequirements(taskId: string, content: string, feedback = "") {
    const task = this.requireTask(taskId);
    if (task.stage !== "requirements_review") throw new AppError("INVALID_STAGE", "需求只能在需求确认阶段确认", 409);
    this.repo.updateRequirements(taskId, content, feedback, true);
    const refreshed = this.requireTask(taskId);
    this.repo.savePlan({
      id: id("plan"),
      taskId,
      content: await this.engine.generatePlan(refreshed, content),
      feedback: "",
      confirmed: false,
      createdAt: now()
    });
    this.repo.updateTaskStage(taskId, "plan_review", "pending");
    return this.repo.getBundle(taskId);
  }

  async updatePlan(taskId: string, content: string, feedback: string) {
    const task = this.requireTask(taskId);
    if (task.stage !== "plan_review") throw new AppError("INVALID_STAGE", "当前阶段不能修改任务计划", 409);
    if (feedback.trim()) {
      this.repo.savePlan({
        id: id("plan"),
        taskId,
        content: await this.engine.regeneratePlan(task, feedback, content),
        feedback,
        confirmed: false,
        createdAt: now()
      });
    } else {
      this.repo.updatePlan(taskId, content, feedback, false);
    }
    this.repo.updateTaskStage(taskId, "plan_review", feedback ? "running" : "pending");
    return this.repo.getBundle(taskId);
  }

  async confirmPlan(taskId: string, content: string, feedback = "") {
    const task = this.requireTask(taskId);
    if (task.stage !== "plan_review") throw new AppError("INVALID_STAGE", "计划只能在计划确认阶段确认", 409);
    this.repo.updatePlan(taskId, content, feedback, true);
    const items = await this.engine.splitWorkItems(task, content);
    const subagents = this.repo.listSubagents();
    const assignments = assignWorkItems(task, items, subagents);
    const assignedItems = items.map((item) => {
      const assignment = assignments.find((candidate) => candidate.workItemId === item.id);
      return {
        ...item,
        targetFiles: item.targetFiles ?? inferTargetFiles(task, item),
        dependencies: item.dependencies ?? [],
        acceptanceChecks: item.acceptanceChecks?.length ? item.acceptanceChecks : ["静态校验通过", "无开放 error finding"],
        riskLevel: item.riskLevel ?? riskFor(item.complexity),
        verificationCommands: verificationCommandsFor(this.repo.getProject(task.projectId), item.verificationCommands),
        status: "assigned" as const,
        assignedSubagentId: assignment?.subagentId ?? null
      };
    });
    this.repo.saveWorkItems(assignedItems);
    this.repo.saveAssignments(assignments);
    this.repo.updateTaskStage(taskId, "assignment", "pending");
    return this.repo.getBundle(taskId);
  }

  updateAssignment(workItemId: string, subagentId: string, modelTier?: ModelTier) {
    const subagent = this.repo.getSubagent(subagentId);
    if (!subagent || !subagent.enabled) throw new AppError("VALIDATION_ERROR", "目标 subagent 不存在或未启用", 400);
    const task = this.findTaskByWorkItem(workItemId);
    const workItem = this.repo.listWorkItems(task.id).find((item) => item.id === workItemId);
    if (!workItem) throw new AppError("NOT_FOUND", "work item 不存在", 404);
    const route = chooseModelTier({
      stage: "generation",
      complexity: workItem.complexity,
      subagent,
      manualModelTier: modelTier ?? null
    });
    const assignment: Assignment = {
      id: id("assign"),
      taskId: task.id,
      workItemId,
      subagentId,
      modelTier: route.modelTier,
      strategyReason: `${route.reason}；用户手动调整分派`,
      manualOverride: true,
      createdAt: now()
    };
    this.repo.setWorkItemAssignment(workItemId, subagentId, "assigned");
    this.repo.replaceAssignment(assignment);
    return this.repo.getBundle(task.id);
  }

  upsertSubagent(input: Partial<Subagent> & { id?: string }) {
    const existing = input.id ? this.repo.getSubagent(input.id) : null;
    const agent: Subagent = {
      id: input.id || id("agent"),
      name: input.name?.trim() || existing?.name || "新 Subagent",
      role: input.role?.trim() || existing?.role || "待配置角色",
      skills: input.skills ?? existing?.skills ?? ["通用"],
      enabled: input.enabled ?? existing?.enabled ?? true,
      costTier: (input.costTier ?? existing?.costTier ?? "medium") as CostTier,
      qualityTier: (input.qualityTier ?? existing?.qualityTier ?? "standard") as QualityTier,
      defaultModelTier: (input.defaultModelTier ?? existing?.defaultModelTier ?? "economy") as ModelTier,
      concurrencyLimit: clamp(input.concurrencyLimit ?? existing?.concurrencyLimit ?? 2, 1, 8),
      activeAssignments: existing?.activeAssignments ?? 0
    };
    this.repo.upsertSubagent(agent);
    return this.repo.listSubagents();
  }

  async runGeneration(taskId: string) {
    return this.withTaskLockAsync(taskId, async () => {
      const task = this.requireTask(taskId);
      if (task.stage !== "assignment" && task.stage !== "generation" && task.stage !== "revision") {
        throw new AppError("INVALID_STAGE", "只能在任务分派后执行代码生成", 409);
      }
      const isRevisionPass = task.stage === "revision";
      // 回流重生成时，把上一轮真实校验/审查的错误作为上下文喂回生成，形成闭环。
      const errorContextByWorkItem = isRevisionPass ? this.collectOpenErrorContext(taskId) : new Map<string, string>();
      if (isRevisionPass) this.repo.resolveOpenFindings(taskId);
      const workItems = this.repo.listWorkItems(taskId);
      const assignments = this.repo.listAssignments(taskId);
      const artifacts = await Promise.all(workItems.map(async (workItem) => {
        const assignment = assignments.find((item) => item.workItemId === workItem.id);
        if (!assignment) throw new AppError("APPLY_BLOCKED", `${workItem.title} 缺少分派`, 409);
        const subagent = this.repo.getSubagent(assignment.subagentId);
        if (!subagent) throw new AppError("APPLY_BLOCKED", `${workItem.title} 的 subagent 不存在`, 409);
        this.repo.setWorkItemAssignment(workItem.id, subagent.id, "generated");
        return this.engine.generateArtifact(task, workItem, assignment, subagent, errorContextByWorkItem.get(workItem.id));
      }));

      this.repo.saveArtifacts(artifacts);
      const project = this.repo.getProject(task.projectId);
      const patchSets = artifacts.map((artifact) => createPatchSetFromArtifact(project, artifact));
      this.repo.savePatchSets(patchSets);
      for (const patchSet of patchSets) this.repo.setArtifactPatchSet(patchSet.artifactId, patchSet.id);
      this.repo.updateTaskStage(taskId, "generation", "running");
      this.refreshCanvas(taskId);
      return this.repo.getBundle(taskId);
    });
  }

  async runReview(taskId: string) {
    return this.withTaskLockAsync(taskId, async () => {
      const task = this.requireTask(taskId);
      if (task.stage !== "generation" && task.stage !== "review") throw new AppError("INVALID_STAGE", "只能在生成后运行代码审查", 409);
      const workItems = this.repo.listWorkItems(taskId);
      const artifacts = this.repo.listCurrentArtifacts(taskId);
      const patchSets = this.repo.listCurrentPatchSets(taskId);
      const project = this.repo.getProject(task.projectId);
      const revisionPass = this.repo.listBacklinks(taskId).length > 0;
      const findingGroups = await Promise.all(artifacts.map(async (artifact) => {
        const workItem = workItems.find((item) => item.id === artifact.workItemId);
        const subagent = this.repo.getSubagent(artifact.subagentId);
        if (!workItem || !subagent) return [];
        this.repo.setWorkItemAssignment(workItem.id, subagent.id, "reviewed");
        const patchSet = patchSets.find((item) => item.artifactId === artifact.id);
        const verification = patchSet
          ? verifyPatchSetInSandbox(project, patchSet, artifact, workItem, subagent)
          : {
              findings: [this.buildApplyFinding(artifact, workItem, subagent, "缺少 PatchSet，无法验证变更集。", "重新生成代码产物。")],
              verificationLog: "Missing patch set.",
              ok: false,
              skipped: false
            };
        // 未运行真实校验时保持 "pending"，不能标成 "verified"——那会让"从未验证过"看起来像"已通过验证"。
        if (patchSet) {
          const patchStatus = verification.skipped ? "pending" : verification.ok ? "verified" : "blocked";
          this.repo.updatePatchSetStatus(patchSet.id, patchStatus, verification.verificationLog);
        }
        const modelFindings = await this.engine.reviewArtifact(artifact, workItem, subagent, revisionPass);
        return [...verification.findings, ...modelFindings.map((finding) => ({ ...finding, source: finding.source ?? ("model" as const) }))];
      }));
      const findings = findingGroups.flat();
      this.repo.saveFindings(findings);
      const hasOpenError = findings.some((finding) => finding.status === "open" && finding.severity === "error");
      this.repo.updateTaskStage(taskId, "review", hasOpenError ? "failed" : "passed");
      this.refreshCanvas(taskId);
      return this.repo.getBundle(taskId);
    });
  }

  submit(taskId: string) {
    return this.withTaskLock(taskId, () => {
      const task = this.requireTask(taskId);
      if (task.stage !== "review") throw new AppError("INVALID_STAGE", "只能在审查后生成提交记录", 409);
      const findings = this.repo.listFindings(taskId);
      const openError = findings.find((finding) => finding.status === "open" && finding.severity === "error");
      if (openError) throw new AppError("APPLY_BLOCKED", "仍有错误级审查问题，不能生成提交记录", 409);
      const project = this.repo.getProject(task.projectId);
      const patchSets = this.repo.listCurrentPatchSets(taskId);
      if (project) {
        const unapplied = patchSets.find((patchSet) => patchSet.applyStatus !== "applied");
        if (unapplied) throw new AppError("APPLY_BLOCKED", "本地项目任务需要先应用 PatchSet，再生成提交记录。", 409);
      }
      const summary = project
        ? "已应用到本地项目并形成提交记录。"
        : "演示模式：未选择本地项目，仅形成提交记录。";
      this.repo.saveSubmission({
        id: id("submission"),
        taskId,
        summary: `${task.title} 已完成审查并${project ? "形成提交记录" : "形成演示提交记录"}。\n${summary}`,
        reviewPassed: true,
        createdAt: now()
      });
      this.repo.updateTaskStage(taskId, "submitted", "passed");
      return this.repo.getBundle(taskId);
    });
  }

  apply(taskId: string) {
    return this.withTaskLock(taskId, () => {
      const task = this.requireTask(taskId);
      if (task.stage !== "review") throw new AppError("INVALID_STAGE", "只能在审查通过后应用到项目", 409);
      const findings = this.repo.listFindings(taskId);
      const openError = findings.find((finding) => finding.status === "open" && finding.severity === "error");
      if (openError) throw new AppError("APPLY_BLOCKED", "仍有错误级审查问题，不能应用到项目", 409);
      const project = this.repo.getProject(task.projectId);
      if (!project) throw new AppError("APPLY_BLOCKED", "未绑定本地项目，不能应用 PatchSet 到磁盘。", 409);
      const patchSets = this.repo.listCurrentPatchSets(taskId);
      if (!patchSets.length) throw new AppError("APPLY_BLOCKED", "缺少 PatchSet，不能应用到项目。", 409);
      const notVerified = patchSets.find((patchSet) => patchSet.applyStatus !== "verified" && patchSet.applyStatus !== "applied");
      if (notVerified) throw new AppError("APPLY_BLOCKED", "存在未通过验证的 PatchSet，不能应用到项目。", 409, { patchSetId: notVerified.id, status: notVerified.applyStatus });
      if (patchSets.every((patchSet) => patchSet.applyStatus === "applied")) return this.repo.getBundle(taskId);

      try {
        const freshProject = this.repo.upsertProject(scanProjectWorkspace(project.rootPath));
        const applySummary = applyPatchSetToProject(freshProject, patchSets.filter((patchSet) => patchSet.applyStatus !== "applied"));
        const applyRecord: ApplyRecord = {
          id: id("apply"),
          taskId,
          projectId: freshProject.id,
          patchSetIds: patchSets.map((patchSet) => patchSet.id),
          summary: applySummary || "已应用变更到本地项目。",
          createdAt: now()
        };
        this.repo.saveApplyRecord(applyRecord);
        for (const patchSet of patchSets) this.repo.updatePatchSetStatus(patchSet.id, "applied", patchSet.verificationLog);
        return this.repo.getBundle(taskId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "应用到项目失败";
        for (const patchSet of patchSets) {
          if (patchSet.applyStatus !== "applied") this.repo.updatePatchSetStatus(patchSet.id, "failed", message);
        }
        if (error instanceof AppError) throw error;
        if (/未提交变更/.test(message)) throw new AppError("PROJECT_DIRTY", message, 409);
        if (/hash 校验失败/.test(message)) throw new AppError("HASH_MISMATCH", message, 409);
        throw new AppError("APPLY_BLOCKED", `应用失败：${message}`, 409, { partialWritePossible: true });
      }
    });
  }

  reopenFinding(findingId: string, note: string) {
    const finding = this.repo.getFinding(findingId);
    if (!finding) throw new Error("审查问题不存在");
    this.repo.saveBacklink({
      id: id("backlink"),
      taskId: finding.taskId,
      findingId,
      workItemId: finding.workItemId,
      subagentId: finding.subagentId,
      note: note.trim() || "提交后问题回流到责任 Agent",
      createdAt: now()
    });
    this.repo.updateTaskStage(finding.taskId, "revision", "failed");
    return this.repo.getBundle(finding.taskId);
  }

  private buildApplyFinding(artifact: GeneratedArtifact, workItem: WorkItem, subagent: Subagent, message: string, suggestedFix: string): ReviewFinding {
    return {
      id: id("finding"),
      taskId: artifact.taskId,
      artifactId: artifact.id,
      workItemId: workItem.id,
      subagentId: subagent.id,
      severity: "error",
      status: "open",
      source: "apply",
      message,
      suggestedFix,
      createdAt: now()
    };
  }

  /** 收集每个 work item 当前未解决的 error 级 finding，作为回流重生成的上下文。 */
  private collectOpenErrorContext(taskId: string): Map<string, string> {
    const grouped = new Map<string, string[]>();
    for (const finding of this.repo.listFindings(taskId)) {
      if (finding.status !== "open" || finding.severity !== "error") continue;
      const lines = grouped.get(finding.workItemId) ?? [];
      lines.push(`- ${finding.message}（建议：${finding.suggestedFix}）`);
      grouped.set(finding.workItemId, lines);
    }
    return new Map([...grouped].map(([workItemId, lines]) => [workItemId, lines.join("\n")]));
  }

  private refreshCanvas(taskId: string) {
    const workItems = this.repo.listWorkItems(taskId);
    const artifacts = this.repo.listCurrentArtifacts(taskId);
    const findings = this.repo.listFindings(taskId);
    const subagents = this.repo.listSubagents();
    const graph = buildCanvasGraph(taskId, workItems, artifacts, findings, subagents);
    this.repo.replaceCanvas(taskId, graph.nodes, graph.edges);
  }

  private requireTask(taskId: string) {
    const task = this.repo.getTask(taskId);
    if (!task) throw new AppError("NOT_FOUND", "任务不存在", 404);
    return task;
  }

  private findTaskByWorkItem(workItemId: string) {
    const task = this.repo.listTasks().find((item) =>
      this.repo.listWorkItems(item.id).some((workItem) => workItem.id === workItemId)
    );
    if (!task) throw new AppError("NOT_FOUND", "work item 不属于任何任务", 404);
    return task;
  }

  private withTaskLock<T>(taskId: string, operation: () => T): T {
    if (this.taskLocks.has(taskId)) throw new AppError("TASK_BUSY", "任务正在执行中，请稍后再试。", 409);
    this.taskLocks.add(taskId);
    try {
      return operation();
    } finally {
      this.taskLocks.delete(taskId);
    }
  }

  private async withTaskLockAsync<T>(taskId: string, operation: () => Promise<T>): Promise<T> {
    if (this.taskLocks.has(taskId)) throw new AppError("TASK_BUSY", "任务正在执行中，请稍后再试。", 409);
    this.taskLocks.add(taskId);
    try {
      return await operation();
    } finally {
      this.taskLocks.delete(taskId);
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));
}

function sanitizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 30);
}

function inferTargetFiles(task: Task, item: WorkItem): string[] {
  if (item.targetFiles?.length) return item.targetFiles;
  if (task.selectedFiles.length) return task.selectedFiles.slice(0, 6);
  const text = `${item.title} ${item.description}`;
  if (/前端|React|UI|界面/i.test(text)) return ["src/App.tsx", "src/styles.css"];
  if (/API|后端|Express|SQLite|状态/i.test(text)) return ["server/app.ts", "server/workflow.ts"];
  if (/测试|验证|审查/i.test(text)) return ["tests/workflow.test.ts"];
  return ["src/generated/agent-change.ts"];
}

function riskFor(complexity: number): WorkItem["riskLevel"] {
  if (complexity >= 8) return "high";
  if (complexity >= 5) return "medium";
  return "low";
}

function verificationCommandsFor(project: ProjectWorkspace | null, requested: string[] = []): string[] {
  if (!project) return [];
  const allowList = ["typecheck", "test", "build"];
  const requestedKeys = requested
    .map((command) => allowList.find((script) => command === script || new RegExp(`\\b${script}\\b`).test(command)))
    .filter((script): script is string => Boolean(script));
  const preferred = requestedKeys.length ? requestedKeys : allowList;
  return [...new Set(preferred)].filter((script) => project.scripts[script]).slice(0, 2);
}
