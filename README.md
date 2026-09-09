# dsh-subagent-progress

English | [中文](README.zh.md)

Live subagent progress summaries above the parent conversation composer — a DeepSeek Harness plugin.

![ci](https://github.com/edgeseeker7/dsh-subagent-progress/actions/workflows/ci.yml/badge.svg)

## What it does

Every subagent is a full Agent + Session whose committed events fire on the host. This plugin combines **passive observation** and **active reporting** in one package:

1. **Host · Passive observation** — registers a `subagentProgress` session projection that folds each child session's events into a small progress state: current turn/step, tool-call count, most recent tool name, and a short preview of the latest assistant text. Projection changes are **broadcast automatically** to every browser by dsh's SessionControlController (zero push code), with a persisted checkpoint cache and reconnect baselines included.
2. **Host · Active reporting (`notify_user`)** — listens for `agent/created` and installs a `notify_user` tool plus usage guidance into every subagent's own scope (`agent.ctx`) — the same child-scoped pattern as the official `dsh-tool-subagent-report`, invisible to parent and siblings, unwound automatically on agent disposal. The guidance asks the model for **one very short line** (ideally under 15 words) carrying only the most important fact plus current progress (what is done / what is happening / what is left), with an explicit cadence: after each distinct piece of work, every few tool calls during long stretches, when remaining work is estimable, the moment a key finding surfaces, and once with the key outcome before finishing; inline Markdown is supported. **Cadence nudge**: a `tools/post-execute` listener scoped to the child (the official repeat-tool-reminder pattern) counts executions since the last communication call and attaches a one-line reminder to the tool result after 6 consecutive non-reporting calls — turning voluntary reporting into rhythmic reporting. **The tool's `execute` deliberately delivers nothing** — the call itself is an ordinary `tool/call` event in the child's durable session log, which the same projection fold turns into `lastUpdate`: durable, replayable, and no extra channel.
3. **Client half** — renders a **frosted-glass progress dock** into the `conversation.input.dock` slot — with geometry identical to the official docks (todo list, attachment tray), so its edges align exactly with the composer card. Each running/grace-period child gets a **two-row info card** (head: status dot + label + right-aligned "running · elapsed"; second row: `turn N · step M`, todo `done/total`, the current action with its key argument; third row: current-task preview clamped to 2 lines), followed by **one update row per child** (up to 3), each faintly tinted by its kind color. **Visibility contract: chips belong to running subagents, and a just-finished child lingers for a 30-second grace window (idle dot + final settled duration, derived purely from the projection's `updatedAt`) before disappearing; the update bar shows the freshest update from a live or grace-period child, or an important `finding` left behind by a finished one; a close button in the dock's top-right corner dismisses it until any NEW activity revives it automatically; when none of these apply, the whole dock vanishes.** Chips are centered as a row and show **key information, not mechanical metadata**: breathing status dot, label, `turn N · step M`, structured `done/total` progress from the child's own todo list (the official `todos` projection), **the current action with its key argument** (`grep SessionEvent`, `bash: pnpm test` — not a bare tool name), elapsed time (tabular numerals); the preview prioritizes "model update > current todo item > raw transcript text" with Markdown markers stripped, and `send_message`/`report` content folds as updates too (covering children that report through the official channel). The update bar is owned by its kind color (blue = progress / amber = eta / violet = finding — a faint 8% tinted glass with a 28% border, not a solid color block), and its message renders through the host's `MarkdownText` component (**bold**, `code`, lists, …). Chips stay neutral: the only color signal is the status dot — green = actively working, amber = running but silent for 5+ minutes (stall warning, sourced from the projection's `updatedAt`). Responsive: on narrow screens chips wrap centered, previews hide, and the update message wraps onto its own line. All colors come from the host's `--dsw-*` theme variables (light/dark adaptive), and the stylesheet is injected at module materialization with a `data-plugin-css` tag per the official HMR-claiming convention. Clicking a chip or the bar opens the child session through the catalog-addressed `openSubagent` navigation.

Data flow:

```
child session events (including notify_user tool/call)
  → sessionProjections fold (subagentProgress)
  → SessionControlController broadcast → client projection store
  → useSessions().byId[child].projectionValues.subagentProgress → chips
```

No dsh source is modified; even if the model never calls `notify_user`, passive observation guarantees visible progress.

## Install

```bash
dsh plugin --profile web add dsh-subagent-progress
```

Then restart `dsh web`.

## Design notes

- **Why a projection instead of polling**: dsh's projection framework (`ctx.sessionProjections`) provides synchronous pure folds, `Object.is` change suppression, persisted checkpoints, and a free real-time channel to browsers — the same architecture as the official `subagentTiming`/`turnOutline` units.
- **Why so few folded fields**: the wire view is broadcast on every change; keeping it small and flat (turn/step/lastTool/lastText/lastUpdate/active/updatedAt) minimizes traffic, and a changed view always implies changed content (no heartbeat broadcasts).
- **Why `notify_user`'s execute is a no-op**: the call is already durable in the child session log, and the fold extracts updates from there — persistence, replay, and resume semantics come for free. A separate delivery channel would only reinvent the wheel.
