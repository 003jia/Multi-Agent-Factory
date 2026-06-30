import { describe, expect, it } from "vitest";
import { artifactWorkspaceDir, cleanupWorkspace, writeArtifactFiles } from "../server/runtime/workspace";
import { verifyArtifactFiles } from "../server/runtime/verify";

function verify(files: { path: string; content: string; language?: string }[]) {
  const dir = artifactWorkspaceDir("test-task", `art-${Math.random().toString(36).slice(2)}`);
  try {
    const written = writeArtifactFiles(dir, files);
    return verifyArtifactFiles(dir, written);
  } finally {
    cleanupWorkspace(dir);
  }
}

describe("verifyArtifactFiles (real static verification)", () => {
  it("flags a syntactically broken TypeScript file as a hard error", () => {
    const result = verify([{ path: "src/broken.ts", content: "export const value = ;\n", language: "typescript" }]);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(true);
  });

  it("passes a valid TypeScript file", () => {
    const result = verify([
      {
        path: "src/ok.ts",
        content: "export const value = 1;\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n",
        language: "typescript"
      }
    ]);
    expect(result.ok).toBe(true);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toHaveLength(0);
  });

  it("flags invalid JSON as an error", () => {
    const result = verify([{ path: "data/config.json", content: "{ not valid json }", language: "json" }]);
    expect(result.ok).toBe(false);
  });

  it("treats unresolved imports as warnings, not failures (isolation noise)", () => {
    const result = verify([
      { path: "src/uses-dep.ts", content: 'import { thing } from "some-missing-pkg";\nexport const x = thing;\n', language: "typescript" }
    ]);
    expect(result.ok).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "warning")).toBe(true);
  });

  it("never writes files outside the sandbox (path traversal is dropped)", () => {
    const dir = artifactWorkspaceDir("test-task", "traversal");
    try {
      const written = writeArtifactFiles(dir, [
        { path: "../../escape.ts", content: "export const danger = 1;", language: "typescript" },
        { path: "/etc/evil.ts", content: "export const danger = 2;", language: "typescript" },
        { path: "src/safe.ts", content: "export const ok = 1;", language: "typescript" }
      ]);
      expect(written.map((file) => file.path)).toEqual(["src/safe.ts"]);
    } finally {
      cleanupWorkspace(dir);
    }
  });
});
