# dsh-subagent-progress

[English](README.md) | 中文

在主 agent 会话的输入框上方实时显示子 agent 进度摘要的 DeepSeek Harness 插件。
Live subagent progress summaries above the parent conversation composer for DeepSeek Harness.

![status](https://img.shields.io/badge/status-early-orange)

## 它做什么

每个子 agent 是一个完整的 Agent + Session,其每一条 session 事件都会在宿主上触发。本插件把「被动观测」和「主动汇报」两条路线合在同一个插件里:

1. **Host · 被动观测**:注册一个 `subagentProgress` session 投影(projection),把每个子 agent session 的事件折叠成小型进度状态——当前轮次/步骤、工具调用计数、最近调用的工具名、最近一段助手文本预览。投影变更由 dsh 的 SessionControlController **自动广播**到所有浏览器(零推送代码),并自带持久化缓存与重连 baseline。
2. **Host · 主动汇报(notify_user)**:监听 `agent/created`,给每个子 agent 的作用域(`agent.ctx`)装一个 `notify_user` 工具 + 一段使用引导(官方 `dsh-tool-subagent-report` 同款 child-scoped 模式,对父 agent 与兄弟不可见,agent dispose 时自动卸载)。引导要求模型用**极短的一句话**(理想 15 词以内)只说最重要的事实 + 当前进度(做完了什么/正在做什么/还剩多少),支持 Markdown 行内语法,并给出明确节奏:每完成一件独立工作、长任务中每隔几次工具调用、能估计剩余量时、关键发现浮现时、收尾前各汇报一次。**节奏提醒**:监听该子 agent 的 `tools/post-execute`(官方 repeat-tool-reminder 同款模式),连续 6 次非汇报类工具调用没有任何 `notify_user`/`send_message`/`report` 时,在工具结果里附一句简短提醒——把"自愿汇报"变成"有节奏的汇报"。**工具的 execute 不做任何投递**——这次调用本身就是子会话日志里的一条普通 `tool/call` 事件,被同一个投影折叠成 `lastUpdate`,持久化、可回放、零额外通道。
3. **Client 半**:在 `conversation.input.dock` slot 渲染**毛玻璃(glassmorphism)进度坞**,几何尺寸直接复用官方 dock 的 `--dsh-composer-card-max-width` 等变量,与输入框卡片精确对齐(不铺满全屏)。**可见性契约:胶囊属于正在运行的子 agent;刚结束的子 agent 胶囊会**再留 30 秒宽限期**(灰点 + 最终耗时,由投影 `updatedAt` 纯数据推导)再消失;汇报栏展示"运行中/宽限期内子 agent 的最新汇报"或"已结束子 agent 留下的重要发现(`finding`)";进度坞右上角有**关闭按钮**,关闭后任何新活动会自动让它重新出现;都不满足时整个进度坞彻底消失。** 胶囊整排居中,展示的是**关键信息而非机械元数据**:呼吸状态点、标签、`轮 N·步 M`、子 agent 自己 todo 列表的 `done/total` 结构化进度(官方 `todos` 投影)、**带关键参数的当前动作**(`grep SessionEvent`、`bash: pnpm test`,而不再是光秃秃的工具名)、耗时(等宽数字);预览按优先级取"模型汇报 > 当前 todo 项 > 原始文本"并清理 markdown 符号;`send_message`/`report` 的内容也作为汇报折叠(覆盖子 agent 用官方通道汇报的场景);汇报栏由 kind 色主导(蓝=进展 / 琥珀=预期 / 紫=发现,8% 淡染玻璃 + 28% 边框,不是色块糊脸),消息体经宿主 `MarkdownText` 组件渲染(支持 **粗体**、`code`、列表等);胶囊保持中性,唯一色彩信号是状态点——绿=活跃运行、琥珀=运行中但 5 分钟无新事件(卡住预警,数据来自投影的 `updatedAt`)。响应式:窄屏下胶囊换行居中、预览隐藏、汇报栏消息自动折行。全部颜色取自宿主 `--dsw-*` 主题变量(亮/暗自适应),样式表按官方约定在模块物化期注入并打 `data-plugin-css` 标(HMR 可认领)。点击胶囊/汇报栏经 catalog 地址(`openSubagent`)打开对应子 agent 会话。

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

## 设计说明

- **为什么是投影而不是轮询**:dsh 的投影框架(`ctx.sessionProjections`)提供同步纯折叠、`Object.is` 变更抑制、持久化 checkpoint、以及到浏览器的免费实时通道,与官方 `subagentTiming`/`turnOutline` 完全同构。
- **为什么只折叠少量字段**:投影的 wire view 每次变更都会广播;保持小而扁平(turn/step/lastTool/lastText/lastUpdate/active/updatedAt)可以把流量降到最低。
- **为什么 notify_user 的 execute 是"假动作"**:工具调用本身已经持久化在子会话日志里,投影折叠从中提取更新,天然获得持久化、回放、resume 语义;另开投递通道只会重复造轮子。
