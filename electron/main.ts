import { app, BrowserWindow, dialog, ipcMain, nativeImage } from "electron";
import { Server } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAiConfigView, getMaskedApiKey, readAiConfig, writeAiConfig } from "./settings.js";
import type { AiProvider, AiProviderConfig, AiProviderConfigInput, AiProviderConfigView } from "./settings.js";

type AiStatus = {
  aiEnabled: boolean;
  mode: "mock" | "claude" | "openai";
  provider: AiProvider | "mock";
  baseUrl?: string;
  models: Record<"economy" | "quality", string>;
  keyMasked?: string;
};

type AppControl = {
  app: import("express").Express;
  setAiConfig: (config?: AiProviderConfig) => AiStatus;
  setApiKey: (apiKey?: string) => AiStatus;
  getAiStatus: () => AiStatus;
  scanProject: (rootPath: string) => unknown;
  projectContext: (projectId: string) => unknown;
};

let server: Server | null = null;
let control: AppControl | null = null;

const __dirname = dirname(fileURLToPath(import.meta.url));

async function createWindow() {
  assertSqliteRuntime();
  const appIcon = loadAppIcon();
  if (process.platform === "darwin" && app.dock && !appIcon.isEmpty()) {
    app.dock.setIcon(appIcon);
  }
  const serverAppUrl = new URL("../server/server/app.js", import.meta.url);
  const { createApp } = (await import(serverAppUrl.href)) as { createApp: (options: any) => AppControl };
  const aiConfig = readAiConfig();
  const staticRoot = app.isPackaged
    ? join(app.getAppPath(), "dist")
    : resolve(process.cwd(), "dist");
  control = createApp({
    serveStatic: true,
    staticRoot,
    aiConfig
  });

  server = control.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolveReady) => server?.once("listening", resolveReady));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("无法启动桌面端本地服务");

  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 720,
    title: "熔炼镇",
    backgroundColor: "#ffffff",
    icon: appIcon.isEmpty() ? undefined : appIcon,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await window.loadURL(`http://127.0.0.1:${address.port}/`);
}

function loadAppIcon() {
  const iconPath = app.isPackaged
    ? join(app.getAppPath(), "assets/icons/forge-town-house.png")
    : resolve(process.cwd(), "assets/icons/forge-town-house.png");
  return nativeImage.createFromPath(iconPath);
}

function assertSqliteRuntime() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 5)) {
    throw new Error(`Electron Node ${process.versions.node} 不满足 node:sqlite 运行要求，需要 Node >= 22.5`);
  }
}

ipcMain.handle("settings:get-ai-status", () => control?.getAiStatus());
ipcMain.handle("settings:get-ai-config", (): AiProviderConfigView => getAiConfigView());
ipcMain.handle("settings:get-api-key-masked", () => getMaskedApiKey());
ipcMain.handle("settings:set-ai-config", (_event, config: AiProviderConfigInput) => {
  const aiConfig = writeAiConfig(config);
  return control?.setAiConfig(aiConfig);
});
ipcMain.handle("settings:set-api-key", (_event, apiKey: string) => {
  const normalized = apiKey.trim();
  writeAiConfig(normalized ? { provider: "anthropic", apiKey: normalized } : undefined);
  return control?.setApiKey(normalized || undefined);
});
ipcMain.handle("projects:select-directory", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  const rootPath = result.filePaths[0];
  if (result.canceled || !rootPath) return null;
  return control?.scanProject(rootPath) ?? null;
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  server?.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
