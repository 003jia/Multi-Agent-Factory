import cors from "cors";
import express from "express";
import { resolve } from "node:path";
import { FactoryRepository } from "./db.js";
import { WorkflowService } from "./workflow.js";
import type { AgentEngine } from "./agents/engine.js";
import { createEngine, engineStatus, maskApiKey, normalizeConfig } from "./agents/index.js";
import type { AiProviderConfig, AiProviderConfigInput, AiProviderConfigView, AiStatus } from "../src/types.js";

export interface AppOptions {
  dbPath?: string;
  serveStatic?: boolean;
  staticRoot?: string;
  aiConfig?: AiProviderConfig;
  apiKey?: string;
  engine?: AgentEngine;
  onAiConfigChange?: (config?: AiProviderConfig) => void;
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
      const nextConfig = mergeAiConfig(aiConfig, request.body as AiProviderConfigInput);
      response.json(applyAiConfig(nextConfig));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/snapshot", (request, response) => {
    response.json(workflow.snapshot(request.query.taskId?.toString()));
  });

  app.post("/api/projects/scan", (request, response, next) => {
    try {
      response.status(201).json(workflow.scanProject(String(request.body.rootPath || "")));
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
      response.status(201).json(
        await workflow.createTask({
          projectId: request.body.projectId ? String(request.body.projectId) : null,
          title: String(request.body.title || "未命名任务"),
          prompt: String(request.body.prompt || ""),
          selectedFiles: Array.isArray(request.body.selectedFiles) ? request.body.selectedFiles.map(String) : [],
          constraints: String(request.body.constraints || ""),
          complexity: Number(request.body.complexity || 5)
        })
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks/:taskId", (request, response, next) => {
    try {
      const bundle = repo.getBundle(request.params.taskId);
      if (!bundle) response.status(404).json({ error: "任务不存在" });
      else response.json(bundle);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/tasks/:taskId/requirements", async (request, response, next) => {
    try {
      response.json(await workflow.updateRequirements(request.params.taskId, String(request.body.content || ""), String(request.body.feedback || "")));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/requirements/confirm", async (request, response, next) => {
    try {
      response.json(await workflow.confirmRequirements(request.params.taskId, String(request.body.content || ""), String(request.body.feedback || "")));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/tasks/:taskId/plan", async (request, response, next) => {
    try {
      response.json(await workflow.updatePlan(request.params.taskId, String(request.body.content || ""), String(request.body.feedback || "")));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/plan/confirm", async (request, response, next) => {
    try {
      response.json(await workflow.confirmPlan(request.params.taskId, String(request.body.content || ""), String(request.body.feedback || "")));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/work-items/:workItemId/assignment", (request, response, next) => {
    try {
      response.json(workflow.updateAssignment(request.params.workItemId, String(request.body.subagentId), request.body.modelTier));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/subagents", (_request, response) => {
    response.json(repo.listSubagents());
  });

  app.post("/api/subagents", (request, response, next) => {
    try {
      response.status(201).json(workflow.upsertSubagent(request.body));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/subagents/:subagentId", (request, response, next) => {
    try {
      response.json(workflow.upsertSubagent({ ...request.body, id: request.params.subagentId }));
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
      response.json(workflow.submit(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/review-findings/:findingId/reopen", (request, response, next) => {
    try {
      response.json(workflow.reopenFinding(request.params.findingId, String(request.body.note || "")));
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
    const message = error instanceof Error ? error.message : "未知错误";
    response.status(400).json({ error: message });
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
