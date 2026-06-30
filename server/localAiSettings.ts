import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AiProviderConfig } from "../src/types.js";

const settingsPath = () => resolve(process.cwd(), "data", "ai-settings.json");

export function readLocalAiConfig(): AiProviderConfig | undefined {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), "utf8")) as Partial<AiProviderConfig>;
    if (parsed.provider !== "anthropic" && parsed.provider !== "openai") return undefined;
    return {
      provider: parsed.provider,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      baseUrl: cleanOptional(parsed.baseUrl),
      economyModel: cleanOptional(parsed.economyModel),
      qualityModel: cleanOptional(parsed.qualityModel)
    };
  } catch {
    return undefined;
  }
}

export function writeLocalAiConfig(config?: AiProviderConfig) {
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config ?? null, null, 2));
}

function cleanOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
