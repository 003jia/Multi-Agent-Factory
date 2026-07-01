import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatusBadge } from "./components/StatusBadge";
import { stageLabels } from "./lib/stage";
import type { AiStatus, AppSnapshot, GeneratedArtifact, ModelTier, ProjectWorkspace, Subagent, TaskBundle } from "./types";

type StageCardId = "requirements" | "plan" | "project" | "execution" | "result";

const forgeSteps = [
  { id: "requirements", name: "需求炉", caption: "需求文档" },
  { id: "plan", name: "计划坊", caption: "任务计划" },
  { id: "execution", name: "铸码间", caption: "项目上下文" },
  { id: "review", name: "审查塔", caption: "执行明细" },
  { id: "submit", name: "提交仓", caption: "代码产物与审查" }
] as const;

const forgeStepX = [150, 390, 630, 870, 1110] as const;

const taskTemplates = [
  {
    title: "生成设置页",
    sub: "配置项 / 模型 / API Key",
    prompt: "给这个项目生成一个简洁的设置页，支持填写 API Key、选择模型，并保存到本地配置。"
  },
  {
    title: "修复构建错误",
    sub: "定位原因 / 最小修改",
    prompt: "扫描当前项目的构建错误，定位最小修改范围，修复后运行 typecheck 和测试。"
  },
  {
    title: "重构组件",
    sub: "清晰结构 / 可维护",
    prompt: "把当前复杂页面拆成更清晰的组件结构，保持行为不变，并提升可维护性。"
  },
  {
    title: "添加测试",
    sub: "单测 / 集成 / 覆盖率",
    prompt: "为核心工作流补充测试，覆盖任务创建、需求确认、计划确认、生成和审查。"
  },
  {
    title: "接入 API",
    sub: "请求封装 / 错误处理",
    prompt: "接入一个后端 API，补齐加载、错误和空状态，并保持现有 UI 简洁。"
  },
  {
    title: "生成页面",
    sub: "布局 / 交互 / 状态",
    prompt: "基于现有视觉风格生成一个新页面，先输出需求和计划，再生成可审查代码。"
  },
  {
    title: "补文档",
    sub: "README / 说明文档",
    prompt: "为当前功能补充 README 或开发文档，说明运行方式、核心流程和限制。"
  },
  {
    title: "优化交互",
    sub: "体验 / 性能 / 可用性",
    prompt: "检查当前页面交互，把信息层级收敛，减少不必要的面板和按钮。"
  }
];

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>({ projects: [], tasks: [], subagents: [], selectedTask: null });
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [recommendedFiles, setRecommendedFiles] = useState<string[]>([]);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showProjectBinding, setShowProjectBinding] = useState(false);
  const [manualProjectPath, setManualProjectPath] = useState("");
  const [selectedFilesText, setSelectedFilesText] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");

  const bundle = snapshot.selectedTask;
  const selectedProject = useMemo(
    () => snapshot.projects.find((project) => project.id === selectedProjectId) ?? null,
    [snapshot.projects, selectedProjectId]
  );
  const openErrors = useMemo(
    () => bundle?.findings.filter((finding) => finding.status === "open" && finding.severity === "error") ?? [],
    [bundle]
  );

  useEffect(() => {
    void refresh(undefined, false);
  }, []);

  useEffect(() => {
    if (!showSettings) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowSettings(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showSettings]);

  const loadAiStatus = async (): Promise<AiStatus> => {
    if (window.desktop) return window.desktop.getAiStatus();
    const health = await api.health();
    return {
      aiEnabled: health.aiEnabled,
      mode: health.mode,
      provider: health.provider,
      baseUrl: health.baseUrl,
      models: health.models,
      keyMasked: health.keyMasked
    };
  };

  const refresh = async (taskId = selectedTaskId, selectTask = Boolean(taskId)) => {
    setBusy(true);
    setError(null);
    try {
      const [data, health] = await Promise.all([api.snapshot(taskId), loadAiStatus()]);
      setSnapshot(selectTask ? data : { ...data, selectedTask: null });
      setAiStatus(health);
      setSelectedTaskId(selectTask ? data.selectedTask?.task.id : undefined);
      if (!selectedProjectId && data.projects[0]) setSelectedProjectId(data.projects[0].id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败");
    } finally {
      setBusy(false);
    }
  };

  const runTaskOperation = async (operation: () => Promise<TaskBundle>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      setSnapshot((current) => ({
        ...current,
        selectedTask: result,
        tasks: [result.task, ...current.tasks.filter((task) => task.id !== result.task.id)]
      }));
      setSelectedTaskId(result.task.id);
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败");
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const upsertProject = async (project: ProjectWorkspace) => {
    setSnapshot((current) => ({
      ...current,
      projects: [project, ...current.projects.filter((item) => item.id !== project.id)]
    }));
    setSelectedProjectId(project.id);
    await loadProjectContext(project.id);
  };

  const loadProjectContext = async (projectId: string) => {
    try {
      const context = await api.projectContext(projectId);
      setRecommendedFiles(context.files.slice(0, 8));
    } catch {
      setRecommendedFiles([]);
    }
  };

  const pickProject = async () => {
    if (!window.desktop) return;
    setProjectBusy(true);
    setError(null);
    try {
      const project = await window.desktop.selectProjectDirectory();
      if (project) await upsertProject(project);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "选择项目失败");
    } finally {
      setProjectBusy(false);
    }
  };

  const scanManualProject = async () => {
    const rootPath = manualProjectPath.trim();
    if (!rootPath) return;
    setProjectBusy(true);
    setError(null);
    try {
      await upsertProject(await api.scanProject(rootPath));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "扫描项目失败");
    } finally {
      setProjectBusy(false);
    }
  };

  const createTask = async (event?: FormEvent) => {
    event?.preventDefault();
    const prompt = draftPrompt.trim();
    if (!prompt) return;
    const selectedFiles = selectedFilesText.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean);
    const title = draftTitle.trim() || titleFromPrompt(prompt);
    const created = await runTaskOperation(() =>
      api.createTask({
        title,
        prompt,
        complexity: 5,
        projectId: selectedProjectId,
        selectedFiles,
        constraints: selectedProjectId
          ? "已绑定本地项目：先生成可审查产物，审查通过后再由用户手动应用。"
          : "先保持简单：不绑定项目时只生成可审查方案和代码产物，不写入真实磁盘。"
      })
    );
    if (created) {
      setDraftTitle("");
      setDraftPrompt("");
    }
  };

  const chooseTemplate = (template: (typeof taskTemplates)[number]) => {
    setDraftTitle(template.title);
    setDraftPrompt(template.prompt);
  };

  const chooseRecommendedFile = (file: string) => {
    const current = selectedFilesText.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean);
    if (current.includes(file)) return;
    setSelectedFilesText([...current, file].join("\n"));
  };

  const openTask = async (taskId: string) => {
    setSelectedTaskId(taskId);
    await refresh(taskId, true);
  };

  const resetToHome = () => {
    setSnapshot((current) => ({ ...current, selectedTask: null }));
    setSelectedTaskId(undefined);
    setError(null);
  };

  return (
    <div className="simple-shell">
      <header className="simple-topbar">
        <button className="simple-brand" onClick={resetToHome} type="button">
          <span className="simple-brand-mark">炉</span>
          <span className="simple-brand-copy">
            <strong>熔炼镇</strong>
            <small>多 Agent 工厂</small>
          </span>
        </button>
        <div className="simple-topbar-actions">
          {aiStatus && <span className={`simple-mode ${aiStatus.aiEnabled ? "online" : "offline"}`}>{aiStatus.mode}</span>}
        </div>
      </header>

      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)}>
          <SettingsPanel status={aiStatus} onStatusChange={setAiStatus} />
        </SettingsDialog>
      )}

      {error && <div className="simple-error">{error}</div>}

      {bundle ? (
        <TaskDetail
          bundle={bundle}
          busy={busy}
          onApply={async () => {
            await runTaskOperation(() => api.apply(bundle.task.id));
          }}
          onBackHome={resetToHome}
          onConfirmPlan={async (content, feedback) => {
            await runTaskOperation(() => api.confirmPlan(bundle.task.id, { content, feedback }));
          }}
          onConfirmRequirements={async (content, feedback) => {
            await runTaskOperation(() => api.confirmRequirements(bundle.task.id, { content, feedback }));
          }}
          onGenerate={async () => {
            await runTaskOperation(() => api.runGeneration(bundle.task.id));
          }}
          onReopen={async (findingId) => {
            await runTaskOperation(() => api.reopenFinding(findingId, "回流到责任 Agent 修改。"));
          }}
          onReview={async () => {
            await runTaskOperation(() => api.runReview(bundle.task.id));
          }}
          onSubmit={async () => {
            await runTaskOperation(() => api.submit(bundle.task.id));
          }}
          openErrors={openErrors.length}
          subagents={snapshot.subagents}
        />
      ) : (
        <ForgeHome
          aiStatus={aiStatus}
          busy={busy}
          draftPrompt={draftPrompt}
          manualProjectPath={manualProjectPath}
          onChooseRecommendedFile={chooseRecommendedFile}
          onChooseTemplate={chooseTemplate}
          onCreateTask={createTask}
          onDraftPromptChange={(value) => {
            setDraftPrompt(value);
            if (draftTitle) setDraftTitle("");
          }}
          onManualProjectPathChange={setManualProjectPath}
          onOpenSettings={() => setShowSettings(true)}
          onOpenTask={openTask}
          onPickProject={pickProject}
          onScanProject={scanManualProject}
          onSelectProject={async (projectId) => {
            setSelectedProjectId(projectId);
            if (projectId) await loadProjectContext(projectId);
          }}
          onSelectedFilesTextChange={setSelectedFilesText}
          onToggleProjectBinding={() => setShowProjectBinding((value) => !value)}
          projectBusy={projectBusy}
          projects={snapshot.projects}
          recommendedFiles={recommendedFiles}
          selectedFilesText={selectedFilesText}
          selectedProject={selectedProject}
          selectedProjectId={selectedProjectId}
          showProjectBinding={showProjectBinding}
          tasks={snapshot.tasks}
        />
      )}
    </div>
  );
}

function SettingsDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="settings-dialog-backdrop" onMouseDown={onClose}>
      <div
        aria-label="添加模型 API Key"
        aria-modal="true"
        className="settings-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button className="settings-dialog-close" aria-label="关闭添加模型" onClick={onClose} type="button">
          <CloseIcon />
        </button>
        {children}
      </div>
    </div>
  );
}

function ForgeHome({
  aiStatus,
  busy,
  draftPrompt,
  manualProjectPath,
  onChooseRecommendedFile,
  onChooseTemplate,
  onCreateTask,
  onDraftPromptChange,
  onManualProjectPathChange,
  onOpenSettings,
  onOpenTask,
  onPickProject,
  onScanProject,
  onSelectProject,
  onSelectedFilesTextChange,
  onToggleProjectBinding,
  projectBusy,
  projects,
  recommendedFiles,
  selectedFilesText,
  selectedProject,
  selectedProjectId,
  showProjectBinding,
  tasks
}: {
  aiStatus: AiStatus | null;
  busy: boolean;
  draftPrompt: string;
  manualProjectPath: string;
  onChooseRecommendedFile: (file: string) => void;
  onChooseTemplate: (template: (typeof taskTemplates)[number]) => void;
  onCreateTask: (event?: FormEvent) => Promise<void>;
  onDraftPromptChange: (value: string) => void;
  onManualProjectPathChange: (value: string) => void;
  onOpenSettings: () => void;
  onOpenTask: (taskId: string) => Promise<void>;
  onPickProject: () => Promise<void>;
  onScanProject: () => Promise<void>;
  onSelectProject: (projectId: string | null) => Promise<void>;
  onSelectedFilesTextChange: (value: string) => void;
  onToggleProjectBinding: () => void;
  projectBusy: boolean;
  projects: ProjectWorkspace[];
  recommendedFiles: string[];
  selectedFilesText: string;
  selectedProject: ProjectWorkspace | null;
  selectedProjectId: string | null;
  showProjectBinding: boolean;
  tasks: AppSnapshot["tasks"];
}) {
  const [queueTab, setQueueTab] = useState<QueueTab>("active");
  const runningTasks = tasks.filter((task) => task.validationState === "running").length;
  const completedTasks = tasks.filter((task) => task.stage === "submitted" || task.validationState === "passed").length;
  const waitingTasks = tasks.filter((task) => task.validationState === "pending").length;
  const errorTasks = tasks.filter((task) => task.validationState === "failed").length;
  const visibleQueue = filterQueueTasks(tasks, queueTab);

  return (
    <main className="forge-home">
      <section className="forge-status-row" aria-label="熔炼状态">
        <ForgeFireStatus aiStatus={aiStatus} onOpenSettings={onOpenSettings} />
        <ForgeDaySummary completed={completedTasks} errors={errorTasks} running={runningTasks} waiting={waitingTasks} />
      </section>

      <section className="forge-main-grid">
        <section className="forge-process-card" aria-label="炼制流程">
          <div className="forge-section-title">
            <h2>炼制流程</h2>
          </div>
          <ForgeTownMap />
          <div className="forge-command-main">
            <h1>想要熔炼什么任务？</h1>
            <form className="home-composer forge-composer" onSubmit={onCreateTask}>
              <textarea
                aria-label="任务描述"
                disabled={busy}
                onChange={(event) => onDraftPromptChange(event.target.value)}
                placeholder="描述一个要修改或创建的软件任务..."
                rows={4}
                value={draftPrompt}
              />
              <ProjectBindingBar
                manualProjectPath={manualProjectPath}
                onChooseFile={onChooseRecommendedFile}
                onManualProjectPathChange={onManualProjectPathChange}
                onPickProject={onPickProject}
                onScanProject={onScanProject}
                onSelectProject={onSelectProject}
                onToggle={onToggleProjectBinding}
                projectBusy={projectBusy}
                projects={projects}
                recommendedFiles={recommendedFiles}
                selectedFilesText={selectedFilesText}
                selectedProject={selectedProject}
                selectedProjectId={selectedProjectId}
                showBinding={showProjectBinding}
                onSelectedFilesTextChange={onSelectedFilesTextChange}
              />
              <div className="composer-footer">
                <span>{busy ? "炉火正在整理需求..." : selectedProject ? `已绑定 ${selectedProject.name}` : "未绑定项目也可以先走草稿流程"}</span>
                <button className="composer-send" disabled={busy || !draftPrompt.trim()} aria-label="创建任务" type="submit">
                  <SendIcon />
                </button>
              </div>
            </form>
          </div>
        </section>

        <ForgeRecentTasks tasks={tasks} onOpenTask={onOpenTask} />
      </section>

      <section className="forge-template-band" aria-label="熔炼模板">
        <div className="forge-section-title">
          <h2>熔炼模板 <span>原矿配方</span></h2>
        </div>
        <div className="starter-grid forge-template-grid">
          {taskTemplates.map((template, index) => (
            <button className="starter-card forge-template-card" key={template.title} onClick={() => onChooseTemplate(template)} type="button">
              <span className={`ore-chip ${index % 3 === 1 ? "warm" : ""}`} aria-hidden="true">
                <OreIcon />
              </span>
              <strong>{template.title}</strong>
              <span>{template.sub}</span>
            </button>
          ))}
        </div>
      </section>

      <ForgeQueue
        activeTab={queueTab}
        completed={completedTasks}
        errors={errorTasks}
        onOpenTask={onOpenTask}
        onSelectTab={setQueueTab}
        running={runningTasks}
        tasks={visibleQueue}
        waiting={waitingTasks}
      />

      <ForgeFooter running={runningTasks} total={tasks.length} />
    </main>
  );
}

