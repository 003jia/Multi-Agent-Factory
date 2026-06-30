import { describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import type { AiProviderConfig } from "../src/types";

describe("AI configuration", () => {
  it("updates the runtime engine and invokes persistence callback", () => {
    let persisted: AiProviderConfig | undefined;
    const control = createApp({
      dbPath: ":memory:",
      onAiConfigChange: (config) => {
        persisted = config;
      }
    });

    const status = control.setAiConfig({
      provider: "openai",
      apiKey: "sk-test-local-only",
      baseUrl: "https://api.openai.com/v1",
      economyModel: "gpt-4o-mini",
      qualityModel: "gpt-4o"
    });

    expect(status).toMatchObject({
      aiEnabled: true,
      mode: "openai",
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      models: { economy: "gpt-4o-mini", quality: "gpt-4o" },
      keyMasked: "sk-tes...only"
    });
    expect(persisted).toMatchObject({
      provider: "openai",
      apiKey: "sk-test-local-only"
    });

    control.repo.close();
  });
});
