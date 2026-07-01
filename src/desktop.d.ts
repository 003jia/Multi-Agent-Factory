import type { AiConfigAuditResult, AiProviderConfigInput, AiProviderConfigView, AiStatus, ProjectWorkspace } from "./types";

declare global {
  interface Window {
    desktop?: {
      getAiStatus: () => Promise<AiStatus>;
      getAiConfig: () => Promise<AiProviderConfigView>;
      auditAiConfig: (config: AiProviderConfigInput) => Promise<AiConfigAuditResult>;
      getApiKeyMasked: () => Promise<string | undefined>;
      setAiConfig: (config: AiProviderConfigInput) => Promise<AiStatus>;
      setApiKey: (apiKey: string) => Promise<AiStatus>;
      selectProjectDirectory: () => Promise<ProjectWorkspace | null>;
    };
  }
}

export {};
