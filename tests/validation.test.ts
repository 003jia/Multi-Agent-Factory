import { describe, expect, it } from "vitest";
import {
  parseAiConfigInput,
  parseAssignmentInput,
  parseCreateTaskInput,
  parseProjectScanInput,
  parseSubagentInput
} from "../server/validation";
import { AppError } from "../server/errors";

describe("API input validation", () => {
  it("rejects unsupported AI providers", () => {
    expectValidationError(() => parseAiConfigInput({ provider: "local", apiKey: "secret" }));
  });

  it("rejects invalid task complexity and path arrays", () => {
    expectValidationError(() => parseCreateTaskInput({ prompt: "hello", complexity: 0 }));
    expectValidationError(() => parseCreateTaskInput({ prompt: "hello", complexity: 5, selectedFiles: ["src.ts", 7] }));
  });

  it("rejects invalid assignment model tiers", () => {
    expectValidationError(() => parseAssignmentInput({ subagentId: "agent_1", modelTier: "cheap" }));
  });

  it("rejects invalid project scan payloads", () => {
    expectValidationError(() => parseProjectScanInput({ rootPath: "" }));
  });

  it("rejects invalid subagent fields", () => {
    expectValidationError(() => parseSubagentInput({ name: "agent", costTier: "free" }));
    expectValidationError(() => parseSubagentInput({ name: "agent", concurrencyLimit: 20 }));
    expectValidationError(() => parseSubagentInput({ name: "agent", skills: ["api", 3] }));
  });
});

function expectValidationError(operation: () => unknown) {
  try {
    operation();
    throw new Error("expected validation error");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("VALIDATION_ERROR");
  }
}
