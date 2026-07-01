import cors from "cors";
import express from "express";
import { resolve } from "node:path";
import { FactoryRepository } from "./db.js";
import { WorkflowService } from "./workflow.js";
import type { AgentEngine } from "./agents/engine.js";
import { createEngine, engineStatus, maskApiKey, normalizeConfig } from "./agents/index.js";
import type { AiConfigAuditResult, AiProviderConfig, AiProviderConfigInput, AiProviderConfigView, AiStatus } from "../src/types.js";
import { AppError } from "./errors.js";
import {
  parseAiConfigInput,
  parseAssignmentInput,
  parseCreateTaskInput,
  parseDocumentInput,
  parseProjectScanInput,
  parseReopenInput,
  parseSubagentInput
} from "./validation.js";

export interface AppOptions {
  dbPath?: string;
  serveStatic?: boolean;
  staticRoot?: string;
  aiConfig?: AiProviderConfig;
  apiKey?: string;
  engine?: AgentEngine;
  onAiConfigChange?: (config?: AiProviderConfig) => void;
  allowHttpProjectScan?: boolean;
}

export function createApp(options: AppOptions = {}) {
  const repo = new FactoryRepository(options.dbPath);
  let aiConfig = normalizeConfig(options.aiConfig ?? options.apiKey);
  let engine = options.engine ?? createEngine(aiConfig);
  const workflow = new WorkflowService(repo, engine);
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, service: "multi-agent-factory", ...engineStatus(engine, maskApiKey(aiConfig?.apiKey)) });
  });

  app.get("/api/settings/ai-config", (_request, response) => {
    response.json(aiConfigView(aiConfig));
  });

  app.post("/api/settings/ai-config", (request, response, next) => {
    try {
      const nextConfig = mergeAiConfig(aiConfig, parseAiConfigInput(request.body));
      response.json(applyAiConfig(nextConfig));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/settings/ai-config/audit", (request, response, next) => {
    try {
      const candidate = mergeAiConfig(aiConfig, parseAiConfigInput(request.body));
      response.json(auditAiConfig(candidate));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/snapshot", (request, response) => {
    response.json(workflow.snapshot(request.query.taskId?.toString()));
  });

  app.post("/api/projects/scan", (request, response, next) => {
    try {
      if (!options.allowHttpProjectScan) {
        throw new AppError("PROJECT_SCAN_DISABLED", "Web 模式不允许通过 HTTP 扫描本机项目，请使用桌面端目录选择。", 403);
      }
      const input = parseProjectScanInput(request.body);
      response.status(201).json(workflow.scanProject(input.rootPath));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectId/context", (request, response, next) => {
    try {
      response.json(workflow.projectContext(request.params.projectId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks", async (request, response, next) => {
    try {
      response.status(201).json(await workflow.createTask(parseCreateTaskInput(request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks/:taskId", (request, response, next) => {
    try {
      const bundle = repo.getBundle(request.params.taskId);
      if (!bundle) response.status(404).json({ error: "任务不存在", code: "NOT_FOUND" });
      else response.json(bundle);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/tasks/:taskId/requirements", async (request, response, next) => {
    try {
      const input = parseDocumentInput(request.body);
      response.json(await workflow.updateRequirements(request.params.taskId, input.content, input.feedback));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/requirements/confirm", async (request, response, next) => {
    try {
      const input = parseDocumentInput(request.body);
      response.json(await workflow.confirmRequirements(request.params.taskId, input.content, input.feedback));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/tasks/:taskId/plan", async (request, response, next) => {
    try {
      const input = parseDocumentInput(request.body);
      response.json(await workflow.updatePlan(request.params.taskId, input.content, input.feedback));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/plan/confirm", async (request, response, next) => {
    try {
      const input = parseDocumentInput(request.body);
      response.json(await workflow.confirmPlan(request.params.taskId, input.content, input.feedback));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/work-items/:workItemId/assignment", (request, response, next) => {
    try {
      const input = parseAssignmentInput(request.body);
      response.json(workflow.updateAssignment(request.params.workItemId, input.subagentId, input.modelTier));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/subagents", (_request, response) => {
    response.json(repo.listSubagents());
  });

  app.post("/api/subagents", (request, response, next) => {
    try {
      response.status(201).json(workflow.upsertSubagent(parseSubagentInput(request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/subagents/:subagentId", (request, response, next) => {
    try {
      response.json(workflow.upsertSubagent(parseSubagentInput(request.body, request.params.subagentId)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/generate", async (request, response, next) => {
    try {
      response.json(await workflow.runGeneration(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/review", async (request, response, next) => {
    try {
      response.json(await workflow.runReview(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/submit", (request, response, next) => {
    try {
      response.json(workflow.submit(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/apply", (request, response, next) => {
    try {
      response.json(workflow.apply(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/review-findings/:findingId/reopen", (request, response, next) => {
    try {
      const { note } = parseReopenInput(request.body);
      response.json(workflow.reopenFinding(request.params.findingId, note));
    } catch (error) {
      next(error);
    }
  });

  if (options.serveStatic) {
    const root = options.staticRoot ?? resolve(process.cwd(), "dist");
    app.use(express.static(root));
    app.get(/.*/, (_request, response) => response.sendFile(resolve(root, "index.html")));
  }

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof AppError) {
      response.status(error.status).json({ error: error.message, code: error.code, details: error.details });
      return;
    }
    const message = error instanceof Error ? error.message : "未知错误";
    response.status(400).json({ error: message, code: "INTERNAL_ERROR" });
  });

  return {
    app,
    repo,
    setAiConfig(nextConfig?: AiProviderConfig) {
      return applyAiConfig(nextConfig);
    },
    setApiKey(nextApiKey?: string) {
      return applyAiConfig(normalizeConfig(nextApiKey));
    },
    getAiStatus() {
      return engineStatus(engine, maskApiKey(aiConfig?.apiKey));
    },
    scanProject(rootPath: string) {
      return workflow.scanProject(rootPath);
    },
    projectContext(projectId: string) {
      return workflow.projectContext(projectId);
    }
  };

  function applyAiConfig(nextConfig?: AiProviderConfig): AiStatus {
    aiConfig = normalizeConfig(nextConfig);
    engine = createEngine(aiConfig);
    workflow.setEngine(engine);
    options.onAiConfigChange?.(aiConfig);
    return engineStatus(engine, maskApiKey(aiConfig?.apiKey));
  }
}

function mergeAiConfig(current: AiProviderConfig | undefined, input: AiProviderConfigInput): AiProviderConfig {
  const provider = input.provider === "openai" ? "openai" : "anthropic";
  const typedApiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const reusableApiKey = current?.provider === provider ? current.apiKey : "";
  return {
    provider,
    apiKey: input.clearApiKey ? "" : typedApiKey || reusableApiKey || "",
    baseUrl: input.baseUrl?.trim() || undefined,
    economyModel: input.economyModel?.trim() || undefined,
    qualityModel: input.qualityModel?.trim() || undefined
  };
}

function aiConfigView(config?: AiProviderConfig): AiProviderConfigView {
  return {
    provider: config?.provider ?? "anthropic",
    baseUrl: config?.baseUrl,
    economyModel: config?.economyModel,
    qualityModel: config?.qualityModel,
    keyMasked: maskApiKey(config?.apiKey),
    hasApiKey: Boolean(config?.apiKey?.trim())
  };
}

function auditAiConfig(config: AiProviderConfig): AiConfigAuditResult {
  const items: AiConfigAuditResult["items"] = [];
  const key = config.apiKey.trim();

  if (!key) {
    items.push({
      id: "api-key-missing",
      severity: "error",
      title: "API Key 缺失",
      message: "当前配置没有可用 API Key，生成和审查仍会走 Mock 模式。"
    });
  } else if (config.provider === "anthropic") {
    items.push(key.startsWith("sk-ant-")
      ? {
          id: "api-key-shape",
          severity: "info",
          title: "Key 格式符合 Anthropic 常见前缀",
          message: "已检测到 sk-ant- 前缀；不会在响应中返回明文 Key。"
        }
      : {
          id: "api-key-shape",
          severity: "warning",
          title: "Key 前缀需要人工确认",
          message: "Anthropic 常见 Key 以 sk-ant- 开头；如果你使用代理网关，可以忽略此提示。"
        });
  } else {
    items.push(key.startsWith("sk-")
      ? {
          id: "api-key-shape",
          severity: "info",
          title: "Key 格式符合 OpenAI 兼容接口常见前缀",
          message: "已检测到 sk- 前缀；不会在响应中返回明文 Key。"
        }
      : {
          id: "api-key-shape",
          severity: "warning",
          title: "Key 前缀需要人工确认",
          message: "OpenAI 兼容接口常见 Key 以 sk- 开头；Azure 或私有网关可能不同。"
        });
  }

  if (config.baseUrl) {
    try {
      const url = new URL(config.baseUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        items.push({
          id: "base-url-protocol",
          severity: "error",
          title: "Base URL 协议无效",
          message: "Base URL 必须使用 http 或 https 协议。"
        });
      } else {
        items.push({
          id: "base-url",
          severity: "info",
          title: "Base URL 格式可解析",
          message: `当前将使用 ${url.origin}。`
        });
      }
    } catch {
      items.push({
        id: "base-url",
        severity: "error",
        title: "Base URL 格式错误",
        message: "请填写完整 URL，例如 https://api.openai.com/v1。"
      });
    }
  } else {
    items.push({
      id: "base-url",
      severity: "info",
      title: "Base URL 使用默认值",
      message: config.provider === "openai" ? "OpenAI 兼容接口将使用默认 https://api.openai.com/v1。" : "Anthropic 将使用默认端点。"
    });
  }

  if (config.economyModel && config.qualityModel) {
    items.push({
      id: "models",
      severity: "info",
      title: "模型档位已显式配置",
      message: `economy=${config.economyModel}，quality=${config.qualityModel}。`
    });
  } else {
    items.push({
      id: "models",
      severity: "warning",
      title: "模型档位将使用默认值",
      message: "未完整填写 economy/quality 模型时，系统会使用 provider 默认模型。"
    });
  }

  items.push({
    id: "network",
    severity: "info",
    title: "未执行外部联网调用",
    message: "本次审查只检查配置完整性和本地格式，不会请求模型服务。"
  });

  const hasError = items.some((item) => item.severity === "error");
  const hasWarning = items.some((item) => item.severity === "warning");
  return {
    status: hasError ? "failed" : hasWarning ? "warning" : "passed",
    provider: config.provider,
    keyMasked: maskApiKey(key),
    canUseRealModel: Boolean(key) && !hasError,
    items,
    reviewedAt: new Date().toISOString()
  };
}
