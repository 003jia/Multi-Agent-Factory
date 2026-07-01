import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type {
  GeneratedArtifact,
  PatchSet,
  ProjectWorkspace,
  ReviewFinding,
  Subagent,
  WorkItem
} from "../../src/types.js";
import { verifyArtifactFiles } from "./verify.js";
import type { WrittenFile } from "./workspace.js";
import { AppError } from "../errors.js";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 10)}`;
const SANDBOX_ROOT = join(tmpdir(), "maf-project-sandboxes");
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "coverage", "release"]);
const MAX_COPY_BYTES = 1024 * 1024;

export function normalizeProjectRelativePath(input: string): string | null {
  const rel = input.replace(/\\/g, "/").trim();
  if (!rel || rel.startsWith("/") || /^[A-Za-z]:/.test(rel)) return null;
  if (rel.split("/").some((segment) => !segment || segment === "." || segment === "..")) return null;
  if (rel.split("/").some((segment) => SKIP_DIRS.has(segment))) return null;
  return rel;
}

export function hashFile(rootPath: string, relPath: string): string | null {
  const safe = normalizeProjectRelativePath(relPath);
  if (!safe) return null;
  const abs = resolve(rootPath, safe);
  if (!isWithin(rootPath, abs) || !existsSync(abs)) return null;
  return hashContent(readFileSync(abs));
}

export function hashContent(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function createPatchSetFromArtifact(project: ProjectWorkspace | null, artifact: GeneratedArtifact): PatchSet {
  const changes = artifact.files.flatMap((file) => {
    const safePath = normalizeProjectRelativePath(file.path);
    if (!safePath) return [];
    const originalHash = project ? hashFile(project.rootPath, safePath) : null;
    return [{
      id: id("change"),
      kind: originalHash ? "modify" as const : "create" as const,
      path: safePath,
      originalHash,
      content: file.content ?? "",
      summary: file.summary
    }];
  });
  const diff = changes.map((change) => buildFileDiff(project?.rootPath, change.path, change.content)).join("\n");
  return {
    id: id("patch"),
    taskId: artifact.taskId,
    workItemId: artifact.workItemId,
    artifactId: artifact.id,
    changes,
    diff,
    applyStatus: "pending",
    verificationLog: "",
    createdAt: now()
  };
}

export function verifyPatchSetInSandbox(
  project: ProjectWorkspace | null,
  patchSet: PatchSet,
  artifact: GeneratedArtifact,
  workItem: WorkItem,
  subagent: Subagent
): { findings: ReviewFinding[]; verificationLog: string; ok: boolean; skipped?: boolean } {
  if (!project) {
    return {
      // status "open"（非 "resolved"）：未绑定项目时真实校验从未运行，不能显示成"已通过/已解决"。
      // severity 仍是 "warning" 而非 "error"，所以不会阻塞审查/提交——这只是一个可见的"未验证"提醒。
      findings: [buildFinding(artifact, workItem, subagent, "static", "warning", "open", "未选择本地项目，未运行真实静态校验（不是“已通过”）。", "绑定本地项目后可运行真实编译/测试门禁。")],
      verificationLog: "No project workspace selected; sandbox verification was not run (not a pass).",
      ok: true,
      skipped: true
    };
  }

  const sandbox = sandboxDir(project.id, patchSet.id);
  let log = "";
  try {
    copyProject(project.rootPath, sandbox);
    applyPatchSetToRoot(sandbox, patchSet, { verifyHash: false });

    const written: WrittenFile[] = patchSet.changes
      .filter((change) => change.kind !== "delete")
      .map((change) => ({ path: change.path, absPath: resolve(sandbox, change.path), language: languageFor(change.path) }));
    const staticResult = verifyArtifactFiles(sandbox, written);
    const findings: ReviewFinding[] = [];
    for (const diagnostic of staticResult.diagnostics) {
      findings.push(buildFinding(
        artifact,
        workItem,
        subagent,
        "static",
        diagnostic.severity,
        diagnostic.severity === "error" ? "open" : "resolved",
        `${diagnostic.filePath}${diagnostic.line ? `:${diagnostic.line}` : ""} ${diagnostic.message}`,
        diagnostic.severity === "error" ? "修复静态校验错误后重新审查。" : "静态提示，仅供参考。",
        diagnostic.filePath,
        diagnostic.line
      ));
    }
    if (!staticResult.diagnostics.length) {
      findings.push(buildFinding(artifact, workItem, subagent, "static", "info", "resolved", "变更文件静态校验通过。", "无需修改。"));
    }

    const commandResults = runVerificationCommands(project, sandbox, workItem.verificationCommands);
    log = commandResults.map((result) => `$ ${result.command}\n${result.output}`).join("\n\n");
    for (const result of commandResults) {
      findings.push(buildFinding(
        artifact,
        workItem,
        subagent,
        "test",
        result.ok ? "info" : "error",
        result.ok ? "resolved" : "open",
        result.ok ? `验证命令通过：${result.command}` : `验证命令失败：${result.command}`,
        result.ok ? "无需修改。" : result.output.slice(0, 600) || "检查脚本输出并修复失败项。"
      ));
    }

    return {
      findings,
      verificationLog: log || "No verification command matched; static verification only.",
      ok: !findings.some((finding) => finding.status === "open" && finding.severity === "error")
    };
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

export function applyPatchSetToProject(project: ProjectWorkspace, patchSets: PatchSet[]): string {
  if (project.gitStatus === "dirty") throw new AppError("PROJECT_DIRTY", "项目存在未提交变更，默认阻止应用。请先提交或清理工作区后重试。", 409);
  const applied: string[] = [];
  for (const patchSet of patchSets) {
    applyPatchSetToRoot(project.rootPath, patchSet, { verifyHash: true });
    applied.push(...patchSet.changes.map((change) => `${change.kind}:${change.path}`));
  }
  return applied.join("\n");
}

export function buildFileDiff(rootPath: string | undefined, relPath: string, nextContent: string): string {
  const previous = rootPath && existsSync(resolve(rootPath, relPath)) ? readFileSync(resolve(rootPath, relPath), "utf8") : "";
  const prevLines = previous.split("\n");
  const nextLines = nextContent.split("\n");
  const lines = [`--- a/${relPath}`, `+++ b/${relPath}`];
  const max = Math.max(prevLines.length, nextLines.length);
  for (let i = 0; i < max; i += 1) {
    if (prevLines[i] === nextLines[i]) {
      if (prevLines[i] !== undefined) lines.push(` ${prevLines[i]}`);
    } else {
      if (prevLines[i] !== undefined) lines.push(`-${prevLines[i]}`);
      if (nextLines[i] !== undefined) lines.push(`+${nextLines[i]}`);
    }
  }
  return lines.join("\n");
}

function applyPatchSetToRoot(rootPath: string, patchSet: PatchSet, options: { verifyHash: boolean }) {
  for (const change of patchSet.changes) {
    const relPath = normalizeProjectRelativePath(change.path);
    if (!relPath) throw new Error(`非法变更路径：${change.path}`);
    const abs = resolve(rootPath, relPath);
    if (!isWithin(rootPath, abs)) throw new Error(`变更路径逃逸项目根目录：${change.path}`);
    if (options.verifyHash) {
      const currentHash = existsSync(abs) ? hashContent(readFileSync(abs)) : null;
      if (currentHash !== change.originalHash) throw new AppError("HASH_MISMATCH", `${change.path} 已变化，hash 校验失败，阻止应用。`, 409);
    }
    if (change.kind === "delete") {
      rmSync(abs, { force: true });
    } else {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, change.content, "utf8");
    }
  }
}

function copyProject(sourceRoot: string, targetRoot: string) {
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(targetRoot, { recursive: true });
  copyDirectory(sourceRoot, targetRoot);
  const nodeModules = join(sourceRoot, "node_modules");
  if (existsSync(nodeModules)) {
    try {
      symlinkSync(nodeModules, join(targetRoot, "node_modules"), "dir");
    } catch {
      // Dependencies are optional for sandbox verification. Static checks still run.
    }
  }
}

function copyDirectory(source: string, target: string) {
  for (const entry of readdirSync(source)) {
    if (SKIP_DIRS.has(entry)) continue;
    const sourcePath = join(source, entry);
    const targetPath = join(target, entry);
    const stat = lstatSync(sourcePath);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyDirectory(sourcePath, targetPath);
    } else if (stat.isFile() && stat.size <= MAX_COPY_BYTES && isTextFile(sourcePath)) {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  }
}

function runVerificationCommands(project: ProjectWorkspace, cwd: string, workItemCommands: string[]) {
  const selected = selectVerificationCommands(project, workItemCommands);
  return selected.map((script) => {
    const command = `${packageManagerRunner(project.packageManager)} ${script}`;
    const result = spawnVerificationCommand(command, cwd);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    return { command, ok: !result.error && result.status === 0, output: output || "(no output)" };
  });
}

function spawnVerificationCommand(command: string, cwd: string) {
  if (process.platform === "win32") {
    return spawnSync(command, { cwd, encoding: "utf8", timeout: 30000, shell: true });
  }
  const [bin, ...args] = command.split(" ");
  return spawnSync(bin, args, { cwd, encoding: "utf8", timeout: 30000, shell: false });
}

function selectVerificationCommands(project: ProjectWorkspace, workItemCommands: string[]) {
  const allowList = ["typecheck", "test", "build"];
  const explicit = [...new Set(workItemCommands.filter((script) => allowList.includes(script) && project.scripts[script]))];
  if (explicit.length) return explicit.slice(0, 3);
  const scripts = Object.keys(project.scripts);
  return ["typecheck", "test", "build"]
    .filter((script) => scripts.includes(script))
    .slice(0, 3);
}

function packageManagerRunner(pm: ProjectWorkspace["packageManager"]) {
  if (pm === "pnpm") return "pnpm run";
  if (pm === "yarn") return "yarn";
  if (pm === "bun") return "bun run";
  return "npm run";
}

function buildFinding(
  artifact: GeneratedArtifact,
  workItem: WorkItem,
  subagent: Subagent,
  source: ReviewFinding["source"],
  severity: ReviewFinding["severity"],
  status: ReviewFinding["status"],
  message: string,
  suggestedFix: string,
  filePath?: string,
  line?: number
): ReviewFinding {
  return {
    id: id("finding"),
    taskId: artifact.taskId,
    artifactId: artifact.id,
    workItemId: workItem.id,
    subagentId: subagent.id,
    severity,
    status,
    source,
    filePath,
    line,
    message,
    suggestedFix,
    createdAt: now()
  };
}

function sandboxDir(projectId: string, patchSetId: string) {
  return join(SANDBOX_ROOT, projectId.replace(/[^A-Za-z0-9._-]/g, "_"), patchSetId.replace(/[^A-Za-z0-9._-]/g, "_"));
}

function isWithin(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

function isTextFile(path: string) {
  if (!/\.(tsx?|jsx?|json|md|css|scss|html|yml|yaml|toml|txt|mjs|cjs)$/i.test(path)) return false;
  const sample = readFileSync(path).subarray(0, 8000);
  return !sample.includes(0);
}

function languageFor(path: string) {
  if (/\.tsx?$/i.test(path)) return "typescript";
  if (/\.jsx?$/i.test(path)) return "javascript";
  if (/\.json$/i.test(path)) return "json";
  return "text";
}
