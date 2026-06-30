import { createApp } from "./app.js";
import { readLocalAiConfig, writeLocalAiConfig } from "./localAiSettings.js";
import type { AiProvider, AiProviderConfig } from "../src/types.js";

const port = Number(process.env.PORT || 4173);
const envAiConfig = readAiConfigFromEnv();
const { app } = createApp({
  serveStatic: process.env.NODE_ENV === "production",
  aiConfig: envAiConfig ?? readLocalAiConfig(),
  onAiConfigChange: writeLocalAiConfig
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Multi Agent Factory API running at http://127.0.0.1:${port}`);
});

function readAiConfigFromEnv(): AiProviderConfig | undefined {
  const explicitProvider = normalizeProvider(process.env.AI_PROVIDER);
  const provider = explicitProvider ?? (process.env.OPENAI_API_KEY ? "openai" : "anthropic");
  const apiKey = provider === "openai"
    ? process.env.OPENAI_API_KEY || process.env.AI_API_KEY
    : process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY;

  if (!apiKey?.trim()) return undefined;

  return {
    provider,
    apiKey: apiKey.trim(),
    baseUrl: provider === "openai"
      ? process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL
      : process.env.ANTHROPIC_BASE_URL || process.env.AI_BASE_URL,
    economyModel: process.env.ECONOMY_MODEL,
    qualityModel: process.env.QUALITY_MODEL
  };
}

function normalizeProvider(provider?: string): AiProvider | undefined {
  if (provider === "openai" || provider === "anthropic") return provider;
  return undefined;
}
