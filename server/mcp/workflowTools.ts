import type { WorkflowService } from "../workflow.js";
import { parseAssignmentInput, parseCreateTaskInput, parseDocumentInput, parseReopenInput, parseSubagentInput } from "../validation.js";
import { MCP_TOOL_NAMES } from "./connection.js";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

const emptySchema: McpToolDefinition["inputSchema"] = {
  type: "object",
  properties: {},
  additionalProperties: false
};

export function listMcpTools(): McpToolDefinition[] {
  const tools: McpToolDefinition[] = [
    {
      name: "health",
      description: "检查多 Agent 工厂 MCP Server 是否可用。",
      inputSchema: emptySchema
    },
    {
      name: "get_snapshot",
      description: "读取任务、subagent 和选中任务快照。",
      inputSchema: {
        type: "object",
        properties: { taskId: { type: "string", description: "可选任务 ID。" } },
        additionalProperties: false
      }
    },
    {
      name: "create_task",
      description: "创建一个新的多 Agent 工厂任务，并生成需求草稿。",
      inputSchema: {
        type: "object",
        required: ["prompt", "complexity"],
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          prompt: { type: "string" },
          complexity: { type: "number", minimum: 1, maximum: 10 },
          projectId: { type: ["string", "null"] },
          selectedFiles: { type: "array", items: { type: "string" } },
          constraints: { type: "string" }
        }
      }
    },
    documentTool("save_requirements", "保存或按反馈重生成需求文档。"),
    documentTool("confirm_requirements", "确认需求文档，并生成任务计划草稿。"),
    documentTool("save_plan", "保存或按反馈重生成任务计划。"),
    documentTool("confirm_plan", "确认任务计划，并完成 work item 拆分和初始分派。"),
    {
      name: "update_assignment",
      description: "调整某个 work item 的 subagent 分派和模型档位。",
      inputSchema: {
        type: "object",
        required: ["workItemId", "subagentId"],
        additionalProperties: false,
        properties: {
          workItemId: { type: "string" },
          subagentId: { type: "string" },
          modelTier: { type: "string", enum: ["economy", "quality"] }
        }
      }
    },
    {
      name: "save_subagent",
      description: "新增或更新 subagent 配置。",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          role: { type: "string" },
          skills: { type: "array", items: { type: "string" } },
          enabled: { type: "boolean" },
          costTier: { type: "string", enum: ["low", "medium", "high"] },
          qualityTier: { type: "string", enum: ["standard", "premium"] },
          defaultModelTier: { type: "string", enum: ["economy", "quality"] },
          concurrencyLimit: { type: "number", minimum: 1, maximum: 8 }
        }
      }
    },
    taskIdTool("run_generation", "按当前分派执行代码生成，产出 Artifact 和 PatchSet。"),
    taskIdTool("run_review", "执行代码审查和沙箱验证。"),
    taskIdTool("apply_task", "把已验证 PatchSet 应用到真实项目。仍受后端门禁保护。"),
    taskIdTool("submit_task", "生成提交/完成记录，不写真实项目文件。"),
    {
      name: "reopen_finding",
      description: "把审查问题回流给责任 Agent。",
      inputSchema: {
        type: "object",
        required: ["findingId"],
        additionalProperties: false,
        properties: {
          findingId: { type: "string" },
          note: { type: "string" }
        }
      }
    },
    {
      name: "get_project_context",
      description: "读取已绑定项目的扫描信息和上下文文件列表。",
      inputSchema: {
        type: "object",
        required: ["projectId"],
        additionalProperties: false,
        properties: { projectId: { type: "string" } }
      }
    }
  ];
  return tools.filter((tool) => MCP_TOOL_NAMES.includes(tool.name));
}

export async function executeMcpTool(workflow: WorkflowService, name: string, args: unknown = {}) {
  switch (name) {
    case "health":
      return { ok: true, service: "multi-agent-factory-mcp", tools: MCP_TOOL_NAMES };
    case "get_snapshot":
      return workflow.snapshot(optionalString(args, "taskId"));
    case "create_task":
      return workflow.createTask(parseCreateTaskInput(args));
    case "save_requirements": {
      const input = taskDocumentInput(args);
      return workflow.updateRequirements(input.taskId, input.content, input.feedback);
    }
    case "confirm_requirements": {
      const input = taskDocumentInput(args);
      return workflow.confirmRequirements(input.taskId, input.content, input.feedback);
    }
    case "save_plan": {
      const input = taskDocumentInput(args);
      return workflow.updatePlan(input.taskId, input.content, input.feedback);
    }
    case "confirm_plan": {
      const input = taskDocumentInput(args);
      return workflow.confirmPlan(input.taskId, input.content, input.feedback);
    }
    case "update_assignment": {
      const body = objectArgs(args);
      const workItemId = requiredString(body, "workItemId");
      const input = parseAssignmentInput(body);
      return workflow.updateAssignment(workItemId, input.subagentId, input.modelTier);
    }
    case "save_subagent":
      return workflow.upsertSubagent(parseSubagentInput(args, optionalString(args, "id")));
    case "run_generation":
      return workflow.runGeneration(taskIdInput(args));
    case "run_review":
      return workflow.runReview(taskIdInput(args));
    case "apply_task":
      return workflow.apply(taskIdInput(args));
    case "submit_task":
      return workflow.submit(taskIdInput(args));
    case "reopen_finding": {
      const body = objectArgs(args);
      const findingId = requiredString(body, "findingId");
      const { note } = parseReopenInput(body);
      return workflow.reopenFinding(findingId, note);
    }
    case "get_project_context":
      return workflow.projectContext(requiredString(objectArgs(args), "projectId"));
    default:
      throw new Error(`未知 MCP 工具：${name}`);
  }
}

function documentTool(name: string, description: string): McpToolDefinition {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      required: ["taskId", "content"],
      additionalProperties: false,
      properties: {
        taskId: { type: "string" },
        content: { type: "string" },
        feedback: { type: "string" }
      }
    }
  };
}

function taskIdTool(name: string, description: string): McpToolDefinition {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      required: ["taskId"],
      additionalProperties: false,
      properties: { taskId: { type: "string" } }
    }
  };
}

function taskDocumentInput(args: unknown) {
  const body = objectArgs(args);
  return {
    taskId: requiredString(body, "taskId"),
    ...parseDocumentInput(body)
  };
}

function taskIdInput(args: unknown) {
  return requiredString(objectArgs(args), "taskId");
}

function objectArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("MCP 工具参数必须是对象");
  return args as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} 必须是非空字符串`);
  return value.trim();
}

function optionalString(args: unknown, key: string) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