function ForgeFireStatus({ aiStatus, onOpenSettings }: { aiStatus: AiStatus | null; onOpenSettings: () => void }) {
  const online = Boolean(aiStatus?.aiEnabled);
  const modelLine = online
    ? `${aiStatus?.models.economy ?? "economy"} / ${aiStatus?.models.quality ?? "quality"}`
    : "Mock / Codex CLI 待接入";
  return (
    <article className={`forge-fire-card ${online ? "online" : "offline"}`}>
      <div className="forge-fire-heading">
        <div>
          <FireIcon />
          <strong>熔炉状态</strong>
        </div>
        <span className="forge-live-pill">
          <i />
          {online ? "运行中" : "Mock"}
        </span>
      </div>
      <div className="forge-fire-metrics">
        <div>
          <span>模型</span>
          <strong>{modelLine}</strong>
        </div>
        <div>
          <span>接口</span>
          <strong>{providerLabel(aiStatus?.provider)}</strong>
        </div>
        <div>
          <span>温度</span>
          <div className="temperature-line">
            <b />
            <strong>0.2</strong>
          </div>
        </div>
        <div>
          <span>运行时</span>
          <strong>{online ? "API 模型" : "本地模拟"}</strong>
        </div>
      </div>
      <button className="secondary-button" onClick={onOpenSettings} type="button">
        添加模型
      </button>
    </article>
  );
}

function ForgeDaySummary({ completed, errors, running, waiting }: { completed: number; errors: number; running: number; waiting: number }) {
  return (
    <div className="forge-day-card" aria-label="今日炼制">
      <div className="forge-day-title">今日炼制</div>
      <div className="forge-day-metrics">
        <ForgeMetric value={completed} label="任务完成" />
        <ForgeMetric value={running} label="进行中" />
        <ForgeMetric value={waiting} label="等待中" />
        <ForgeMetric value={errors} label="错误" />
      </div>
    </div>
  );
}

