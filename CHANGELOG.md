# Changelog

## 0.4.2 (2026-09-11)

- Fix: Retry/Pause buttons actually deliver now. They previously routed through
  the generic session face, which the host rejects for every subagent-owned
  session ("owned by subagent routing") unless the user had first navigated
  into the child. Cards now call `remote.subagents.prompt` /
  `interruptByParent` directly with the continuable address built from the
  card's own parent id.
- One-shot (workflow) children no longer show Retry/Pause at all: the official
  protocol scopes both control operations to continuable children, so those
  buttons could never have worked. The child catalog is refreshed on dock
  mount so the distinction is available.

## 0.4.1 (2026-09-11)

- Fix: card dismissals no longer revive on page switches — the per-card × now
  persists to `localStorage` (per session, 7-day expiry), while newer child
  activity still revives a dismissed card on its own.
- Fix: single close-button semantics — the redundant dock-level × is removed;
  each card's own × is the only way to dismiss, one card at a time.

## 0.4.0 (2026-09-10)

- Failure surface: `turn/end` with `reason.kind === 'error'` folds into a distilled
  `failure` (code; one-line message stripped of request ids and provider JSON
  envelopes; full text for the hover popover). Projection state version 6.
- Failed subagents keep their card past the grace window with a pulsing red dot and
  action buttons: **Retry** queues a fresh turn into the child session through the
  client session face (`prompt(..., 'queue')`), falling back to opening the child
  when the control channel is unavailable; running cards gain a **Pause** button
  (`cancel()` → `subagents.interruptByParent`). A new `turn/start` clears the
  failure durably, so a successful retry restores the normal card on its own.

## 0.2.2 (2026-09-09)

- Close control is now a real glass button inside the dock (was a ghost glyph clipping outside).
- One type scale across the dock: MarkdownText descendants inherit the dock's 12px/11px scale.

## 0.2.1 (2026-09-09)

- Guidance hardening: notify_user demands ONE single sentence (readable in two seconds) with
  concrete shape examples; send_message/report content distilled to its first-line headline.
- Unified card: a running/grace child is one element — status head, progress meta, todo
  preview, and its latest update in a hairline-separated section. Standalone rows remain only
  for orphaned findings.
- Update messages preserve Markdown structure (lists render).
- Cards dedupe against update rows; lastText no longer leaks raw report text.
- Key-information cards: todo done/total, distilled current action with its key argument.

## 0.2.0 (2026-09-09)

- Grace window: a just-finished child's card lingers 30s before disappearing.
- Dismissible dock (close button); any new activity revives it automatically.

## 0.1.0 (2026-09-09)

- First public release: frosted-glass progress dock above the composer (running-only chips,
  kind-tinted update bar, stall indicator), child-scoped notify_user tool with cadence nudge,
  subagentProgress session projection, bilingual README.
