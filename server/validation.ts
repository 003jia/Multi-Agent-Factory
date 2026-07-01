import type { AiProviderConfigInput, CostTier, ModelTier, QualityTier, Subagent } from "../src/types.js";
import { validationError } from "./errors.js";

type Body = Record<string, unknown>;

const modelTiers = new Set<ModelTier>(["economy", "quality"]);
const costTiers = new Set<CostTier>(["low", "medium", "high"]);
const qualityTiers = new Set<QualityTier>(["standard", "premium"]);

export function parseAiConfigInput(body: unknown): AiProviderConfigInput {
  const input = objectBody(body);
  const provider = enumField(input, "provider", ["anthropic", "openai"]);
  return {
    provider,
    apiKey: optionalString(input, "apiKey"),
    baseUrl: optionalString(input, "baseUrl"),
    economyModel: optionalString(input, "economyModel"),
    qualityModel: optionalString(input, "qualityModel"),
    clearApiKey: optionalBoolean(input, "clearApiKey")
  };
}

export function parseProjectScanInput(body: unknown) {
  const input = objectBody(body);
  return { rootPath: requiredString(input, "rootPath") };
}

export function parseCreateTaskInput(body: unknown) {
  const input = objectBody(body);
  return {
    projectId: nullableString(input, "projectId"),
    title: optionalString(input, "title") || "未命名任务",
    prompt: requiredString(input, "prompt"),
    selectedFiles: stringArray(input, "selectedFiles", 30),
    constraints: optionalString(input, "constraints") || "",
    complexity: numberRange(input, "complexity", 1, 10)
  };
}

export function parseDocumentInput(body: unknown) {
  const input = objectBody(body);
  return {
    content: requiredString(input, "content"),
    feedback: optionalString(input, "feedback") || ""
  };
}

export function parseReopenInput(body: unknown) {
  const input = objectBody(body);
  return { note: optionalString(input, "note") || "" };
}

export function parseAssignmentInput(body: unknown) {
  const input = objectBody(body);
  return {
    subagentId: requiredString(input, "subagentId"),
    modelTier: input.modelTier === undefined ? undefined : enumField(input, "modelTier", ["economy", "quality"])
  };
}

export function parseSubagentInput(body: unknown, id?: string): Partial<Subagent> & { id?: string } {
  const input = objectBody(body);
  return {
    id,
    name: optionalString(input, "name"),
    role: optionalString(input, "role"),
    skills: input.skills === undefined ? undefined : stringArray(input, "skills", 20),
    enabled: optionalBoolean(input, "enabled"),
    costTier: input.costTier === undefined ? undefined : enumField(input, "costTier", [...costTiers]),
    qualityTier: input.qualityTier === undefined ? undefined : enumField(input, "qualityTier", [...qualityTiers]),
    defaultModelTier: input.defaultModelTier === undefined ? undefined : enumField(input, "defaultModelTier", [...modelTiers]),
    concurrencyLimit: input.concurrencyLimit === undefined ? undefined : numberRange(input, "concurrencyLimit", 1, 8)
  };
}

function objectBody(body: unknown): Body {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw validationError("请求体必须是对象");
  return body as Body;
}

function requiredString(body: Body, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw validationError(`${key} 必须是非空字符串`);
  return value.trim();
}

function optionalString(body: Body, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw validationError(`${key} 必须是字符串`);
  return value.trim() || undefined;
}

function nullableString(body: Body, key: string): string | null {
  const value = body[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw validationError(`${key} 必须是字符串或 null`);
  return value.trim() || null;
}

function optionalBoolean(body: Body, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw validationError(`${key} 必须是布尔值`);
  return value;
}

function numberRange(body: Body, key: string, min: number, max: number): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw validationError(`${key} 必须是数字`);
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) throw validationError(`${key} 必须在 ${min}-${max} 之间`);
  return rounded;
}

function stringArray(body: Body, key: string, limit: number): string[] {
  const value = body[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw validationError(`${key} 必须是字符串数组`);
  if (value.length > limit) throw validationError(`${key} 不能超过 ${limit} 项`);
  return value.map((item) => {
    if (typeof item !== "string") throw validationError(`${key} 只能包含字符串`);
    return item.trim();
  }).filter(Boolean);
}

function enumField<T extends string>(body: Body, key: string, allowed: readonly T[]): T {
  const value = body[key];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw validationError(`${key} 必须是 ${allowed.join(" / ")} 之一`);
  }
  return value as T;
}
