import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AppSnapshot,
  ApplyRecord,
  Assignment,
  CanvasEdge,
  CanvasNode,
  DocumentVersion,
  ExecutionPlan,
  GeneratedArtifact,
  IssueBacklink,
  PatchSet,
  ProjectWorkspace,
  ReviewFinding,
  Subagent,
  Task,
  TaskBundle,
  TaskStage,
  ValidationState,
  WorkItem
} from "../src/types.js";
import { defaultSubagents } from "./mockAgents.js";

type Row = Record<string, unknown>;

const bool = (value: unknown) => Number(value) === 1;
const json = <T>(value: unknown): T => JSON.parse(String(value ?? "null"));

function mapTask(row: Row): Task {
  return {
    id: String(row.id),
    projectId: row.project_id ? String(row.project_id) : null,
    title: String(row.title),
    prompt: String(row.prompt),
    selectedFiles: json<string[]>(row.selected_files ?? "[]"),
    constraints: String(row.constraints ?? ""),
    complexity: Number(row.complexity),
    stage: row.stage as TaskStage,
    validationState: row.validation_state as ValidationState,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapProject(row: Row): ProjectWorkspace {
  return {
    id: String(row.id),
    name: String(row.name),
    rootPath: String(row.root_path),
    packageManager: row.package_manager as ProjectWorkspace["packageManager"],
    frameworkHints: json<string[]>(row.framework_hints ?? "[]"),
    scripts: json<Record<string, string>>(row.scripts ?? "{}"),
    gitStatus: row.git_status as ProjectWorkspace["gitStatus"],
    lastScannedAt: String(row.last_scanned_at)
  };
}

function mapDocument(row: Row): DocumentVersion {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    kind: "requirements",
    content: String(row.content),
    feedback: String(row.feedback ?? ""),
    confirmed: bool(row.confirmed),
    createdAt: String(row.created_at)
  };
}

function mapPlan(row: Row): ExecutionPlan {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    content: String(row.content),
    feedback: String(row.feedback ?? ""),
    confirmed: bool(row.confirmed),
    createdAt: String(row.created_at)
  };
}

function mapSubagent(row: Row): Subagent {
  return {
    id: String(row.id),
    name: String(row.name),
    role: String(row.role),
    skills: json<string[]>(row.skills),
    enabled: bool(row.enabled),
    costTier: row.cost_tier as Subagent["costTier"],
    qualityTier: row.quality_tier as Subagent["qualityTier"],
    defaultModelTier: row.default_model_tier as Subagent["defaultModelTier"],
    concurrencyLimit: Number(row.concurrency_limit),
    activeAssignments: Number(row.active_assignments)
  };
}

function mapWorkItem(row: Row): WorkItem {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    title: String(row.title),
    description: String(row.description),
    targetFiles: json<string[]>(row.target_files ?? "[]"),
    dependencies: json<string[]>(row.dependencies ?? "[]"),
    acceptanceChecks: json<string[]>(row.acceptance_checks ?? "[]"),
    riskLevel: (row.risk_level as WorkItem["riskLevel"]) ?? "medium",
    verificationCommands: json<string[]>(row.verification_commands ?? "[]"),
    complexity: Number(row.complexity),
    preferredModelTier: row.preferred_model_tier as WorkItem["preferredModelTier"],
    status: row.status as WorkItem["status"],
    assignedSubagentId: row.assigned_subagent_id ? String(row.assigned_subagent_id) : null
  };
}

function mapAssignment(row: Row): Assignment {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    workItemId: String(row.work_item_id),
    subagentId: String(row.subagent_id),
    modelTier: row.model_tier as Assignment["modelTier"],
    strategyReason: String(row.strategy_reason),
    manualOverride: bool(row.manual_override),
    createdAt: String(row.created_at)
  };
}

