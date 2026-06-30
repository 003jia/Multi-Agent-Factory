import { useMemo, useState } from "react";
import type { ModelTier, Subagent } from "../types";

interface SubagentPanelProps {
  subagents: Subagent[];
  onSave: (agent: Partial<Subagent>) => Promise<void>;
}

const emptyAgent: Partial<Subagent> = {
  name: "",
  role: "",
  skills: ["通用"],
  enabled: true,
  costTier: "medium",
  qualityTier: "standard",
  defaultModelTier: "economy",
  concurrencyLimit: 2
};

export function SubagentPanel({ subagents, onSave }: SubagentPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const selected = useMemo(() => subagents.find((agent) => agent.id === editingId), [editingId, subagents]);
  const [draft, setDraft] = useState<Partial<Subagent>>(emptyAgent);

  const startEdit = (agent: Subagent) => {
    setEditingId(agent.id);
    setDraft(agent);
  };

  const startNew = () => {
    setEditingId(null);
    setDraft(emptyAgent);
  };

  const save = async () => {
    await onSave({ ...draft, id: selected?.id, skills: normalizeSkills(draft.skills) });
    startNew();
  };

  return (
    <section className="panel subagent-panel">
      <div className="section-heading">
        <div>
          <h2>Subagent 配置</h2>
          <p>配置角色、能力、成本层级和默认模型策略；任务分派时可手动覆盖。</p>
        </div>
        <button className="secondary-button" onClick={startNew} type="button">
          新增
        </button>
      </div>
      <div className="agent-list">
        {subagents.map((agent) => (
          <button className={`agent-row ${editingId === agent.id ? "selected" : ""}`} key={agent.id} onClick={() => startEdit(agent)}>
            <span className={`agent-enabled ${agent.enabled ? "on" : "off"}`} />
            <span>
              <strong>{agent.name}</strong>
              <small>{agent.role}</small>
            </span>
            <span className="agent-meta">{agent.defaultModelTier}</span>
          </button>
        ))}
      </div>
      <div className="agent-editor">
        <label>
          名称
          <input value={draft.name ?? ""} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label>
          角色
          <input value={draft.role ?? ""} onChange={(event) => setDraft({ ...draft, role: event.target.value })} />
        </label>
        <label>
          能力标签
          <input
            value={normalizeSkills(draft.skills).join("、")}
            onChange={(event) => setDraft({ ...draft, skills: event.target.value.split(/[、,，]/).map((item) => item.trim()) })}
          />
        </label>
        <div className="field-grid">
          <label>
            默认模型
            <select
              value={draft.defaultModelTier ?? "economy"}
              onChange={(event) => setDraft({ ...draft, defaultModelTier: event.target.value as ModelTier })}
            >
              <option value="economy">economy</option>
              <option value="quality">quality</option>
            </select>
          </label>
          <label>
            并发上限
            <input
              min={1}
              max={8}
              type="number"
              value={draft.concurrencyLimit ?? 2}
              onChange={(event) => setDraft({ ...draft, concurrencyLimit: Number(event.target.value) })}
            />
          </label>
        </div>
        <label className="check-row">
          <input
            checked={draft.enabled ?? true}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
            type="checkbox"
          />
          启用该 subagent
        </label>
        <button className="primary-button" disabled={!draft.name?.trim()} onClick={save} type="button">
          保存 Subagent
        </button>
      </div>
    </section>
  );
}

function normalizeSkills(skills: Subagent["skills"] | undefined) {
  return (skills ?? []).map((item) => item.trim()).filter(Boolean);
}
