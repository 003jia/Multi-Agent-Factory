import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanProjectWorkspace } from "../server/projectWorkspace";
import {
  applyPatchSetToProject,
  createPatchSetFromArtifact,
  normalizeProjectRelativePath,
  verifyPatchSetInSandbox
} from "../server/runtime/projectPatch";
import type { GeneratedArtifact, ProjectWorkspace, Subagent, WorkItem } from "../src/types";

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

  it("blocks apply when the scanned project is dirty", () => {
    const project = { ...makeProject(), gitStatus: "dirty" as const };
    const patchSet = createPatchSetFromArtifact(project, artifact(project));

    expect(() => applyPatchSetToProject(project, [patchSet])).toThrow("未提交变更");
  });

  it("applies a verified patch set to the project", () => {
    const project = makeProject();
    const patchSet = createPatchSetFromArtifact(project, artifact(project));
    applyPatchSetToProject(project, [patchSet]);
    expect(readFileSync(join(project.rootPath, "src.ts"), "utf8")).toContain("value = 2");
  });

  it("only runs allowed project script keys during sandbox verification", () => {
    const project = makeProject();
    const generated = artifact(project);
    const patchSet = createPatchSetFromArtifact(project, generated);
    const workItem: WorkItem = {
      id: generated.workItemId,
      taskId: generated.taskId,
      title: "验证脚本白名单",
      description: "不执行任意 shell 命令",
      targetFiles: ["src.ts"],
      dependencies: [],
      acceptanceChecks: [],
      riskLevel: "low",
      verificationCommands: ["node -e \"process.exit(1)\"", "typecheck"],
      complexity: 3,
      preferredModelTier: "economy",
      status: "generated",
      assignedSubagentId: generated.subagentId
    };
    const subagent: Subagent = {
      id: generated.subagentId,
      name: "测试 Agent",
      role: "验证",
      skills: ["测试"],
      enabled: true,
      costTier: "low",
      qualityTier: "standard",
      defaultModelTier: "economy",
      concurrencyLimit: 1,
      activeAssignments: 0
    };

    const result = verifyPatchSetInSandbox(project, patchSet, generated, workItem, subagent);

    expect(result.ok).toBe(true);
    expect(result.verificationLog).toContain("$ npm run typecheck");
    expect(result.verificationLog).not.toContain("node -e \"process.exit(1)\"");
  });
});
