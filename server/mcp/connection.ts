import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { McpConnectionInfo, McpServerCommand } from "../../src/types.js";

export const MCP_SERVER_NAME = "multi-agent-factory";

export const MCP_TOOL_NAMES = [
  "health",
  "get_snapshot",
  "create_task",
  "save_requirements",
  "confirm_requirements",
  "save_plan",
  "confirm_plan",
  "update_assignment",
  "save_subagent",
  "run_generation",
  "run_review",
  "apply_task",
  "submit_task",
  "reopen_finding",
  "get_project_context"
];

export function getMcpConnectionInfo(rootDir = process.cwd(), dbPath = process.env.MAF_DB_PATH || resolve(rootDir, "data", "factory.sqlite")): McpConnectionInfo {
  const sourceEntry = resolve(rootDir, "server", "mcp", "stdio.ts");
  const builtEntry = resolve(rootDir, "dist", "server", "server", "mcp", "stdio.js");
  const localTsx = resolve(rootDir, "node_modules", ".bin", "tsx");
  const builtAvailable = existsSync(builtEntry);
  const devAvailable = existsSync(localTsx) && existsSync(sourceEntry);
  const status: McpConnectionInfo["status"] = builtAvailable ? "ready" : devAvailable ? "dev" : "missing-build";
  const command: McpServerCommand = {
    type: "stdio",
    command: builtAvailable ? "node" : localTsx,
    args: [builtAvailable ? builtEntry : sourceEntry],
    env: {
      MAF_DB_PATH: dbPath,
      MAF_WORKSPACE_ROOT: rootDir
    }
  };

  return {
    serverName: MCP_SERVER_NAME,
    transport: "stdio",
    status,
    rootDir,
    dbPath,
    tools: MCP_TOOL_NAMES,
    claudeCode: {
      name: "Claude Code",
      description: "把多 Agent 工厂作为 Claude Code 可调用的本地 MCP Server。",
      config: { mcpServers: { [MCP_SERVER_NAME]: command } },
      addCommand: [
        "claude",
        "mcp",
        "add",
        "--env",
        `MAF_DB_PATH=${dbPath}`,
        "--env",
        `MAF_WORKSPACE_ROOT=${rootDir}`,
        "--transport",
        "stdio",
        MCP_SERVER_NAME,
        "--",
        command.command,
        ...command.args
      ],
      note: "Claude Code 可使用项目级 .mcp.json 或 claude mcp add 导入；首次连接需要在 Claude Code 中确认信任。"
    },
    codex: {
      name: "Codex",
      description: "给支持 MCP stdio 配置的 Codex 客户端使用同一组工具。",
      config: { mcpServers: { [MCP_SERVER_NAME]: command } },
      note: "Codex 侧具体导入位置取决于当前版本；使用支持 .mcp.json/stdio MCP 的配置入口时，可直接复用此 JSON。"
    },
    notes: [
      "MCP Server 只暴露任务编排工具，不提供任意 shell 执行工具。",
      "apply_task 仍走项目原有门禁：审查通过、无开放 error、PatchSet 已验证、git clean、hash 未变化。",
      status === "ready" ? "当前已找到构建后的 MCP 入口。" : "当前未找到构建后的 MCP 入口；开发模式会使用本地 tsx 启动。"
    ]
  };
}
