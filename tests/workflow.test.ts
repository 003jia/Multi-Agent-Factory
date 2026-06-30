import { afterEach, describe, expect, it } from "vitest";
import { MockEngine } from "../server/agents/mockEngine";
import { FactoryRepository } from "../server/db";
import { WorkflowService } from "../server/workflow";

let repo: FactoryRepository | null = null;

const service = () => {
  repo = new FactoryRepository(":memory:");
  return new WorkflowService(repo, new MockEngine());
};

afterEach(() => {
  repo?.close();
  repo = null;
});

describe("WorkflowService", () => {
  it("runs the full confirmed workflow through submission", async () => {
    const workflow = service();
    const created = await workflow.createTask({
      title: "测试任务",
      prompt: "验证多 agent 工厂流程",
      complexity: 5
    });

    expect(created?.task.stage).toBe("requirements_review");
    expect(created?.requirements?.confirmed).toBe(false);

    const planned = await workflow.confirmRequirements(created!.task.id, created!.requirements!.content, "确认需求");
    expect(planned?.task.stage).toBe("plan_review");
    expect(planned?.plan?.confirmed).toBe(false);

    const assigned = await workflow.confirmPlan(planned!.task.id, planned!.plan!.content, "确认计划");
    expect(assigned?.task.stage).toBe("assignment");
    expect(assigned?.workItems.length).toBeGreaterThanOrEqual(4);
    expect(assigned?.assignments.every((assignment) => assignment.subagentId)).toBe(true);

    const generated = await workflow.runGeneration(assigned!.task.id);
    expect(generated?.task.stage).toBe("generation");
    expect(generated?.artifacts.length).toBe(assigned?.workItems.length);

    const reviewed = await workflow.runReview(generated!.task.id);
    expect(reviewed?.task.validationState).toBe("passed");
    expect(reviewed?.canvas.nodes.length).toBeGreaterThan(0);
    expect(reviewed?.canvas.edges.length).toBeGreaterThan(0);

    const submitted = workflow.submit(reviewed!.task.id);
    expect(submitted?.task.stage).toBe("submitted");
    expect(submitted?.submissions).toHaveLength(1);
  });

  it("locks phase ordering and blocks submission with open review errors", async () => {
    const workflow = service();
    const created = await workflow.createTask({
      title: "高复杂度任务",
      prompt: "需要触发错误级审查问题",
      complexity: 9
    });

    await expect(workflow.runGeneration(created!.task.id)).rejects.toThrow("只能在任务分派后执行代码生成");

    const planned = await workflow.confirmRequirements(created!.task.id, created!.requirements!.content);
    const assigned = await workflow.confirmPlan(planned!.task.id, planned!.plan!.content);
    await workflow.runGeneration(assigned!.task.id);
    const reviewed = await workflow.runReview(assigned!.task.id);

    expect(reviewed?.task.validationState).toBe("failed");
    expect(() => workflow.submit(assigned!.task.id)).toThrow("仍有错误级审查问题");

    const openFinding = reviewed!.findings.find((finding) => finding.status === "open");
    const revision = workflow.reopenFinding(openFinding!.id, "回流给责任 agent");
    expect(revision?.task.stage).toBe("revision");
    expect(revision?.backlinks).toHaveLength(1);

    const regenerated = await workflow.runGeneration(revision!.task.id);
    expect(regenerated?.task.stage).toBe("generation");
    const rereviewed = await workflow.runReview(regenerated!.task.id);
    expect(rereviewed?.task.validationState).toBe("passed");
    const submitted = workflow.submit(rereviewed!.task.id);
    expect(submitted?.task.stage).toBe("submitted");
  });

  it("regenerates requirement and plan drafts when feedback is provided", async () => {
    const workflow = service();
    const created = await workflow.createTask({ title: "反馈测试", prompt: "需要根据反馈重整文档", complexity: 4 });

    const updatedRequirements = await workflow.updateRequirements(created!.task.id, created!.requirements!.content, "加入代码画布验收标准");
    expect(updatedRequirements?.requirements?.content).toContain("本轮反馈处理");
    expect(updatedRequirements?.requirements?.content).toContain("加入代码画布验收标准");

    const planned = await workflow.confirmRequirements(updatedRequirements!.task.id, updatedRequirements!.requirements!.content);
    const updatedPlan = await workflow.updatePlan(planned!.task.id, planned!.plan!.content, "把任务分派作为独立步骤");
    expect(updatedPlan?.plan?.content).toContain("本轮反馈处理");
    expect(updatedPlan?.plan?.content).toContain("把任务分派作为独立步骤");
  });

  it("allows subagent configuration and manual assignment override", async () => {
    const workflow = service();
    const created = await workflow.createTask({ title: "分派测试", prompt: "测试手动覆盖", complexity: 4 });
    const planned = await workflow.confirmRequirements(created!.task.id, created!.requirements!.content);
    const assigned = await workflow.confirmPlan(planned!.task.id, planned!.plan!.content);

    const agents = workflow.upsertSubagent({
      name: "低成本测试 Agent",
      role: "专门验证分派",
      skills: ["测试"],
      defaultModelTier: "economy",
      enabled: true
    });
    const customAgent = agents.find((agent) => agent.name === "低成本测试 Agent")!;
    const changed = workflow.updateAssignment(assigned!.workItems[0].id, customAgent.id, "quality");
    const updated = changed!.assignments.find((assignment) => assignment.workItemId === assigned!.workItems[0].id)!;

    expect(updated.subagentId).toBe(customAgent.id);
    expect(updated.modelTier).toBe("quality");
    expect(updated.manualOverride).toBe(true);
  });

  it("keeps seven visible steps while using explicit agent responsibilities internally", async () => {
    const workflow = service();
    const snapshot = workflow.snapshot();
    const agentNames = snapshot.subagents.map((agent) => agent.name);

    expect(agentNames).toContain("协调调度 Agent");
    expect(agentNames).toContain("产品需求 Agent");
    expect(agentNames).toContain("任务计划 Agent");
    expect(agentNames).toContain("代码审查 Agent");
    expect(agentNames).toContain("问题修复 Agent");
    expect(agentNames).toContain("监督巡检 Agent");

    const created = await workflow.createTask({ title: "明确分工", prompt: "按明确 Agent 分工执行", complexity: 7 });
    const planned = await workflow.confirmRequirements(created!.task.id, created!.requirements!.content);
    const assigned = await workflow.confirmPlan(planned!.task.id, planned!.plan!.content);

    expect(assigned?.task.stage).toBe("assignment");
    expect(assigned?.workItems.length).toBeGreaterThanOrEqual(5);
    expect(assigned?.assignments.every((assignment) => assignment.strategyReason.includes("并发容量"))).toBe(true);
    expect(assigned?.assignments.every((assignment) => assignment.strategyReason.includes("交接物"))).toBe(true);
  });
});
