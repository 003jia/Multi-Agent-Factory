import { randomUUID } from "node:crypto";
import type {
  Assignment,
  GeneratedArtifact,
  GeneratedFile,
  ModelTier,
  ReviewFinding,
  Subagent,
  Task,
  WorkItem
} from "../../src/types.js";
import type { AgentEngine } from "./engine.js";

interface OpenAiArtifactResponse {
  files: GeneratedFile[];
  agentNotes: string;
  commitMessageDraft: string;
}

interface OpenAiReviewResponse {
  findings: Array<Pick<ReviewFinding, "severity" | "status" | "message" | "suggestedFix">>;
}

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

const systemPrompt = `你是多 Agent 工厂的模型层。输出必须清晰、可执行、可审查。需要 JSON 时只输出 JSON，不要 Markdown 包裹。`;

/**
 * 兼容 OpenAI Chat Completions 格式的引擎（OpenAI / Azure / Ollama / vLLM / OpenRouter 等）。
 * 用裸 fetch 调用 `${baseUrl}/chat/completions`，baseUrl 可在设置里自定义。
 */
export class OpenAiEngine implements AgentEngine {
  readonly kind = "openai" as const;
  readonly models: Record<ModelTier, string>;
  readonly baseUrl: string;

  constructor(private apiKey: string, baseUrl: string, models: Record<ModelTier, string>) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.models = models;
  }

  async generateRequirements(task: Task): Promise<string> {
    return this.text(tierFor(task.complexity, 6), `请为以下任务生成中文需求文档，包含背景、目标、范围、流程、验收标准，保持可供用户确认和编辑。\n\n任务标题：${task.title}\n任务描述：${task.prompt}`);
  }

  async regenerateRequirements(task: Task, feedback: string, previousContent: string): Promise<string> {
    return this.text(tierFor(task.complexity, 6), `请根据用户反馈重写需求文档，保留合理内容并明确响应反馈。\n\n用户反馈：${feedback}\n\n上一版：\n${previousContent}`);
  }

  async generatePlan(task: Task, requirements: string): Promise<string> {
    return this.text(tierFor(task.complexity, 6), `请基于已确认需求生成任务计划，包含阶段、任务拆分、agent 分派依据、验证标准。\n\n任务：${task.title}\n\n需求：\n${requirements}`);
  }

  async regeneratePlan(task: Task, feedback: string, previousContent: string): Promise<string> {
    return this.text(tierFor(task.complexity, 6), `请根据用户反馈重写任务计划，保持可执行、可验证。\n\n用户反馈：${feedback}\n\n上一版：\n${previousContent}`);
  }

  async splitWorkItems(task: Task, plan: string): Promise<WorkItem[]> {
    const payload = await this.json<{ items: Array<Omit<WorkItem, "id" | "taskId" | "status" | "assignedSubagentId">> }>(
      tierFor(task.complexity, 7),
      `请把任务计划拆分为 3-6 个 work item。只返回 JSON：{"items":[{"title":"","description":"","complexity":1-10,"preferredModelTier":"economy|quality"}]}。\n\n任务：${task.title}\n计划：\n${plan}`
    );
    return (payload.items ?? []).map((item) => ({
      id: id("work"),
      taskId: task.id,
      title: item.title,
      description: item.description,
      targetFiles: item.targetFiles ?? task.selectedFiles ?? [],
      dependencies: item.dependencies ?? [],
      acceptanceChecks: item.acceptanceChecks ?? ["静态校验通过"],
      riskLevel: item.riskLevel ?? (clamp(item.complexity, 1, 10) >= 8 ? "high" : "medium"),
      verificationCommands: item.verificationCommands ?? [],
      complexity: clamp(item.complexity, 1, 10),
      preferredModelTier: item.preferredModelTier === "quality" ? "quality" : "economy",
      status: "queued",
      assignedSubagentId: null
    }));
  }

  async generateArtifact(
    task: Task,
    workItem: WorkItem,
    assignment: Assignment,
    subagent: Subagent,
    errorContext?: string
  ): Promise<GeneratedArtifact> {
    const fixBlock = errorContext?.trim()
      ? `\n\n【回流修复】上一轮的静态校验/审查发现了以下问题，请在本次生成中针对性修复，确保代码可通过编译：\n${errorContext.trim()}\n`
      : "";
    const payload = await this.json<OpenAiArtifactResponse>(
      assignment.modelTier,
      `你是 ${subagent.name}，角色：${subagent.role}，能力：${subagent.skills.join("、")}。
请为 work item 生成真实可下载的多文件代码产物。不要写入真实文件系统，只返回 JSON。${fixBlock}

JSON 结构：
{
  "agentNotes": "说明",
  "commitMessageDraft": "feat: ...",
  "files": [
    {"path":"src/...","language":"typescript","summary":"...","content":"完整文件内容","diff":"统一 diff 或 + 行摘要"}
  ]
}

任务：${task.title}
任务描述：${task.prompt}
work item：${workItem.title}
work item 描述：${workItem.description}`,
      { maxTokens: assignment.modelTier === "quality" ? 8192 : 4096 }
    );

    return {
      id: id("artifact"),
      taskId: task.id,
      workItemId: workItem.id,
      subagentId: subagent.id,
      modelTier: assignment.modelTier,
      patchSetId: null,
      files: (payload.files ?? []).map((file) => ({
        path: file.path,
        language: file.language || "text",
        summary: file.summary || "OpenAI 生成文件",
        content: file.content || "",
        diff: file.diff || buildDiffFromContent(file.content || "")
      })),
      agentNotes: payload.agentNotes || `${subagent.name} 已生成代码产物。`,
      commitMessageDraft: payload.commitMessageDraft || `feat: ${task.title} - ${workItem.title}`,
      createdAt: now()
    };
  }

  async reviewArtifact(
    artifact: GeneratedArtifact,
    workItem: WorkItem,
    subagent: Subagent
  ): Promise<ReviewFinding[]> {
    const payload = await this.json<OpenAiReviewResponse>(
      "quality",
      `你是代码审查 Agent。请审查以下生成产物，只返回 JSON：
{"findings":[{"severity":"info|warning|error","status":"open|resolved","message":"","suggestedFix":""}]}

责任 Agent：${subagent.name}
work item：${workItem.title}
文件：
${artifact.files.map((file) => `### ${file.path}\n${file.content}`).join("\n\n")}`
    );
    return (payload.findings ?? []).map((finding) => ({
      id: id("finding"),
      taskId: artifact.taskId,
      artifactId: artifact.id,
      workItemId: workItem.id,
      subagentId: subagent.id,
      severity: normalizeSeverity(finding.severity),
      status: finding.status === "open" ? "open" : "resolved",
      source: "model",
      message: finding.message || "OpenAI 审查完成。",
      suggestedFix: finding.suggestedFix || "无需修改。",
      createdAt: now()
    }));
  }

  private async text(modelTier: ModelTier, prompt: string, options?: { maxTokens?: number }): Promise<string> {
    return this.chat(modelTier, prompt, { ...options, json: false });
  }

  private async json<T>(modelTier: ModelTier, prompt: string, options?: { maxTokens?: number }): Promise<T> {
    const text = await this.chat(modelTier, prompt, { ...options, json: true });
    return parseJson<T>(text);
  }

  private async chat(modelTier: ModelTier, prompt: string, options: { json: boolean; maxTokens?: number }): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.models[modelTier],
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      max_tokens: options.maxTokens ?? (modelTier === "quality" ? 4096 : 2048),
      temperature: 0.2
    };
    if (options.json) body.response_format = { type: "json_object" };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`OpenAI 兼容接口错误 ${response.status}：${(await response.text()).slice(0, 300)}`);
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  }
}

function tierFor(complexity: number, threshold: number): ModelTier {
  return complexity >= threshold ? "quality" : "economy";
}

function parseJson<T>(text: string): T {
  const trimmed = text.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = match?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(jsonText) as T;
  } catch (error) {
    throw new Error(`OpenAI 返回内容不是合法 JSON：${error instanceof Error ? error.message : "解析失败"}`);
  }
}

function buildDiffFromContent(content: string): string {
  return content
    .split("\n")
    .map((line) => `+ ${line}`)
    .join("\n");
}

function normalizeSeverity(value: unknown): ReviewFinding["severity"] {
  return value === "error" || value === "warning" ? value : "info";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));
}
