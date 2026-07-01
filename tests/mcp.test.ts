import { afterEach, describe, expect, it } from "vitest";
import { MockEngine } from "../server/agents/mockEngine";
import { FactoryRepository } from "../server/db";
import { getMcpConnectionInfo, MCP_SERVER_NAME } from "../server/mcp/connection";
import { executeMcpTool, listMcpTools } from "../server/mcp/workflowTools";
import { WorkflowService } from "../server/workflow";
import type { TaskBundle } from "../src/types";

let repo: FactoryRepository | null = null;

afterEach(() => {
  repo?.close();
  repo = null;
});

function workflow() {
  repo = new FactoryRepository(":memory:");
  return new WorkflowService(repo, new MockEngine());
}

describe("MCP integration", () => {
  it("describes Claude Code and Codex stdio connection configs", () => {
    const info = getMcpConnectionInfo("/tmp/maf", "/tmp/maf/data/factory.sqlite");

    expect(info.serverName).toBe(MCP_SERVER_NAME);
    expect(info.transport).toBe("stdio");
    expect(info.claudeCode.config.mcpServers[MCP_SERVER_NAME].type).toBe("stdio");
    expect(info.codex.config.mcpServers[MCP_SERVER_NAME].env.MAF_DB_PATH).toBe("/tmp/maf/data/factory.sqlite");
    expect(info.tools).toContain("create_task");
    expect(info.tools).toContain("apply_task");
  });

  it("lists safe workflow tools", () => {
    const tools = listMcpTools();
    const names = tools.map((tool) => tool.name);

    expect(names).toContain("health");
    expect(names).toContain("run_review");
    expect(names).not.toContain("run_shell");
  });

  it("executes workflow tools through the MCP adapter", async () => {
    const service = workflow();
    const created = await executeMcpTool(service, "create_task", {
      title: "MCP 任务",
      prompt: "通过 MCP 创建任务",
      complexity: 4
    }) as TaskBundle;

    expect(created.task.stage).toBe("requirements_review");
    expect(created.requirements?.content).toContain("MCP 任务");

    const snapshot = await executeMcpTool(service, "get_snapshot", { taskId: created.task.id });
    expect(JSON.stringify(snapshot)).toContain(created.task.id);
  });
});
