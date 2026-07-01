import { app, safeStorage } from "electron";
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

interface StoredAiProviderConfig {
  provider: AiProvider;
  apiKey?: string;
  apiKeyEncrypted?: string;
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

export interface AiConfigAuditItem {
  id: string;
  severity: "info" | "warning" | "error";
  title: string;
  message: string;
}

export interface AiConfigAuditResult {
  status: "passed" | "warning" | "failed";
  provider: AiProvider;
  keyMasked?: string;
  canUseRealModel: boolean;
  items: AiConfigAuditItem[];
  reviewedAt: string;
}

export interface DesktopSettings {
  aiConfig?: StoredAiProviderConfig;
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

export function readAiConfig(): AiProviderConfig | undefined {
  const stored = readSettings().aiConfig;
  if (!stored) return undefined;
  return cleanConfig({
    provider: stored.provider,
    apiKey: decryptApiKey(stored),
    baseUrl: stored.baseUrl,
    economyModel: stored.economyModel,
    qualityModel: stored.qualityModel
  });
}

export function writeAiConfig(nextConfig?: AiProviderConfigInput) {
  const settings = readSettings();
  const previous = readAiConfig();
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

  writeSettings({ ...settings, aiConfig: toStoredConfig(aiConfig), apiKey: undefined });
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

export function auditAiConfig(nextConfig: AiProviderConfigInput): AiConfigAuditResult {
  const previous = readAiConfig();
  const provider = nextConfig.provider === "openai" ? "openai" : "anthropic";
  const typedApiKey = nextConfig.apiKey?.trim();
  const reusableKey = previous?.provider === provider ? previous.apiKey : "";
  const apiKey = nextConfig.clearApiKey ? "" : typedApiKey || reusableKey || "";
  return auditConfig(cleanConfig({
    provider,
    apiKey,
    baseUrl: nextConfig.baseUrl,
    economyModel: nextConfig.economyModel,
    qualityModel: nextConfig.qualityModel
  }));
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

function toStoredConfig(config: AiProviderConfig): StoredAiProviderConfig {
  return {
    provider: config.provider,
    ...encryptApiKey(config.apiKey),
    baseUrl: config.baseUrl,
    economyModel: config.economyModel,
    qualityModel: config.qualityModel
  };
}

function encryptApiKey(apiKey: string): Pick<StoredAiProviderConfig, "apiKey" | "apiKeyEncrypted"> {
  if (!apiKey.trim()) return {};
  if (safeStorage.isEncryptionAvailable()) {
    return { apiKeyEncrypted: safeStorage.encryptString(apiKey).toString("base64") };
  }
  return { apiKey };
}

function decryptApiKey(config: StoredAiProviderConfig): string {
  if (config.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(config.apiKeyEncrypted, "base64"));
    } catch {
      return "";
    }
  }
  return config.apiKey ?? "";
}

function maskApiKey(apiKey?: string) {
  if (!apiKey?.trim()) return undefined;
  if (apiKey.length <= 10) return "********";
  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
}

function auditConfig(config: AiProviderConfig): AiConfigAuditResult {
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
