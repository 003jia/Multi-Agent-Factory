import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import type { AiConfigAuditResult, AiProvider, AiProviderConfigInput, AiStatus, McpConnectionInfo } from "../types";

interface SettingsPanelProps {
  status: AiStatus | null;
  onStatusChange: (status: AiStatus) => void;
}

export function SettingsPanel({ status, onStatusChange }: SettingsPanelProps) {
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [economyModel, setEconomyModel] = useState("");
  const [qualityModel, setQualityModel] = useState("");
  const [masked, setMasked] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "warning" | "error">("success");
  const [auditResult, setAuditResult] = useState<AiConfigAuditResult | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [mcpInfo, setMcpInfo] = useState<McpConnectionInfo | null>(null);
  const desktopAvailable = Boolean(window.desktop);

  useEffect(() => {
    const loadConfig = window.desktop ? window.desktop.getAiConfig : api.getAiConfig;
    void loadConfig()
      .then((config) => {
        setProvider(config.provider);
        setBaseUrl(config.baseUrl ?? "");
        setEconomyModel(config.economyModel ?? "");
        setQualityModel(config.qualityModel ?? "");
        setMasked(config.keyMasked);
      })
      .catch((error) => {
        setMessageTone("error");
        setMessage(error instanceof Error ? error.message : "读取模型配置失败");
      });
  }, [status?.mode, status?.provider, status?.keyMasked]);

  useEffect(() => {
    void api.getMcpConfig()
      .then(setMcpInfo)
      .catch(() => setMcpInfo(null));
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const saveConfig = window.desktop ? window.desktop.setAiConfig : api.setAiConfig;
      const nextStatus = await saveConfig(buildDraftConfig());
      onStatusChange(nextStatus);
      setMasked(nextStatus.keyMasked);
      setApiKey("");
      setAuditResult(null);
      setMessageTone("success");
      setMessage(nextStatus.aiEnabled ? `${providerName(provider)} 已启用` : "配置已保存；未设置 API Key 时继续使用 Mock 模式");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "保存模型 API Key 失败");
    }
  };

  const auditKey = async () => {
    try {
      setAuditBusy(true);
      const auditConfig = window.desktop ? window.desktop.auditAiConfig : api.auditAiConfig;
      const result = await auditConfig(buildDraftConfig());
      setAuditResult(result);
      setMessageTone(result.status === "failed" ? "error" : result.status === "warning" ? "warning" : "success");
      setMessage(result.status === "failed" ? "API Key 审查未通过" : result.status === "warning" ? "API Key 审查有提示项" : "API Key 审查通过");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "API Key 审查失败");
    } finally {
      setAuditBusy(false);
    }
  };

  const clearKey = async () => {
    try {
      const saveConfig = window.desktop ? window.desktop.setAiConfig : api.setAiConfig;
      const nextStatus = await saveConfig({
        provider,
        clearApiKey: true,
        baseUrl: baseUrl.trim() || undefined,
        economyModel: economyModel.trim() || undefined,
        qualityModel: qualityModel.trim() || undefined
      });
      onStatusChange(nextStatus);
      setMasked(undefined);
      setApiKey("");
      setAuditResult(null);
      setMessageTone("success");
      setMessage("API Key 已清除，当前使用 Mock 模式");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "清除 API Key 失败");
    }
  };

  return (
    <section className="panel settings-panel">
      <div className="section-heading">
        <div>
          <h2>添加模型 API Key</h2>
          <p>{status?.aiEnabled ? `${providerName(status.provider)} 已接入，生成与审查将调用真实模型。` : "填写 API Key 后启用真实模型；不填写时继续使用 Mock 模式。"}</p>
        </div>
        <span className={`status-badge ${status?.aiEnabled ? "status-passed" : "status-running"}`}>
          {status?.mode ?? "mock"}
        </span>
      </div>

      <div className="model-grid">
        <div>
          <span>economy</span>
          <strong>{status?.models.economy ?? "claude-haiku-4-5"}</strong>
        </div>
        <div>
          <span>quality</span>
          <strong>{status?.models.quality ?? "claude-opus-4-8"}</strong>
        </div>
        <div>
          <span>provider</span>
          <strong>{providerName(status?.aiEnabled ? status.provider : provider)}</strong>
        </div>
        <div>
          <span>base URL</span>
          <strong>{status?.baseUrl ?? (baseUrl || defaultBaseUrl(provider))}</strong>
        </div>
      </div>

      <form className="settings-form" onSubmit={save}>
        <label>
          接口类型
          <select value={provider} onChange={(event) => setProvider(event.target.value as AiProvider)}>
            <option value="anthropic">Anthropic Claude</option>
            <option value="openai">OpenAI 兼容接口</option>
          </select>
        </label>
        <label>
          模型 API Key
          <input
            autoComplete="off"
            placeholder={masked ? `已保存：${masked}` : provider === "anthropic" ? "sk-ant-..." : "sk-..."}
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
        <label>
          Base URL
          <input
            autoComplete="off"
            placeholder={defaultBaseUrl(provider)}
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </label>
        <div className="settings-model-row">
          <label>
            economy 模型
            <input
              autoComplete="off"
              placeholder={provider === "anthropic" ? "claude-haiku-4-5" : "gpt-4o-mini"}
              value={economyModel}
              onChange={(event) => setEconomyModel(event.target.value)}
            />
          </label>
          <label>
            quality 模型
            <input
              autoComplete="off"
              placeholder={provider === "anthropic" ? "claude-opus-4-8" : "gpt-4o"}
              value={qualityModel}
              onChange={(event) => setQualityModel(event.target.value)}
            />
          </label>
        </div>
        <p className="settings-storage-note">
          {desktopAvailable ? "桌面端会保存到本机应用设置。" : "浏览器模式会保存到本地后端 data/ai-settings.json，并立即切换当前模型引擎。"}
        </p>
        <div className="settings-actions">
          <button className="primary-button" type="submit">
            保存 API Key
          </button>
          <button className="secondary-button" disabled={auditBusy} onClick={auditKey} type="button">
            {auditBusy ? "审查中" : "审查 API Key"}
          </button>
          <button className="secondary-button" disabled={!masked && !apiKey} onClick={clearKey} type="button">
            清除 Key
          </button>
        </div>
        {auditResult && <AuditResult result={auditResult} />}
        {message && <p className={`${messageTone === "success" ? "success-text" : messageTone === "warning" ? "warning-text" : "danger-text"} settings-message`}>{message}</p>}
      </form>
      {mcpInfo && <McpConnectionPanel info={mcpInfo} />}
    </section>
  );

  function buildDraftConfig(): AiProviderConfigInput {
    return {
      provider,
      apiKey: apiKey.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      economyModel: economyModel.trim() || undefined,
      qualityModel: qualityModel.trim() || undefined
    };
  }
}

