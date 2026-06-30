import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  getAiStatus: () => ipcRenderer.invoke("settings:get-ai-status"),
  getAiConfig: () => ipcRenderer.invoke("settings:get-ai-config"),
  getApiKeyMasked: () => ipcRenderer.invoke("settings:get-api-key-masked") as Promise<string | undefined>,
  setAiConfig: (config: unknown) => ipcRenderer.invoke("settings:set-ai-config", config),
  setApiKey: (apiKey: string) => ipcRenderer.invoke("settings:set-api-key", apiKey),
  selectProjectDirectory: () => ipcRenderer.invoke("projects:select-directory")
});
