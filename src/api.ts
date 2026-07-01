import type { AiConfigAuditResult, AiProviderConfigInput, AiProviderConfigView, AiStatus, AppSnapshot, McpConnectionInfo, ModelTier, ProjectWorkspace, Subagent, TaskBundle } from "./types";

const request = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    },
    ...options
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string; details?: unknown };
    const error = new Error(body.error || `请求失败：${response.status}`);
    Object.assign(error, { code: body.code, details: body.details });
    throw error;
  }

  return response.json() as Promise<T>;
};

export const api = {
  health: () => request<AiStatus & { ok: boolean; service: string }>("/api/health"),
  getAiConfig: () => request<AiProviderConfigView>("/api/settings/ai-config"),
  setAiConfig: (body: AiProviderConfigInput) => request<AiStatus>("/api/settings/ai-config", { method: "POST", body: JSON.stringify(body) }),
  auditAiConfig: (body: AiProviderConfigInput) => request<AiConfigAuditResult>("/api/settings/ai-config/audit", { method: "POST", body: JSON.stringify(body) }),
  getMcpConfig: () => request<McpConnectionInfo>("/api/settings/mcp"),
  snapshot: (taskId?: string) => request<AppSnapshot>(`/api/snapshot${taskId ? `?taskId=${taskId}` : ""}`),
  scanProject: (rootPath: string) => request<ProjectWorkspace>("/api/projects/scan", { method: "POST", body: JSON.stringify({ rootPath }) }),
  projectContext: (projectId: string) => request<{ project: ProjectWorkspace; files: string[] }>(`/api/projects/${projectId}/context`),
  createTask: (body: { title: string; prompt: string; complexity: number; projectId?: string | null; selectedFiles?: string[]; constraints?: string }) =>
    request<TaskBundle>("/api/tasks", { method: "POST", body: JSON.stringify(body) }),
  saveRequirements: (taskId: string, body: { content: string; feedback: string }) =>
    request<TaskBundle>(`/api/tasks/${taskId}/requirements`, { method: "PUT", body: JSON.stringify(body) }),
  confirmRequirements: (taskId: string, body: { content: string; feedback: string }) =>
    request<TaskBundle>(`/api/tasks/${taskId}/requirements/confirm`, { method: "POST", body: JSON.stringify(body) }),
  savePlan: (taskId: string, body: { content: string; feedback: string }) =>
    request<TaskBundle>(`/api/tasks/${taskId}/plan`, { method: "PUT", body: JSON.stringify(body) }),
  confirmPlan: (taskId: string, body: { content: string; feedback: string }) =>
    request<TaskBundle>(`/api/tasks/${taskId}/plan/confirm`, { method: "POST", body: JSON.stringify(body) }),
  updateAssignment: (workItemId: string, body: { subagentId: string; modelTier?: ModelTier }) =>
    request<TaskBundle>(`/api/work-items/${workItemId}/assignment`, { method: "PUT", body: JSON.stringify(body) }),
  saveSubagent: (agent: Partial<Subagent>) => {
    const method = agent.id ? "PUT" : "POST";
    const url = agent.id ? `/api/subagents/${agent.id}` : "/api/subagents";
    return request<Subagent[]>(url, { method, body: JSON.stringify(agent) });
  },
  runGeneration: (taskId: string) => request<TaskBundle>(`/api/tasks/${taskId}/generate`, { method: "POST" }),
  runReview: (taskId: string) => request<TaskBundle>(`/api/tasks/${taskId}/review`, { method: "POST" }),
  submit: (taskId: string) => request<TaskBundle>(`/api/tasks/${taskId}/submit`, { method: "POST" }),
  apply: (taskId: string) => request<TaskBundle>(`/api/tasks/${taskId}/apply`, { method: "POST" }),
  reopenFinding: (findingId: string, note: string) =>
    request<TaskBundle>(`/api/review-findings/${findingId}/reopen`, { method: "POST", body: JSON.stringify({ note }) })
};
