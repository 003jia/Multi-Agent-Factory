import { randomUUID } from "node:crypto";
import type {
  Assignment,
  CanvasEdge,
  CanvasNode,
  GeneratedArtifact,
  ReviewFinding,
  Subagent,
  Task,
  WorkItem
} from "../src/types.js";
import { agentRoleProfiles } from "../src/lib/agentRoles.js";
import { chooseModelTier } from "./modelRouter.js";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

export const defaultSubagents: Subagent[] = [
  {
    id: "agent_coordinator",
    name: agentRoleProfiles.coordinator.title,
    role: agentRoleProfiles.coordinator.responsibility,
    skills: ["流程编排", "任务交接", "容量调度", "升级判断"],
    enabled: true,
    costTier: "medium",
    qualityTier: "premium",
    defaultModelTier: agentRoleProfiles.coordinator.defaultModelTier,
    concurrencyLimit: 1,
    activeAssignments: 0
  },
  {
    id: "agent_product",
    name: agentRoleProfiles.product.title,
    role: agentRoleProfiles.product.responsibility,
    skills: ["需求分析", "范围拆解", "验收标准", "用户反馈整理"],
    enabled: true,
    costTier: "low",
    qualityTier: "standard",
    defaultModelTier: agentRoleProfiles.product.defaultModelTier,
    concurrencyLimit: 3,
    activeAssignments: 0
  },
  {
    id: "agent_planner",
    name: agentRoleProfiles.planner.title,
    role: agentRoleProfiles.planner.responsibility,
    skills: ["任务拆分", "依赖关系", "系统设计", "验收门禁"],
    enabled: true,
    costTier: "medium",
    qualityTier: "premium",
    defaultModelTier: agentRoleProfiles.planner.defaultModelTier,
    concurrencyLimit: 2,
    activeAssignments: 0
  },
  {
    id: "agent_frontend",
    name: "前端实现 Agent",
    role: "React 工作台与交互实现",
    skills: ["React", "TypeScript", "UI 状态", "客户端界面"],
    enabled: true,
    costTier: "medium",
    qualityTier: "standard",
    defaultModelTier: agentRoleProfiles.implementer.defaultModelTier,
    concurrencyLimit: 2,
    activeAssignments: 0
  },
  {
    id: "agent_backend",
    name: "后端实现 Agent",
    role: "API、SQLite 与编排逻辑",
    skills: ["Express", "SQLite", "状态机", "持久化工作单"],
    enabled: true,
    costTier: "medium",
    qualityTier: "standard",
    defaultModelTier: agentRoleProfiles.implementer.defaultModelTier,
    concurrencyLimit: 2,
    activeAssignments: 0
  },
  {
    id: "agent_review",
    name: agentRoleProfiles.reviewer.title,
    role: agentRoleProfiles.reviewer.responsibility,
    skills: ["代码审查", "测试", "风险识别", "提交门禁"],
    enabled: true,
    costTier: "high",
    qualityTier: "premium",
    defaultModelTier: agentRoleProfiles.reviewer.defaultModelTier,
    concurrencyLimit: 1,
    activeAssignments: 0
  },
  {
    id: "agent_fix",
    name: agentRoleProfiles.fixer.title,
    role: agentRoleProfiles.fixer.responsibility,
    skills: ["问题回流", "边界修复", "回归验证"],
    enabled: true,
    costTier: "medium",
    qualityTier: "premium",
    defaultModelTier: agentRoleProfiles.fixer.defaultModelTier,
    concurrencyLimit: 1,
    activeAssignments: 0
  },
  {
    id: "agent_supervisor",
    name: agentRoleProfiles.supervisor.title,
    role: agentRoleProfiles.supervisor.responsibility,
    skills: ["健康检查", "失败重试", "阻塞升级", "容量监控"],
    enabled: true,
    costTier: "low",
    qualityTier: "standard",
    defaultModelTier: agentRoleProfiles.supervisor.defaultModelTier,
    concurrencyLimit: 1,
    activeAssignments: 0
  }
];

export function generateRequirements(task: Task): string {
  const route = chooseModelTier({ stage: "requirements", complexity: task.complexity });
  return `# ${task.title} 需求文档

## 背景
用户提交的任务是：${task.prompt}

## 目标
搭建一个可确认、可追踪、可回流的多 Agent 工作流，确保需求、计划、执行、审查和提交都有明确状态。

## 关键能力
- 任务进入模型层后生成可编辑需求文档。
- 用户可以直接修改文档，或给出反馈让 Agent 重新整理。
- 需求确认后才允许生成任务计划。
- 后续执行必须保留 subagent、模型层级、产物和审查记录。
- 每一步都必须有责任 Agent、输入、输出和门禁。
- 调度层需要考虑能力匹配、并发容量、失败回流和人工升级。

## 验收标准
- 需求确认状态清晰可见。
- 绿色表示正确通过，红色表示错误需要修改，黄色表示验证中。
- 当前草稿由 ${route.modelTier} 模型策略生成：${route.reason}。`;
}

