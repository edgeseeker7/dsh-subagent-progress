# dsh-subagent-progress

[English](README.md) | 中文

> **一句话**:在输入框上方实时显示子 agent 的进度——它们在干什么、做到哪了、有没有卡住,一眼看清,不用点进去翻会话。

![截图](docs/screenshot.png)

[![npm](https://img.shields.io/npm/v/dsh-subagent-progress)](https://www.npmjs.com/package/dsh-subagent-progress) [![ci](https://github.com/edgeseeker7/dsh-subagent-progress/actions/workflows/ci.yml/badge.svg)](https://github.com/edgeseeker7/dsh-subagent-progress/actions)

## 你会看到什么

- **每个运行中的子 agent 一张卡片**:标签、轮次/步数、todo 完成度(`1/3`)、正在执行的具体动作(`bash: cargo build --release` 这种,而不是光秃秃的工具名)、耗时。
- **子 agent 主动开口汇报**:一句话告诉你进展如何、预计还要多久、有什么关键发现——品牌蓝=进展、琥珀=预期、绿=发现(全部取自 DS 主题变量,明暗主题自适应)。
- **卡住预警**:运行中但 5 分钟没有任何动静,状态点从绿变琥珀。
- **失败处置**:子 agent 的轮次报错(比如 429 过载)时,卡片不再默默消失——红点脉冲、一行蒸馏后的错误(悬停看全文),并给出明确动作:**重试**直接从卡片给子 agent 排一轮新任务,**打开**跳进它的会话手动处理;运行中的卡片也有**暂停**按钮,可中断当前轮次(重试风暴时正好用)。
- **多子 agent 也对齐**:卡片按等宽网格排列、统一四行结构,任何数量都整整齐齐;超过两行在面板内滚动,不会挤爆屏幕。
- **不打扰**:子 agent 一结束,卡片停留 30 秒就自动消失;它留下的重要发现会多保留 3 分钟再消失;每张卡片有自己的 × 可单独关闭,右上角的 × 关闭整个面板——无论哪种,有新活动时都会自动回来。

## 安装

```bash
dsh plugin --profile web add dsh-subagent-progress
```

然后重启 `dsh web`。包托管在 npm:[dsh-subagent-progress](https://www.npmjs.com/package/dsh-subagent-progress),要求 dsh ≥ 0.1.2-rc.1——详见[兼容性](#兼容性)。

## 使用

- **点卡片** → 打开对应子 agent 的完整会话。
- **悬停汇报区** → 弹出毛玻璃浮层,查看完整的汇报全文(Markdown 渲染,列表/代码块都在)。
- 无需任何配置,装好即用。

## 它是怎么工作的(30 秒版)

两条通道,一个出口:

- **被动观测**:每个子 agent 的 session 事件(轮次/步骤/工具调用/助手文本)被折叠成小型进度状态,由 dsh 的投影框架**自动推送**到所有浏览器——所以即使子 agent 一句话不说,卡片上也一定有进度。
- **主动汇报**:每个子 agent 启动时会被装上 `notify_user` 工具和一段"一句话汇报"的引导(连续 6 次工具调用不汇报还会收到一句提醒)。它的每次汇报都是会话日志里的普通事件,被同一条通道带出来——天然持久化、可回放。

不修改 dsh 任何源码;host 半在任何部署形态下工作,界面半只在 dsh web 渲染。

## 兼容性

dsh 官方插件用 `peerDependencies` 声明对自己触碰的 `@deepseek-ai/*` 核心包的版本契约,本插件遵循同一约定。核心包按发布列车(0.1.x-rc)整体联动,所以一个区间即可覆盖整个宿主。

**支持范围:dsh ≥ 0.1.2-rc.1 且 < 0.2.0。在 0.1.5-rc.1 上开发并实测验证。**

下限不是拍脑袋——它来自本插件实际使用的 API 面,已逐一对照各核心版本的发布 tarball 核实:

| 我们使用的 API | 提供方 | 引入版本 |
|---|---|---|
| `remote.subagents` wire API(`prompt` / `interruptByParent`,`mode: 'continuable'`)——重试/暂停按钮 | `@deepseek-ai/dsh-api-remotes` | **0.1.2-rc.1**(0.1.0-rc.8 没有) |
| `sessionProjections` 服务(服务端事件折叠) | `@deepseek-ai/dsh-session-projection` | ≤ 0.1.0-rc.8 |
| `systemPrompt` 服务(汇报引导段) | `@deepseek-ai/dsh-system-prompt` | ≤ 0.1.0-rc.8 |
| `defineTool`(注册 `notify_user`) | `@deepseek-ai/dsh-tools` | ≤ 0.1.0-rc.8 |
| 客户端服务 `sessions` / `slots` / `locale` / `remote` | `@deepseek-ai/dsh-api-session-controller`、`@deepseek-ai/dsh-client-*` | ≤ 0.1.0-rc.8 |

由于 web 客户端把 `remote.subagents` 声明进了 cordis 的 `inject`,整个 dock——不只是按钮——都要求 ≥ 0.1.2-rc.1。0.1.2 到 0.1.3 按 API 面推断可用,但未持续测试;每个发布版本都在 0.1.5-rc.1 上验证。

关于强制力的一点说明:npm semver 无法表达"X 之后的所有预发布列车"——`>=0.1.2-rc.1 <0.2.0` 在同元组预发布规则下只认 0.1.2-rc.* 一列,而 `^0.1.5-rc.1` 只能钉死单列(这正是官方插件每列车都重声明 peers 的原因)。两种写法都表达不了真实契约,所以本节才是权威声明;`peerDependencies` 保持最小化(`cordis`、`dsh-tools`),与官方客户端插件的惯例一致。

## 更多

- [CHANGELOG](CHANGELOG.md) — 各版本改动
- 问题反馈:[GitHub Issues](https://github.com/edgeseeker7/dsh-subagent-progress/issues)
- License: MIT
