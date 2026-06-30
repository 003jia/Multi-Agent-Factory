import type { ModelTier, Subagent, TaskBundle } from "../types";

interface AssignmentPanelProps {
  bundle: TaskBundle;
  subagents: Subagent[];
  onAssign: (workItemId: string, subagentId: string, modelTier?: ModelTier) => Promise<void>;
  onGenerate: () => Promise<void>;
}

export function AssignmentPanel({ bundle, subagents, onAssign, onGenerate }: AssignmentPanelProps) {
  const canGenerate = bundle.task.stage === "assignment" || bundle.task.stage === "revision";
  const generateLabel = bundle.task.stage === "revision" ? "回流后重新生成" : "执行代码生成";

  if (!bundle.workItems.length) {
    return (
      <section className="panel empty-panel">
        <h2>任务分派</h2>
        <p>确认任务计划后，系统会自动拆分 work item 并匹配 subagent。</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>任务分派</h2>
          <p>系统已按能力、成本和模型策略完成初始分派，可在生成前手动调整。</p>
        </div>
        <button className="primary-button" disabled={!canGenerate} onClick={onGenerate} type="button">
          {generateLabel}
        </button>
      </div>
      <div className="work-list">
        {bundle.workItems.map((item, index) => {
          const assignment = bundle.assignments.find((candidate) => candidate.workItemId === item.id);
          const assignedAgent = subagents.find((agent) => agent.id === (assignment?.subagentId ?? item.assignedSubagentId));
          return (
            <article className="work-row" key={item.id}>
              <span className="work-index">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <div className="work-title-line">
                  <h3>{item.title}</h3>
                  <small>约 {Math.max(5, item.complexity * 3)} 分钟</small>
                </div>
                <p>{item.description}</p>
                <small>复杂度 {item.complexity} · 风险 {item.riskLevel} · 建议模型 {item.preferredModelTier}</small>
                <div className="work-meta-grid">
                  <span>目标：{item.targetFiles.length ? item.targetFiles.join(" / ") : "待推断"}</span>
                  <span>验收：{item.acceptanceChecks.length ? item.acceptanceChecks.join(" / ") : "静态校验"}</span>
                  <span>验证：{item.verificationCommands.length ? item.verificationCommands.join(" / ") : "按项目脚本自动选择"}</span>
                </div>
                <div className="work-chip-row">
                  <span>{assignedAgent?.name ?? "待分派 Agent"}</span>
                  <span>{assignment?.modelTier ?? item.preferredModelTier}</span>
                  <span className={assignment ? "success-text" : "muted"}>{assignment ? "已分配" : "排队中"}</span>
                </div>
              </div>
              <div className="assignment-controls">
                <select
                  value={assignment?.subagentId ?? item.assignedSubagentId ?? ""}
                  onChange={(event) => onAssign(item.id, event.target.value, assignment?.modelTier)}
                >
                  {subagents
                    .filter((agent) => agent.enabled)
                    .map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                </select>
                <select
                  value={assignment?.modelTier ?? item.preferredModelTier}
                  onChange={(event) =>
                    onAssign(item.id, assignment?.subagentId ?? item.assignedSubagentId ?? subagents[0]?.id, event.target.value as ModelTier)
                  }
                >
                  <option value="economy">economy</option>
                  <option value="quality">quality</option>
                </select>
                <span className="strategy">{assignment?.strategyReason ?? "等待分派"}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