export function generatePlan(task: Task): string {
  const route = chooseModelTier({ stage: "plan", complexity: task.complexity });
  return `# ${task.title} 任务计划

1. 建立任务状态机与持久化结构。
2. 建立明确的 Agent 职责：协调、产品、计划、实现、审查、修复、监督。
3. 根据需求拆分 work item，并为每个 work item 选择合适 subagent。
4. 使用 economy/quality 两档模型策略控制成本和质量。
5. 调度时考虑并发上限，避免所有 work item 同时压到同一个 Agent。
6. 生成可审查代码产物，包括文件树、diff 和提交说明草稿。
7. 由代码审查 Agent 输出审查结论，必要时回流到责任 Agent。
8. 为 V2 代码画布保留文件、diff、审查意见、Agent 与 work item 的关系数据。

模型策略：${route.modelTier}，原因：${route.reason}。`;
}

export function splitWorkItems(task: Task): WorkItem[] {
  const base: Array<Pick<WorkItem, "title" | "description" | "targetFiles" | "dependencies" | "acceptanceChecks" | "riskLevel" | "verificationCommands" | "complexity" | "preferredModelTier">> = [
    {
      title: "数据模型与任务状态机",
      description: "实现任务、需求文档、计划、分派、产物、审查和问题回流的数据结构。",
      targetFiles: ["src/types.ts", "server/db.ts", "server/workflow.ts"],
      dependencies: ["SQLite schema", "TaskBundle"],
      acceptanceChecks: ["类型检查通过", "状态机门禁覆盖"],
      riskLevel: task.complexity >= 8 ? "high" : "medium",
      verificationCommands: [],
      complexity: Math.max(4, task.complexity - 1),
      preferredModelTier: task.complexity >= 7 ? "quality" : "economy"
    },
    {
      title: "Agent 编排与模型路由",
      description: "按阶段和复杂度选择 economy 或 quality，并将任务分配给合适的 subagent。",
      targetFiles: ["server/agents/engine.ts", "server/modelRouter.ts"],
      dependencies: ["模型配置", "Subagent 能力标签"],
      acceptanceChecks: ["模型路由可解释", "离线 Mock 可用"],
      riskLevel: task.complexity >= 7 ? "high" : "medium",
      verificationCommands: [],
      complexity: task.complexity,
      preferredModelTier: task.complexity >= 6 ? "quality" : "economy"
    },
    {
      title: "调度容量与健康巡检",
      description: "实现并发容量、卡住状态、失败重试和升级事件的记录策略。",
      targetFiles: ["server/mockAgents.ts", "src/lib/agentRoles.ts"],
      dependencies: ["Subagent 配置", "Assignment"],
      acceptanceChecks: ["分派理由包含容量", "失败可升级"],
      riskLevel: task.complexity >= 8 ? "high" : "medium",
      verificationCommands: [],
      complexity: Math.max(5, task.complexity),
      preferredModelTier: task.complexity >= 7 ? "quality" : "economy"
    },
    {
      title: "工作台前端体验",
      description: "实现白+蓝简约工作台、确认流程、subagent 窗口、产物和审查视图。",
      targetFiles: ["src/App.tsx", "src/styles.css"],
      dependencies: ["React", "状态色 token"],
      acceptanceChecks: ["7 步页面可见", "每页主操作清晰"],
      riskLevel: "medium",
      verificationCommands: [],
      complexity: Math.max(5, task.complexity),
      preferredModelTier: "economy"
    },
    {
      title: "代码画布 V2 数据预留",
      description: "保存文件、diff、审查、Agent、work item 的图谱关系，首版仅查看追踪。",
      targetFiles: ["src/components/CanvasPreview.tsx", "server/mockAgents.ts"],
      dependencies: ["PatchSet", "ReviewFinding"],
      acceptanceChecks: ["图谱关联 work item/文件/diff/finding", "入口标记为 V2"],
      riskLevel: "low",
      verificationCommands: [],
      complexity: Math.max(4, task.complexity - 2),
      preferredModelTier: "economy"
    }
  ];

  return base.map((item) => ({
    id: id("work"),
    taskId: task.id,
    status: "queued",
    assignedSubagentId: null,
    ...item
  }));
}