function mapArtifact(row: Row): GeneratedArtifact {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    workItemId: String(row.work_item_id),
    subagentId: String(row.subagent_id),
    modelTier: row.model_tier as GeneratedArtifact["modelTier"],
    patchSetId: row.patch_set_id ? String(row.patch_set_id) : null,
    files: json<GeneratedArtifact["files"]>(row.files),
    agentNotes: String(row.agent_notes),
    commitMessageDraft: String(row.commit_message_draft),
    createdAt: String(row.created_at)
  };
}

function mapPatchSet(row: Row): PatchSet {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    workItemId: String(row.work_item_id),
    artifactId: String(row.artifact_id),
    changes: json<PatchSet["changes"]>(row.changes),
    diff: String(row.diff),
    applyStatus: row.apply_status as PatchSet["applyStatus"],
    verificationLog: String(row.verification_log ?? ""),
    createdAt: String(row.created_at)
  };
}

function mapFinding(row: Row): ReviewFinding {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    artifactId: String(row.artifact_id),
    workItemId: String(row.work_item_id),
    subagentId: String(row.subagent_id),
    severity: row.severity as ReviewFinding["severity"],
    status: row.status as ReviewFinding["status"],
    source: (row.source as ReviewFinding["source"]) ?? "model",
    filePath: row.file_path ? String(row.file_path) : undefined,
    line: row.line ? Number(row.line) : undefined,
    message: String(row.message),
    suggestedFix: String(row.suggested_fix),
    createdAt: String(row.created_at)
  };
}

function mapSubmission(row: Row) {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    summary: String(row.summary),
    reviewPassed: bool(row.review_passed),
    createdAt: String(row.created_at)
  };
}

function mapBacklink(row: Row): IssueBacklink {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    findingId: String(row.finding_id),
    workItemId: String(row.work_item_id),
    subagentId: String(row.subagent_id),
    note: String(row.note),
    createdAt: String(row.created_at)
  };
}

function mapApplyRecord(row: Row): ApplyRecord {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    projectId: String(row.project_id),
    patchSetIds: json<string[]>(row.patch_set_ids ?? "[]"),
    summary: String(row.summary),
    createdAt: String(row.created_at)
  };
}

function mapNode(row: Row): CanvasNode {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    type: row.type as CanvasNode["type"],
    label: String(row.label),
    refId: String(row.ref_id)
  };
}

function mapEdge(row: Row): CanvasEdge {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    sourceId: String(row.source_id),
    targetId: String(row.target_id),
    label: String(row.label)
  };
}

export class FactoryRepository {
  private db: DatabaseSync;

  constructor(dbPath = "data/factory.sqlite") {
    if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
    this.seedSubagents();
  }

