import type { AiProvider, AiProviderConfig, ModelTier, Subagent, TaskStage } from "../src/types.js";

export interface RoutingInput {
  stage: TaskStage | "requirements" | "plan" | "generation" | "review";
  complexity: number;
  subagent?: Subagent | null;
  manualModelTier?: ModelTier | null;
}

export interface RoutingDecision {
  modelTier: ModelTier;
  reason: string;
}

export const modelByTier: Record<ModelTier, string> = {
  economy: "claude-haiku-4-5",
  quality: "claude-opus-4-8"
};

export function tierToModel(tier: ModelTier): string {
  return modelByTier[tier];
}

/** 各 provider 的默认两档模型；用户可在配置里覆盖。 */
export const defaultModelsByProvider: Record<AiProvider, Record<ModelTier, string>> = {
  anthropic: { economy: "claude-haiku-4-5", quality: "claude-opus-4-8" },
  openai: { economy: "gpt-4o-mini", quality: "gpt-4o" }
};

export function resolveModels(config: AiProviderConfig): Record<ModelTier, string> {
  const defaults = defaultModelsByProvider[config.provider];
  return {
    economy: config.economyModel?.trim() || defaults.economy,
    quality: config.qualityModel?.trim() || defaults.quality
  };
}

export function chooseModelTier(input: RoutingInput): RoutingDecision {
  if (input.manualModelTier) {
    return {
      modelTier: input.manualModelTier,
      reason: "人工覆盖模型层级"
    };
  }

  if (input.subagent?.defaultModelTier === "quality") {
    return {
      modelTier: "quality",
      reason: `${input.subagent.name} 默认使用效果模型`
    };
  }

  if (input.stage === "review" || input.complexity >= 8) {
    return {
      modelTier: "quality",
      reason: "高复杂度或审查阶段需要更强模型"
    };
  }

  if (input.stage === "requirements" || input.stage === "plan") {
    return {
      modelTier: input.complexity >= 6 ? "quality" : "economy",
      reason: input.complexity >= 6 ? "中高复杂度文档生成使用效果模型" : "低复杂度文档生成使用便宜模型"
    };
  }

  return {
    modelTier: "economy",
    reason: "常规执行任务优先控制成本"
  };
}
