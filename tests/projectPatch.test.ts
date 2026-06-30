import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanProjectWorkspace } from "../server/projectWorkspace";
import {
  applyPatchSetToProject,
  createPatchSetFromArtifact,
  normalizeProjectRelativePath
} from "../server/runtime/projectPatch";
import type { GeneratedArtifact, ProjectWorkspace } from "../src/types";

let tempDir: string | null = null;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

function makeProject() {
  tempDir = mkdtempSync(join(tmpdir(), "maf-project-"));
  writeFileSync(
    join(tempDir, "package.json"),
    JSON.stringify({ name: "sample", scripts: { typecheck: "node -e \"process.exit(0)\"" }, dependencies: { react: "latest" }, devDependencies: { vite: "latest" } }),
    "utf8"
  );
  writeFileSync(join(tempDir, "src.ts"), "export const value = 1;\n", "utf8");
  return scanProjectWorkspace(tempDir);
}

function artifact(project: ProjectWorkspace, content = "export const value = 2;\n"): GeneratedArtifact {
  return {
    id: "artifact_1",
    taskId: "task_1",
    workItemId: "work_1",
    subagentId: "agent_1",
    modelTier: "economy",
    patchSetId: null,
    files: [{ path: "src.ts", language: "typescript", summary: "update value", content, diff: "" }],
    agentNotes: `project ${project.name}`,
    commitMessageDraft: "feat: update value",
    createdAt: new Date().toISOString()
  };
}

describe("project workspace and patch safety", () => {
  it("rejects unsafe project-relative paths", () => {
    expect(normalizeProjectRelativePath("src/app.ts")).toBe("src/app.ts");
    expect(normalizeProjectRelativePath("../secret.ts")).toBeNull();
    expect(normalizeProjectRelativePath("/tmp/secret.ts")).toBeNull();
    expect(normalizeProjectRelativePath("node_modules/pkg/index.js")).toBeNull();
  });

  it("scans package manager, scripts, framework hints and git state", () => {
    const project = makeProject();
    expect(project.name).toBe("sample");
    expect(project.packageManager).toBe("npm");
    expect(project.frameworkHints).toContain("React");
    expect(project.frameworkHints).toContain("Vite");
    expect(project.scripts.typecheck).toContain("process.exit");
    expect(project.gitStatus).toBe("unavailable");
  });

  it("builds patch sets and blocks apply when original hash changed", () => {
    const project = makeProject();
    const patchSet = createPatchSetFromArtifact(project, artifact(project));
    expect(patchSet.changes[0].originalHash).toBeTruthy();
    writeFileSync(join(project.rootPath, "src.ts"), "export const value = 99;\n", "utf8");
    expect(() => applyPatchSetToProject(project, [patchSet])).toThrow("hash 校验失败");
  });

  it("applies a verified patch set to the project", () => {
    const project = makeProject();
    const patchSet = createPatchSetFromArtifact(project, artifact(project));
    applyPatchSetToProject(project, [patchSet]);
    expect(readFileSync(join(project.rootPath, "src.ts"), "utf8")).toContain("value = 2");
  });
});
