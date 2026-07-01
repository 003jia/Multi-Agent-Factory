import { createInterface } from "node:readline";
import { createEngine } from "../agents/index.js";
import { FactoryRepository } from "../db.js";
import { readLocalAiConfig } from "../localAiSettings.js";
import { WorkflowService } from "../workflow.js";
import { MCP_SERVER_NAME } from "./connection.js";
import { executeMcpTool, listMcpTools } from "./workflowTools.js";

interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const protocolVersion = "2025-06-18";
if (process.env.MAF_WORKSPACE_ROOT) process.chdir(process.env.MAF_WORKSPACE_ROOT);
const repo = new FactoryRepository(process.env.MAF_DB_PATH || "data/factory.sqlite");
const workflow = new WorkflowService(repo, createEngine(readLocalAiConfig()));

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  void handleLine(trimmed);
});

rl.on("close", () => {
  repo.close();
});

process.on("SIGINT", () => {
  repo.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  repo.close();
  process.exit(0);
});

async function handleLine(line: string) {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch {
    writeError(null, -32700, "Parse error");
    return;
  }

  if (!request.method) {
    writeError(request.id ?? null, -32600, "Invalid Request");
    return;
  }

  if (request.method.startsWith("notifications/")) return;
  if (request.id === undefined || request.id === null) return;

  try {
    const result = await dispatch(request);
    write({ jsonrpc: "2.0", id: request.id, result });
  } catch (error) {
    writeError(request.id, -32603, error instanceof Error ? error.message : "Internal error");
  }
}

async function dispatch(request: JsonRpcRequest) {
  switch (request.method) {
    case "initialize":
      return {
        protocolVersion,
        capabilities: {
          tools: { listChanged: false },
          resources: {}
        },
        serverInfo: {
          name: MCP_SERVER_NAME,
          version: "0.1.0"
        }
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: listMcpTools() };
    case "tools/call": {
      const params = request.params ?? {};
      const name = typeof params.name === "string" ? params.name : "";
      if (!name) throw new Error("tools/call 缺少 name");
      const result = await executeMcpTool(workflow, name, params.arguments ?? {});
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ],
        isError: false
      };
    }
    case "resources/list":
      return { resources: [] };
    case "prompts/list":
      return { prompts: [] };
    default:
      throw new Error(`Method not found: ${request.method}`);
  }
}

function write(payload: unknown) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function writeError(id: JsonRpcRequest["id"], code: number, message: string) {
  write({
    jsonrpc: "2.0",
    id,
    error: { code, message }
  });
}
