# dsh-subagent-progress

English | [中文](README.zh.md)

Live subagent progress summaries above the parent conversation composer — a DeepSeek Harness plugin.

![status](https://img.shields.io/badge/status-early-orange)

## What it does

Every subagent is a full Agent + Session whose committed events fire on the host. This plugin combines **passive observation** and **active reporting** in one package:

1. **Host · Passive observation** — registers a `subagentProgress` session projection that folds each child session's events into a small progress state: current turn/step, tool-call count, most recent tool name, and a short preview of the latest assistant text. Projection changes are **broadcast automatically** to every browser by dsh's SessionControlController (zero push code), with a persisted checkpoint cache and reconnect baselines included.
2. **Host · Active reporting (`notify_user`)** — listens for `agent/created` and installs a `notify_user` tool plus usage guidance into every subagent's own scope (`agent.ctx`) — the same child-scoped pattern as the official `dsh-tool-subagent-report`, invisible to parent and siblings, unwound automatically on agent disposal. The guidance asks the model for **one very short line** (ideally under 15 words) carrying only the most important fact plus current progress (what is done / what is happening / what is left); inline Markdown is supported. **The tool's `execute` deliberately delivers nothing** — the call itself is an ordinary `tool/call` event in the child's durable session log, which the same projection fold turns into `lastUpdate`: durable, replayable, and no extra channel.
3. **Client half** — renders a **frosted-glass progress dock** into the `conversation.input.dock` slot, geometry-matched to the composer card via the official `--dsh-composer-card-max-width` variables (never full-window). **Visibility contract: chips belong only to running subagents — the moment a subagent stops, its chip disappears; the update bar shows the freshest update from a still-running child, or an important `finding` left behind by a finished one; with nothing running and no finding, the whole dock vanishes.** Chips are centered as a row: breathing status dot, label, `turn N · step M`, last tool, elapsed time (tabular numerals), and a single-line preview with Markdown markers stripped. The update bar is owned by its kind color (blue = progress / amber = eta / violet = finding — a faint 8% tinted glass with a 28% border, not a solid color block), and its message renders through the host's `MarkdownText` component (**bold**, `code`, lists, …). Chips stay neutral: the only color signal is the status dot — green = actively working, amber = running but silent for 5+ minutes (stall warning, sourced from the projection's `updatedAt`). Responsive: on narrow screens chips wrap centered, previews hide, and the update message wraps onto its own line. All colors come from the host's `--dsw-*` theme variables (light/dark adaptive), and the stylesheet is injected at module materialization with a `data-plugin-css` tag per the official HMR-claiming convention. Clicking a chip or the bar opens the child session through the catalog-addressed `openSubagent` navigation.

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

## Verification (2026-09-09, headless profile)

Real delegation tasks were run in the headless profile:

1. The child agent's `request/header` confirmed `notify_user` among its tools and the guidance in its system prompt; non-subagent sessions never receive the tool (unit-test covered).
2. A "read 4 files and summarize" delegation produced **5 real `notify_user` calls**: 4 staged progress updates (one per file) + 1 `kind: finding` key discovery — all persisted as `tool/call` events in the child's session log.
3. Replaying that real child session log through the projection fold produced 25 deduplicated views; the final view passes schema validation with the finding as `lastUpdate` and `updateCount: 5`.

Also see `node test-client.mjs` (client structure & navigation self-check) and `node test-visual.mjs` (real React render + headless-chromium screenshot verification).

## Design notes

- **Why a projection instead of polling**: dsh's projection framework (`ctx.sessionProjections`) provides synchronous pure folds, `Object.is` change suppression, persisted checkpoints, and a free real-time channel to browsers — the same architecture as the official `subagentTiming`/`turnOutline` units.
- **Why so few folded fields**: the wire view is broadcast on every change; keeping it small and flat (turn/step/lastTool/lastText/lastUpdate/active/updatedAt) minimizes traffic, and a changed view always implies changed content (no heartbeat broadcasts).
- **Why `notify_user`'s execute is a no-op**: the call is already durable in the child session log, and the fold extracts updates from there — persistence, replay, and resume semantics come for free. A separate delivery channel would only reinvent the wheel.
