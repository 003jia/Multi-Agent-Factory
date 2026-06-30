import { Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import type { FactoryRepository } from "../server/db";
import type { AppSnapshot, ProjectWorkspace, TaskBundle } from "../src/types";

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

async function startApi() {
  const created = createApp({ dbPath: ":memory:" });
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

    const submitted = await json<TaskBundle>(baseUrl, `/api/tasks/${created.task.id}/apply`, { method: "POST" });
    expect(submitted.task.stage).toBe("submitted");
    expect(submitted.applyRecords).toHaveLength(1);
  });
});
