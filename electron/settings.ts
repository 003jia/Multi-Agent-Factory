import { app } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type AiProvider = "anthropic" | "openai";

export interface AiProviderConfig {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  economyModel?: string;
  qualityModel?: string;
}

export interface AiProviderConfigInput {
  provider: AiProvider;
  apiKey?: string;
  baseUrl?: string;
  economyModel?: string;
  qualityModel?: string;
  clearApiKey?: boolean;
}

export interface AiProviderConfigView {
  provider: AiProvider;
  baseUrl?: string;
  economyModel?: string;
  qualityModel?: string;
  keyMasked?: string;
  hasApiKey: boolean;
}

export interface DesktopSettings {
  aiConfig?: AiProviderConfig;
  /** 旧版本字段，读取时会迁移为 Anthropic 配置。 */
  apiKey?: string;
}

function settingsPath() {
  return join(app.getPath("userData"), "settings.json");
}

export function readSettings(): DesktopSettings {
  try {
    const settings = JSON.parse(readFileSync(settingsPath(), "utf8")) as DesktopSettings;
    if (!settings.aiConfig && settings.apiKey) {
      return {
        ...settings,
        aiConfig: {
          provider: "anthropic",
          apiKey: settings.apiKey
        }
      };
    }
    return settings;
  } catch {
    return {};
  }
}

export function writeSettings(settings: DesktopSettings) {
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2));
}

export function readAiConfig() {
  return readSettings().aiConfig;
}

export function writeAiConfig(nextConfig?: AiProviderConfigInput) {
  const settings = readSettings();
  const previous = settings.aiConfig;
  if (!nextConfig) {
    writeSettings({ ...settings, aiConfig: undefined, apiKey: undefined });
    return undefined;
  }

  const provider = nextConfig.provider === "openai" ? "openai" : "anthropic";
  const typedApiKey = nextConfig.apiKey?.trim();
  const reusableKey = previous?.provider === provider ? previous.apiKey : "";
  const apiKey = nextConfig.clearApiKey ? "" : typedApiKey || reusableKey || "";
  const aiConfig = cleanConfig({
    provider,
    apiKey,
    baseUrl: nextConfig.baseUrl,
    economyModel: nextConfig.economyModel,
    qualityModel: nextConfig.qualityModel
  });

  writeSettings({ ...settings, aiConfig, apiKey: undefined });
  return aiConfig;
}

export function getAiConfigView(): AiProviderConfigView {
  const config = readAiConfig();
  return {
    provider: config?.provider ?? "anthropic",
    baseUrl: config?.baseUrl,
    economyModel: config?.economyModel,
    qualityModel: config?.qualityModel,
    keyMasked: maskApiKey(config?.apiKey),
    hasApiKey: Boolean(config?.apiKey?.trim())
  };
}

export function getMaskedApiKey() {
  return maskApiKey(readAiConfig()?.apiKey);
}

function cleanConfig(config: AiProviderConfig): AiProviderConfig {
  return {
    provider: config.provider,
    apiKey: config.apiKey.trim(),
    baseUrl: config.baseUrl?.trim() || undefined,
    economyModel: config.economyModel?.trim() || undefined,
    qualityModel: config.qualityModel?.trim() || undefined
  };
}

function maskApiKey(apiKey?: string) {
  if (!apiKey?.trim()) return undefined;
  if (apiKey.length <= 10) return "********";
  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
}
