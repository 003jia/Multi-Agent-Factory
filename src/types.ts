export type TaskStage =
  | "intake"
  | "requirements_review"
  | "plan_review"
  | "assignment"
  | "generation"
  | "review"
  | "submitted"
  | "revision";

export type ValidationState = "pending" | "running" | "passed" | "failed";
export type ModelTier = "economy" | "quality";
export type CostTier = "low" | "medium" | "high";
export type QualityTier = "standard" | "premium";
export type WorkItemStatus = "queued" | "assigned" | "generated" | "reviewed" | "needs_revision";
export type ReviewSeverity = "info" | "warning" | "error";
export type ReviewSource = "static" | "model" | "test" | "apply";
export type RiskLevel = "low" | "medium" | "high";
export type FileChangeKind = "create" | "modify" | "delete";
export type PatchApplyStatus = "pending" | "verified" | "blocked" | "applied";

export interface ProjectWorkspace {
  id: string;
  name: string;
  rootPath: string;
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | "unknown";
  frameworkHints: string[];
  scripts: Record<string, string>;
  gitStatus: "clean" | "dirty" | "unavailable";
  lastScannedAt: string;
}

export interface Task {
  id: string;
  projectId: string | null;
  title: string;
  prompt: string;
  selectedFiles: string[];
  constraints: string;
  complexity: number;
  stage: TaskStage;
  validationState: ValidationState;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersion {
  id: string;
  taskId: string;
  kind: "requirements";
  content: string;
  feedback: string;
  confirmed: boolean;
  createdAt: string;
}

export interface ExecutionPlan {
  id: string;
  taskId: string;
  content: string;
  feedback: string;
  confirmed: boolean;
  createdAt: string;
}

export interface Subagent {
  id: string;
  name: string;
  role: string;
  skills: string[];
  enabled: boolean;
  costTier: CostTier;
  qualityTier: QualityTier;
  defaultModelTier: ModelTier;
  concurrencyLimit: number;
  activeAssignments: number;
}

export interface WorkItem {
  id: string;
  taskId: string;
  title: string;
  description: string;
  targetFiles: string[];
  dependencies: string[];
  acceptanceChecks: string[];
  riskLevel: RiskLevel;
  verificationCommands: string[];
  complexity: number;
  preferredModelTier: ModelTier;
  status: WorkItemStatus;
  assignedSubagentId: string | null;
}

export interface Assignment {
  id: string;
  taskId: string;
  workItemId: string;
  subagentId: string;
  modelTier: ModelTier;
  strategyReason: string;
  manualOverride: boolean;
  createdAt: string;
}

export interface GeneratedFile {
  path: string;
  language: string;
  summary: string;
  content: string;
  diff: string;
}

export interface GeneratedArtifact {
  id: string;
  taskId: string;
  workItemId: string;
  subagentId: string;
  modelTier: ModelTier;
  patchSetId: string | null;
  files: GeneratedFile[];
  agentNotes: string;
  commitMessageDraft: string;
  createdAt: string;
}

export interface FileChange {
  id: string;
  kind: FileChangeKind;
  path: string;
  originalHash: string | null;
  content: string;
  summary: string;
}

export interface PatchSet {
  id: string;
  taskId: string;
  workItemId: string;
  artifactId: string;
  changes: FileChange[];
  diff: string;
  applyStatus: PatchApplyStatus;
  verificationLog: string;
  createdAt: string;
}

export interface ReviewFinding {
  id: string;
  taskId: string;
  artifactId: string;
  workItemId: string;
  subagentId: string;
  severity: ReviewSeverity;
  status: "open" | "resolved";
  source: ReviewSource;
  filePath?: string;
  line?: number;
  message: string;
  suggestedFix: string;
  createdAt: string;
}

export interface SubmissionRecord {
  id: string;
  taskId: string;
  summary: string;
  reviewPassed: boolean;
  createdAt: string;
}

export interface IssueBacklink {
  id: string;
  taskId: string;
  findingId: string;
  workItemId: string;
  subagentId: string;
  note: string;
  createdAt: string;
}

export interface ApplyRecord {
  id: string;
  taskId: string;
  projectId: string;
  patchSetIds: string[];
  summary: string;
  createdAt: string;
}

export interface CanvasNode {
  id: string;
  taskId: string;
  type: "file" | "diff" | "review" | "agent" | "workItem";
  label: string;
  refId: string;
}

export interface CanvasEdge {
  id: string;
  taskId: string;
  sourceId: string;
  targetId: string;
  label: string;
}

export interface TaskBundle {
  task: Task;
  project: ProjectWorkspace | null;
  requirements: DocumentVersion | null;
  plan: ExecutionPlan | null;
  workItems: WorkItem[];
  assignments: Assignment[];
  artifacts: GeneratedArtifact[];
  patchSets: PatchSet[];
  findings: ReviewFinding[];
  submissions: SubmissionRecord[];
  applyRecords: ApplyRecord[];
  backlinks: IssueBacklink[];
  canvas: {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
  };
}

export interface AppSnapshot {
  projects: ProjectWorkspace[];
  tasks: Task[];
  subagents: Subagent[];
  selectedTask: TaskBundle | null;
}

export type AiProvider = "anthropic" | "openai";

/** AI 接入配置：provider 决定走 Anthropic 还是 OpenAI 兼容格式。 */
export interface AiProviderConfig {
  provider: AiProvider;
  apiKey: string;
  /** OpenAI 兼容端点可自定义（Azure / Ollama / vLLM / OpenRouter 等）；留空用默认。 */
  baseUrl?: string;
  economyModel?: string;
  qualityModel?: string;
}

export interface AiProviderConfigInput {
  provider: AiProvider;
  apiKey?: string;
  baseUrl?: string;
  economyModel?: string;
  qualityModel?: string;
  clearApiKey?: boolean;
}

export interface AiProviderConfigView {
  provider: AiProvider;
  baseUrl?: string;
  economyModel?: string;
  qualityModel?: string;
  keyMasked?: string;
  hasApiKey: boolean;
}

export interface AiStatus {
  aiEnabled: boolean;
  mode: "mock" | "claude" | "openai";
  provider: AiProvider | "mock";
  baseUrl?: string;
  models: Record<ModelTier, string>;
  keyMasked?: string;
}
