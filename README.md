# dsh-subagent-progress

English | [中文](README.zh.md)

> **One-liner:** Live progress for your subagents, right above the input box — what they're doing, how far along they are, whether they're stuck. No clicking into transcripts.

![screenshot](docs/screenshot.png)

[![npm](https://img.shields.io/npm/v/dsh-subagent-progress)](https://www.npmjs.com/package/dsh-subagent-progress) [![ci](https://github.com/edgeseeker7/dsh-subagent-progress/actions/workflows/ci.yml/badge.svg)](https://github.com/edgeseeker7/dsh-subagent-progress/actions)

## What you see

- **One card per running subagent**: label, turn/step, todo completion (`1/3`), the exact action in flight (`bash: cargo build --release`, not a bare tool name), and elapsed time.
- **Subagents report in their own words**: one-sentence updates about progress, how long remains, and key discoveries — brand blue = progress, amber = ETA, green = finding (all sourced from DS theme variables, light/dark adaptive).
- **Stall alerts**: a live subagent silent for 5+ minutes turns its status dot amber.
- **Failure actions**: when a subagent's turn dies (e.g. a 429 overload), its card stays — red dot, the distilled error on one line (hover for the full text), and explicit actions: **Retry** queues a fresh turn for the child right from the card, **Open** jumps into its session; a running card likewise gets a **Pause** button that interrupts the active turn (handy during retry storms).
- **Aligned at any count**: cards snap into an equal-width grid with a uniform four-row structure, so they line up perfectly whether there are two or ten; beyond two rows the panel scrolls instead of eating your screen.
- **Zero nagging**: when a subagent finishes, its card lingers 30 seconds then disappears; important findings linger 3 minutes before disappearing too; every card has its own × to dismiss it individually, and the corner × dismisses the whole dock — either way, everything reappears on its own when new activity arrives.

## Install

```bash
dsh plugin --profile web add dsh-subagent-progress
```

Then restart `dsh web`. Published on npm as [dsh-subagent-progress](https://www.npmjs.com/package/dsh-subagent-progress). Requires dsh ≥ 0.1.2-rc.1 — see [Compatibility](#compatibility).

## Usage

- **Click a card** → open that subagent's full session.
- **Hover the update area** → a frosted popover shows the full update, markdown-rendered (lists and code blocks intact).
- No configuration needed — install and it works.

## How it works (30-second version)

Two channels, one outlet:

- **Passive observation**: every subagent's session events (turns, steps, tool calls, assistant text) are folded into a small progress state that dsh's projection framework **pushes to every browser automatically** — so there is always progress on the card, even if the model never says a word.
- **Active reporting**: every subagent gets a `notify_user` tool plus guidance to report in single sentences (and a gentle reminder after 6 consecutive tool calls without one). Each report is an ordinary event in the child's durable session log, carried out by the same channel — persistent and replayable by construction.

No dsh source is modified; the host half works in any deployment, the UI half renders only under dsh web.

## Compatibility

Official dsh plugins declare their version contract as `peerDependencies` on the `@deepseek-ai/*` core packages they touch; this plugin follows the same convention. All core packages ship in lockstep release trains (0.1.x-rc), so one range covers the whole host.

**Supported: dsh ≥ 0.1.2-rc.1, < 0.2.0. Developed and live-verified on 0.1.5-rc.1.**

The floor is not arbitrary — it comes from the exact API surface this plugin uses, checked against the published tarballs of every core release:

| API surface we use | Provided by | Introduced |
|---|---|---|
| `remote.subagents` wire API (`prompt` / `interruptByParent`, `mode: 'continuable'`) — the Retry/Pause buttons | `@deepseek-ai/dsh-api-remotes` | **0.1.2-rc.1** (absent in 0.1.0-rc.8) |
| `sessionProjections` service (server-side event folding) | `@deepseek-ai/dsh-session-projection` | ≤ 0.1.0-rc.8 |
| `systemPrompt` service (reporting guidance section) | `@deepseek-ai/dsh-system-prompt` | ≤ 0.1.0-rc.8 |
| `defineTool` (`notify_user` registration) | `@deepseek-ai/dsh-tools` | ≤ 0.1.0-rc.8 |
| Client services `sessions` / `slots` / `locale` / `remote` | `@deepseek-ai/dsh-api-session-controller`, `@deepseek-ai/dsh-client-*` | ≤ 0.1.0-rc.8 |

Because the web client declares `remote.subagents` in its cordis `inject`, the whole dock — not just the buttons — requires ≥ 0.1.2-rc.1. Versions 0.1.2 through 0.1.3 are expected to work by API surface but are not continuously tested; 0.1.5-rc.1 is the version every release is verified against.

One nuance on enforcement: npm semver cannot express "any prerelease train from X onward" — a range like `>=0.1.2-rc.1 <0.2.0` only admits the 0.1.2-rc.* line under the same-tuple prerelease rule, and `^0.1.5-rc.1` pins a single train (which is why official plugins redeclare peers every train). Since neither expresses the real contract, this section is the authoritative statement; `peerDependencies` stays minimal (`cordis`, `dsh-tools`), matching the official client-plugin convention.

## More

- [CHANGELOG](CHANGELOG.md) — what changed in each version
- Feedback: [GitHub Issues](https://github.com/edgeseeker7/dsh-subagent-progress/issues)
- License: MIT
