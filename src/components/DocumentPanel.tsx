import { useEffect, useState } from "react";

interface DocumentPanelProps {
  title: string;
  content: string;
  feedback: string;
  locked: boolean;
  saveLabel: string;
  confirmLabel: string;
  onSave: (content: string, feedback: string) => Promise<void>;
  onConfirm: (content: string, feedback: string) => Promise<void>;
}

export function DocumentPanel({
  title,
  content,
  feedback,
  locked,
  saveLabel,
  confirmLabel,
  onSave,
  onConfirm
}: DocumentPanelProps) {
  const [draft, setDraft] = useState(content);
  const [note, setNote] = useState(feedback);

  useEffect(() => {
    setDraft(content);
    setNote(feedback);
  }, [content, feedback]);

  return (
    <section className="panel document-panel">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{locked ? "已确认，后续阶段将以此版本为准。" : "可直接编辑，也可以写下反馈让 Agent 重新整理。"}</p>
        </div>
        {locked ? <span className="status-badge status-passed">已确认</span> : <span className="status-badge status-running">待确认</span>}
      </div>
      <textarea
        className="markdown-editor"
        disabled={locked}
        onChange={(event) => setDraft(event.target.value)}
        value={draft}
      />
      <label className="feedback-box">
        给 Agent 的修改意见
        <textarea disabled={locked} onChange={(event) => setNote(event.target.value)} rows={3} value={note} />
      </label>
      {!locked && (
        <div className="button-row">
          <button className="secondary-button" onClick={() => onSave(draft, note)} type="button">
            {saveLabel}
          </button>
          <button className="primary-button" onClick={() => onConfirm(draft, note)} type="button">
            {confirmLabel}
          </button>
        </div>
      )}
    </section>
  );
}