export function assignWorkItems(task: Task, workItems: WorkItem[], subagents: Subagent[]): Assignment[] {
  const enabled = subagents.filter((agent) => agent.enabled);
  if (!enabled.length) throw new Error("没有可用 subagent，无法分派任务");
  const load = new Map(enabled.map((agent) => [agent.id, agent.activeAssignments]));
  return workItems.map((item) => {
    const agent = pickSubagent(item, enabled, load);
    load.set(agent.id, (load.get(agent.id) ?? 0) + 1);
    const route = chooseModelTier({
      stage: "generation",
      complexity: item.complexity,
      subagent: agent,
      manualModelTier: item.preferredModelTier
    });

    return {
      id: id("assign"),
      taskId: task.id,
      workItemId: item.id,
      subagentId: agent.id,
      modelTier: route.modelTier,
      strategyReason: `${route.reason}；按能力评分（技能/目标文件/风险）与并发容量匹配 ${agent.name}；交接物：${item.title} 产物草稿`,
      manualOverride: false,
      createdAt: now()
    };
  });
}

// 元角色（编排/产品/巡检）不直接承接实现工作单，除非确无更合适的候选。
const META_AGENT_IDS = new Set(["agent_coordinator", "agent_product", "agent_supervisor"]);

/** 从 targetFiles 的扩展名/路径推断领域，用于能力打分。 */
function fileDomainHints(targetFiles: string[]): Set<string> {
  const hints = new Set<string>();
  for (const file of targetFiles) {
    const lower = file.toLowerCase();
    if (/\.(tsx|jsx|vue|svelte|css|scss|less|html)$/.test(lower) || /(^|\/)(components?|pages?|ui|styles?|views?)\//.test(lower)) {
      hints.add("frontend");
    }
    if (/\.(sql)$/.test(lower) || /(^|\/)(server|api|routes?|controllers?|db|database|services?|models?)\//.test(lower)) {
      hints.add("backend");
    }
    if (/\.(test|spec)\./.test(lower) || /(^|\/)(tests?|__tests__|e2e)\//.test(lower)) {
      hints.add("test");
    }
    if (/\.(json|ya?ml|toml)$/.test(lower) || /(^|\/)(config|scripts?)\//.test(lower)) {
      hints.add("config");
    }
  }
  return hints;
}

/** 对单个 subagent 与 work item 做能力匹配打分（确定性，可单测）。 */
export function scoreSubagent(workItem: WorkItem, agent: Subagent, load: Map<string, number>): number {
  const targetFiles = workItem.targetFiles ?? [];
  const haystack = `${workItem.title} ${workItem.description ?? ""} ${targetFiles.join(" ")}`.toLowerCase();
  let score = 0;
  for (const skill of agent.skills) {
    if (skill && haystack.includes(skill.toLowerCase())) score += 3;
  }
  const domains = fileDomainHints(targetFiles);
  if (domains.has("frontend") && agent.id === "agent_frontend") score += 5;
  if (domains.has("backend") && agent.id === "agent_backend") score += 5;
  if (domains.has("test") && (agent.id === "agent_review" || agent.id === "agent_fix")) score += 4;
  if (domains.has("config") && agent.id === "agent_backend") score += 2;
  if (workItem.riskLevel === "high" && agent.qualityTier === "premium") score += 2;
  if (META_AGENT_IDS.has(agent.id)) score -= 4;
  const limit = Math.max(1, agent.concurrencyLimit);
  const current = load.get(agent.id) ?? 0;
  score -= (current / limit) * 2; // 负载越满越不优先
  if (current >= agent.concurrencyLimit) score -= 3; // 超并发上限重罚（仍可兜底）
  return score;
}

function pickSubagent(workItem: WorkItem, subagents: Subagent[], load: Map<string, number>): Subagent {
  return [...subagents]
    .map((agent) => ({ agent, score: scoreSubagent(workItem, agent, load) }))
    .sort((left, right) => right.score - left.score || (load.get(left.agent.id) ?? 0) - (load.get(right.agent.id) ?? 0))[0]
    .agent;
}

