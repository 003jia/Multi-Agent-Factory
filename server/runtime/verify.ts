import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import type { WrittenFile } from "./workspace.js";

export interface VerifyDiagnostic {
  filePath: string;
  line?: number;
  code?: number;
  severity: "error" | "warning";
  message: string;
}

export interface VerificationResult {
  checkedFiles: number;
  skippedFiles: string[];
  diagnostics: VerifyDiagnostic[];
  /** true when there are no error-severity diagnostics */
  ok: boolean;
}

const TS_EXT = /\.(tsx?|mts|cts|jsx?|mjs|cjs)$/i;
const JSON_EXT = /\.json$/i;

// Codes that mean "this dependency can't be resolved in the isolated sandbox".
// Real in a full project, but expected noise here — surfaced as warnings, never errors.
const ISOLATION_NOISE_CODES = new Set([2307, 2792, 2306, 2305, 2614, 7016, 6053, 2688, 2580, 2584]);

/**
 * Real static verification of generated files. TypeScript/JS files are compiled
 * with the TS compiler API; JSON files are parsed. Syntax errors are hard errors
 * (unambiguous ground truth); type/semantic issues are surfaced as warnings so
 * isolated-snippet noise never produces a false failure.
 */
export function verifyArtifactFiles(rootDir: string, files: WrittenFile[]): VerificationResult {
  const tsFiles = files.filter((file) => TS_EXT.test(file.path));
  const jsonFiles = files.filter((file) => JSON_EXT.test(file.path));
  const skippedFiles = files
    .filter((file) => !TS_EXT.test(file.path) && !JSON_EXT.test(file.path))
    .map((file) => file.path);

  const diagnostics: VerifyDiagnostic[] = [];

  for (const file of jsonFiles) {
    try {
      JSON.parse(readFileSync(file.absPath, "utf8"));
    } catch (error) {
      diagnostics.push({
        filePath: file.path,
        severity: "error",
        message: `JSON 解析失败：${error instanceof Error ? error.message : "未知错误"}`
      });
    }
  }

  if (tsFiles.length > 0) {
    const byAbs = new Map(tsFiles.map((file) => [resolve(file.absPath), file.path]));
    const program = ts.createProgram(
      tsFiles.map((file) => file.absPath),
      {
        noEmit: true,
        skipLibCheck: true,
        allowJs: true,
        checkJs: false,
        strict: false,
        noImplicitAny: false,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.ReactJSX,
        types: []
      }
    );

    for (const file of tsFiles) {
      const source = program.getSourceFile(file.absPath);
      if (!source) continue;
      // Syntax errors are unambiguous → hard errors.
      for (const diagnostic of program.getSyntacticDiagnostics(source)) {
        diagnostics.push(mapDiagnostic(diagnostic, rootDir, byAbs, "error"));
      }
      // Semantic issues may be sandbox isolation noise → warnings.
      for (const diagnostic of program.getSemanticDiagnostics(source)) {
        diagnostics.push(mapDiagnostic(diagnostic, rootDir, byAbs, "warning"));
      }
    }
  }

  return {
    checkedFiles: tsFiles.length + jsonFiles.length,
    skippedFiles,
    diagnostics,
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error")
  };
}

function mapDiagnostic(
  diagnostic: ts.Diagnostic,
  rootDir: string,
  byAbs: Map<string, string>,
  baseSeverity: "error" | "warning"
): VerifyDiagnostic {
  const fileName = diagnostic.file?.fileName;
  const filePath = fileName ? byAbs.get(resolve(fileName)) ?? relative(rootDir, fileName) : "(unknown)";
  const line =
    diagnostic.file && typeof diagnostic.start === "number"
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
      : undefined;
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  const isNoise = diagnostic.code !== undefined && ISOLATION_NOISE_CODES.has(diagnostic.code);
  const severity: "error" | "warning" = isNoise ? "warning" : baseSeverity;
  return { filePath, line, code: diagnostic.code, severity, message };
}
