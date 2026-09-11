# Changelog

## 0.7.3 (2026-09-11)

- Fix: dark corners from the 0.5px ring shadow (user: "四角为什么有点深").
  A spread ring bunches geometrically at tight corner radii — at 14px the
  corners read darker than the straight edges (the composer's 22px radius
  hides the same artifact). The hairline is now a 0.5px FRACTIONAL BORDER
  (never spreads → corners stay uniform; one physical pixel on retina).
  Ambient and inset-highlight shadows unchanged; hover goes 18% border.

## 0.7.2 (2026-09-11)

- Design: borders and type aligned with the composer (user: "边框有点不明
  显…字体大小也没对齐"). Measured in the live GUI via CDP: the card
  border's 70% border-l1 mix computed over the glass background to a
  2.7%-opacity hairline — functionally invisible; the composer input text
  is 14px while dock chrome ran 11–12px.
  - Card border now drawn the way the composer card draws it (measured:
    `border:none` + a 0.5px ring box-shadow at 10% black + soft ambient).
    The ring uses `label-primary` at 10% so dark mode gets 10% white; hover
    tightens to 18%. Nested cards keep the ring, drop the ambient.
  - Card body, label, preview, card-update and slim-update text now use the
    host's own `--dsh-content-font-size-secondary` token (13px, tracks the
    host's content-font settings) instead of hardcoded 12px. Meta/status
    stay 11px as tertiary metrics; font family already matched.

## 0.7.1 (2026-09-11)

- Fix (host projection): sticky `lastFinding` slot (stateVersion 7). Live
  verification of 0.7.0 exposed a deeper hole: the harness REQUIRES every
  child to send_message a final report, and the single `lastUpdate` slot
  meant that report always clobbered a mid-run finding — so finding
  retention had never actually engaged outside of lucky timing. The
  projection now folds findings into a separate churn-proof `lastFinding`;
  the client reads it for finding-holder retention and prefers the freshest
  of (recent update, sticky finding) on live cards. Client is
  backward-compatible with pre-v7 projections (no lastFinding → old
  behavior). NOTE: the host half loads at host start — the sticky slot
  activates on the next `dsh web` restart; everything else is hot-swapped.

## 0.7.0 (2026-09-11)

- Behavior: findings now stay IN THE TREE (user question: "那不应该是两个
  发现吗" → review found the recursive orphan rule tore a settled child's
  finding out of its branch to a detached bottom row). A settled child with
  an unexpired finding now keeps its place as a slim row for the finding's
  TTL; its ancestors stay as connectors. Consequence: the orphan-row
  mechanism became provably unreachable (progress/eta always rides a live
  card, findings now always keep their card alive), so OrphanRow, its CSS,
  MAX_UPDATES and the flash animation are deleted outright.
- Behavior: updates from live/grace cards now go stale after 10 minutes
  (`UPDATE_STALE_MS`) — a card that has run for hours no longer parades
  hour-old news as current. Findings keep their own 3-minute TTL.
- Header doc comment rewritten to describe the Apple-outline tree and the
  in-tree update model.

## 0.6.2 (2026-09-11)

- Design: the Apple answer to tree lines — NONE (user: "不是苹果的那种设计
  风格", then asked for a reference check). NSOutlineView/Finder never draw
  connector lines; hierarchy is indentation + disclosure triangles only.
  Both 0.5.2's直角 elbow and 0.6.1's rounded hook were the wrong dialect:
  - All connector pseudo-elements removed. Nested cards now indent their
    left edge exactly onto the parent's TEXT axis (26px), the way Finder
    aligns a child row with the parent row's label.
  - Parent cards with visible children gain a disclosure chip in the head
    (▾/▸ with count): the Apple outline affordance, and a screen-space
    valve — collapsing hides the whole subtree (session-local state).
  - Bonus: collapsed parents keep their card, so a running grandchild's
    lineage stays one click away instead of scrolling the dock.

## 0.6.1 (2026-09-11)

- Design: Apple-HIG tree connectors (user feedback: the直角 elbow "很不
  苹果"). The engineering-style right-angle tick becomes a 1px hairline
  that drops from the parent card's STATUS DOT axis (15px = padding 12 +
  dot 7/2) and curves into the child's head with a quarter-circle
  (border-bottom-left-radius 9px). Non-last siblings continue the vertical
  segment; the last child ends in the hook, so the tree terminates softly.
  Line weight 1.5px → 1px: hierarchy through precision, not stroke weight.

## 0.6.0 (2026-09-11)

- Feature: slim rows for settled cards (user feedback: "占屏幕有点大").
  Progressive disclosure: running and failed cards keep the full layout
  (they are the protagonists); a settled, healthy card — idle, grace-period,
  or one carrying a finding — collapses to a single 30px row: status dot,
  label, the finding inline (kind badge + one-line text, hover popover
  intact), elapsed, ×. Three agents that used to occupy ~600px of vertical
  space now take roughly half when some of them are done.
- Design: tree rail/ticks darkened a second notch (label-tertiary 50%→65%)
  after the user still found them too faint on white glass.

## 0.5.2 (2026-09-11)

- Design: one shared text axis — three-judge review (claude_opus5,
  gpt6_astra, fable5, dispatched after the user called the tree layout
  "上下对不齐") converged on the same diagnosis, and this implements their
  consensus:
  - Every card previously carried three or four left baselines (title at
    padding+dot+gap, meta/preview/failure at padding, update text past the
    kind badge). Meta, preview, failure and the update row now all start on
    the title's text axis (14px in); the update hairline still bleeds to the
    card edges.
  - Nested cards keep the parent's padding (0.5.1's "density step" padding
    cut misaligned every generation by 2px on both sides); lineage is
    expressed by the rail and indent alone, and the rail/ticks are stronger.
  - Retry/Pause moved from a body row into the card head — a parent with a
    Pause row and an idle child without one no longer diverge in rhythm.
  - Row equalization is scoped to FLAT mode (`:not([data-treed])`), per
    fable5's addendum; tree rows keep natural heights.
  - Nested cards drop the shell shadow; card hover no longer translates
    (an interface about alignment must not move when inspected);
    focus-visible gets a real 2px outline; the close button grows to
    24px at full opacity; the failed dot stops pulsing (the TTL already
    bounds the alarm); reduced-motion now also kills the live/stalled
    pulses and the enter/flash animations.
  - Update rows: min-height removed, two-line clamp (36px) instead of a
    single nowrap line; flat grid columns guarded with
    `minmax(min(100%, 250px), 1fr)` for narrow docks.
  - Tree mode goes single-column (`data-treed`), and the 0.5.1
    `height:100%` row-equalizer is gone: in a mixed grid it stretched a lone
    card to a whole neighbouring subtree's height.
  - Review artifacts: live-GUI screenshots verified via headless CDP
    browser against the real session, not just the static mock.

## 0.5.1 (2026-09-11)

- Design: tree-aware height and real tree connectors (design-review pass
  after 0.5.0; implemented by the parent agent after three delegate
  attempts died on provider-gateway failures before making any change).
  - The chips region's 208px cap was tuned for two FLAT rows; a single
    parent + two nested children already overflowed it, scrolling the
    nested cards — the protagonists of the tree layout — half out of view.
    The cap now stays 208px for flat docks and grows to `min(320px, 38vh)`
    once any card carries nested children (`data-treed` on the dock root).
  - The bare vertical rail becomes a real tree connector: short horizontal
    elbow ticks hook from the rail into each nested card.
  - Density steps down one generation (tighter padding, smaller radius on
    nested cards) so lineage reads at a glance without shrinking type.
  - Grid rows no longer stretch (`align-items: start`), and the inner
    scroll region stops chaining wheel scrolls to the conversation
    (`overscroll-behavior: contain`).

## 0.5.0 (2026-09-11)

- Feature: recursive subagent tree. The dock previously filtered
  `parentId === sessionId`, so a child's OWN subagents (grandchildren and
  deeper) were invisible even though their progress projections exist.
  Cards now render as a delegation tree: each card's nested children hang
  below it, indented with a guide rail. Mechanics:
  - `byParent` map + cycle-guarded descendant walk recovers the whole tree
    from the sessions store.
  - Structural visibility: a finished middle generation keeps its card as a
    tree connector while any descendant below it is still worth showing;
    when it expires, the gap collapses and the deeper node re-hangs from its
    nearest visible ancestor (or the dock root).
  - Each tree level owns its child-catalog subscription (navigation mode,
    retry/pause eligibility) and pulls it on demand via
    `refreshSubagents(parentId)` — which also makes the host advertise that
    level's children into the store.
  - Retry/Pause/Open address the real parent-child pair at any depth
    (`subagents.prompt` / `interruptByParent` / `openSubagent` with the
    node's own parentId).
  - Exit animations (0.4.5) work per level; a departing branch animates at
    its own level while surviving deeper nodes re-hang upward.

## 0.4.5 (2026-09-11)

- Feature: exit animation for the dock. Departing cards and orphan update
  rows previously hard-cut out of the layout (grace expiry, failure TTL,
  finding TTL, × dismissal); they now slide down 10px, fade out, and
  collapse their measured height over 260ms (`EXIT_MS`), so siblings and the
  composer glide up instead of jumping. A `useLeaving` hook keeps a frozen
  snapshot of each departed entry mounted for the animation window; an entry
  whose child shows new activity mid-exit is revived immediately. Respects
  `prefers-reduced-motion` (transition disabled, old instant behavior).

## 0.4.4 (2026-09-11)

- Fix: failure cards now expire after 1 hour (`FAILURE_TTL_MS`). Previously a
  failed child's card persisted with no TTL until manually dismissed, so
  failures from an incident that was already resolved re-rendered on every
  host restart / page load (observed: ~10 stale failure cards from a resolved
  provider-delisting incident nagging after every `dsh web` restart). The ×
  dismissal remains the "acknowledge" path; the TTL is the "stale" path.

## 0.4.3 (2026-09-11)

- Fix: Retry/Pause actually deliver (verified in the live GUI). The 0.4.2
  reroute accessed `ctx.remote.subagents` without declaring the dotted
  sub-service in the client inject list — cordis throws
  `cannot get property "remote.subagents" without inject`, killing the
  button silently. Declared (matching the official session-controller's
  inject list) and moved service resolution inside the error boundary.
- Control-channel failures now log detailed diagnostics (`console.error`
  with the host's rejection object) instead of failing silently.

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
