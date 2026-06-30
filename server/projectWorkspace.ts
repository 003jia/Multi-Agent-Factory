import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { ProjectWorkspace } from "../src/types.js";

const now = () => new Date().toISOString();

export function scanProjectWorkspace(rootPath: string): ProjectWorkspace {
  const root = resolve(rootPath);
  const stat = statSync(root);
  if (!stat.isDirectory()) throw new Error("请选择一个项目文件夹");
  const packageJson = readPackageJson(root);
  const scripts = packageJson?.scripts && typeof packageJson.scripts === "object" ? packageJson.scripts as Record<string, string> : {};
  return {
    id: projectIdFromRoot(root),
    name: packageJson?.name ? String(packageJson.name) : basename(root),
    rootPath: root,
    packageManager: detectPackageManager(root),
    frameworkHints: detectFrameworkHints(packageJson),
    scripts,
    gitStatus: detectGitStatus(root),
    lastScannedAt: now()
  };
}

export function listProjectContextFiles(rootPath: string, limit = 80): string[] {
  const root = resolve(rootPath);
  const files: string[] = [];
  walk(root, "", files, limit);
  return files;
}

function projectIdFromRoot(rootPath: string) {
  return `project_${createHash("sha1").update(rootPath).digest("hex").slice(0, 12)}`;
}

function readPackageJson(root: string): Record<string, unknown> | null {
  const path = join(root, "package.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function detectPackageManager(root: string): ProjectWorkspace["packageManager"] {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return "bun";
  if (existsSync(join(root, "package-lock.json"))) return "npm";
  if (existsSync(join(root, "package.json"))) return "npm";
  return "unknown";
}

function detectFrameworkHints(packageJson: Record<string, unknown> | null): string[] {
  if (!packageJson) return [];
  const deps = {
    ...(packageJson.dependencies as Record<string, string> | undefined),
    ...(packageJson.devDependencies as Record<string, string> | undefined)
  };
  const hints = new Set<string>();
  if (deps.react) hints.add("React");
  if (deps.vue) hints.add("Vue");
  if (deps.svelte) hints.add("Svelte");
  if (deps.next) hints.add("Next.js");
  if (deps.vite) hints.add("Vite");
  if (deps.express) hints.add("Express");
  if (deps.typescript) hints.add("TypeScript");
  if (deps.electron) hints.add("Electron");
  if (deps.vitest) hints.add("Vitest");
  return [...hints];
}

function detectGitStatus(root: string): ProjectWorkspace["gitStatus"] {
  const result = spawnSync("git", ["-C", root, "status", "--short"], { encoding: "utf8", timeout: 2500 });
  if (result.error || result.status !== 0) return "unavailable";
  return result.stdout.trim() ? "dirty" : "clean";
}

function walk(root: string, rel: string, output: string[], limit: number) {
  if (output.length >= limit) return;
  const abs = join(root, rel);
  for (const entry of readdirSync(abs)) {
    if (output.length >= limit) return;
    if (shouldSkipPath(entry)) continue;
    const nextRel = rel ? `${rel}/${entry}` : entry;
    const nextAbs = join(root, nextRel);
    const stat = statSync(nextAbs);
    if (stat.isDirectory()) {
      walk(root, nextRel, output, limit);
    } else if (stat.isFile() && stat.size <= 1024 * 1024 && isTextCandidate(nextRel)) {
      output.push(nextRel);
    }
  }
}

function shouldSkipPath(name: string) {
  return new Set([".git", "node_modules", "dist", "build", ".next", "coverage", "release"]).has(name);
}

function isTextCandidate(path: string) {
  return /\.(tsx?|jsx?|json|md|css|scss|html|yml|yaml|toml|txt|mjs|cjs)$/i.test(path);
}
