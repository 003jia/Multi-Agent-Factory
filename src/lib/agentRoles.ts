import type { TaskStage } from "../types.js";

export type AgentRoleKey =
  | "coordinator"
  | "product"
  | "planner"
  | "implementer"
  | "reviewer"
  | "fixer"
  | "supervisor";

export interface AgentRoleProfile {
  key: AgentRoleKey;
  title: string;
  responsibility: string;
  defaultModelTier: "economy" | "quality";
  handoff: string;
}

export interface StageAgentProfile {
  stage: Exclude<TaskStage, "revision">;
  role: AgentRoleKey;
  owner: string;
  responsibility: string;
  input: string;
  output: string;
  gate: string;
}

export const agentRoleProfiles: Record<AgentRoleKey, AgentRoleProfile> = {
  coordinator: {
    key: "coordinator",
    title: "协调调度 Agent",
    responsibility: "接收用户目标，维护 7 步流程状态，决定何时进入下一阶段。",
    defaultModelTier: "quality",
    handoff: "把已确认目标转交给具体阶段负责人，并保存交接记录。"
  },
  product: {
    key: "product",
    title: "产品需求 Agent",
    responsibility: "把用户输入整理成可确认、可修改、可验收的需求文档。",
    defaultModelTier: "economy",
    handoff: "输出需求文档版本，等待用户确认后交给计划阶段。"
  },
  planner: {
    key: "planner",
    title: "任务计划 Agent",
    responsibility: "把需求拆成 work item、依赖关系、验收门禁和分派建议。",
    defaultModelTier: "quality",
    handoff: "输出任务计划与可分派 work item，交给调度和分派阶段。"
  },
  implementer: {
    key: "implementer",
    title: "实现 Agent",
    responsibility: "按 work item 生成可审查代码产物、文件树、diff 和提交说明草稿。",
    defaultModelTier: "economy",
    handoff: "提交可审查产物，不直接写入真实项目文件。"
  },
  reviewer: {
    key: "reviewer",
    title: "代码审查 Agent",
    responsibility: "执行质量门禁，识别错误、风险和需要回流的问题。",
    defaultModelTier: "quality",
    handoff: "输出审查意见，允许通过或创建回流记录。"
  },
  fixer: {
    key: "fixer",
    title: "问题修复 Agent",
    responsibility: "接收审查或提交后的问题回流，定位责任 work item 并重跑生成。",
    defaultModelTier: "quality",
    handoff: "把修复后的产物重新交给审查阶段。"
  },
  supervisor: {
    key: "supervisor",
    title: "监督巡检 Agent",
    responsibility: "监控容量、卡住状态、失败重试和需要人工判断的升级事件。",
    defaultModelTier: "economy",
    handoff: "输出健康状态、阻塞原因和升级建议。"
  }
};

export const stageAgentProfiles: Record<Exclude<TaskStage, "revision">, StageAgentProfile> = {
  intake: {
    stage: "intake",
    role: "coordinator",
    owner: agentRoleProfiles.coordinator.title,
    responsibility: "确认目标、复杂度和执行边界。",
    input: "用户任务描述",
    output: "任务记录与初始需求生成请求",
    gate: "标题、描述和复杂度完整后进入需求确认。"
  },
  requirements_review: {
    stage: "requirements_review",
    role: "product",
    owner: agentRoleProfiles.product.title,
    responsibility: "生成并维护需求文档草稿。",
    input: "任务记录与用户反馈",
    output: "已确认需求文档版本",
    gate: "用户确认需求后才能生成任务计划。"
  },
  plan_review: {
    stage: "plan_review",
    role: "planner",
    owner: agentRoleProfiles.planner.title,
    responsibility: "生成计划、拆分策略和门禁标准。",
    input: "已确认需求文档",
    output: "已确认任务计划",
    gate: "用户确认计划后才能拆分 work item。"
  },
  assignment: {
    stage: "assignment",
    role: "coordinator",
    owner: agentRoleProfiles.coordinator.title,
    responsibility: "按能力、成本、质量和并发容量分派 work item。",
    input: "任务计划、subagent 能力和容量",
    output: "分派记录与模型层级策略",
    gate: "每个 work item 都有责任 Agent 后才能生成。"
  },
  generation: {
    stage: "generation",
    role: "implementer",
    owner: agentRoleProfiles.implementer.title,
    responsibility: "生成可审查代码产物和提交说明草稿。",
    input: "work item、分派记录、模型层级",
    output: "文件、diff、Agent 输出说明",
    gate: "产物完整后进入代码审查。"
  },
  review: {
    stage: "review",
    role: "reviewer",
    owner: agentRoleProfiles.reviewer.title,
    responsibility: "运行审查门禁并标记通过、警告或错误。",
    input: "代码产物、diff、责任 Agent",
    output: "审查意见和回流记录",
    gate: "无开放错误后才能提交完成。"
  },
  submitted: {
    stage: "submitted",
    role: "supervisor",
    owner: agentRoleProfiles.supervisor.title,
    responsibility: "汇总提交记录、审查状态、回流次数和后续风险。",
    input: "审查通过结果和提交草稿",
    output: "提交记录与最终状态",
    gate: "提交记录可追踪，问题可回流到责任 Agent。"
  }
};

export const revisionAgentProfile = {
  role: "fixer" as const,
  owner: agentRoleProfiles.fixer.title,
  responsibility: "把开放问题回流到责任 Agent，修复后重新进入生成和审查。"
};
