import type { TaskBundle } from "../types";

interface CanvasPreviewProps {
  bundle: TaskBundle;
}

export function CanvasPreview({ bundle }: CanvasPreviewProps) {
  return (
    <section className="panel canvas-panel">
      <div className="section-heading">
        <div>
          <h2>代码画布 V2</h2>
          <p>数据链路已改为 ProjectWorkspace → WorkItem → PatchSet → Finding → ApplyRecord。</p>
        </div>
        <span className="status-badge status-running">后续版本</span>
      </div>
      <div className="canvas-summary">
        <div>
          <strong>{bundle.patchSets.length}</strong>
          <span>PatchSet</span>
        </div>
        <div>
          <strong>{bundle.applyRecords.length}</strong>
          <span>应用记录</span>
        </div>
      </div>
      <div className="canvas-summary">
        <div>
          <strong>{bundle.canvas.nodes.length}</strong>
          <span>节点</span>
        </div>
        <div>
          <strong>{bundle.canvas.edges.length}</strong>
          <span>关系</span>
        </div>
      </div>
      <div className="canvas-list">
        {bundle.canvas.edges.length ? (
          bundle.canvas.edges.slice(0, 8).map((edge) => {
            const source = bundle.canvas.nodes.find((node) => node.id === edge.sourceId);
            const target = bundle.canvas.nodes.find((node) => node.id === edge.targetId);
            return (
              <div className="canvas-edge" key={edge.id}>
                <span>{source?.label ?? edge.sourceId}</span>
                <strong>{edge.label}</strong>
                <span>{target?.label ?? edge.targetId}</span>
              </div>
            );
          })
        ) : (
          <p className="muted">生成产物和审查意见后，会自动形成文件、diff、审查和责任 Agent 的关系。</p>
        )}
      </div>
    </section>
  );
}
