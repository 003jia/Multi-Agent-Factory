import { describe, expect, it } from "vitest";
import { assignWorkItems, defaultSubagents } from "../server/mockAgents";
import type { Task, WorkItem } from "../src/types";

const task: Task = {
  id: "t1",
  projectId: null,
  title: "演示",
  prompt: "p",
  selectedFiles: [],
  constraints: "",
  complexity: 5,
  stage: "assignment",
  validationState: "pending",
  createdAt: "",
  updatedAt: ""
};

function wi(partial: Partial<WorkItem> & { id: string; title: string }): WorkItem {
  return {
    taskId: "t1",
    description: "",
    targetFiles: [],
    dependencies: [],
    acceptanceChecks: [],
    riskLevel: "medium",
    verificationCommands: [],
    complexity: 5,
    preferredModelTier: "economy",
    status: "queued",
    assignedSubagentId: null,
    ...partial
  };
}

function assignOne(item: WorkItem): string {
  return assignWorkItems(task, [item], defaultSubagents)[0].subagentId;
}

describe("semantic dispatch (M1)", () => {
  it("routes frontend files to the frontend agent", () => {
    expect(assignOne(wi({ id: "w1", title: "登录页", targetFiles: ["src/components/Login.tsx"] }))).toBe("agent_frontend");
  });

  it("routes server files to the backend agent", () => {
    expect(assignOne(wi({ id: "w2", title: "用户接口", targetFiles: ["server/api/users.ts"] }))).toBe("agent_backend");
  });

  it("routes test files to the review or fix agent", () => {
    expect(["agent_review", "agent_fix"]).toContain(
      assignOne(wi({ id: "w3", title: "补测试", targetFiles: ["tests/users.test.ts"] }))
    );
  });

  it("matches by skill keyword when there are no target files", () => {
    expect(assignOne(wi({ id: "w5", title: "React 组件状态", description: "用 React 管理 UI 状态" }))).toBe("agent_frontend");
  });

  it("does not hand implementation work to a pure meta agent", () => {
    const picked = assignOne(wi({ id: "w4", title: "实现一个工具函数", description: "add two numbers", targetFiles: ["src/util/add.ts"] }));
    expect(["agent_coordinator", "agent_product", "agent_supervisor"]).not.toContain(picked);
  });
});
