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

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 10)}`;

export class WorkflowService {
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
    if (!project) throw new Error("项目不存在");
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
    if (task.stage !== "requirements_review") throw new Error("当前阶段不能修改需求文档");
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
    if (task.stage !== "requirements_review") throw new Error("需求只能在需求确认阶段确认");
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
    if (task.stage !== "plan_review") throw new Error("当前阶段不能修改任务计划");
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
    if (task.stage !== "plan_review") throw new Error("计划只能在计划确认阶段确认");
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
        verificationCommands: item.verificationCommands ?? verificationCommandsFor(this.repo.getProject(task.projectId)),
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
    if (!subagent || !subagent.enabled) throw new Error("目标 subagent 不存在或未启用");
    const task = this.findTaskByWorkItem(workItemId);
    const workItem = this.repo.listWorkItems(task.id).find((item) => item.id === workItemId);
    if (!workItem) throw new Error("work item 不存在");
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
    const task = this.requireTask(taskId);
    if (task.stage !== "assignment" && task.stage !== "generation" && task.stage !== "revision") {
      throw new Error("只能在任务分派后执行代码生成");
    }
    const isRevisionPass = task.stage === "revision";
    // 回流重生成时，把上一轮真实校验/审查的错误作为上下文喂回生成，形成闭环。
    const errorContextByWorkItem = isRevisionPass ? this.collectOpenErrorContext(taskId) : new Map<string, string>();
    if (isRevisionPass) this.repo.resolveOpenFindings(taskId);
    const workItems = this.repo.listWorkItems(taskId);
    const assignments = this.repo.listAssignments(taskId);
    const artifacts = await Promise.all(workItems.map(async (workItem) => {
      const assignment = assignments.find((item) => item.workItemId === workItem.id);
      if (!assignment) throw new Error(`${workItem.title} 缺少分派`);
      const subagent = this.repo.getSubagent(assignment.subagentId);
      if (!subagent) throw new Error(`${workItem.title} 的 subagent 不存在`);
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
  }

  async runReview(taskId: string) {
    const task = this.requireTask(taskId);
    if (task.stage !== "generation" && task.stage !== "review") throw new Error("只能在生成后运行代码审查");
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
            ok: false
          };
      if (patchSet) this.repo.updatePatchSetStatus(patchSet.id, verification.ok ? "verified" : "blocked", verification.verificationLog);
      const modelFindings = await this.engine.reviewArtifact(artifact, workItem, subagent, revisionPass);
      return [...verification.findings, ...modelFindings.map((finding) => ({ ...finding, source: finding.source ?? ("model" as const) }))];
    }));
    const findings = findingGroups.flat();
    this.repo.saveFindings(findings);
    const hasOpenError = findings.some((finding) => finding.status === "open" && finding.severity === "error");
    this.repo.updateTaskStage(taskId, "review", hasOpenError ? "failed" : "passed");
    this.refreshCanvas(taskId);
    return this.repo.getBundle(taskId);
  }

  submit(taskId: string) {
    const task = this.requireTask(taskId);
    if (task.stage !== "review") throw new Error("只能在审查后提交");
    const findings = this.repo.listFindings(taskId);
    const openError = findings.find((finding) => finding.status === "open" && finding.severity === "error");
    if (openError) throw new Error("仍有错误级审查问题，不能提交");
    const project = this.repo.getProject(task.projectId);
    const patchSets = this.repo.listCurrentPatchSets(taskId);
    let applySummary = "演示模式：未选择本地项目，仅形成提交记录。";
    if (project) {
      const blocked = patchSets.find((patchSet) => patchSet.applyStatus === "blocked");
      if (blocked) throw new Error("仍有被阻止的变更集，不能应用到项目");
      const freshProject = this.repo.upsertProject(scanProjectWorkspace(project.rootPath));
      applySummary = applyPatchSetToProject(freshProject, patchSets);
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
    }
    this.repo.saveSubmission({
      id: id("submission"),
      taskId,
      summary: `${task.title} 已完成审查并${project ? "应用到本地项目" : "形成提交记录"}。\n${applySummary}`,
      reviewPassed: true,
      createdAt: now()
    });
    this.repo.updateTaskStage(taskId, "submitted", "passed");
    return this.repo.getBundle(taskId);
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
    if (!task) throw new Error("任务不存在");
    return task;
  }

  private findTaskByWorkItem(workItemId: string) {
    const task = this.repo.listTasks().find((item) =>
      this.repo.listWorkItems(item.id).some((workItem) => workItem.id === workItemId)
    );
    if (!task) throw new Error("work item 不属于任何任务");
    return task;
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

function verificationCommandsFor(project: ProjectWorkspace | null): string[] {
  if (!project) return [];
  const runner = project.packageManager === "pnpm" ? "pnpm run" : project.packageManager === "yarn" ? "yarn" : project.packageManager === "bun" ? "bun run" : "npm run";
  return ["typecheck", "test", "build"]
    .filter((script) => project.scripts[script])
    .slice(0, 2)
    .map((script) => `${runner} ${script}`);
}
