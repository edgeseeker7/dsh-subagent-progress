# dsh-subagent-progress

在主 agent 会话头部实时显示子 agent 进度摘要的 DeepSeek Harness 插件。
Live subagent progress summaries in the parent conversation header for DeepSeek Harness.

![status](https://img.shields.io/badge/status-early-orange)

## 它做什么

每个子 agent 是一个完整的 Agent + Session,其每一条 session 事件都会在宿主上触发。本插件:

1. **Host 半**:注册一个 `subagentProgress` session 投影(projection),把每个子 agent session 的事件折叠成小型进度状态——当前轮次/步骤、工具调用计数、最近调用的工具名、最近一段助手文本预览。投影变更由 dsh 的 SessionControlController **自动广播**到所有浏览器(零推送代码),并自带持久化缓存与重连 baseline。
2. **Client 半**:在会话头部的 `utilities` slot 渲染一排进度 chip——每个直接子 agent 一个:运行状态呼吸点、标签、`轮 N·步 M`、最近工具、耗时、最新文本预览。点击 chip 打开对应子 agent 会话。

数据流:

```
child session events → sessionProjections fold (subagentProgress)
  → SessionControlController broadcast → client projection store
  → useSessions().byId[child].projectionValues.subagentProgress → chips
```

不修改 dsh 任何源码;不依赖模型主动汇报(被动观测),因此无论子 agent 是否配合都有进度可看。

## 安装

```bash
dsh plugin --profile web add <本仓库路径或 npm 包名>
```

然后重启 `dsh web`。

## 设计说明

- **为什么是投影而不是轮询**:dsh 的投影框架(`ctx.sessionProjections`)提供同步纯折叠、`Object.is` 变更抑制、持久化 checkpoint、以及到浏览器的免费实时通道,与官方 `subagentTiming`/`turnOutline` 完全同构。
- **为什么只折叠少量字段**:投影的 wire view 每次变更都会广播;保持小而扁平(turn/step/lastTool/lastText/active/updatedAt)可以把流量降到最低。
- **后续路线**:可以叠加"主动汇报"——利用官方 `@deepseek-ai/dsh-tool-subagent-report` 的 `report` 工具或自建 child-scoped 工具,把模型自己的阶段性总结也渲染进 chip。
