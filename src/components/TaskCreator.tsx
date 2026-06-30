import { FormEvent, useState } from "react";
import type { ProjectWorkspace } from "../types";

interface TaskCreatorProps {
  onCreate: (input: { title: string; prompt: string; complexity: number; projectId?: string | null; selectedFiles?: string[]; constraints?: string }) => Promise<void>;
  onPickProject: () => Promise<void>;
  onScanProjectPath: (rootPath: string) => Promise<void>;
  onSelectProject: (projectId: string | null) => void;
  projects: ProjectWorkspace[];
  selectedProjectId: string | null;
  busy: boolean;
}

export function TaskCreator({ onCreate, onPickProject, onScanProjectPath, onSelectProject, projects, selectedProjectId, busy }: TaskCreatorProps) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [constraints, setConstraints] = useState("默认不自动写入项目；审查通过后手动应用。");
  const [selectedFilesText, setSelectedFilesText] = useState("");
  const [manualPath, setManualPath] = useState("");
  const [complexity, setComplexity] = useState(5);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onCreate({
      title,
      prompt,
      complexity,
      projectId: selectedProjectId,
      selectedFiles: selectedFilesText.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean),
      constraints
    });
  };

  return (
    <form className="task-form" onSubmit={submit}>
      <div className="project-picker">
        <div>
          <strong>本地项目</strong>
          <p>{window.desktop ? "桌面端会通过主进程选择目录并扫描项目。" : "Web 模式可粘贴当前机器可访问的项目路径，或不绑定项目走演示流程。"}</p>
        </div>
        <div className="button-row">
          {window.desktop && (
            <button className="secondary-button" disabled={busy} onClick={onPickProject} type="button">
              选择项目文件夹
            </button>
          )}
          <button className="secondary-button" disabled={busy || !manualPath.trim()} onClick={() => onScanProjectPath(manualPath)} type="button">
            扫描路径
          </button>
        </div>
      </div>
      <label>
        项目路径
        <input placeholder="/Users/me/project" value={manualPath} onChange={(event) => setManualPath(event.target.value)} />
      </label>
      {projects.length > 0 && (
        <label>
          已扫描项目
          <select value={selectedProjectId ?? ""} onChange={(event) => onSelectProject(event.target.value || null)}>
            <option value="">演示模式：不绑定项目</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} · {project.packageManager} · {project.gitStatus}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        任务标题
        <input placeholder="例如：给设置页增加 API Key 管理" value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        任务描述
        <textarea placeholder="说明要修改的业务目标、期望结果、不要改的范围。" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} />
      </label>
      <label>
        目标文件或目录（可选，每行一个）
        <textarea placeholder="src/App.tsx&#10;server/app.ts" value={selectedFilesText} onChange={(event) => setSelectedFilesText(event.target.value)} rows={3} />
      </label>
      <label>
        执行约束
        <textarea value={constraints} onChange={(event) => setConstraints(event.target.value)} rows={3} />
      </label>
      <label>
        复杂度：{complexity}
        <input
          aria-label="复杂度"
          max={10}
          min={1}
          onChange={(event) => setComplexity(Number(event.target.value))}
          type="range"
          value={complexity}
        />
      </label>
      <button className="primary-button" disabled={busy || !title.trim() || !prompt.trim()} type="submit">
        创建任务并生成需求
      </button>
    </form>
  );
}
