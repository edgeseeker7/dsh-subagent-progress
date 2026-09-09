# dsh-subagent-progress

在主 agent 会话的输入框上方实时显示子 agent 进度摘要的 DeepSeek Harness 插件。
Live subagent progress summaries above the parent conversation composer for DeepSeek Harness.

![status](https://img.shields.io/badge/status-early-orange)

## 它做什么

每个子 agent 是一个完整的 Agent + Session,其每一条 session 事件都会在宿主上触发。本插件把「被动观测」和「主动汇报」两条路线合在同一个插件里:

1. **Host · 被动观测**:注册一个 `subagentProgress` session 投影(projection),把每个子 agent session 的事件折叠成小型进度状态——当前轮次/步骤、工具调用计数、最近调用的工具名、最近一段助手文本预览。投影变更由 dsh 的 SessionControlController **自动广播**到所有浏览器(零推送代码),并自带持久化缓存与重连 baseline。
2. **Host · 主动汇报(notify_user)**:监听 `agent/created`,给每个子 agent 的作用域(`agent.ctx`)装一个 `notify_user` 工具 + 一段使用引导(官方 `dsh-tool-subagent-report` 同款 child-scoped 模式,对父 agent 与兄弟不可见,agent dispose 时自动卸载)。引导鼓励模型汇报:阶段性进展、预期管理(还要多久)、关键发现。**工具的 execute 不做任何投递**——这次调用本身就是子会话日志里的一条普通 `tool/call` 事件,被同一个投影折叠成 `lastUpdate`,持久化、可回放、零额外通道。
3. **Client 半**:在 `conversation.input.dock` slot(输入框卡片正上方、整宽)渲染**毛玻璃(glassmorphism)进度坞**——每个直接子 agent 一枚玻璃胶囊:呼吸状态点、标签、`轮 N·步 M`、最近工具、耗时(等宽数字)、最新汇报/文本预览;下方一条整宽汇报栏展示所有子 agent 中最新的一条 `notify_user` 汇报,带彩色分类徽标(↗ 进展 / ◷ 预期 / ◆ 发现)。全部颜色取自宿主的 `--dsw-*` 主题变量(亮/暗主题自适应),样式表按官方约定在模块物化期注入并打 `data-plugin-css` 标(HMR 可认领)。点击胶囊/汇报栏经 catalog 地址(`openSubagent`)打开对应子 agent 会话。

数据流:

```
child session events (含 notify_user 的 tool/call)
  → sessionProjections fold (subagentProgress)
  → SessionControlController broadcast → client projection store
  → useSessions().byId[child].projectionValues.subagentProgress → chips
```

不修改 dsh 任何源码;即使模型从不调用 `notify_user`,被动观测也保证有进度可看。

## 安装

```bash
dsh plugin --profile web add <本仓库路径或 npm 包名>
```

然后重启 `dsh web`。

## 验证记录(2026-09-09,headless profile 实测)

在 headless profile 中跑了真实委派任务(模型:the configured model):

1. 子 agent 的 `request/header` 里确认 `notify_user` 出现在 27 个工具中,且使用引导出现在其 system prompt;非子 agent 会话不安装(单测覆盖)。
2. 委派"读 4 个文件并总结"任务,子 agent 实际调用了 **5 次** `notify_user`:4 次阶段性进展(每读完一个文件一次)+ 1 次 `kind: finding` 关键发现,全部作为 `tool/call` 事件落入其持久会话日志。
3. 把该真实子会话日志逐事件回放进投影折叠:产出 25 个去重后的 view,最终 view schema 校验通过,`lastUpdate` 为最后一条 finding,`updateCount: 5`。

复现:`dsh --profile headless --patch verify.patch.yml "<委派任务>"`(`verify.patch.yml` 把 an internal gateway provider 内联进 llm-pi-ai 配置,绕开 stored settings 节里 schema 非法键导致的 NO_ADAPTER——当时 `settings.yaml` 的 `llm-pi-ai` 节含非法 effort 键,整节校验失败使 llm-pi-ai 退化为 0 个 provider)。

另有 `node test-client.mjs`(client 结构与导航自检)和 `node test-visual.mjs`(真实 React 渲染 + headless chromium 截图的视觉效果验证)。

## 设计说明

- **为什么是投影而不是轮询**:dsh 的投影框架(`ctx.sessionProjections`)提供同步纯折叠、`Object.is` 变更抑制、持久化 checkpoint、以及到浏览器的免费实时通道,与官方 `subagentTiming`/`turnOutline` 完全同构。
- **为什么只折叠少量字段**:投影的 wire view 每次变更都会广播;保持小而扁平(turn/step/lastTool/lastText/lastUpdate/active/updatedAt)可以把流量降到最低。
- **为什么 notify_user 的 execute 是"假动作"**:工具调用本身已经持久化在子会话日志里,投影折叠从中提取更新,天然获得持久化、回放、resume 语义;另开投递通道只会重复造轮子。
