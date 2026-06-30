import type {
  Assignment,
  GeneratedArtifact,
  ReviewFinding,
  Subagent,
  Task,
  WorkItem
} from "../../src/types.js";
import type { AgentEngine } from "./engine.js";
import {
  generateArtifact,
  generatePlan,
  generateRequirements,
  reviewArtifact,
  splitWorkItems
} from "../mockAgents.js";

export class MockEngine implements AgentEngine {
  readonly kind = "mock" as const;
  readonly models = { economy: "mock", quality: "mock" } as const;

  async generateRequirements(task: Task): Promise<string> {
    return generateRequirements(task);
  }

  async regenerateRequirements(task: Task, feedback: string, previousContent: string): Promise<string> {
    return `${generateRequirements(task)}

## 本轮反馈处理
用户反馈：${feedback.trim()}

## 上一版草稿参考
${previousContent.trim()}`;
  }

  async generatePlan(task: Task, _requirements: string): Promise<string> {
    return generatePlan(task);
  }

  async regeneratePlan(task: Task, feedback: string, previousContent: string): Promise<string> {
    return `${generatePlan(task)}

## 本轮反馈处理
用户反馈：${feedback.trim()}

## 上一版计划参考
${previousContent.trim()}`;
  }

  async splitWorkItems(task: Task, _plan: string): Promise<WorkItem[]> {
    return splitWorkItems(task);
  }

  async generateArtifact(
    task: Task,
    workItem: WorkItem,
    assignment: Assignment,
    subagent: Subagent,
    errorContext?: string
  ): Promise<GeneratedArtifact> {
    return generateArtifact(task, workItem, assignment, subagent, errorContext);
  }

  async reviewArtifact(
    artifact: GeneratedArtifact,
    workItem: WorkItem,
    subagent: Subagent,
    revisionPass = false
  ): Promise<ReviewFinding[]> {
    return reviewArtifact(artifact, workItem, subagent, revisionPass);
  }
}