function ForgeTownMap() {
  return (
    <div className="forge-town-map">
      <svg className="forge-town-svg" viewBox="0 0 1190 250" role="img" aria-label={forgeSteps.map((step) => step.name).join("\u5230")}>
        <defs>
          <g id="forge-building">
            <polygon points="-44,24 0,46 0,-6 -44,-28" />
            <polygon points="44,24 0,46 0,-6 44,-28" />
            <polygon points="0,-58 -44,-28 0,-6" />
            <polygon points="0,-58 44,-28 0,-6" />
          </g>
        </defs>
        <polyline className="mountain-line strong" points="0,70 110,32 190,54 310,18 430,50 548,26 680,56 820,24 960,52 1080,30 1190,58" />
        <polyline className="mountain-line" points="60,78 198,48 340,74 470,46 620,76 760,48 900,74 1040,52 1190,74" />
        <path className="town-road-base" d="M28,146 C140,146 150,130 250,126 C360,122 360,144 470,140 C580,138 560,124 660,124 C770,124 760,142 880,140 C1000,138 1010,126 1120,126 L1170,126" />
        <path className="town-road-dash" d="M28,146 C140,146 150,130 250,126 C360,122 360,144 470,140 C580,138 560,124 660,124 C770,124 760,142 880,140 C1000,138 1010,126 1120,126 L1170,126" />
        {forgeSteps.map((step, index) => {
          const x = forgeStepX[index];
          return (
            <g className={`town-step ${index === 0 ? "active" : ""}`} key={step.id} transform={`translate(${x},0)`}>
              <g className={`town-building ${index === 0 ? "active" : ""}`} transform="translate(0,112)">
                <ellipse cx="0" cy="52" rx="62" ry="17" />
                <use href="#forge-building" />
                {index === 0 && (
                  <>
                    <g transform="translate(20,-46)">
                      <polygon points="-10,8 0,14 0,-28 -10,-34" />
                      <polygon points="10,8 0,14 0,-28 10,-34" />
                      <polygon points="0,-42 10,-34 0,-28 -10,-34" />
                    </g>
                    <circle cx="5" cy="18" r="12" />
                    <circle cx="5" cy="18" r="7" />
                  </>
                )}
                {index === 1 && <circle cx="-72" cy="-10" r="12" />}
                {index === 3 && <circle cx="22" cy="-6" r="10" />}
                {index === 4 && <path d="M10,38 L10,10 q0,-9 13,-9 q13,0 13,9 L36,30 Z" />}
              </g>
              <g className="town-stage-label" transform="translate(0,184)">
                <circle className="town-stage-index-ring" cx="0" cy="0" r="11" />
                <text className="town-stage-index-text" x="0" y="4" textAnchor="middle">{index + 1}</text>
                <text className="town-stage-name" x="0" y="33" textAnchor="middle">{step.name}</text>
                <text className="town-stage-caption" x="0" y="56" textAnchor="middle">{step.caption}</text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ForgeMetric({ value, label }: { value: number; label: string }) {
  return (
    <div className="forge-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ForgeRecentTasks({ tasks, onOpenTask }: { tasks: AppSnapshot["tasks"]; onOpenTask: (taskId: string) => Promise<void> }) {
  return (
    <aside className="forge-recent" aria-label="近期运送">
      <div className="forge-section-title">
        <h2>近期运送</h2>
      </div>
      <div className="forge-recent-list">
        {tasks.length ? tasks.slice(0, 5).map((task) => (
          <button className="forge-recent-task" key={task.id} onClick={() => onOpenTask(task.id)} type="button">
            <OreIcon />
            <span>{task.title}</span>
            <small className={`queue-status ${statusTone(task)}`}>{stageLabels[task.stage]}</small>
          </button>
        )) : <p className="forge-empty">暂无运送记录</p>}
      </div>
    </aside>
  );
}

type QueueTab = "active" | "waiting" | "done" | "error";

function ForgeQueue({
  activeTab,
  completed,
  errors,
  onOpenTask,
  onSelectTab,
  running,
  tasks,
  waiting
}: {
  activeTab: QueueTab;
  completed: number;
  errors: number;
  onOpenTask: (taskId: string) => Promise<void>;
  onSelectTab: (tab: QueueTab) => void;
  running: number;
  tasks: AppSnapshot["tasks"];
  waiting: number;
}) {
  const tabs: Array<{ id: QueueTab; label: string; count: number }> = [
    { id: "active", label: "进行中", count: running },
    { id: "waiting", label: "等待中", count: waiting },
    { id: "done", label: "已完成", count: completed },
    { id: "error", label: "错误", count: errors }
  ];
  return (
    <section className="forge-queue" aria-label="我的熔炼队列">
      <div className="forge-queue-heading">
        <h2>我的熔炼队列</h2>
        <div className="forge-tabs">
          {tabs.map((tab) => (
            <button className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => onSelectTab(tab.id)} type="button">
              {tab.label}
              <span>{tab.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="forge-queue-table">
        <div className="forge-queue-row head">
          <span>任务名称</span>
          <span>当前所在</span>
          <span>进度</span>
          <span>模型</span>
          <span>更新时间</span>
          <span>操作</span>
        </div>
        {tasks.length ? tasks.slice(0, 6).map((task) => (
          <button className="forge-queue-row" key={task.id} onClick={() => onOpenTask(task.id)} type="button">
            <strong>{task.title}</strong>
            <span>{stageLocation(task)}</span>
            <span className="queue-progress"><i style={{ width: `${taskProgress(task)}%` }} /><b>{taskProgress(task)}%</b></span>
            <span>{modelHint(task)}</span>
            <span>{formatShortDate(task.updatedAt)}</span>
            <span className="queue-action">查看</span>
          </button>
        )) : <p className="forge-empty queue">当前分类暂无任务</p>}
      </div>
    </section>
  );
}

function ForgeFooter({ running, total }: { running: number; total: number }) {
  const load = total ? Math.min(98, Math.round((running / Math.max(total, 1)) * 100)) : 0;
  return (
    <footer className="forge-footer">
      <div><span>熔炉负载</span><strong>{load}%</strong></div>
      <div><span>并发任务</span><strong>{running} / {Math.max(total, 1)}</strong></div>
      <div><span>模式</span><strong>渐进式任务流</strong></div>
      <div><span>主线</span><strong>需求到提交</strong></div>
    </footer>
  );
}

function ProjectBindingBar({
  manualProjectPath,
  onChooseFile,
  onManualProjectPathChange,
  onPickProject,
  onScanProject,
  onSelectProject,
  onSelectedFilesTextChange,
  onToggle,
  projectBusy,
  projects,
  recommendedFiles,
  selectedFilesText,
  selectedProject,
  selectedProjectId,
  showBinding
}: {
  manualProjectPath: string;
  onChooseFile: (file: string) => void;
  onManualProjectPathChange: (value: string) => void;
  onPickProject: () => Promise<void>;
  onScanProject: () => Promise<void>;
  onSelectProject: (projectId: string | null) => Promise<void>;
  onSelectedFilesTextChange: (value: string) => void;
  onToggle: () => void;
  projectBusy: boolean;
  projects: ProjectWorkspace[];
  recommendedFiles: string[];
  selectedFilesText: string;
  selectedProject: ProjectWorkspace | null;
  selectedProjectId: string | null;
  showBinding: boolean;
}) {
  return (
    <div className="project-bind">
      <button className="project-bind-toggle" onClick={onToggle} type="button">
        <FolderIcon />
        <span>{selectedProject ? selectedProject.name : "绑定项目（可选）"}</span>
        <small>{selectedProject ? `${selectedProject.packageManager} · ${selectedProject.gitStatus}` : "不绑定也可创建草稿任务"}</small>
      </button>
      {showBinding && (
        <div className="project-bind-panel">
          <div className="project-bind-actions">
            {window.desktop && (
              <button className="secondary-button" disabled={projectBusy} onClick={onPickProject} type="button">
                选择项目文件夹
              </button>
            )}
            <input
              onChange={(event) => onManualProjectPathChange(event.target.value)}
              placeholder="/Users/me/project"
              value={manualProjectPath}
            />
            <button className="secondary-button" disabled={projectBusy || !manualProjectPath.trim()} onClick={onScanProject} type="button">
              扫描路径
            </button>
          </div>
          {projects.length > 0 && (
            <select value={selectedProjectId ?? ""} onChange={(event) => onSelectProject(event.target.value || null)}>
              <option value="">不绑定项目：草稿流程</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} · {project.packageManager} · {project.gitStatus}
                </option>
              ))}
            </select>
          )}
          <textarea
            aria-label="目标文件"
            onChange={(event) => onSelectedFilesTextChange(event.target.value)}
            placeholder="目标文件或目录（可选，每行一个）"
            rows={3}
            value={selectedFilesText}
          />
          {recommendedFiles.length > 0 && (
            <div className="recommended-files">
              <span>推荐文件</span>
              <div>
                {recommendedFiles.slice(0, 6).map((file) => (
                  <button key={file} onClick={() => onChooseFile(file)} type="button">
                    {file}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskDetail({
  bundle,
  busy,
  onApply,
  onBackHome,
  onConfirmPlan,
  onConfirmRequirements,
  onGenerate,
  onReopen,
  onReview,
  onSubmit,
  openErrors,
  subagents
}: {
  bundle: TaskBundle;
  busy: boolean;
  onApply: () => Promise<void>;
  onBackHome: () => void;
  onConfirmPlan: (content: string, feedback: string) => Promise<void>;
  onConfirmRequirements: (content: string, feedback: string) => Promise<void>;
  onGenerate: () => Promise<void>;
  onReopen: (findingId: string) => Promise<void>;
  onReview: () => Promise<void>;
  onSubmit: () => Promise<void>;
  openErrors: number;
  subagents: Subagent[];
}) {
  const currentCard = currentStageCard(bundle);
  const [expandedCards, setExpandedCards] = useState<Set<StageCardId>>(() => new Set([currentCard]));

  useEffect(() => {
    setExpandedCards(new Set([currentStageCard(bundle)]));
  }, [bundle.task.stage, bundle.task.validationState, bundle.artifacts.length, bundle.findings.length]);

  const toggleCard = (id: StageCardId) => {
    setExpandedCards((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="simple-task">
      <section className="task-hero">
        <button className="simple-back" onClick={onBackHome} type="button">
          返回首页
        </button>
        <div>
          <h1>{bundle.task.title}</h1>
          <p>{bundle.task.prompt}</p>
        </div>
        <div className="task-hero-meta">
          <StatusBadge state={bundle.task.validationState} />
          <span>{stageLabels[bundle.task.stage]}</span>
          {bundle.project ? <span>{bundle.project.name}</span> : <span>草稿流程</span>}
        </div>
      </section>

      <SimpleProgress bundle={bundle} openErrors={openErrors} />

      <section className="task-detail-layout" aria-busy={busy}>
        <ConversationRail bundle={bundle} />
        <div className="stage-card-stack">
          <RequirementsStageCard
            bundle={bundle}
            current={currentCard === "requirements"}
            expanded={expandedCards.has("requirements")}
            onConfirm={onConfirmRequirements}
            onToggle={() => toggleCard("requirements")}
          />
          <PlanStageCard
            bundle={bundle}
            current={currentCard === "plan"}
            expanded={expandedCards.has("plan")}
            onConfirm={onConfirmPlan}
            onToggle={() => toggleCard("plan")}
          />
          <ProjectStageCard
            bundle={bundle}
            current={currentCard === "project"}
            expanded={expandedCards.has("project")}
            onToggle={() => toggleCard("project")}
          />
          <ExecutionStageCard
            bundle={bundle}
            current={currentCard === "execution"}
            expanded={expandedCards.has("execution")}
            onGenerate={onGenerate}
            onToggle={() => toggleCard("execution")}
            subagents={subagents}
          />
          <ResultStageCard
            bundle={bundle}
            current={currentCard === "result"}
            expanded={expandedCards.has("result")}
            onApply={onApply}
            onReopen={onReopen}
            onReview={onReview}
            onSubmit={onSubmit}
            onToggle={() => toggleCard("result")}
          />
        </div>
      </section>
    </main>
  );
}

function StageCard({
  action,
  children,
  current,
  expanded,
  id,
  summary,
  title,
  onToggle
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  current: boolean;
  expanded: boolean;
  id: StageCardId;
  summary: string;
  title: string;
  onToggle: () => void;
}) {
  return (
    <article className={`stage-card ${current ? "current" : ""}`} data-stage={id}>
      <button className="stage-card-header" onClick={onToggle} type="button">
        <div>
          <span>{current ? "当前阶段" : "阶段"}</span>
          <h2>{title}</h2>
          <p>{summary}</p>
        </div>
        <ChevronIcon expanded={expanded} />
      </button>
      {expanded && (
        <div className="stage-card-body">
          {children}
          {action && <div className="stage-card-action">{action}</div>}
        </div>
      )}
    </article>
  );
}

function RequirementsStageCard({
  bundle,
  current,
  expanded,
  onConfirm,
  onToggle
}: {
  bundle: TaskBundle;
  current: boolean;
  expanded: boolean;
  onConfirm: (content: string, feedback: string) => Promise<void>;
  onToggle: () => void;
}) {
  const [draft, setDraft] = useState(bundle.requirements?.content ?? "");
  const [feedback, setFeedback] = useState(bundle.requirements?.feedback ?? "");
  useEffect(() => {
    setDraft(bundle.requirements?.content ?? "");
    setFeedback(bundle.requirements?.feedback ?? "");
  }, [bundle.requirements?.id, bundle.requirements?.content, bundle.requirements?.feedback]);

  return (
    <StageCard
      current={current}
      expanded={expanded}
      id="requirements"
      onToggle={onToggle}
      summary={bundle.requirements?.confirmed ? "需求已确认，后续计划以该版本为准。" : "先确认目标、范围和验收标准。"}
      title="需求文档"
      action={
        !bundle.requirements?.confirmed && (
          <button className="primary-button" disabled={bundle.task.stage !== "requirements_review"} onClick={() => onConfirm(draft, feedback)} type="button">
            确认需求
          </button>
        )
      }
    >
      {bundle.requirements ? (
        <div className="stage-editor">
          <textarea aria-label="需求文档" disabled={bundle.requirements.confirmed} onChange={(event) => setDraft(event.target.value)} value={draft} />
          {!bundle.requirements.confirmed && (
            <textarea
              aria-label="需求修改意见"
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="给 Agent 的修改意见（可选）"
              rows={3}
              value={feedback}
            />
          )}
        </div>
      ) : (
        <p className="muted">创建任务后会自动生成需求草稿。</p>
      )}
    </StageCard>
  );
}

function PlanStageCard({
  bundle,
  current,
  expanded,
  onConfirm,
  onToggle
}: {
  bundle: TaskBundle;
  current: boolean;
  expanded: boolean;
  onConfirm: (content: string, feedback: string) => Promise<void>;
  onToggle: () => void;
}) {
  const [draft, setDraft] = useState(bundle.plan?.content ?? "");
  const [feedback, setFeedback] = useState(bundle.plan?.feedback ?? "");
  useEffect(() => {
    setDraft(bundle.plan?.content ?? "");
    setFeedback(bundle.plan?.feedback ?? "");
  }, [bundle.plan?.id, bundle.plan?.content, bundle.plan?.feedback]);

  return (
    <StageCard
      current={current}
      expanded={expanded}
      id="plan"
      onToggle={onToggle}
      summary={bundle.plan?.confirmed ? `${bundle.workItems.length} 个 work item 已生成。` : bundle.plan ? "确认计划后会拆分任务并分派 Agent。" : "需求确认后生成任务计划。"}
      title="任务计划"
      action={
        bundle.plan && !bundle.plan.confirmed && (
          <button className="primary-button" disabled={bundle.task.stage !== "plan_review"} onClick={() => onConfirm(draft, feedback)} type="button">
            确认计划
          </button>
        )
      }
    >
      {bundle.plan ? (
        <div className="stage-editor">
          <textarea aria-label="任务计划" disabled={bundle.plan.confirmed} onChange={(event) => setDraft(event.target.value)} value={draft} />
          {!bundle.plan.confirmed && (
            <textarea
              aria-label="计划修改意见"
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="给 Agent 的修改意见（可选）"
              rows={3}
              value={feedback}
            />
          )}
        </div>
      ) : (
        <p className="muted">等待需求确认。</p>
      )}
    </StageCard>
  );
}

function ProjectStageCard({ bundle, current, expanded, onToggle }: { bundle: TaskBundle; current: boolean; expanded: boolean; onToggle: () => void }) {
  const project = bundle.project;
  const scripts = Object.entries(project?.scripts ?? {});
  return (
    <StageCard
      current={current}
      expanded={expanded}
      id="project"
      onToggle={onToggle}
      summary={project ? `${project.name} · ${project.gitStatus} · ${bundle.task.selectedFiles.length || "未指定"} 个目标文件` : "未绑定项目，当前走演示/草稿流程。"}
      title="项目上下文"
    >
      {project ? (
        <div className="project-context-grid">
          <div>
            <span>项目</span>
            <strong>{project.name}</strong>
            <small>{project.rootPath}</small>
          </div>
          <div>
            <span>运行环境</span>
            <strong>{project.packageManager}</strong>
            <small>{project.frameworkHints.join(" / ") || "未识别框架"}</small>
          </div>
          <div>
            <span>Git 状态</span>
            <strong>{project.gitStatus}</strong>
            <small>{new Date(project.lastScannedAt).toLocaleString()}</small>
          </div>
          <div>
            <span>目标文件</span>
            <strong>{bundle.task.selectedFiles.length || "未指定"}</strong>
            <small>{bundle.task.selectedFiles.join(" / ") || "由 Agent 根据任务推断"}</small>
          </div>
          {scripts.length > 0 && (
            <div className="script-list">
              <span>脚本</span>
              {scripts.slice(0, 4).map(([name, command]) => (
                <code key={name}>{name}: {command}</code>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="muted">没有绑定项目时，不启用真实 PatchSet 应用到磁盘，只保留可审查产物和提交记录。</p>
      )}
    </StageCard>
  );
}

function ExecutionStageCard({
  bundle,
  current,
  expanded,
  onGenerate,
  onToggle,
  subagents
}: {
  bundle: TaskBundle;
  current: boolean;
  expanded: boolean;
  onGenerate: () => Promise<void>;
  onToggle: () => void;
  subagents: Subagent[];
}) {
  const canGenerate = bundle.task.stage === "assignment" || bundle.task.stage === "revision";
  const actionLabel = bundle.task.stage === "revision" ? "回流后重新生成" : "开始生成";
  return (
    <StageCard
      current={current}
      expanded={expanded}
      id="execution"
      onToggle={onToggle}
      summary={bundle.workItems.length ? `${bundle.workItems.length} 个 work item，自动展示 Agent 分工。` : "计划确认后展示执行明细。"}
      title="执行明细"
      action={
        canGenerate && (
          <button className="primary-button" onClick={onGenerate} type="button">
            {actionLabel}
          </button>
        )
      }
    >
      {bundle.workItems.length ? (
        <div className="execution-list">
          {bundle.workItems.map((item, index) => {
            const assignment = bundle.assignments.find((candidate) => candidate.workItemId === item.id);
            const agent = subagents.find((candidate) => candidate.id === (assignment?.subagentId ?? item.assignedSubagentId));
            return (
              <article className="execution-row" key={item.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  <small>{agent?.name ?? "待分派 Agent"} · {assignment?.modelTier ?? item.preferredModelTier} · {item.riskLevel}</small>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="muted">等待任务计划确认。</p>
      )}
    </StageCard>
  );
}

function ResultStageCard({
  bundle,
  current,
  expanded,
  onApply,
  onReopen,
  onReview,
  onSubmit,
  onToggle
}: {
  bundle: TaskBundle;
  current: boolean;
  expanded: boolean;
  onApply: () => Promise<void>;
  onReopen: (findingId: string) => Promise<void>;
  onReview: () => Promise<void>;
  onSubmit: () => Promise<void>;
  onToggle: () => void;
}) {
  const openError = bundle.findings.find((finding) => finding.status === "open" && finding.severity === "error");
  const hasArtifacts = bundle.artifacts.length > 0;
  const reviewed = bundle.findings.length > 0 || bundle.task.stage === "review" || bundle.task.stage === "submitted";
  const fileCount = bundle.patchSets.reduce((total, patchSet) => total + patchSet.changes.length, 0) || bundle.artifacts.reduce((total, artifact) => total + artifact.files.length, 0);
  const action = (() => {
    if (!hasArtifacts) return null;
    if (bundle.task.stage === "generation") {
      return <button className="primary-button" onClick={onReview} type="button">运行审查</button>;
    }
    if (openError) {
      return <button className="primary-button" onClick={() => onReopen(openError.id)} type="button">回流修复</button>;
    }
    if (bundle.task.stage === "review" && reviewed) {
      const projectApplied = bundle.project && bundle.patchSets.length > 0 && bundle.patchSets.every((patchSet) => patchSet.applyStatus === "applied");
      if (bundle.project && !projectApplied) {
        return <button className="primary-button" onClick={onApply} type="button">应用到项目</button>;
      }
      return <button className="primary-button" onClick={onSubmit} type="button">{bundle.project ? "生成提交记录" : "形成提交记录"}</button>;
    }
    return null;
  })();

  return (
    <StageCard
      current={current}
      expanded={expanded}
      id="result"
      onToggle={onToggle}
      summary={hasArtifacts ? `${fileCount} 个文件变更，${openError ? "存在开放错误" : "暂无开放错误"}。` : "代码生成后展示变更摘要和审查结果。"}
      title="代码产物与审查"
      action={action}
    >
      {hasArtifacts ? (
        <div className="result-summary">
          <div className="result-kpis">
            <span><strong>{fileCount}</strong> 文件变更</span>
            <span><strong>{bundle.findings.length}</strong> 审查记录</span>
            <span className={openError ? "danger-text" : "success-text"}><strong>{bundle.findings.filter((finding) => finding.status === "open").length}</strong> 开放问题</span>
          </div>
          <div className="result-file-list">
            {bundle.artifacts.map((artifact) => (
              <ArtifactSummary artifact={artifact} key={artifact.id} />
            ))}
          </div>
          <details className="collapsed-detail">
            <summary>查看审查与验证明细</summary>
            <div className="finding-list-compact">
              {bundle.findings.length ? bundle.findings.map((finding) => (
                <div className={`finding-compact ${finding.severity}`} key={finding.id}>
                  <strong>{finding.message}</strong>
                  <p>{finding.suggestedFix}</p>
                </div>
              )) : <p className="muted">暂无审查记录。</p>}
            </div>
          </details>
        </div>
      ) : (
        <p className="muted">等待代码生成。</p>
      )}
    </StageCard>
  );
}

function ArtifactSummary({ artifact }: { artifact: GeneratedArtifact }) {
  return (
    <article className="artifact-summary">
      <strong>{artifact.commitMessageDraft}</strong>
      <p>{artifact.agentNotes}</p>
      <details>
        <summary>{artifact.files.length} 个文件</summary>
        {artifact.files.map((file) => (
          <div className="artifact-file-summary" key={file.path}>
            <code>{file.path}</code>
            <small>{file.summary}</small>
            <details>
              <summary>查看内容和 diff</summary>
              <pre className="file-content">{file.content || "暂无完整文件内容"}</pre>
              <pre>{file.diff || "暂无 diff"}</pre>
            </details>
          </div>
        ))}
      </details>
    </article>
  );
}

function ConversationRail({ bundle }: { bundle: TaskBundle }) {
  const messages = [
    { role: "你", text: bundle.task.prompt, meta: "任务目标" },
    ...(bundle.requirements ? [{ role: "Agent", text: bundle.requirements.confirmed ? "需求已确认，进入计划阶段。" : "需求草稿已生成，等待确认。", meta: "需求确认" }] : []),
    ...(bundle.plan ? [{ role: "Agent", text: bundle.plan.confirmed ? `计划已确认，拆分出 ${bundle.workItems.length} 个 work item。` : "任务计划已生成，等待确认。", meta: "任务计划" }] : []),
    ...(bundle.artifacts.length ? [{ role: "Agent", text: `已生成 ${bundle.artifacts.length} 组代码产物。`, meta: "代码生成" }] : []),
    ...(bundle.findings.length ? [{ role: "审查", text: `审查完成，开放错误 ${bundle.findings.filter((finding) => finding.status === "open" && finding.severity === "error").length} 个。`, meta: "代码审查" }] : []),
    ...(bundle.submissions.length ? [{ role: "系统", text: "结果已形成提交/应用记录。", meta: "完成" }] : [])
  ];
  return (
    <aside className="conversation-rail" aria-label="对话流">
      <h2>对话</h2>
      {messages.map((message, index) => (
        <article className="conversation-message" key={`${message.meta}-${index}`}>
          <span>{message.role}</span>
          <div>
            <small>{message.meta}</small>
            <p>{message.text}</p>
          </div>
        </article>
      ))}
    </aside>
  );
}

function SimpleProgress({ bundle, openErrors }: { bundle: TaskBundle; openErrors: number }) {
  const steps = [
    { label: "需求", done: Boolean(bundle.requirements?.confirmed) },
    { label: "计划", done: Boolean(bundle.plan?.confirmed) },
    { label: "生成", done: bundle.artifacts.length > 0 },
    { label: "审查", done: bundle.task.stage === "submitted" || bundle.task.validationState === "passed" },
  ];

  return (
    <section className="simple-progress" aria-label="任务进度">
      {steps.map((step, index) => (
        <div className={`simple-progress-step ${step.done ? "done" : ""}`} key={step.label}>
          <span>{index + 1}</span>
          <strong>{step.label}</strong>
        </div>
      ))}
      <div className={`simple-progress-errors ${openErrors ? "has-errors" : ""}`}>
        <strong>{openErrors}</strong>
        <span>开放错误</span>
      </div>
    </section>
  );
}

function currentStageCard(bundle: TaskBundle): StageCardId {
  if (bundle.task.stage === "requirements_review") return "requirements";
  if (bundle.task.stage === "plan_review") return "plan";
  if (bundle.task.stage === "assignment" || bundle.task.stage === "revision") return "execution";
  if (bundle.task.stage === "generation" || bundle.task.stage === "review" || bundle.task.stage === "submitted") return "result";
  return "requirements";
}

function filterQueueTasks(tasks: AppSnapshot["tasks"], tab: QueueTab) {
  if (tab === "active") return tasks.filter((task) => task.validationState === "running" || ["assignment", "generation", "revision"].includes(task.stage));
  if (tab === "waiting") return tasks.filter((task) => task.validationState === "pending" && task.stage !== "submitted");
  if (tab === "done") return tasks.filter((task) => task.stage === "submitted" || task.validationState === "passed");
  return tasks.filter((task) => task.validationState === "failed");
}

function statusTone(task: AppSnapshot["tasks"][number]) {
  if (task.validationState === "failed") return "error";
  if (task.validationState === "passed" || task.stage === "submitted") return "done";
  if (task.validationState === "running") return "active";
  return "waiting";
}

function stageLocation(task: AppSnapshot["tasks"][number]) {
  if (task.stage === "requirements_review") return "需求炉 · 需求确认";
  if (task.stage === "plan_review") return "计划坊 · 任务计划";
  if (task.stage === "assignment") return "铸码间 · 任务分派";
  if (task.stage === "generation") return "铸码间 · 代码实现";
  if (task.stage === "review") return "审查塔 · 代码审查";
  if (task.stage === "revision") return "审查塔 · 回流修复";
  if (task.stage === "submitted") return "提交仓 · 已交付";
  return "需求炉 · 待整理";
}

function taskProgress(task: AppSnapshot["tasks"][number]) {
  const byStage: Record<string, number> = {
    intake: 5,
    requirements_review: 18,
    plan_review: 34,
    assignment: 52,
    generation: 68,
    review: task.validationState === "passed" ? 92 : 82,
    revision: 76,
    submitted: 100
  };
  return byStage[task.stage] ?? 10;
}

function modelHint(task: AppSnapshot["tasks"][number]) {
  if (task.complexity >= 7) return "quality";
  if (task.validationState === "passed" || task.stage === "review") return "review";
  return "economy";
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function titleFromPrompt(prompt: string) {
  return prompt
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24) || "新任务";
}

function SendIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M3 7.8A2.8 2.8 0 0 1 5.8 5h4.3l2 2.2h6.1A2.8 2.8 0 0 1 21 10v6.2a2.8 2.8 0 0 1-2.8 2.8H5.8A2.8 2.8 0 0 1 3 16.2V7.8Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg aria-hidden="true" className={expanded ? "expanded" : ""} fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="m8 10 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function FireIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
      <path
        d="M12.4 3.2c.6 3.3-2.7 4.4-2.7 7 0 1.2.7 2.2 1.8 2.7-.2-2.2 1.3-3.4 2.8-4.8 2.3 2.1 3.7 4.1 3.7 6.8 0 3.4-2.7 6.1-6 6.1s-6-2.7-6-6.1c0-2.2 1.1-4.2 3.1-5.9 1.6-1.4 2.8-2.9 3.3-5.8Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 17.8a2.6 2.6 0 0 0 2.6-2.6c0-1.1-.5-2-1.7-3.1-.7.8-1.5 1.6-1.5 2.8 0 .5.2 1 .5 1.4-.9-.3-1.5-.9-1.8-1.8-.5.7-.7 1.3-.7 2 0 .8.3 1.3.8 1.7.5.4 1.1.6 1.8.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function OreIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="m5 9 5-5 7 2 3 7-5 7H8l-4-5 1-6Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="m10 4 2 7 8 2M4 15l8-4 3 9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

function WorkshopIcon({ index }: { index: number }) {
  const paths = [
    "M6 19V9l6-4 6 4v10M9 19v-6h6v6M5 19h14",
    "M5 19V8h14v11M8 8V5h8v3M8 12h8M8 15h5",
    "M4 19h16M7 19V8l5-3 5 3v11M10 19v-5h4v5M9 10h6",
    "M6 20V7l6-3 6 3v13M9 11h6M9 15h6M12 4v16",
    "M5 19V9l7-4 7 4v10M8 19v-7h8v7M9 15h6"
  ];
  return (
    <svg aria-hidden="true" fill="none" height="28" viewBox="0 0 24 24" width="28">
      <path d={paths[index] ?? paths[0]} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function providerLabel(provider?: AiStatus["provider"]) {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Claude";
  return "Mock";
}
