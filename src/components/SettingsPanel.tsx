import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import type { AiProvider, AiStatus } from "../types";

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
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
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

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const saveConfig = window.desktop ? window.desktop.setAiConfig : api.setAiConfig;
      const nextStatus = await saveConfig({
        provider,
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
        economyModel: economyModel.trim() || undefined,
        qualityModel: qualityModel.trim() || undefined
      });
      onStatusChange(nextStatus);
      setMasked(nextStatus.keyMasked);
      setApiKey("");
      setMessageTone("success");
      setMessage(nextStatus.aiEnabled ? `${providerName(provider)} 已启用` : "配置已保存；未设置 API Key 时继续使用 Mock 模式");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "保存模型 API Key 失败");
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
          <button className="secondary-button" disabled={!masked && !apiKey} onClick={clearKey} type="button">
            清除 Key
          </button>
        </div>
        {message && <p className={`${messageTone === "success" ? "success-text" : "danger-text"} settings-message`}>{message}</p>}
      </form>
    </section>
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
