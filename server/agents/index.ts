import type { AiProviderConfig, AiStatus } from "../../src/types.js";
import { resolveModels } from "../modelRouter.js";
import type { AgentEngine } from "./engine.js";
import { ClaudeEngine } from "./claudeEngine.js";
import { OpenAiEngine } from "./openaiEngine.js";
import { MockEngine } from "./mockEngine.js";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

/** 接受完整 provider 配置，或一个裸 API key（向后兼容，按 Anthropic 处理）。 */
export function createEngine(input?: AiProviderConfig | string): AgentEngine {
  const config = normalizeConfig(input);
  if (!config?.apiKey?.trim()) return new MockEngine();
  const models = resolveModels(config);
  if (config.provider === "openai") {
    return new OpenAiEngine(config.apiKey.trim(), config.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL, models);
  }
  return new ClaudeEngine(config.apiKey.trim(), models, config.baseUrl?.trim() || undefined);
}

export function normalizeConfig(input?: AiProviderConfig | string): AiProviderConfig | undefined {
  if (!input) return undefined;
  if (typeof input === "string") return input.trim() ? { provider: "anthropic", apiKey: input.trim() } : undefined;
  return input;
}

export function engineStatus(engine: AgentEngine, keyMasked?: string): AiStatus {
  const provider = engine.kind === "claude" ? "anthropic" : engine.kind; // "openai" | "mock"
  return {
    aiEnabled: engine.kind !== "mock",
    mode: engine.kind,
    provider,
    baseUrl: engine.baseUrl,
    models: engine.models,
    keyMasked
  };
}

export function maskApiKey(apiKey?: string): string | undefined {
  if (!apiKey) return undefined;
  if (apiKey.length <= 10) return "********";
  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
}