  close() {
    this.db.close();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        package_manager TEXT NOT NULL,
        framework_hints TEXT NOT NULL,
        scripts TEXT NOT NULL,
        git_status TEXT NOT NULL,
        last_scanned_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES project_workspaces(id),
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        selected_files TEXT NOT NULL DEFAULT '[]',
        constraints TEXT NOT NULL DEFAULT '',
        complexity INTEGER NOT NULL,
        stage TEXT NOT NULL,
        validation_state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS document_versions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        feedback TEXT NOT NULL,
        confirmed INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS execution_plans (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        feedback TEXT NOT NULL,
        confirmed INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS subagents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        skills TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        cost_tier TEXT NOT NULL,
        quality_tier TEXT NOT NULL,
        default_model_tier TEXT NOT NULL,
        concurrency_limit INTEGER NOT NULL,
        active_assignments INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        target_files TEXT NOT NULL DEFAULT '[]',
        dependencies TEXT NOT NULL DEFAULT '[]',
        acceptance_checks TEXT NOT NULL DEFAULT '[]',
        risk_level TEXT NOT NULL DEFAULT 'medium',
        verification_commands TEXT NOT NULL DEFAULT '[]',
        complexity INTEGER NOT NULL,
        preferred_model_tier TEXT NOT NULL,
        status TEXT NOT NULL,
        assigned_subagent_id TEXT REFERENCES subagents(id)
      );
      CREATE TABLE IF NOT EXISTS assignments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        subagent_id TEXT NOT NULL REFERENCES subagents(id),
        model_tier TEXT NOT NULL,
        strategy_reason TEXT NOT NULL,
        manual_override INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS generated_artifacts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        subagent_id TEXT NOT NULL REFERENCES subagents(id),
        model_tier TEXT NOT NULL,
        patch_set_id TEXT,
        files TEXT NOT NULL,
        agent_notes TEXT NOT NULL,
        commit_message_draft TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS patch_sets (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        artifact_id TEXT NOT NULL REFERENCES generated_artifacts(id) ON DELETE CASCADE,
        changes TEXT NOT NULL,
        diff TEXT NOT NULL,
        apply_status TEXT NOT NULL,
        verification_log TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_findings (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        artifact_id TEXT NOT NULL REFERENCES generated_artifacts(id) ON DELETE CASCADE,
        work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        subagent_id TEXT NOT NULL REFERENCES subagents(id),
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'model',
        file_path TEXT,
        line INTEGER,
        message TEXT NOT NULL,
        suggested_fix TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS submission_records (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        summary TEXT NOT NULL,
        review_passed INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS apply_records (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES project_workspaces(id),
        patch_set_ids TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS issue_backlinks (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        finding_id TEXT NOT NULL REFERENCES review_findings(id),
        work_item_id TEXT NOT NULL REFERENCES work_items(id),
        subagent_id TEXT NOT NULL REFERENCES subagents(id),
        note TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS canvas_nodes (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        ref_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS canvas_edges (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        label TEXT NOT NULL
      );
    `);
    this.addColumn("tasks", "project_id", "TEXT REFERENCES project_workspaces(id)");
    this.addColumn("tasks", "selected_files", "TEXT NOT NULL DEFAULT '[]'");
    this.addColumn("tasks", "constraints", "TEXT NOT NULL DEFAULT ''");
    this.addColumn("work_items", "target_files", "TEXT NOT NULL DEFAULT '[]'");
    this.addColumn("work_items", "dependencies", "TEXT NOT NULL DEFAULT '[]'");
    this.addColumn("work_items", "acceptance_checks", "TEXT NOT NULL DEFAULT '[]'");
    this.addColumn("work_items", "risk_level", "TEXT NOT NULL DEFAULT 'medium'");
    this.addColumn("work_items", "verification_commands", "TEXT NOT NULL DEFAULT '[]'");
    this.addColumn("generated_artifacts", "patch_set_id", "TEXT");
    this.addColumn("review_findings", "source", "TEXT NOT NULL DEFAULT 'model'");
    this.addColumn("review_findings", "file_path", "TEXT");
    this.addColumn("review_findings", "line", "INTEGER");
  }

  private addColumn(table: string, column: string, definition: string) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (columns.some((item) => item.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  private seedSubagents() {
    const exists = this.db.prepare("SELECT id FROM subagents WHERE id = ?");
    for (const agent of defaultSubagents) {
      if (!exists.get(agent.id)) this.upsertSubagent(agent);
    }
  }

  upsertProject(project: ProjectWorkspace) {
    this.db
      .prepare(
        `INSERT INTO project_workspaces
        (id, name, root_path, package_manager, framework_hints, scripts, git_status, last_scanned_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(root_path) DO UPDATE SET
          name = excluded.name,
          package_manager = excluded.package_manager,
          framework_hints = excluded.framework_hints,
          scripts = excluded.scripts,
          git_status = excluded.git_status,
          last_scanned_at = excluded.last_scanned_at`
      )
      .run(
        project.id,
        project.name,
        project.rootPath,
        project.packageManager,
        JSON.stringify(project.frameworkHints),
        JSON.stringify(project.scripts),
        project.gitStatus,
        project.lastScannedAt
      );
    const row = this.db.prepare("SELECT * FROM project_workspaces WHERE root_path = ?").get(project.rootPath) as Row | undefined;
    return row ? mapProject(row) : project;
  }

  listProjects(): ProjectWorkspace[] {
    return this.db.prepare("SELECT * FROM project_workspaces ORDER BY last_scanned_at DESC").all().map(mapProject);
  }

  getProject(projectId: string | null | undefined): ProjectWorkspace | null {
    if (!projectId) return null;
    const row = this.db.prepare("SELECT * FROM project_workspaces WHERE id = ?").get(projectId) as Row | undefined;
    return row ? mapProject(row) : null;
  }

  getProjectByRoot(rootPath: string): ProjectWorkspace | null {
    const row = this.db.prepare("SELECT * FROM project_workspaces WHERE root_path = ?").get(rootPath) as Row | undefined;
    return row ? mapProject(row) : null;
  }

  listTasks(): Task[] {
    return this.db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC").all().map(mapTask);
  }

  getTask(taskId: string): Task | null {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Row | undefined;
    return row ? mapTask(row) : null;
  }

  createTask(task: Task) {
    this.db
      .prepare(
        `INSERT INTO tasks
        (id, project_id, title, prompt, selected_files, constraints, complexity, stage, validation_state, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        task.id,
        task.projectId,
        task.title,
        task.prompt,
        JSON.stringify(task.selectedFiles),
        task.constraints,
        task.complexity,
        task.stage,
        task.validationState,
        task.createdAt,
        task.updatedAt
      );
  }

  updateTaskStage(taskId: string, stage: TaskStage, validationState: ValidationState) {
    this.db
      .prepare("UPDATE tasks SET stage = ?, validation_state = ?, updated_at = ? WHERE id = ?")
      .run(stage, validationState, new Date().toISOString(), taskId);
  }

  saveRequirements(document: DocumentVersion) {
    this.db
      .prepare(
        "INSERT INTO document_versions (id, task_id, kind, content, feedback, confirmed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(document.id, document.taskId, document.kind, document.content, document.feedback, document.confirmed ? 1 : 0, document.createdAt);
  }

  updateRequirements(taskId: string, content: string, feedback: string, confirmed = false) {
    const current = this.getRequirements(taskId);
    if (!current) throw new Error("需求文档不存在");
    this.db
      .prepare("UPDATE document_versions SET content = ?, feedback = ?, confirmed = ? WHERE id = ?")
      .run(content, feedback, confirmed ? 1 : 0, current.id);
  }

  getRequirements(taskId: string): DocumentVersion | null {
    const row = this.db
      .prepare("SELECT * FROM document_versions WHERE task_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(taskId) as Row | undefined;
    return row ? mapDocument(row) : null;
  }

  savePlan(plan: ExecutionPlan) {
    this.db
      .prepare("INSERT INTO execution_plans (id, task_id, content, feedback, confirmed, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(plan.id, plan.taskId, plan.content, plan.feedback, plan.confirmed ? 1 : 0, plan.createdAt);
  }

  updatePlan(taskId: string, content: string, feedback: string, confirmed = false) {
    const current = this.getPlan(taskId);
    if (!current) throw new Error("任务计划不存在");
    this.db
      .prepare("UPDATE execution_plans SET content = ?, feedback = ?, confirmed = ? WHERE id = ?")
      .run(content, feedback, confirmed ? 1 : 0, current.id);
  }

  getPlan(taskId: string): ExecutionPlan | null {
    const row = this.db
      .prepare("SELECT * FROM execution_plans WHERE task_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(taskId) as Row | undefined;
    return row ? mapPlan(row) : null;
  }

  listSubagents(): Subagent[] {
    return this.db.prepare("SELECT * FROM subagents ORDER BY name").all().map(mapSubagent);
  }

  getSubagent(id: string): Subagent | null {
    const row = this.db.prepare("SELECT * FROM subagents WHERE id = ?").get(id) as Row | undefined;
    return row ? mapSubagent(row) : null;
  }

  upsertSubagent(agent: Subagent) {
    this.db
      .prepare(
        `INSERT INTO subagents
        (id, name, role, skills, enabled, cost_tier, quality_tier, default_model_tier, concurrency_limit, active_assignments)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          role = excluded.role,
          skills = excluded.skills,
          enabled = excluded.enabled,
          cost_tier = excluded.cost_tier,
          quality_tier = excluded.quality_tier,
          default_model_tier = excluded.default_model_tier,
          concurrency_limit = excluded.concurrency_limit,
          active_assignments = excluded.active_assignments`
      )
      .run(
        agent.id,
        agent.name,
        agent.role,
        JSON.stringify(agent.skills),
        agent.enabled ? 1 : 0,
        agent.costTier,
        agent.qualityTier,
        agent.defaultModelTier,
        agent.concurrencyLimit,
        agent.activeAssignments
      );
  }

  saveWorkItems(items: WorkItem[]) {
    const statement = this.db.prepare(
      `INSERT INTO work_items
      (id, task_id, title, description, target_files, dependencies, acceptance_checks, risk_level, verification_commands, complexity, preferred_model_tier, status, assigned_subagent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        target_files = excluded.target_files,
        dependencies = excluded.dependencies,
        acceptance_checks = excluded.acceptance_checks,
        risk_level = excluded.risk_level,
        verification_commands = excluded.verification_commands,
        complexity = excluded.complexity,
        preferred_model_tier = excluded.preferred_model_tier,
        status = excluded.status,
        assigned_subagent_id = excluded.assigned_subagent_id`
    );
    for (const item of items) {
      statement.run(
        item.id,
        item.taskId,
        item.title,
        item.description,
        JSON.stringify(item.targetFiles),
        JSON.stringify(item.dependencies),
        JSON.stringify(item.acceptanceChecks),
        item.riskLevel,
        JSON.stringify(item.verificationCommands),
        item.complexity,
        item.preferredModelTier,
        item.status,
        item.assignedSubagentId
      );
    }
  }

  listWorkItems(taskId: string): WorkItem[] {
    return this.db.prepare("SELECT * FROM work_items WHERE task_id = ? ORDER BY rowid").all(taskId).map(mapWorkItem);
  }

  setWorkItemAssignment(workItemId: string, subagentId: string, status: WorkItem["status"]) {
    this.db
      .prepare("UPDATE work_items SET assigned_subagent_id = ?, status = ? WHERE id = ?")
      .run(subagentId, status, workItemId);
  }

  saveAssignments(assignments: Assignment[]) {
    const statement = this.db.prepare(
      `INSERT INTO assignments
      (id, task_id, work_item_id, subagent_id, model_tier, strategy_reason, manual_override, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        subagent_id = excluded.subagent_id,
        model_tier = excluded.model_tier,
        strategy_reason = excluded.strategy_reason,
        manual_override = excluded.manual_override`
    );
    for (const assignment of assignments) {
      statement.run(
        assignment.id,
        assignment.taskId,
        assignment.workItemId,
        assignment.subagentId,
        assignment.modelTier,
        assignment.strategyReason,
        assignment.manualOverride ? 1 : 0,
        assignment.createdAt
      );
    }
  }

  replaceAssignment(assignment: Assignment) {
    this.db.prepare("DELETE FROM assignments WHERE work_item_id = ?").run(assignment.workItemId);
    this.saveAssignments([assignment]);
  }

  listAssignments(taskId: string): Assignment[] {
    return this.db.prepare("SELECT * FROM assignments WHERE task_id = ? ORDER BY created_at").all(taskId).map(mapAssignment);
  }

  saveArtifacts(artifacts: GeneratedArtifact[]) {
    const statement = this.db.prepare(
      `INSERT INTO generated_artifacts
      (id, task_id, work_item_id, subagent_id, model_tier, patch_set_id, files, agent_notes, commit_message_draft, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const artifact of artifacts) {
      statement.run(
        artifact.id,
        artifact.taskId,
        artifact.workItemId,
        artifact.subagentId,
        artifact.modelTier,
        artifact.patchSetId ?? null,
        JSON.stringify(artifact.files),
        artifact.agentNotes,
        artifact.commitMessageDraft,
        artifact.createdAt
      );
    }
  }

  listArtifacts(taskId: string): GeneratedArtifact[] {
    return this.db.prepare("SELECT * FROM generated_artifacts WHERE task_id = ? ORDER BY created_at").all(taskId).map(mapArtifact);
  }

  /** Latest artifact per work item — regeneration appends, so reads must dedupe to current. */
  listCurrentArtifacts(taskId: string): GeneratedArtifact[] {
    const latest = new Map<string, GeneratedArtifact>();
    for (const artifact of this.listArtifacts(taskId)) latest.set(artifact.workItemId, artifact);
    return [...latest.values()];
  }

  setArtifactPatchSet(artifactId: string, patchSetId: string) {
    this.db.prepare("UPDATE generated_artifacts SET patch_set_id = ? WHERE id = ?").run(patchSetId, artifactId);
  }

  savePatchSets(patchSets: PatchSet[]) {
    const statement = this.db.prepare(
      `INSERT INTO patch_sets
      (id, task_id, work_item_id, artifact_id, changes, diff, apply_status, verification_log, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        changes = excluded.changes,
        diff = excluded.diff,
        apply_status = excluded.apply_status,
        verification_log = excluded.verification_log`
    );
    for (const patchSet of patchSets) {
      statement.run(
        patchSet.id,
        patchSet.taskId,
        patchSet.workItemId,
        patchSet.artifactId,
        JSON.stringify(patchSet.changes),
        patchSet.diff,
        patchSet.applyStatus,
        patchSet.verificationLog,
        patchSet.createdAt
      );
    }
  }

  listPatchSets(taskId: string): PatchSet[] {
    return this.db.prepare("SELECT * FROM patch_sets WHERE task_id = ? ORDER BY created_at").all(taskId).map(mapPatchSet);
  }

  listCurrentPatchSets(taskId: string): PatchSet[] {
    const latest = new Map<string, PatchSet>();
    for (const patchSet of this.listPatchSets(taskId)) latest.set(patchSet.workItemId, patchSet);
    return [...latest.values()];
  }

  updatePatchSetStatus(patchSetId: string, applyStatus: PatchSet["applyStatus"], verificationLog = "") {
    this.db
      .prepare("UPDATE patch_sets SET apply_status = ?, verification_log = ? WHERE id = ?")
      .run(applyStatus, verificationLog, patchSetId);
  }

  saveFindings(findings: ReviewFinding[]) {
    const statement = this.db.prepare(
      `INSERT INTO review_findings
      (id, task_id, artifact_id, work_item_id, subagent_id, severity, status, source, file_path, line, message, suggested_fix, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const finding of findings) {
      statement.run(
        finding.id,
        finding.taskId,
        finding.artifactId,
        finding.workItemId,
        finding.subagentId,
        finding.severity,
        finding.status,
        finding.source,
        finding.filePath ?? null,
        finding.line ?? null,
        finding.message,
        finding.suggestedFix,
        finding.createdAt
      );
    }
  }

  listFindings(taskId: string): ReviewFinding[] {
    return this.db.prepare("SELECT * FROM review_findings WHERE task_id = ? ORDER BY created_at").all(taskId).map(mapFinding);
  }

  resolveOpenFindings(taskId: string) {
    this.db.prepare("UPDATE review_findings SET status = 'resolved' WHERE task_id = ? AND status = 'open'").run(taskId);
  }

  getFinding(findingId: string): ReviewFinding | null {
    const row = this.db.prepare("SELECT * FROM review_findings WHERE id = ?").get(findingId) as Row | undefined;
    return row ? mapFinding(row) : null;
  }

  saveSubmission(record: ReturnType<typeof mapSubmission>) {
    this.db
      .prepare("INSERT INTO submission_records (id, task_id, summary, review_passed, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(record.id, record.taskId, record.summary, record.reviewPassed ? 1 : 0, record.createdAt);
  }

  listSubmissions(taskId: string) {
    return this.db.prepare("SELECT * FROM submission_records WHERE task_id = ? ORDER BY created_at").all(taskId).map(mapSubmission);
  }

  saveApplyRecord(record: ApplyRecord) {
    this.db
      .prepare("INSERT INTO apply_records (id, task_id, project_id, patch_set_ids, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(record.id, record.taskId, record.projectId, JSON.stringify(record.patchSetIds), record.summary, record.createdAt);
  }

  listApplyRecords(taskId: string): ApplyRecord[] {
    return this.db.prepare("SELECT * FROM apply_records WHERE task_id = ? ORDER BY created_at").all(taskId).map(mapApplyRecord);
  }

  saveBacklink(backlink: IssueBacklink) {
    this.db
      .prepare("INSERT INTO issue_backlinks (id, task_id, finding_id, work_item_id, subagent_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(backlink.id, backlink.taskId, backlink.findingId, backlink.workItemId, backlink.subagentId, backlink.note, backlink.createdAt);
  }

  listBacklinks(taskId: string): IssueBacklink[] {
    return this.db.prepare("SELECT * FROM issue_backlinks WHERE task_id = ? ORDER BY created_at").all(taskId).map(mapBacklink);
  }

  replaceCanvas(taskId: string, nodes: CanvasNode[], edges: CanvasEdge[]) {
    this.db.prepare("DELETE FROM canvas_edges WHERE task_id = ?").run(taskId);
    this.db.prepare("DELETE FROM canvas_nodes WHERE task_id = ?").run(taskId);
    const nodeStatement = this.db.prepare("INSERT INTO canvas_nodes (id, task_id, type, label, ref_id) VALUES (?, ?, ?, ?, ?)");
    for (const node of nodes) nodeStatement.run(node.id, node.taskId, node.type, node.label, node.refId);
    const edgeStatement = this.db.prepare("INSERT INTO canvas_edges (id, task_id, source_id, target_id, label) VALUES (?, ?, ?, ?, ?)");
    for (const edge of edges) edgeStatement.run(edge.id, edge.taskId, edge.sourceId, edge.targetId, edge.label);
  }

  getCanvas(taskId: string) {
    return {
      nodes: this.db.prepare("SELECT * FROM canvas_nodes WHERE task_id = ? ORDER BY rowid").all(taskId).map(mapNode),
      edges: this.db.prepare("SELECT * FROM canvas_edges WHERE task_id = ? ORDER BY rowid").all(taskId).map(mapEdge)
    };
  }

  getBundle(taskId: string): TaskBundle | null {
    const task = this.getTask(taskId);
    if (!task) return null;
    return {
      task,
      project: this.getProject(task.projectId),
      requirements: this.getRequirements(taskId),
      plan: this.getPlan(taskId),
      workItems: this.listWorkItems(taskId),
      assignments: this.listAssignments(taskId),
      artifacts: this.listCurrentArtifacts(taskId),
      patchSets: this.listCurrentPatchSets(taskId),
      findings: this.listFindings(taskId),
      submissions: this.listSubmissions(taskId),
      applyRecords: this.listApplyRecords(taskId),
      backlinks: this.listBacklinks(taskId),
      canvas: this.getCanvas(taskId)
    };
  }

  snapshot(selectedTaskId?: string): AppSnapshot {
    const tasks = this.listTasks();
    return {
      projects: this.listProjects(),
      tasks,
      subagents: this.listSubagents(),
      selectedTask: selectedTaskId ? this.getBundle(selectedTaskId) : tasks[0] ? this.getBundle(tasks[0].id) : null
    };
  }
}
