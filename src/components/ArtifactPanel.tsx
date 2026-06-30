import type { TaskBundle } from "../types";

interface ArtifactPanelProps {
  bundle: TaskBundle;
  onReview: () => Promise<void>;
  onSubmit: () => Promise<void>;
  onReopen: (findingId: string) => Promise<void>;
}

export function ArtifactPanel({ bundle, onReview, onSubmit, onReopen }: ArtifactPanelProps) {
  if (!bundle.artifacts.length) {
    return (
      <section className="panel empty-panel">
        <h2>代码产物与审查</h2>
        <p>执行代码生成后，这里会展示文件树、diff、提交说明草稿和审查意见。</p>
      </section>
    );
  }

  const hasOpenError = bundle.findings.some((finding) => finding.status === "open" && finding.severity === "error");

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>代码产物与审查</h2>
          <p>所有产物均为可审查材料，不会直接写入真实项目文件。</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" disabled={bundle.task.stage !== "generation" && bundle.task.stage !== "review"} onClick={onReview} type="button">
            运行代码审查
          </button>
          <button className="primary-button" disabled={bundle.task.stage !== "review" || hasOpenError || !bundle.findings.length} onClick={onSubmit} type="button">
            {bundle.project ? "应用到项目" : "形成提交记录"}
          </button>
        </div>
      </div>
      <div className="artifact-list">
        {bundle.artifacts.map((artifact) => {
          const workItem = bundle.workItems.find((item) => item.id === artifact.workItemId);
          const findings = bundle.findings.filter((finding) => finding.artifactId === artifact.id);
          const patchSet = bundle.patchSets.find((item) => item.artifactId === artifact.id);
          return (
            <article className="artifact-row" key={artifact.id}>
              <header>
                <div>
                  <h3>{workItem?.title ?? "未命名产物"}</h3>
                  <small>{artifact.agentNotes}</small>
                </div>
                <span className="agent-meta">{artifact.modelTier}</span>
              </header>
              <div className="button-row">
                <button className="secondary-button" onClick={() => downloadArtifactBundle(artifact)} type="button">
                  下载全部产物
                </button>
                {patchSet && <span className={`status-badge status-${patchSet.applyStatus === "blocked" ? "failed" : patchSet.applyStatus === "verified" || patchSet.applyStatus === "applied" ? "passed" : "running"}`}>PatchSet：{patchSet.applyStatus}</span>}
              </div>
              {patchSet && (
                <div className="patchset-card">
                  <div className="patchset-summary">
                    <strong>{patchSet.changes.length} 个文件变更</strong>
                    <span>{patchSet.applyStatus === "applied" ? "已应用" : patchSet.applyStatus === "verified" ? "已验证，等待应用" : patchSet.applyStatus === "blocked" ? "被门禁阻止" : "等待审查"}</span>
                  </div>
                  <div className="change-list">
                    {patchSet.changes.map((change) => (
                      <div className="change-row" key={change.id}>
                        <strong>{change.kind}</strong>
                        <span>{change.path}</span>
                        <small>{change.originalHash ? `hash ${change.originalHash.slice(0, 10)}` : "new file"}</small>
                      </div>
                    ))}
                  </div>
                  <pre>{patchSet.diff}</pre>
                  {patchSet.verificationLog && <pre className="file-content">{patchSet.verificationLog}</pre>}
                </div>
              )}
              {artifact.files.map((file) => (
                <div className="file-diff" key={file.path}>
                  <div className="file-heading">
                    <strong>{file.path}</strong>
                    <button className="secondary-button" onClick={() => downloadFile(file.path, file.content)} type="button">
                      下载文件
                    </button>
                  </div>
                  <p>{file.summary}</p>
                  <pre className="file-content">{file.content || "暂无完整文件内容"}</pre>
                  <pre>{file.diff}</pre>
                </div>
              ))}
              <div className="commit-draft">提交说明草稿：{artifact.commitMessageDraft}</div>
              <div className="finding-list">
                {findings.map((finding) => (
                  <div className={`finding finding-${finding.severity}`} key={finding.id}>
                    <div>
                      <strong>{finding.message}</strong>
                      <p>{finding.suggestedFix}</p>
                    </div>
                    <button className="secondary-button" onClick={() => onReopen(finding.id)} type="button">
                      回流修改
                    </button>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function downloadArtifactBundle(artifact: TaskBundle["artifacts"][number]) {
  downloadFile(
    `${artifact.commitMessageDraft.replace(/[^\u4e00-\u9fa5A-Za-z0-9-]/g, "-") || "artifact"}.json`,
    JSON.stringify(
      {
        commitMessageDraft: artifact.commitMessageDraft,
        agentNotes: artifact.agentNotes,
        files: artifact.files
      },
      null,
      2
    )
  );
}

function downloadFile(path: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = path.split("/").pop() || "generated-file.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
