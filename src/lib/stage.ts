import type { TaskStage, ValidationState } from "../types";

export const stageLabels: Record<TaskStage, string> = {
  intake: "任务录入",
  requirements_review: "需求确认",
  plan_review: "计划确认",
  assignment: "任务分派",
  generation: "代码生成",
  review: "代码审查",
  submitted: "提交完成",
  revision: "问题回流"
};

export const validationLabels: Record<ValidationState, string> = {
  pending: "等待中",
  running: "验证中",
  passed: "正确通过",
  failed: "错误需修改"
};

export const workflowOrder: TaskStage[] = [
  "intake",
  "requirements_review",
  "plan_review",
  "assignment",
  "generation",
  "review",
  "submitted"
];
