import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export interface ArtifactFileInput {
  path: string;
  content: string;
  language?: string;
}

export interface WrittenFile {
  /** sandbox-relative path, normalized */
  path: string;
  /** absolute path on disk inside the sandbox */
  absPath: string;
  language?: string;
}

const WORKSPACE_ROOT = join(tmpdir(), "maf-workspaces");

/** Deterministic isolated directory for one artifact's files. */
export function artifactWorkspaceDir(taskId: string, artifactId: string): string {
  return join(WORKSPACE_ROOT, sanitizeSegment(taskId), sanitizeSegment(artifactId));
}

/**
 * Write generated files into an isolated sandbox directory.
 * Unsafe paths (absolute, traversal, empty) are skipped — generated code never
 * escapes the sandbox.
 */
export function writeArtifactFiles(rootDir: string, files: ArtifactFileInput[]): WrittenFile[] {
  rmSync(rootDir, { recursive: true, force: true });
  mkdirSync(rootDir, { recursive: true });

  const written: WrittenFile[] = [];
  for (const file of files) {
    const safeRel = normalizeRelative(file.path);
    if (!safeRel) continue;
    const absPath = resolve(rootDir, safeRel);
    if (!isWithin(rootDir, absPath)) continue;
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, file.content ?? "", "utf8");
    written.push({ path: safeRel, absPath, language: file.language });
  }
  return written;
}

export function cleanupWorkspace(rootDir: string): void {
  rmSync(rootDir, { recursive: true, force: true });
}

function normalizeRelative(input: string): string | null {
  if (!input) return null;
  const rel = input.replace(/\\/g, "/").trim();
  if (!rel) return null;
  // Drop absolute paths outright (POSIX "/..." or Windows "C:/...") and any traversal.
  if (rel.startsWith("/") || /^[A-Za-z]:/.test(rel)) return null;
  const segments = rel.split("/");
  if (segments.some((segment) => segment === "..")) return null;
  return rel;
}

function isWithin(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "x";
}
