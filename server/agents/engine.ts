import type {
  Assignment,
  GeneratedArtifact,
  ModelTier,
  ReviewFinding,
  Subagent,
  Task,
  WorkItem
} from "../../src/types.js";

export interface AgentEngine {
  readonly kind: "mock" | "claude" | "openai";
  readonly models: Record<ModelTier, string>;
  readonly baseUrl?: string;
  generateRequirements(task: Task): Promise<string>;
  regenerateRequirements(task: Task, feedback: string, previousContent: string): Promise<string>;
  generatePlan(task: Task, requirements: string): Promise<string>;
  regeneratePlan(task: Task, feedback: string, previousContent: string): Promise<string>;
  splitWorkItems(task: Task, plan: string): Promise<WorkItem[]>;
  generateArtifact(
    task: Task,
    workItem: WorkItem,
    assignment: Assignment,
    subagent: Subagent,
    errorContext?: string
  ): Promise<GeneratedArtifact>;
  reviewArtifact(
    artifact: GeneratedArtifact,
    workItem: WorkItem,
    subagent: Subagent,
    revisionPass?: boolean
  ): Promise<ReviewFinding[]>;
}
