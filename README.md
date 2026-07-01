# 熔炼镇 / Multi-Agent Factory

熔炼镇是一个以“熔炼镇”主题为基座延伸出来的多 Agent 软件工程工作台。它不是先做一个复杂控制台再套主题，而是把软件任务本身设计成镇里的炼制流程：用户提交原矿一样的任务目标，系统沿着需求炉、计划坊、铸码间、审查塔、提交仓逐步推进，最后形成可审查、可应用的工程产物。

当前版本以“熔炼镇首页”作为主入口，后续项目绑定、Agent 分工、AI 运行时、PatchSet、沙箱验证和应用到磁盘，都会从这条工坊路线自然延伸出来。复杂能力不再默认铺满工作台，而是放到任务详情和设置里渐进展开。

## 产品基线

本项目的产品基线来自 `design-reference/smelting-town/`，后续开发默认围绕这个主题继续演进：

- 任务是原矿：用户先描述要创建、修复或重构的软件任务。
- 模型是炉火：Mock、Anthropic、OpenAI 兼容接口、未来的 Codex CLI / Claude Code CLI 都属于运行时炉火。
- 阶段是工坊：需求、计划、代码、审查、提交分别对应镇里的工坊路线。
- 首页是入口：只保留任务输入、模板、近期任务和模型设置，不恢复复杂大控制台。
- 能力向内展开：项目上下文、Agent 分工、Diff、验证日志、应用结果都放进任务详情。

因此，Multi-Agent Factory 是“熔炼镇”的工程能力延伸，而不是一个脱离主题的通用 Agent 面板集合。

## 当前状态

- 桌面端：Electron 应用，内嵌 Express API 和 React 前端。
- Web 端：同一套前端和 API 可以用 `npm run dev` 运行。
- 工作流：任务创建、需求确认、计划确认、work item 拆分、Agent 分派、代码生成、审查、提交记录、应用到项目。
- 项目集成：支持扫描本地项目、选择目标文件、生成 PatchSet、沙箱验证和应用补丁。
- AI 引擎：支持 Mock、Anthropic、OpenAI 兼容接口；无 Key 时自动降级 Mock。
- 视觉方向：以 `design-reference/smelting-town/` 的熔炼镇主题为后续开发基线，功能扩展必须服务这条炼制主线。

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

优先级按“从熔炼镇入口逐步延伸能力”的方向排序：

1. 桌面端主体验：继续打磨熔炼镇首页、任务详情和阶段卡片。
2. 项目绑定：让原矿任务能绑定真实项目，展示项目名、脚本、Git 状态和目标文件。
3. 真实 Agent 协作：让 work item 之间消费依赖产物，实现跨 Agent 交接。
4. 运行时接入：补 Codex CLI / Claude Code CLI 等本地 Agent runtime，作为新的炉火来源。
5. 工具循环：让 Agent 能读文件、编辑、运行验证，并根据错误自我迭代。
6. 组件拆分：拆分 `src/App.tsx`，降低单文件复杂度。
7. 代码应用闭环：继续强化 PatchSet、沙箱验证、审查门禁和应用到磁盘。
8. 移动端：暂时只保持基础可访问，后续再精细适配。

## 仓库

GitHub: <https://github.com/003jia/Multi-Agent-Factory>
