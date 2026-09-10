# dsh-subagent-progress

[English](README.md) | 中文

> **一句话**:在输入框上方实时显示子 agent 的进度——它们在干什么、做到哪了、有没有卡住,一眼看清,不用点进去翻会话。

![截图](docs/screenshot.png)

[![npm](https://img.shields.io/npm/v/dsh-subagent-progress)](https://www.npmjs.com/package/dsh-subagent-progress) [![ci](https://github.com/edgeseeker7/dsh-subagent-progress/actions/workflows/ci.yml/badge.svg)](https://github.com/edgeseeker7/dsh-subagent-progress/actions)

## 你会看到什么

- **每个运行中的子 agent 一张卡片**:标签、轮次/步数、todo 完成度(`1/3`)、正在执行的具体动作(`bash: cargo build --release` 这种,而不是光秃秃的工具名)、耗时。
- **子 agent 主动开口汇报**:一句话告诉你进展如何、预计还要多久、有什么关键发现——品牌蓝=进展、琥珀=预期、绿=发现(全部取自 DS 主题变量,明暗主题自适应)。
- **卡住预警**:运行中但 5 分钟没有任何动静,状态点从绿变琥珀。
- **多子 agent 也对齐**:卡片按等宽网格排列、统一四行结构,任何数量都整整齐齐;超过两行在面板内滚动,不会挤爆屏幕。
- **不打扰**:子 agent 一结束,卡片停留 30 秒就自动消失;它留下的重要发现会多保留 3 分钟再消失;每张卡片有自己的 × 可单独关闭,右上角的 × 关闭整个面板——无论哪种,有新活动时都会自动回来。

## 安装

```bash
dsh plugin --profile web add dsh-subagent-progress
```

然后重启 `dsh web`。包托管在 npm:[dsh-subagent-progress](https://www.npmjs.com/package/dsh-subagent-progress),要求 dsh ≥ 0.1.2-rc.1(在 0.1.2-rc.1 上开发和验证)。

## 使用

- **点卡片** → 打开对应子 agent 的完整会话。
- **悬停汇报区** → 弹出毛玻璃浮层,查看完整的汇报全文(Markdown 渲染,列表/代码块都在)。
- 无需任何配置,装好即用。

## 它是怎么工作的(30 秒版)

两条通道,一个出口:

- **被动观测**:每个子 agent 的 session 事件(轮次/步骤/工具调用/助手文本)被折叠成小型进度状态,由 dsh 的投影框架**自动推送**到所有浏览器——所以即使子 agent 一句话不说,卡片上也一定有进度。
- **主动汇报**:每个子 agent 启动时会被装上 `notify_user` 工具和一段"一句话汇报"的引导(连续 6 次工具调用不汇报还会收到一句提醒)。它的每次汇报都是会话日志里的普通事件,被同一条通道带出来——天然持久化、可回放。

不修改 dsh 任何源码;host 半在任何部署形态下工作,界面半只在 dsh web 渲染。

## 更多

- [CHANGELOG](CHANGELOG.md) — 各版本改动
- 问题反馈:[GitHub Issues](https://github.com/edgeseeker7/dsh-subagent-progress/issues)
- License: MIT
