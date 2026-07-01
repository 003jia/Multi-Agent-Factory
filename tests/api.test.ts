import { Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import type { FactoryRepository } from "../server/db";
import type { AiConfigAuditResult, AiStatus, AppSnapshot, McpConnectionInfo, ProjectWorkspace, TaskBundle } from "../src/types";

let server: Server | null = null;
let repo: FactoryRepository | null = null;
let projectDir: string | null = null;

afterEach(async () => {
  repo?.close();
  repo = null;
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
  }
  server = null;
  if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  projectDir = null;
});

async function startApi(options: { allowHttpProjectScan?: boolean } = { allowHttpProjectScan: true }) {
  const created = createApp({ dbPath: ":memory:", allowHttpProjectScan: options.allowHttpProjectScan });
  repo = created.repo;
  const { app } = created;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("无法获取测试端口");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function json<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

describe("API workflow", () => {
  it("supports task creation, confirmations, generation, review and submission", async () => {
    const { baseUrl } = await startApi();

    const snapshot = await json<AppSnapshot>(baseUrl, "/api/snapshot");
    expect(snapshot.subagents.length).toBeGreaterThanOrEqual(5);
    projectDir = mkdtempSync(join(tmpdir(), "maf-api-project-"));
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "api-project", scripts: {} }), "utf8");
    const project = await json<ProjectWorkspace>(baseUrl, "/api/projects/scan", {
      method: "POST",
      body: JSON.stringify({ rootPath: projectDir })
    });
    expect(project.name).toBe("api-project");

    const created = await json<TaskBundle>(baseUrl, "/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "API 流程", prompt: "跑通完整 API", complexity: 5, projectId: project.id, selectedFiles: ["src/generated/api.ts"], constraints: "审查后应用" })
    });
    expect(created.task.stage).toBe("requirements_review");
    expect(created.project?.id).toBe(project.id);

    const planned = await json<TaskBundle>(baseUrl, `/api/tasks/${created.task.id}/requirements/confirm`, {
      method: "POST",
      body: JSON.stringify({ content: created.requirements!.content, feedback: "OK" })
    });
    expect(planned.task.stage).toBe("plan_review");

    const assigned = await json<TaskBundle>(baseUrl, `/api/tasks/${created.task.id}/plan/confirm`, {
      method: "POST",
      body: JSON.stringify({ content: planned.plan!.content, feedback: "OK" })
    });
    expect(assigned.workItems.length).toBeGreaterThan(0);

    const generated = await json<TaskBundle>(baseUrl, `/api/tasks/${created.task.id}/generate`, { method: "POST" });
    expect(generated.artifacts.length).toBe(assigned.workItems.length);
    expect(generated.patchSets.length).toBe(assigned.workItems.length);

    const reviewed = await json<TaskBundle>(baseUrl, `/api/tasks/${created.task.id}/review`, { method: "POST" });
    expect(reviewed.canvas.nodes.some((node) => node.type === "diff")).toBe(true);

    const applied = await json<TaskBundle>(baseUrl, `/api/tasks/${created.task.id}/apply`, { method: "POST" });
    expect(applied.task.stage).toBe("review");
    expect(applied.applyRecords).toHaveLength(1);
    expect(applied.patchSets.every((patchSet) => patchSet.applyStatus === "applied")).toBe(true);

    const submitted = await json<TaskBundle>(baseUrl, `/api/tasks/${created.task.id}/submit`, { method: "POST" });
    expect(submitted.task.stage).toBe("submitted");
    expect(submitted.submissions).toHaveLength(1);
  });

  it("blocks HTTP project scans unless explicitly enabled", async () => {
    const { baseUrl } = await startApi({ allowHttpProjectScan: false });
    const response = await fetch(`${baseUrl}/api/projects/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rootPath: "/tmp/example" })
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "PROJECT_SCAN_DISABLED" });
  });

  it("returns structured validation errors for invalid task input", async () => {
    const { baseUrl } = await startApi();
    const response = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "", complexity: 11 })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("audits AI API key configuration without returning the raw key", async () => {
    const { baseUrl } = await startApi();

    const missing = await json<AiConfigAuditResult>(baseUrl, "/api/settings/ai-config/audit", {
      method: "POST",
      body: JSON.stringify({ provider: "openai" })
    });
    expect(missing.status).toBe("failed");
    expect(missing.canUseRealModel).toBe(false);
    expect(missing.items.some((item) => item.id === "api-key-missing")).toBe(true);

    await json<AiStatus>(baseUrl, "/api/settings/ai-config", {
      method: "POST",
      body: JSON.stringify({
        provider: "openai",
        apiKey: "sk-test-local-only",
        baseUrl: "https://api.openai.com/v1",
        economyModel: "gpt-4o-mini",
        qualityModel: "gpt-4o"
      })
    });
    const reused = await json<AiConfigAuditResult>(baseUrl, "/api/settings/ai-config/audit", {
      method: "POST",
      body: JSON.stringify({
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        economyModel: "gpt-4o-mini",
        qualityModel: "gpt-4o"
      })
    });

    expect(reused.status).toBe("passed");
    expect(reused.keyMasked).toBe("sk-tes...only");
    expect(JSON.stringify(reused)).not.toContain("sk-test-local-only");
  });

  it("returns MCP connection config for Claude Code and Codex", async () => {
    const { baseUrl } = await startApi();
    const info = await json<McpConnectionInfo>(baseUrl, "/api/settings/mcp");

    expect(info.serverName).toBe("multi-agent-factory");
    expect(info.claudeCode.config.mcpServers["multi-agent-factory"].type).toBe("stdio");
    expect(info.codex.config.mcpServers["multi-agent-factory"].command).toBeTruthy();
    expect(info.tools).toContain("create_task");
  });
});