function McpConnectionPanel({ info }: { info: McpConnectionInfo }) {
  return (
    <div className="mcp-panel">
      <div className="mcp-heading">
        <div>
          <h3>MCP 连接 Codex / Claude Code</h3>
          <p>把当前工作台作为本地 MCP Server，让外部 Agent 调用任务编排工具。</p>
        </div>
        <span className={`status-badge status-${info.status === "missing-build" ? "failed" : info.status === "ready" ? "passed" : "running"}`}>
          {info.status === "ready" ? "可连接" : info.status === "dev" ? "开发模式" : "需构建"}
        </span>
      </div>
      <div className="mcp-meta-grid">
        <div>
          <span>server</span>
          <strong>{info.serverName}</strong>
        </div>
        <div>
          <span>transport</span>
          <strong>{info.transport}</strong>
        </div>
        <div>
          <span>tools</span>
          <strong>{info.tools.length}</strong>
        </div>
      </div>
      <div className="mcp-config-grid">
        <div>
          <strong>Claude Code</strong>
          <pre>{JSON.stringify(info.claudeCode.config, null, 2)}</pre>
        </div>
        <div>
          <strong>Codex</strong>
          <pre>{JSON.stringify(info.codex.config, null, 2)}</pre>
        </div>
      </div>
      {info.claudeCode.addCommand && (
        <div className="mcp-command">
          <strong>Claude Code CLI</strong>
          <code>{info.claudeCode.addCommand.map((part) => part.includes(" ") ? `"${part}"` : part).join(" ")}</code>
        </div>
      )}
      <div className="mcp-notes">
        {info.notes.map((note) => <span key={note}>{note}</span>)}
      </div>
    </div>
  );
}

function AuditResult({ result }: { result: AiConfigAuditResult }) {
  const tone = result.status === "passed" ? "passed" : result.status === "warning" ? "running" : "failed";
  return (
    <div className={`api-key-audit audit-${result.status}`}>
      <div className="api-key-audit-heading">
        <div>
          <strong>{result.status === "passed" ? "审查通过" : result.status === "warning" ? "需要确认" : "审查未通过"}</strong>
          <span>{result.keyMasked ? `Key ${result.keyMasked}` : "未检测到可用 Key"}</span>
        </div>
        <span className={`status-badge status-${tone}`}>{result.canUseRealModel ? "可启用" : "不可启用"}</span>
      </div>
      <div className="api-key-audit-list">
        {result.items.map((item) => (
          <div className={`api-key-audit-item item-${item.severity}`} key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function providerName(provider: AiStatus["provider"] | AiProvider) {
  if (provider === "openai") return "OpenAI 兼容接口";
  if (provider === "anthropic") return "Anthropic Claude";
  return "Mock";
}

function defaultBaseUrl(provider: AiProvider) {
  return provider === "openai" ? "https://api.openai.com/v1" : "Anthropic 默认端点";
}
