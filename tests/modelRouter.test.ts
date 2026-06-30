import { describe, expect, it } from "vitest";
import { createEngine, engineStatus, maskApiKey } from "../server/agents";
import { chooseModelTier, resolveModels, tierToModel } from "../server/modelRouter";
import type { Subagent } from "../src/types";

const premiumAgent: Subagent = {
  id: "agent_quality",
  name: "质量 Agent",
  role: "审查",
  skills: ["review"],
  enabled: true,
  costTier: "high",
  qualityTier: "premium",
  defaultModelTier: "quality",
  concurrencyLimit: 1,
  activeAssignments: 0
};

describe("chooseModelTier", () => {
  it("uses economy for low-complexity requirement drafting", () => {
    const decision = chooseModelTier({ stage: "requirements", complexity: 3 });
    expect(decision.modelTier).toBe("economy");
  });

  it("uses quality for review and high-complexity work", () => {
    expect(chooseModelTier({ stage: "review", complexity: 2 }).modelTier).toBe("quality");
    expect(chooseModelTier({ stage: "generation", complexity: 9 }).modelTier).toBe("quality");
  });

  it("honors manual and subagent strategy overrides", () => {
    expect(chooseModelTier({ stage: "generation", complexity: 2, subagent: premiumAgent }).modelTier).toBe("quality");
    expect(chooseModelTier({ stage: "generation", complexity: 9, manualModelTier: "economy" }).modelTier).toBe("economy");
  });

  it("maps model tiers to Claude model ids", () => {
    expect(tierToModel("economy")).toBe("claude-haiku-4-5");
    expect(tierToModel("quality")).toBe("claude-opus-4-8");
  });

  it("resolves provider defaults and custom model overrides", () => {
    expect(resolveModels({ provider: "openai", apiKey: "sk-test" })).toEqual({
      economy: "gpt-4o-mini",
      quality: "gpt-4o"
    });
    expect(resolveModels({ provider: "openai", apiKey: "sk-test", economyModel: "cheap", qualityModel: "strong" })).toEqual({
      economy: "cheap",
      quality: "strong"
    });
  });

  it("creates an OpenAI-compatible engine status from model API config", () => {
    const engine = createEngine({
      provider: "openai",
      apiKey: "sk-test-value",
      baseUrl: "https://example.com/v1/",
      economyModel: "cheap",
      qualityModel: "strong"
    });
    expect(engine.kind).toBe("openai");
    expect(engineStatus(engine, maskApiKey("sk-test-value"))).toMatchObject({
      aiEnabled: true,
      mode: "openai",
      provider: "openai",
      baseUrl: "https://example.com/v1",
      models: { economy: "cheap", quality: "strong" },
      keyMasked: "sk-tes...alue"
    });
  });
});
