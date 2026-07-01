# 熔炼镇 / Multi-Agent Factory

熔炼镇是一个桌面优先的多 Agent 软件工程工作台。它把一次软件开发任务抽象成“炼制流程”：用户输入任务目标，系统逐步整理需求、生成计划、分派 Agent、产出 PatchSet、运行审查，并在绑定真实项目后应用到磁盘。

当前版本以前端“熔炼镇”首页作为主入口，复杂能力不再默认铺满工作台，而是放到任务详情里渐进展开。

## 当前状态

- 桌面端：Electron 应用，内嵌 Express API 和 React 前端。
- Web 端：同一套前端和 API 可以用 `npm run dev` 运行。
- 工作流：任务创建、需求确认、计划确认、work item 拆分、Agent 分派、代码生成、审查、提交记录、应用到项目。
- 项目集成：支持扫描本地项目、选择目标文件、生成 PatchSet、沙箱验证和应用补丁。
- AI 引擎：支持 Mock、Anthropic、OpenAI 兼容接口；无 Key 时自动降级 Mock。
- 视觉方向：以 `design-reference/smelting-town/` 的熔炼镇主题为后续开发基线。

## 技术栈

- React 19
- TypeScript
- Vite
- Express
- Electron
- Node `node:sqlite`
- Vitest

Node 运行时需要支持 `node:sqlite`，建议使用 Node 22.5 或更高版本。

## 快速开始

```bash
npm install
npm run dev
```

默认会启动：

- 前端：`http://127.0.0.1:5173`，端口被占用时 Vite 会自动换端口。
- API：`http://127.0.0.1:4173`

## 桌面端运行

```bash
npm run dev:electron
```

这个命令会先构建 Web 和 Electron 主进程，再打开桌面端窗口。桌面端图标使用 `assets/icons/forge-town-house.png` 和 `assets/icons/forge-town-house.icns`。

## 常用命令

```bash
npm run typecheck       # TypeScript 类型检查
npm run build           # 构建 Web + server
npm run build:electron  # 构建 Electron 主进程
npm test                # 运行测试
npm run dist            # 构建 macOS dmg
```

## AI 配置

可以在设置页配置：

- Provider：Anthropic 或 OpenAI 兼容接口
- API Key
- Base URL
- economy / quality 模型

浏览器模式配置会写入本地后端数据文件；桌面模式配置会写入 Electron 应用设置。密钥和本地数据库不应提交到仓库。

## 项目结构

```text
src/                         React 前端与共享类型
src/components/              任务面板、设置页、产物面板等组件
server/                      Express API、工作流、持久化、Agent 引擎
server/agents/               Mock / Claude / OpenAI 引擎
server/runtime/              PatchSet、沙箱验证、真实项目写入
electron/                    Electron 主进程、preload、桌面设置存储
tests/                       工作流、API、补丁、模型配置等测试
docs/                        工程基线、产品基线与路线图
design-reference/            熔炼镇视觉参考包
assets/icons/                桌面端图标资源
```

## 数据与提交边界

以下内容默认不提交：

- `node_modules/`
- `dist/`
- `data/`
- `release/`
- `.playwright-cli/`
- `output/`

本地任务数据保存在 `data/factory.sqlite`，AI 设置和运行数据只应留在本机。

## 后续方向

优先级按当前产品方向排序：

1. 桌面端主体验：继续打磨熔炼镇首页、任务详情和阶段卡片。
2. 真实 Agent 协作：让 work item 之间消费依赖产物，实现跨 Agent 交接。
3. 运行时接入：补 Codex CLI / Claude Code CLI 等本地 Agent runtime。
4. 工具循环：让 Agent 能读文件、编辑、运行验证，并根据错误自我迭代。
5. 组件拆分：拆分 `src/App.tsx`，降低单文件复杂度。
6. 移动端：暂时只保持基础可访问，后续再精细适配。

## 仓库

GitHub: <https://github.com/003jia/Multi-Agent-Factory>