export function generateArtifact(
  task: Task,
  workItem: WorkItem,
  assignment: Assignment,
  subagent: Subagent,
  errorContext?: string
): GeneratedArtifact {
  const fileBase = workItem.title
    .replace(/\s+/g, "-")
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9-]/g, "")
    .slice(0, 24);

  const fixNote = errorContext?.trim()
    ? ` \u672c\u8f6e\u5df2\u9488\u5bf9\u56de\u6d41\u95ee\u9898\u91cd\u751f\u6210\uff1a${errorContext.trim().split("\n")[0]}`
    : "";

  return {
    id: id("artifact"),
    taskId: task.id,
    workItemId: workItem.id,
    subagentId: subagent.id,
    modelTier: assignment.modelTier,
    patchSetId: null,
    files: [
      {
        path: `src/generated/${fileBase || "work-item"}.ts`,
        language: "typescript",
        summary: `由 ${subagent.name} 生成的 ${workItem.title} 产物草稿。`,
        content: `export const feature = "${workItem.title}";\nexport const owner = "${subagent.name}";\nexport const responsibility = "${subagent.role}";\nexport const modelTier = "${assignment.modelTier}";\nexport const handoff = "${assignment.strategyReason}";\n`,
        diff: `+ export const feature = "${workItem.title}";\n+ export const owner = "${subagent.name}";\n+ export const responsibility = "${subagent.role}";\n+ export const modelTier = "${assignment.modelTier}";\n+ export const handoff = "${assignment.strategyReason}";`
      }
    ],
    agentNotes: `${subagent.name} 已完成 ${workItem.title}。责任：${subagent.role}。当前产物只作为审查材料，不写入真实项目文件。${fixNote}`,
    commitMessageDraft: `feat: ${task.title} - ${workItem.title}`,
    createdAt: now()
  };
}

export function reviewArtifact(
  artifact: GeneratedArtifact,
  workItem: WorkItem,
  subagent: Subagent,
  revisionPass = false
): ReviewFinding[] {
  const findings: ReviewFinding[] = [
    {
      id: id("finding"),
      taskId: artifact.taskId,
      artifactId: artifact.id,
      workItemId: workItem.id,
      subagentId: subagent.id,
      severity: "info",
      status: "resolved",
      source: "model",
      message: `${workItem.title} 的产物结构完整，已关联责任 Agent 和模型层级。`,
      suggestedFix: "无需修改。",
      createdAt: now()
    }
  ];

  if (workItem.complexity >= 8 && !revisionPass) {
    findings.push({
      id: id("finding"),
      taskId: artifact.taskId,
      artifactId: artifact.id,
      workItemId: workItem.id,
      subagentId: subagent.id,
      severity: "error",
      status: "open",
      source: "model",
      message: `${workItem.title} 复杂度较高，需要补充边界条件验证。`,
      suggestedFix: "回流给责任 Agent，补充失败路径和回归测试；若连续失败，由监督巡检 Agent 标记为需要人工判断。",
      createdAt: now()
    });
  }

  return findings;
}

export function buildCanvasGraph(
  taskId: string,
  workItems: WorkItem[],
  artifacts: GeneratedArtifact[],
  findings: ReviewFinding[],
  subagents: Subagent[]
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  const pushEdge = (sourceId: string, targetId: string, label: string) => {
    edges.push({ id: id("edge"), taskId, sourceId, targetId, label });
  };

  for (const workItem of workItems) {
    const workNodeId = `canvas_work_${workItem.id}`;
    nodes.push({ id: workNodeId, taskId, type: "workItem", label: workItem.title, refId: workItem.id });

    const artifact = artifacts.find((item) => item.workItemId === workItem.id);
    const agent = subagents.find((item) => item.id === workItem.assignedSubagentId);
    if (agent) {
      const agentNodeId = `canvas_agent_${agent.id}_${workItem.id}`;
      nodes.push({ id: agentNodeId, taskId, type: "agent", label: agent.name, refId: agent.id });
      pushEdge(workNodeId, agentNodeId, "分派给");
    }

    if (!artifact) continue;

    for (const file of artifact.files) {
      const fileNodeId = `canvas_file_${artifact.id}_${file.path}`;
      const diffNodeId = `canvas_diff_${artifact.id}_${file.path}`;
      nodes.push({ id: fileNodeId, taskId, type: "file", label: file.path, refId: artifact.id });
      nodes.push({ id: diffNodeId, taskId, type: "diff", label: `${file.path} diff`, refId: artifact.id });
      pushEdge(workNodeId, fileNodeId, "生成");
      pushEdge(fileNodeId, diffNodeId, "包含 diff");

      for (const finding of findings.filter((item) => item.artifactId === artifact.id)) {
        const reviewNodeId = `canvas_review_${finding.id}`;
        nodes.push({ id: reviewNodeId, taskId, type: "review", label: finding.message, refId: finding.id });
        pushEdge(diffNodeId, reviewNodeId, finding.status === "open" ? "需要修改" : "审查通过");
      }
    }
  }

  return { nodes, edges };
}
