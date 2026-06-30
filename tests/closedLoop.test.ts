import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FactoryRepository } from "../server/db";
import { WorkflowService } from "../server/workflow";
import type { AgentEngine } from "../server/agents/engine";
import type { Assignment, GeneratedArtifact, ReviewFinding, Subagent, Task, WorkItem } from "../src/types";

/**
 * Engine that emits a syntactically BROKEN file on the first pass and a VALID
 * file once it receives error context — proving the real verification loop:
 * broken → caught by tsc → reopen → regenerate-with-errors → green.
 */
class BrokenThenFixedEngine implements AgentEngine {
  readonly kind = "mock" as const;

  async generateRequirements() {
    return "# 需求";
  }
  async regenerateRequirements() {
    return "# 需求 v2";
  }
  async generatePlan() {
    return "# 计划";
  }
  async regeneratePlan() {
    return "# 计划 v2";
  }
  async splitWorkItems(task: Task): Promise<WorkItem[]> {
    return [
      {
        id: "w1",
        taskId: task.id,
        title: "实现 add 工具函数",
        description: "一个把两个数字相加的函数",
        complexity: 4,
        preferredModelTier: "economy",
        status: "queued",
        assignedSubagentId: null
      }
    ];
  }
  async generateArtifact(
    task: Task,
    workItem: WorkItem,
    assignment: Assignment,
    subagent: Subagent,
    errorContext?: string
  ): Promise<GeneratedArtifact> {
    const fixed = Boolean(errorContext?.trim());
    return {
      id: `art_${Math.random().toString(36).slice(2)}`,
      taskId: task.id,
      workItemId: workItem.id,
      subagentId: subagent.id,
      modelTier: assignment.modelTier,
      files: [
        {
          path: "src/tool.ts",
          language: "typescript",
          summary: "add 工具函数",
          // 第一版语法错误（缺右操作数）；拿到错误上下文后产出修复版。
          content: fixed
            ? "export const add = (a: number, b: number): number => a + b;\n"
            : "export const add = (a: number, b: number): number => a + ;\n",
          diff: ""
        }
      ],
      agentNotes: fixed ? "已修复编译错误" : "首版",
      commitMessageDraft: "feat: add tool",
      createdAt: new Date().toISOString()
    };
  }
  async reviewArtifact(): Promise<ReviewFinding[]> {
    return []; // 不给模型意见，纯靠真实静态校验
  }
}

describe("closed loop: real verification catches a broken artifact, revision fixes it", () => {
  let repo: FactoryRepository | null = null;
  afterEach(() => {
    repo?.close();
    repo = null;
  });

  it("fails review on a broken file, then passes after revision regeneration", async () => {
    repo = new FactoryRepository(":memory:");
    const workflow = new WorkflowService(repo, new BrokenThenFixedEngine());
    const projectDir = mkdtempSync(join(tmpdir(), "maf-closed-loop-"));
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "target-project", scripts: {} }), "utf8");
    const project = workflow.scanProject(projectDir);

    const created = await workflow.createTask({ title: "工具任务", prompt: "写一个 add", complexity: 4, projectId: project.id });
    const planned = await workflow.confirmRequirements(created!.task.id, created!.requirements!.content);
    const assigned = await workflow.confirmPlan(planned!.task.id, planned!.plan!.content);

    await workflow.runGeneration(assigned!.task.id);
    const reviewed = await workflow.runReview(assigned!.task.id);

    // 真实 tsc 抓到语法错误 → 审查失败
    expect(reviewed!.task.validationState).toBe("failed");
    const openError = reviewed!.findings.find((finding) => finding.status === "open" && finding.severity === "error");
    expect(openError).toBeTruthy();

    // 回流 → 重生成（带真实错误上下文 → 引擎产出修复版）→ 再审查 → 通过
    const revision = workflow.reopenFinding(openError!.id, "修复编译错误");
    expect(revision!.task.stage).toBe("revision");

    await workflow.runGeneration(revision!.task.id);
    const reReviewed = await workflow.runReview(revision!.task.id);

    expect(reReviewed!.task.validationState).toBe("passed");
    expect(reReviewed!.findings.some((finding) => finding.status === "open" && finding.severity === "error")).toBe(false);
    // 只保留每个 work item 的最新产物（修复版）
    expect(reReviewed!.artifacts).toHaveLength(1);
    rmSync(projectDir, { recursive: true, force: true });
  });
});
