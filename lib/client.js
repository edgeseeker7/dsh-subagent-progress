/* dsh-subagent-progress (client half).
 *
 * Renders the subagent progress dock into the `conversation.input.dock` slot
 * (composer-aligned, directly above the composer card):
 *
 *   ┌ glass chips: one per RUNNING or FAILED subagent — status dot, label,
 *   │ turn/step, last tool, elapsed, latest preview. Nested generations
 *   │ (a child's own subagents) indent onto the parent's text axis, Apple
 *   │ outline style: no connector lines, a ▾/▸ disclosure chip on parents.
 *   │ Settled cards collapse to one slim row; a finding keeps its card in
 *   │ the tree for FINDING_TTL_MS. Departures slide down, fade, and
 *   │ collapse away (EXIT_MS); nothing lingers.
 *   └ updates: the freshest notify_user update per child lives inside its
 *     own card (or slim row). Updates from live cards go stale after
 *     UPDATE_STALE_MS. With nothing to show, the dock vanishes.
 *
 * Aesthetic direction: frosted-glass chips floating above the composer —
 * translucent blurred backgrounds on the host theme's surface color, a fine
 * top-highlight border, a breathing glow on running dots, tabular numerals
 * for the metrics. All colors come from the host's --dsw-* theme variables,
 * so light and dark themes both work. Tradeoff: backdrop-filter is used on
 * small elements only, negligible even on low-power devices.
 *
 * Hand-written in the __ModuleLoader__ factory format (no build step); React
 * is required from the host-provided module table.
 */
window.__ModuleLoader__.load({
  id: 'dsh-subagent-progress',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require('react');
    const h = React.createElement;
    // Host markdown primitive for update messages; absent → plain-text fallback.
    let MarkdownText = null;
    try {
      MarkdownText = require('@deepseek-ai/dsh-client-ui-primitives').MarkdownText ?? null;
    } catch {
      MarkdownText = null;
    }

    const NS = 'subagent-progress';
    /** How long a just-finished child's chip lingers before the dock hides. */
    const GRACE_MS = 30 * 1000;
    /** How long a finding keeps its (settled) card alive in the tree after posting. */
    const FINDING_TTL_MS = 3 * 60 * 1000;
    /** How long a failed child's card stays on screen before it expires. */
    const FAILURE_TTL_MS = 60 * 60 * 1000;
    /**
     * Exit animation budget: a departing card/update row slides down, fades,
     * and collapses its height inside this window before it is unmounted.
     * Keep in sync with the .dsh-sp-leaving transition durations below.
     */
    const EXIT_MS = 260;
    /** A live card stops showing an update this old — stale news is not news. */
    const UPDATE_STALE_MS = 10 * 60 * 1000;
    /** Dismissals persist across page switches; entries older than this are pruned. */
    const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

    /** Per-session localStorage key for card dismissals. */
    const dismissKey = (sessionId) => `dsh-subagent-progress:dismissals:${sessionId}`;
    /** Load childId → dismissed-at map, pruning expired entries. Fails closed. */
    const loadDismissals = (sessionId) => {
      try {
        const raw = window.localStorage.getItem(dismissKey(sessionId));
        if (raw === null) return {};
        const parsed = JSON.parse(raw);
        const now = Date.now();
        const out = {};
        for (const [id, at] of Object.entries(parsed)) {
          if (typeof at === 'number' && now - at < DISMISS_TTL_MS) out[id] = at;
        }
        return out;
      } catch {
        return {};
      }
    };
    /** Persist the dismissal map; storage failures (private mode) are ignored. */
    const saveDismissals = (sessionId, map) => {
      try {
        window.localStorage.setItem(dismissKey(sessionId), JSON.stringify(map));
      } catch {
        /* storage unavailable: dismissal stays session-local only */
      }
    };

    const zh = {
      'dock.aria': '子代理进度',
      'chip.turn': '轮 {turn}',
      'chip.step': '步 {step}',
      'chip.running': '运行中',
      'chip.idle': '空闲',
      'chip.stalled': '{minutes} 分钟无新事件',
      'chip.failed': '失败',
      'action.retry': '重试',
      'action.retrying': '重试中…',
      'action.pause': '暂停',
      'action.pausing': '暂停中…',
      'action.retryPrompt': '继续:上一轮运行因错误中断,请从断点继续完成任务。',
      'chip.open': '打开子代理会话',
      'duration.seconds': '{seconds}s',
      'duration.minutes': '{minutes}m{seconds}s',
      'duration.hours': '{hours}h{minutes}m',
      'kind.progress': '进展',
      'kind.eta': '预期',
      'kind.finding': '发现',
      'card.close': '关闭此卡片,有新活动时重新出现',
      'tree.toggle': '展开或收起下级子代理',
      'md.copy': '复制',
      'md.copied': '已复制',
      'md.footnotes': '脚注',
    };
    const en = {
      'dock.aria': 'Subagent progress',
      'chip.turn': 'turn {turn}',
      'chip.step': 'step {step}',
      'chip.running': 'running',
      'chip.idle': 'idle',
      'chip.stalled': 'no new events for {minutes}m',
      'chip.failed': 'failed',
      'action.retry': 'Retry',
      'action.retrying': 'Retrying…',
      'action.pause': 'Pause',
      'action.pausing': 'Pausing…',
      'action.retryPrompt': 'Continue: the previous turn failed with an error; resume the task from where it stopped.',
      'chip.open': 'Open subagent session',
      'duration.seconds': '{seconds}s',
      'duration.minutes': '{minutes}m {seconds}s',
      'duration.hours': '{hours}h {minutes}m',
      'kind.progress': 'progress',
      'kind.eta': 'eta',
      'kind.finding': 'finding',
      'card.close': 'Dismiss this card; reappears on new activity',
      'tree.toggle': 'Expand or collapse child subagents',
      'md.copy': 'Copy',
      'md.copied': 'Copied',
      'md.footnotes': 'Footnotes',
    };

    const CSS = `
/* Geometry identical to the official input.dock children (todo list,
   attachment tray): same width formula, same inset, so the dock's edges line
   up exactly with the composer card and its sibling docks. The information
   density comes from the card layout, not from outgrowing the composer. */
.dsh-sp-dock {
  box-sizing: border-box;
  position: relative;
  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));
  max-width: calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));
  margin: 0 auto;
  padding: 0 var(--dsh-composer-dock-inset);
  display: flex; flex-direction: column; gap: 6px;
  animation: dsh-sp-enter .24s ease-out;
}
@keyframes dsh-sp-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ---- exit: slide down + fade + measured height collapse ----
   A departing card/row keeps its snapshot mounted inside a .dsh-sp-leaving
   wrapper; JS measures the height once, then the transition carries it to
   zero so siblings and the composer glide up instead of jumping. */
.dsh-sp-leaving {
  overflow: hidden; pointer-events: none;
  transition:
    max-height .26s cubic-bezier(.4, 0, .2, 1),
    opacity .18s ease-in,
    transform .26s cubic-bezier(.4, 0, .2, 1);
}
.dsh-sp-leaving-out { opacity: 0; transform: translateY(10px); }
/* The wrapper replaces the card as grid/flex child; keep the card filling it. */
.dsh-sp-leaving > .dsh-sp-card { width: 100%; box-sizing: border-box; }
@media (prefers-reduced-motion: reduce) {
  .dsh-sp-leaving { transition: none; }
  .dsh-sp-dock { animation: none; }
  .dsh-sp-dot.dsh-sp-live, .dsh-sp-dot.dsh-sp-stalled { animation: none; }
}

/* ---- glass cards: uniform grid, any count aligns ---- */
.dsh-sp-chips {
  display: grid;
  /* min() guard: a dock narrower than 250px must not overflow horizontally. */
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
  gap: 8px;
  /* Two rows visible, more scroll inside the dock. */
  max-height: 208px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
/* Flat rows stretch and equalize; tree rows keep natural heights. */
.dsh-sp-dock:not([data-treed]) .dsh-sp-chips > .dsh-sp-subtree > .dsh-sp-card {
  height: 100%; box-sizing: border-box;
}
/* Trees read as one vertical outline, not a card mosaic: single column. */
.dsh-sp-dock[data-treed] .dsh-sp-chips { grid-template-columns: 1fr; align-items: start; }
/* Trees grow taller than flat rows ever did: once any card carries nested
   children (dock[data-treed]), the scroll region stretches to fit a parent
   plus its first generation — nested cards are the protagonist of the tree
   layout, they must not open scrolled half out of view. Viewport-capped so
   small windows keep the composer visible. */
.dsh-sp-dock[data-treed] .dsh-sp-chips { max-height: min(320px, 38vh); }
/* Nested generations: a child's own subagents hang below its card, indented
   with a guide rail, so recursive delegation stays visible at any depth. */
.dsh-sp-subtree { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dsh-sp-nested {
  display: flex; flex-direction: column; gap: 6px; min-width: 0;
  /* Apple outline grammar: NO connector lines (NSOutlineView/Finder never
     draw them — that is Windows Explorer's dialect). Hierarchy is expressed
     by indenting the child's card edge exactly onto the parent's TEXT axis
     (padding 12 + dot 7 + gap 7 = 26px), plus a disclosure chip on the
     parent's head. */
  margin-left: 26px; padding-left: 0;
}
/* Disclosure chip on parent cards: ▸/▾ + child count, click toggles the
   subtree — the Apple outline affordance, and a screen-space valve. */
.dsh-sp-disclosure {
  flex: none; display: inline-flex; align-items: center; gap: 3px;
  padding: 0 5px; border-radius: 6px;
  font-size: 11px; font-variant-numeric: tabular-nums; line-height: 16px;
  color: var(--dsw-alias-label-tertiary); cursor: pointer;
}
.dsh-sp-disclosure:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-sp-disclosure:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4176e6);
  outline-offset: 1px;
}
.dsh-sp-disclosure-chevron {
  display: inline-block; font-size: 9px; line-height: 1;
  transition: transform .15s ease-out;
}
.dsh-sp-disclosure-chevron[data-collapsed] { transform: rotate(-90deg); }
@media (prefers-reduced-motion: reduce) {
  .dsh-sp-disclosure-chevron { transition: none; }
}
/* Lineage is expressed by the rail and indent alone — nested cards keep the
   parent's padding so every generation shares the same text axis, and drop
   the shell shadow so connectors read louder than decoration. */
.dsh-sp-nested .dsh-sp-card {
  border-radius: 12px;
  /* Keep the hairline, drop the ambient lift. */
  box-shadow: inset 0 1px 0 rgba(255,255,255,.18);
}

/* ---- slim rows: settled, healthy cards collapse to one line ----
   Progressive disclosure: running and failed cards are the protagonists and
   keep the full layout; an idle/grace card (optionally carrying a finding)
   is context, so it becomes a single 30px row instead of a ~90px card. */
.dsh-sp-slim { padding-top: 5px; padding-bottom: 5px; }
.dsh-sp-slim .dsh-sp-label { flex: none; max-width: 34%; }
.dsh-sp-slim-update {
  display: flex; align-items: baseline; gap: 6px; min-width: 0; flex: 1;
  font-size: var(--dsh-content-font-size-secondary, 13px); line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dsh-sp-slim-update-text {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-sp-card {
  min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
  padding: 7px 12px; border-radius: 14px;
  font-size: var(--dsh-content-font-size-secondary, 13px); line-height: 18px; color: var(--dsw-alias-label-secondary);
  text-align: left;
  background: color-mix(in srgb, var(--dsw-specific-menu, rgba(255,255,255,.72)) 62%, transparent);
  -webkit-backdrop-filter: blur(12px) saturate(1.5);
  backdrop-filter: blur(12px) saturate(1.5);
  /* Hairline as a FRACTIONAL BORDER, not the composer's 0.5px ring shadow:
     a spread ring bunches at tight corner radii (the corners read darker
     than the straight edges — the user spotted exactly that). A border
     never spreads, so corners stay uniform; at 0.5px it is one physical
     pixel on retina, the same crispness as the composer's ring. Color from
     label-primary at 10% so dark mode gets 10% white. */
  border: 0.5px solid color-mix(in srgb, var(--dsw-alias-label-primary, #1c1f26) 10%, transparent);
  box-shadow:
    0 4px 16px rgba(15,18,30,.03),
    inset 0 1px 0 rgba(255,255,255,.22);
  cursor: pointer; overflow: hidden;
  transition: transform .15s ease-out, box-shadow .15s ease-out, border-color .15s ease-out;
}
.dsh-sp-card:hover {
  color: var(--dsw-alias-label-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-label-primary, #1c1f26) 18%, transparent);
  box-shadow:
    0 4px 12px rgba(15,18,30,.12),
    inset 0 1px 0 rgba(255,255,255,.3);
}
/* Focus is a crisp outline, never a shadow-shift or translate: an interface
   about alignment must not move when inspected. */
.dsh-sp-card:focus-visible {
  color: var(--dsw-alias-label-primary);
  outline: 2px solid var(--dsw-alias-state-business-primary, #4176e6);
  outline-offset: 2px;
}
.dsh-sp-card-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
.dsh-sp-status {
  flex: none; margin-left: auto;
  font-size: 11px; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary); white-space: nowrap;
}
.dsh-sp-dot {
  width: 7px; height: 7px; border-radius: 50%; flex: none;
  background: var(--dsw-alias-label-dimmed, #9aa0ab);
}
.dsh-sp-dot.dsh-sp-live {
  background: var(--dsw-alias-state-business-primary, #4176e6);
  animation: dsh-sp-pulse 1.7s ease-in-out infinite;
}
@keyframes dsh-sp-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 45%, transparent); }
  55% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 0%, transparent); }
}
/* Running but silent for a while: amber means "no new events", a stall
   warning rather than a decoration; slower, calmer pulse than active work. */
.dsh-sp-dot.dsh-sp-stalled {
  background: var(--dsw-alias-state-warn-primary, #f59e0b);
  animation: dsh-sp-pulse-stalled 2.6s ease-in-out infinite;
}
@keyframes dsh-sp-pulse-stalled {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-warn-primary, #f59e0b) 40%, transparent); }
  55% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--dsw-alias-state-warn-primary, #f59e0b) 0%, transparent); }
}
/* Turn failure: error dot + distilled one-liner + explicit actions, so a
   dead child (e.g. 429 overload) never just silently vanishes. */
/* Failed dot is static: an alarm that never stops ringing becomes noise,
   and the failure TTL already bounds how long the card stays. */
.dsh-sp-dot.dsh-sp-failed {
  background: var(--dsw-alias-state-error-primary, #e5484d);
}
@keyframes dsh-sp-pulse-failed {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-error-primary, #e5484d) 40%, transparent); }
  55% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--dsw-alias-state-error-primary, #e5484d) 0%, transparent); }
}
.dsh-sp-failure {
  margin-left: 14px;
  font-size: 11px; line-height: 1.5;
  color: var(--dsw-alias-state-error-primary, #e5484d);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* Actions sit inline in the card head (between status and ×): compact,
   non-shrinking, same baseline as the status text. */
.dsh-sp-card-actions {
  display: flex; gap: 4px; align-items: center; flex: none;
}
.dsh-sp-action {
  appearance: none; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.5));
  background: transparent; border-radius: 999px;
  padding: 0 8px; font-size: 11px; line-height: 17px;
  color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.dsh-sp-action:hover {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-tertiary);
}
.dsh-sp-action-primary {
  color: var(--dsw-alias-state-business-primary, #4176e6);
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 55%, transparent);
}
.dsh-sp-action-primary:hover {
  color: var(--dsw-alias-state-business-primary, #4176e6);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 10%, transparent);
}
.dsh-sp-action[data-busy='true'] {
  opacity: .55; pointer-events: none;
}
.dsh-sp-label {
  font-weight: 600; color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* One shared text axis: every body row starts where the title text starts
   (status dot 7px + head gap 7px = 14px in from the card padding). Without
   this, title/meta/preview/update each start on a different left line and
   the card reads as misaligned ("上下对不齐"). */
.dsh-sp-meta {
  margin-left: 14px;
  font-variant-numeric: tabular-nums; font-size: 11px;
  color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-sp-preview {
  margin-left: 14px;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size-secondary, 13px); line-height: 17px;
  min-height: 17px;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
  overflow: hidden; overflow-wrap: anywhere; white-space: nowrap; text-overflow: ellipsis;
}
/* The child's latest update lives inside its own card, separated by a
   hairline — one element per subagent, no competing rows. The hairline
   bleeds to the card edges while the content joins the shared text axis. */
.dsh-sp-card-update {
  display: flex; align-items: baseline; gap: 7px; min-width: 0;
  margin: 4px -12px 0; padding: 4px 12px 0 26px;
  border-top: .5px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25));
  font-size: var(--dsh-content-font-size-secondary, 13px); line-height: 18px;
}
.dsh-sp-card-update-empty {
  color: var(--dsw-alias-label-tertiary);
}
.dsh-sp-card-update-message {
  min-width: 0; flex: 1; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: normal; text-overflow: ellipsis;
  overflow: hidden; max-height: 36px;
}
/* One type scale across the whole dock: MarkdownText brings the host's
   markdown typography (~14px), which reads as a different font next to the
   card's 11-12px chrome. Force its descendants to inherit our scale;
   code/pre keep their monospace family. */
.dsh-sp-card-update-message :where(*:not(code):not(pre):not(kbd)) {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}
.dsh-sp-card-update-message :where(p, ul, ol) { margin: 0; }
.dsh-sp-card-update-message :where(ul, ol) { padding-left: 18px; }
.dsh-sp-card-update-message :where(pre) {
  margin: 4px 0; padding: 6px 8px; border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover);
  overflow-x: auto; font-size: 11.5px;
}
.dsh-sp-card-update-message :where(code) { font-size: 11.5px; }

.dsh-sp-kind {
  flex: none; display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600; line-height: 16px;
  color: var(--dsh-sp-kind, var(--dsw-alias-state-business-primary, #4176e6));
  background: color-mix(in srgb, var(--dsh-sp-kind, var(--dsw-alias-state-business-primary, #4176e6)) 13%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsh-sp-kind, var(--dsw-alias-state-business-primary, #4176e6)) 30%, transparent);
}

/* Per-card close affordance. */
.dsh-sp-card-close {
  flex: none; width: 24px; height: 24px; padding: 0;
  display: grid; place-items: center;
  border: 0; border-radius: 999px; background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px; font-weight: 600; line-height: 1; cursor: pointer;
  transition: color .12s, background-color .12s;
}
.dsh-sp-card-close:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-sp-card-close:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4176e6);
  outline-offset: 1px;
}

/* ---- hover popover for clamped update content ---- */
.dsh-sp-pop {
  position: fixed; z-index: 100;
  width: min(520px, calc(100vw - 32px));
  max-height: 280px; overflow-y: auto; scrollbar-width: thin;
  padding: 10px 14px; border-radius: 14px;
  font-size: 12.5px; line-height: 19px; color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-specific-menu, rgba(255,255,255,.94)) 94%, transparent);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
  backdrop-filter: blur(16px) saturate(1.6);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1, rgba(127,127,127,.35)) 75%, transparent);
  box-shadow: 0 8px 32px rgba(15,18,30,.16), inset 0 1px 0 rgba(255,255,255,.25);
  animation: dsh-sp-pop-in .16s ease-out;
}
@keyframes dsh-sp-pop-in {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
.dsh-sp-pop-head {
  display: flex; align-items: center; gap: 8px; margin-bottom: 5px;
}
.dsh-sp-pop-label {
  font-weight: 600; color: var(--dsw-alias-label-primary); font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-sp-pop-body :where(p, ul, ol) { margin: 0 0 4px; }
.dsh-sp-pop-body :where(p:last-child, ul:last-child, ol:last-child) { margin-bottom: 0; }
.dsh-sp-pop-body :where(ul, ol) { padding-left: 18px; }
.dsh-sp-pop-body :where(pre) {
  margin: 4px 0; padding: 6px 8px; border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover);
  overflow-x: auto; font-size: 11.5px;
}
.dsh-sp-pop-body :where(code) { font-size: 11.5px; }
.dsh-sp-pop-body :where(*:not(code):not(pre):not(kbd)) { font-family: inherit; }

/* ---- responsive ---- */
@media (max-width: 720px) {
  .dsh-sp-preview { -webkit-line-clamp: 1; }
}
`;

    // Official-style injection at module materialization: tagged so the client
    // module system can claim the stylesheet across HMR reloads.
    const CSS_TAG_ID = 'dsh-subagent-progress/dock.css';
    if (
      typeof document !== 'undefined' &&
      document.querySelector(`style[data-plugin-css=${JSON.stringify(CSS_TAG_ID)}]`) === null
    ) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-subagent-progress';
      tag.dataset.pluginCss = CSS_TAG_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    const KIND_COLOR = {
      progress: 'var(--dsw-alias-state-business-primary, #4176e6)',
      eta: 'var(--dsw-alias-state-warn-primary, #f59e0b)',
      finding: 'var(--dsw-alias-state-success-primary, #22c55e)',
    };

    function formatDuration(ms, t) {
      const seconds = Math.max(0, Math.round(ms / 1000));
      if (seconds < 60) return t('duration.seconds', { seconds });
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return t('duration.minutes', { minutes, seconds: seconds % 60 });
      return t('duration.hours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
    }

    function childLabel(summary) {
      const identity = summary.projectionValues?.subagent;
      if (identity && typeof identity.label === 'string' && identity.label !== '') return identity.label;
      if (typeof summary.title === 'string' && summary.title !== '') return summary.title;
      if (typeof summary.displayTitle === 'string' && summary.displayTitle !== '') return summary.displayTitle;
      return summary.id.slice(0, 8);
    }

    function isLive(summary) {
      return summary.running === true || summary.projectionValues?.subagentProgress?.active === true;
    }

    /** Card ordering within one tree level: live first, then failures, then freshest activity. */
    function compareCards(a, b) {
      const liveDiff = (isLive(b) ? 1 : 0) - (isLive(a) ? 1 : 0);
      if (liveDiff !== 0) return liveDiff;
      const failA = a.projectionValues?.subagentProgress?.failure ? 1 : 0;
      const failB = b.projectionValues?.subagentProgress?.failure ? 1 : 0;
      if (failB !== failA) return failB - failA;
      return (
        (b.projectionValues?.subagentProgress?.updatedAt ?? 0) - (a.projectionValues?.subagentProgress?.updatedAt ?? 0)
      );
    }

    /** A live child with no meaningful events for this long reads as stalled. */
    const STALL_MS = 5 * 60 * 1000;

    /**
     * Structured progress from the child's own todo list (official `todos`
     * projection): done/total plus the current open item's content — the most
     * semantic progress signal short of a model-authored update.
     */
    function todoProgress(summary) {
      const todos = summary.projectionValues?.todos;
      if (!Array.isArray(todos) || todos.length === 0) return null;
      const done = todos.filter((item) => item?.status === 'completed').length;
      const current = todos.find((item) => item?.status !== 'completed');
      return { done, total: todos.length, current: typeof current?.content === 'string' ? current.content : null };
    }

    /** Format the latest action as `name: arg`, preferring the distilled key argument. */
    function formatAction(progress) {
      const action = progress?.lastAction;
      if (!action) return progress?.lastTool ?? null;
      if (action.name === 'bash' || action.name === 'pwsh')
        return action.arg ? `${action.name}: ${action.arg}` : action.name;
      return action.arg ? `${action.name} ${action.arg}` : action.name;
    }

    function UpdateBody({ update, t }) {
      return h(
        MarkdownText !== null ? MarkdownText : FallbackText,
        MarkdownText !== null
          ? {
              text: update.message,
              labels: {
                code: { copyLabel: t('md.copy'), copiedLabel: t('md.copied') },
                footnotes: t('md.footnotes'),
              },
            }
          : { text: update.message },
      );
    }

    function FallbackText({ text }) {
      return h('span', {}, text);
    }

    function Chip({
      summary,
      now,
      openChild,
      t,
      update,
      onUpdateHover,
      onUpdateLeave,
      onDismiss,
      onRetry,
      onPause,
      busy,
      canControl,
      childCount = 0,
      collapsed = false,
      onToggleCollapse = () => {},
    }) {
      const progress = summary.projectionValues?.subagentProgress;
      const timing = summary.projectionValues?.subagentTiming;
      const live = isLive(summary);
      const failure = live ? null : (progress?.failure ?? null);
      const stalled =
        live &&
        typeof progress?.updatedAt === 'number' &&
        progress.updatedAt > 0 &&
        now - progress.updatedAt > STALL_MS;
      let elapsed = null;
      if (timing?.active) elapsed = now - timing.active.since;
      else if (typeof timing?.settledMs === 'number' && timing.settledMs > 0) elapsed = timing.settledMs;

      const todos = todoProgress(summary);
      const action = formatAction(progress);

      // Head carries status + elapsed; the meta line is pure progress info.
      const meta = [];
      if (progress && progress.turn > 0) {
        meta.push(`${t('chip.turn', { turn: progress.turn })}·${t('chip.step', { step: progress.step })}`);
      }
      if (todos !== null) meta.push(`${todos.done}/${todos.total}`);
      if (action) meta.push(action);

      // Content-driven rows: the grid's stretch alignment keeps same-row
      // cards equal-height, so rows that have nothing to say simply do not
      // render — no "nothing here yet" placeholder text anywhere.
      const stripMarkers = (text) =>
        text
          ?.replace(/[*`#]+/g, '')
          .replace(/\s+/g, ' ')
          .trim() || null;
      const preview = stripMarkers(todos?.current);
      const fallbackText = update ? null : (stripMarkers(progress?.lastText) ?? null);

      const dotClass = stalled
        ? 'dsh-sp-dot dsh-sp-stalled'
        : live
          ? 'dsh-sp-dot dsh-sp-live'
          : failure !== null
            ? 'dsh-sp-dot dsh-sp-failed'
            : 'dsh-sp-dot';
      const title = stalled
        ? `${t('chip.open')} · ${t('chip.stalled', { minutes: Math.floor((now - progress.updatedAt) / 60000) })}`
        : t('chip.open');

      const statusText = [
        live ? t('chip.running') : failure !== null ? t('chip.failed') : t('chip.idle'),
        elapsed !== null ? formatDuration(elapsed, t) : null,
      ]
        .filter(Boolean)
        .join(' · ');

      // Apple outline affordance on parents: ▸/▾ + count toggles the subtree.
      const disclosure =
        childCount > 0
          ? h(
              'span',
              {
                role: 'button',
                tabIndex: 0,
                className: 'dsh-sp-disclosure',
                title: t('tree.toggle'),
                'aria-expanded': !collapsed,
                onClick: (event) => {
                  event.stopPropagation();
                  onToggleCollapse();
                },
                onKeyDown: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleCollapse();
                  }
                },
              },
              h('span', { className: 'dsh-sp-disclosure-chevron', 'data-collapsed': collapsed || undefined }, '▾'),
              String(childCount),
            )
          : null;

      // Slim mode: a settled, healthy child (idle or past grace, no failure)
      // is context, not a protagonist — one line carrying its finding instead
      // of a full card. Screen real estate belongs to whoever is running.
      if (!live && failure === null) {
        return h(
          'button',
          {
            type: 'button',
            className: 'dsh-sp-card dsh-sp-slim',
            title,
            onClick: () => openChild(summary.id),
          },
          h(
            'span',
            { className: 'dsh-sp-card-head' },
            h('span', { className: dotClass }),
            h('span', { className: 'dsh-sp-label' }, childLabel(summary)),
            disclosure,
            update
              ? h(
                  'span',
                  {
                    className: 'dsh-sp-slim-update',
                    style: { '--dsh-sp-kind': KIND_COLOR[update.kind] ?? KIND_COLOR.progress },
                    onMouseEnter: (event) =>
                      onUpdateHover({ summary, update, rect: event.currentTarget.getBoundingClientRect() }),
                    onMouseLeave: onUpdateLeave,
                  },
                  h('span', { className: 'dsh-sp-kind' }, t(`kind.${update.kind}`)),
                  h('span', { className: 'dsh-sp-slim-update-text' }, h(UpdateBody, { update, t })),
                )
              : null,
            h('span', { className: 'dsh-sp-status' }, statusText),
            h(
              'span',
              {
                role: 'button',
                tabIndex: 0,
                className: 'dsh-sp-card-close',
                title: t('card.close'),
                'aria-label': t('card.close'),
                onClick: (event) => {
                  event.stopPropagation();
                  onDismiss();
                },
                onKeyDown: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onDismiss();
                  }
                },
              },
              '×',
            ),
          ),
        );
      }

      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-sp-card',
          title,
          onClick: () => openChild(summary.id),
        },
        h(
          'span',
          { className: 'dsh-sp-card-head' },
          h('span', { className: dotClass }),
          h('span', { className: 'dsh-sp-label' }, childLabel(summary)),
          disclosure,
          h('span', { className: 'dsh-sp-status' }, statusText),
          // Control buttons exist only where the official protocol can honor
          // them: subagents.prompt / interruptByParent accept continuable
          // children only — one-shot (workflow) children get no dead buttons.
          // They live in the head: a body-level actions row made cards with
          // controls taller than their siblings, breaking the row rhythm.
          canControl && (failure !== null || live)
            ? h(
                'span',
                { key: 'actions', className: 'dsh-sp-card-actions' },
                failure !== null
                  ? h(
                      'span',
                      {
                        role: 'button',
                        tabIndex: 0,
                        className: 'dsh-sp-action dsh-sp-action-primary',
                        'data-busy': busy === 'retry' ? 'true' : 'false',
                        onClick: (event) => {
                          event.stopPropagation();
                          onRetry();
                        },
                        onKeyDown: (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            onRetry();
                          }
                        },
                      },
                      busy === 'retry' ? t('action.retrying') : t('action.retry'),
                    )
                  : null,
                live
                  ? h(
                      'span',
                      {
                        role: 'button',
                        tabIndex: 0,
                        className: 'dsh-sp-action',
                        'data-busy': busy === 'pause' ? 'true' : 'false',
                        onClick: (event) => {
                          event.stopPropagation();
                          onPause();
                        },
                        onKeyDown: (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            onPause();
                          }
                        },
                      },
                      busy === 'pause' ? t('action.pausing') : t('action.pause'),
                    )
                  : null,
              )
            : null,
          h(
            'span',
            {
              role: 'button',
              tabIndex: 0,
              className: 'dsh-sp-card-close',
              title: t('card.close'),
              'aria-label': t('card.close'),
              onClick: (event) => {
                event.stopPropagation();
                onDismiss();
              },
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onDismiss();
                }
              },
            },
            '×',
          ),
        ),
        h('span', { className: 'dsh-sp-meta' }, meta.join(' · ')),
        preview !== null ? h('span', { className: 'dsh-sp-preview' }, preview) : null,
        failure !== null
          ? h(
              'span',
              {
                key: 'failure',
                className: 'dsh-sp-failure',
                onMouseEnter: (event) =>
                  onUpdateHover({
                    summary,
                    update: { kind: null, message: failure.full, at: failure.at },
                    rect: event.currentTarget.getBoundingClientRect(),
                  }),
                onMouseLeave: onUpdateLeave,
              },
              failure.message,
            )
          : null,
        update !== null && update !== undefined
          ? h(
              'span',
              {
                className: 'dsh-sp-card-update',
                style: { '--dsh-sp-kind': KIND_COLOR[update.kind] ?? KIND_COLOR.progress },
                onMouseEnter: (event) =>
                  onUpdateHover({ summary, update, rect: event.currentTarget.getBoundingClientRect() }),
                onMouseLeave: onUpdateLeave,
              },
              h('span', { className: 'dsh-sp-kind' }, t(`kind.${update.kind}`)),
              h('span', { className: 'dsh-sp-card-update-message' }, h(UpdateBody, { update, t })),
            )
          : fallbackText !== null
            ? h(
                'span',
                {
                  className: 'dsh-sp-card-update dsh-sp-card-update-empty',
                  onMouseEnter: (event) =>
                    onUpdateHover({
                      summary,
                      update: { kind: null, message: progress?.lastText ?? '', at: progress?.updatedAt ?? 0 },
                      rect: event.currentTarget.getBoundingClientRect(),
                    }),
                  onMouseLeave: onUpdateLeave,
                },
                h('span', { className: 'dsh-sp-card-update-message' }, fallbackText),
              )
            : null,
      );
    }

    /**
     * Exit-animation keeper: tracks the entries rendered last pass, and when
     * one vanishes from the live list it stays returned (keyed, with its last
     * props snapshot) for EXIT_MS so the caller can mount it inside a Leaving
     * wrapper. An entry whose key reappears (new activity mid-exit) is
     * filtered back out immediately.
     */
    function useLeaving(entries, keyOf) {
      const [departed, setDeparted] = React.useState([]);
      const prevKeysRef = React.useRef(null);
      const snapshotRef = React.useRef(new Map());
      const keySet = new Set();
      const snapshot = new Map();
      for (const entry of entries) {
        const key = keyOf(entry);
        keySet.add(key);
        snapshot.set(key, entry);
      }
      snapshotRef.current = snapshot;
      const signature = [...keySet].sort().join('|');
      React.useEffect(() => {
        const previous = prevKeysRef.current;
        prevKeysRef.current = keySet;
        if (previous === null) return undefined;
        const gone = [...previous].filter((key) => !keySet.has(key));
        if (gone.length === 0) return undefined;
        const leaving = [];
        for (const key of gone) {
          const entry = snapshotRef.current.get(key);
          if (entry !== undefined) leaving.push({ key, entry });
        }
        if (leaving.length === 0) return undefined;
        setDeparted((current) => [...current, ...leaving]);
        const timer = setTimeout(() => {
          setDeparted((current) => current.filter((item) => !leaving.includes(item)));
        }, EXIT_MS + 80);
        return () => clearTimeout(timer);
      }, [signature]);
      return departed.filter((item) => !keySet.has(item.key));
    }

    /**
     * Exit wrapper: measures its height on mount, then transitions max-height
     * to zero while the .dsh-sp-leaving-out class slides the content down and
     * fades it out — the "disappear downward" motion instead of a hard cut.
     */
    function Leaving({ children }) {
      const ref = React.useRef(null);
      React.useEffect(() => {
        const el = ref.current;
        if (el === null) return;
        el.style.maxHeight = `${el.scrollHeight}px`;
        void el.offsetHeight; // flush styles so the transition has a start value
        el.classList.add('dsh-sp-leaving-out');
        el.style.maxHeight = '0px';
      }, []);
      return h('div', { ref, className: 'dsh-sp-leaving', 'aria-hidden': 'true' }, children);
    }

    /**
     * One nested tree level: the visible children of parentId, each followed
     * recursively by its own level. Every level owns its catalog subscription
     * (navigation mode / control eligibility for ITS children) and its own
     * useLeaving list, so exit animations work at any depth. `trail` carries
     * the ancestor ids as a cycle guard against a pathological parent loop.
     */
    function SubtreeCards({
      parentId,
      trail,
      kidsOf,
      updateByChild,
      now,
      openChild,
      actOnChild,
      busyChildren,
      dismissChild,
      onUpdateHover,
      onUpdateLeave,
      refreshCatalog,
      useSessions,
      collapsedIds,
      toggleCollapse,
      t,
    }) {
      const catalog = useSessions((state) => state.subagentsByParent[parentId]);
      // Pull this level's child catalog once: it delivers the navigation mode
      // AND makes the host advertise this child's own children (grandchildren
      // of the dock's session) into the sessions store.
      React.useEffect(() => {
        if (catalog === undefined) void refreshCatalog?.(parentId);
      }, [catalog, parentId, refreshCatalog]);
      const modeOf = (childId) =>
        catalog?.entries?.find((entry) => entry.kind === 'child' && entry.id === childId)?.mode ?? null;
      const kids = (kidsOf.get(parentId) ?? []).filter((summary) => !trail.includes(summary.id)).sort(compareCards);
      const entries = kids.map((summary) => ({ summary, update: updateByChild.get(summary.id) ?? null }));
      const leaving = useLeaving(entries, (entry) => entry.summary.id);
      if (entries.length === 0 && leaving.length === 0) return null;
      const noop = () => {};
      const nested = (summary) =>
        collapsedIds.has(summary.id)
          ? null
          : h(SubtreeCards, {
              parentId: summary.id,
              trail: [...trail, summary.id],
              kidsOf,
              updateByChild,
              now,
              openChild,
              actOnChild,
              busyChildren,
              dismissChild,
              onUpdateHover,
              onUpdateLeave,
              refreshCatalog,
              useSessions,
              collapsedIds,
              toggleCollapse,
              t,
            });
      return h(
        'div',
        { className: 'dsh-sp-nested' },
        entries.map(({ summary, update }) =>
          h(
            'div',
            { key: summary.id, className: 'dsh-sp-subtree' },
            h(Chip, {
              summary,
              now,
              openChild: () => openChild(parentId, summary.id, modeOf(summary.id)),
              update,
              onUpdateHover,
              onUpdateLeave,
              onDismiss: () => dismissChild(summary.id),
              onRetry: () => actOnChild(parentId, summary.id, 'retry', modeOf(summary.id)),
              onPause: () => actOnChild(parentId, summary.id, 'pause', modeOf(summary.id)),
              busy: busyChildren[summary.id] ?? null,
              canControl: modeOf(summary.id) === 'continuable',
              childCount: (kidsOf.get(summary.id) ?? []).length,
              collapsed: collapsedIds.has(summary.id),
              onToggleCollapse: () => toggleCollapse(summary.id),
              t,
            }),
            nested(summary),
          ),
        ),
        leaving.map(({ key, entry }) =>
          h(
            Leaving,
            { key: `leaving:${key}` },
            h(Chip, {
              summary: entry.summary,
              now,
              openChild: noop,
              update: entry.update,
              onUpdateHover: noop,
              onUpdateLeave: noop,
              onDismiss: noop,
              onRetry: noop,
              onPause: noop,
              busy: null,
              canControl: false,
              t,
            }),
          ),
        ),
      );
    }

    function SubagentProgressDock({ sessionId, useSessions, openChild, controlChild, refreshCatalog, t }) {
      const byId = useSessions((state) => state.byId);
      const catalog = useSessions((state) => state.subagentsByParent[sessionId]);
      // Make sure the direct-child catalog is loaded: it decides both
      // navigation mode and whether control buttons exist at all.
      React.useEffect(() => {
        if (catalog === undefined) void refreshCatalog?.(sessionId);
      }, [catalog, sessionId]);
      const modeOf = (childId) =>
        // Only real children carry a navigation mode; diagnostic catalog
        // entries must fall through to the plain-open path.
        catalog?.entries?.find((entry) => entry.kind === 'child' && entry.id === childId)?.mode ?? null;
      // Parent → direct subagent children, for every subagent session the
      // client knows about. A grandchild (a child's own subagent) carries its
      // child's id as parentId, so the whole delegation tree is recoverable
      // from this one map.
      const byParent = React.useMemo(() => {
        const map = new Map();
        for (const summary of Object.values(byId)) {
          if (summary?.origin !== 'subagent' || typeof summary.parentId !== 'string') continue;
          const list = map.get(summary.parentId);
          if (list === undefined) map.set(summary.parentId, [summary]);
          else list.push(summary);
        }
        return map;
      }, [byId]);

      // Every descendant of this session (cycle-guarded): direct children
      // plus nested subagents at any depth.
      const allDescendants = React.useMemo(() => {
        const out = [];
        const seen = new Set([sessionId]);
        const visit = (parentId) => {
          for (const summary of byParent.get(parentId) ?? []) {
            if (seen.has(summary.id)) continue;
            seen.add(summary.id);
            out.push(summary);
            visit(summary.id);
          }
        };
        visit(sessionId);
        return out;
      }, [byParent, sessionId]);

      // Visibility contract: chips exist while their subagent runs, and a
      // just-finished child lingers for a short grace window (derived purely
      // from the projection's updatedAt, so it survives reloads). The update
      // bar surfaces the freshest update from a live or grace-period child,
      // or an important `finding` left behind by a finished one. Each card's
      // own × dismisses it — persisted across page switches — until THAT
      // child has newer activity.
      const running = React.useMemo(() => allDescendants.filter(isLive), [allDescendants]);

      const [now, setNow] = React.useState(() => Date.now());

      // A child whose last turn ended in an error (e.g. 429 overload) keeps
      // its card past the grace window — with retry/open actions — until the
      // user dismisses it, a new turn/start clears the failure durably, or
      // the failure ages out. Without an expiry, failures from an incident
      // that is already resolved would nag forever: the dock re-renders them
      // after every host restart / page load.
      const failed = React.useMemo(
        () =>
          allDescendants.filter((summary) => {
            if (isLive(summary)) return false;
            const failure = summary.projectionValues?.subagentProgress?.failure;
            return failure != null && now - failure.at <= FAILURE_TTL_MS;
          }),
        [allDescendants, now],
      );
      // Per-card dismissal: childId → epoch ms when its card was closed.
      // Persisted per session in localStorage so page switches cannot revive
      // dismissed cards; a child with NEWER activity than its dismissal
      // timestamp still comes back on its own.
      const [dismissedChildren, setDismissedChildren] = React.useState(() => loadDismissals(sessionId));
      React.useEffect(() => {
        setDismissedChildren(loadDismissals(sessionId));
      }, [sessionId]);
      const dismissChild = (childId) =>
        setDismissedChildren((map) => {
          const next = { ...map, [childId]: Date.now() };
          saveDismissals(sessionId, next);
          return next;
        });

      /** Per-card in-flight control action: childId → 'retry' | 'pause' | null. */
      const [busyChildren, setBusyChildren] = React.useState({});
      const actOnChild = async (parentId, childId, action, mode) => {
        setBusyChildren((map) => ({ ...map, [childId]: action }));
        try {
          const ok = await controlChild(parentId, childId, action, t('action.retryPrompt'));
          // The control channel could not reach the child: land the user in
          // the child's own session so the action can be taken manually.
          if (!ok) openChild(parentId, childId, mode);
        } finally {
          setBusyChildren((map) => ({ ...map, [childId]: null }));
        }
      };

      // Hover popover for clamped update content: 160ms intent delay to open,
      // 220ms grace to close so the pointer can travel onto the popover
      // itself (it may contain copyable code).
      const [hoverInfo, setHoverInfo] = React.useState(null);
      const hoverTimer = React.useRef(null);
      const onUpdateHover = (info) => {
        if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => setHoverInfo(info), 160);
      };
      const onUpdateLeave = () => {
        if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => setHoverInfo(null), 220);
      };
      const keepHoverOpen = () => {
        if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
      };
      React.useEffect(
        () => () => {
          if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
        },
        [],
      );

      const failedIds = new Set(failed.map((summary) => summary.id));
      const recentlyStopped = React.useMemo(
        () =>
          allDescendants.filter((summary) => {
            if (isLive(summary) || failedIds.has(summary.id)) return false;
            const updatedAt = summary.projectionValues?.subagentProgress?.updatedAt ?? 0;
            return updatedAt > 0 && now - updatedAt < GRACE_MS;
          }),
        [allDescendants, now],
      );

      const recentlyIds = new Set(recentlyStopped.map((summary) => summary.id));
      // A settled child carrying an unexpired finding keeps its place IN THE
      // TREE (slim row) for the finding's TTL: the conclusion stays on its
      // own branch instead of being torn out to a detached row at the dock
      // bottom. When the TTL lapses the card leaves with the exit animation.
      const findingHolders = allDescendants.filter((summary) => {
        if (isLive(summary) || failedIds.has(summary.id) || recentlyIds.has(summary.id)) return false;
        const finding = summary.projectionValues?.subagentProgress?.lastFinding;
        return finding != null && now - finding.at <= FINDING_TTL_MS;
      });

      // Set semantics only — per-level ordering happens at render via compareCards.
      const displayed = [...running, ...failed, ...recentlyStopped, ...findingHolders];

      const anyLive = running.length > 0;
      const graceActive = recentlyStopped.length > 0;

      // One unified card per child: the latest update lives INSIDE its card.
      // Updates from live/grace cards go stale after UPDATE_STALE_MS — a card
      // that has run for hours must not parade hour-old news as current.
      const updateByChild = new Map();
      for (const summary of allDescendants) {
        const progress = summary.projectionValues?.subagentProgress;
        const finding = progress?.lastFinding;
        const freshFinding = finding != null && now - finding.at <= FINDING_TTL_MS ? finding : null;
        const lastUpdate = progress?.lastUpdate ?? null;
        // Live/grace cards ride the freshest of (recent churn, sticky
        // finding); settled cards only an unexpired finding keeps alive.
        let update = null;
        if (isLive(summary) || recentlyIds.has(summary.id)) {
          if (lastUpdate !== null && now - lastUpdate.at <= UPDATE_STALE_MS) update = lastUpdate;
          if (freshFinding !== null && (update === null || freshFinding.at > update.at)) update = freshFinding;
        } else if (freshFinding !== null) {
          update = freshFinding;
        }
        if (update !== null) updateByChild.set(summary.id, update);
      }

      // Per-card dismissal: hidden until THAT child has newer activity.
      const childLastActivity = (summary) =>
        Math.max(summary.projectionValues?.subagentProgress?.updatedAt ?? 0, updateByChild.get(summary.id)?.at ?? 0);
      const isChildDismissed = (summary) => {
        const at = dismissedChildren[summary.id];
        return at !== undefined && childLastActivity(summary) <= at;
      };
      const visibleDisplayed = displayed.filter((summary) => !isChildDismissed(summary));

      // Structural visibility: a card stays mounted while it is
      // content-visible (running / failed / grace, not dismissed) OR any of
      // its descendants is — a finished middle generation keeps its card as
      // the tree connector while a grandchild below it is still worth showing.
      const structVisible = new Set(visibleDisplayed.map((summary) => summary.id));
      let grew = true;
      while (grew) {
        grew = false;
        for (const summary of allDescendants) {
          if (structVisible.has(summary.id)) continue;
          if ((byParent.get(summary.id) ?? []).some((child) => structVisible.has(child.id))) {
            structVisible.add(summary.id);
            grew = true;
          }
        }
      }

      // Tree gaps collapse: a visible node whose own parent is not visible
      // hangs from its nearest visible ancestor (or the dock root), so a
      // finished middle generation never orphans a running grandchild.
      const kidsOf = new Map();
      for (const summary of allDescendants) {
        if (!structVisible.has(summary.id)) continue;
        let parent = summary.parentId;
        const guard = new Set([summary.id]);
        while (parent !== sessionId && typeof parent === 'string' && !structVisible.has(parent) && !guard.has(parent)) {
          guard.add(parent);
          parent = byId[parent]?.parentId;
        }
        const key =
          typeof parent === 'string' && parent !== sessionId && structVisible.has(parent) ? parent : sessionId;
        const list = kidsOf.get(key);
        if (list === undefined) kidsOf.set(key, [summary]);
        else list.push(summary);
      }

      // Keep ticking while anything time-bound is on screen: grace cards, an
      // unexpired failure card, or a finding approaching its TTL must hide
      // themselves on schedule.
      const findingActive = findingHolders.length > 0;
      const failureActive = visibleDisplayed.some((summary) => failedIds.has(summary.id));
      React.useEffect(() => {
        if (!anyLive && !graceActive && !findingActive && !failureActive) return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
      }, [anyLive, graceActive, findingActive, failureActive]);

      // Root level: every visible node whose nearest visible ancestor is the
      // dock itself; deeper generations render through SubtreeCards below
      // their parent's card.
      const cardEntries = (kidsOf.get(sessionId) ?? [])
        .sort(compareCards)
        .map((summary) => ({ summary, update: updateByChild.get(summary.id) ?? null }));
      // Departing cards stay mounted (frozen at their last snapshot) for one
      // EXIT_MS window so they can slide out instead of hard-cutting.
      const leavingCards = useLeaving(cardEntries, (entry) => entry.summary.id);

      if (cardEntries.length === 0 && leavingCards.length === 0) return null;

      const noop = () => {};

      // Disclosure chips: per-node subtree collapse, session-local only.
      const [collapsedIds, setCollapsedIds] = React.useState(() => new Set());
      const toggleCollapse = (childId) =>
        setCollapsedIds((current) => {
          const next = new Set(current);
          if (next.has(childId)) next.delete(childId);
          else next.add(childId);
          return next;
        });

      // Any visible second-generation (or deeper) node → the dock carries a
      // tree: the chips region grows beyond the flat-era two-row cap.
      let anyNested = false;
      for (const [parentId, list] of kidsOf) {
        if (parentId !== sessionId && list.length > 0) {
          anyNested = true;
          break;
        }
      }

      return h(
        'div',
        {
          className: 'dsh-sp-dock',
          role: 'status',
          'aria-label': t('dock.aria'),
          'data-treed': anyNested || undefined,
        },
        cardEntries.length > 0 || leavingCards.length > 0
          ? h(
              'div',
              { className: 'dsh-sp-chips' },
              cardEntries.map(({ summary, update }) =>
                h(
                  'div',
                  { key: summary.id, className: 'dsh-sp-subtree' },
                  h(Chip, {
                    summary,
                    now,
                    openChild: () => openChild(sessionId, summary.id, modeOf(summary.id)),
                    update,
                    onUpdateHover,
                    onUpdateLeave,
                    onDismiss: () => dismissChild(summary.id),
                    onRetry: () => actOnChild(sessionId, summary.id, 'retry', modeOf(summary.id)),
                    onPause: () => actOnChild(sessionId, summary.id, 'pause', modeOf(summary.id)),
                    busy: busyChildren[summary.id] ?? null,
                    canControl: modeOf(summary.id) === 'continuable',
                    childCount: (kidsOf.get(summary.id) ?? []).length,
                    collapsed: collapsedIds.has(summary.id),
                    onToggleCollapse: () => toggleCollapse(summary.id),
                    t,
                  }),
                  collapsedIds.has(summary.id)
                    ? null
                    : h(SubtreeCards, {
                        parentId: summary.id,
                        trail: [summary.id],
                        kidsOf,
                        updateByChild,
                        now,
                        openChild,
                        actOnChild,
                        busyChildren,
                        dismissChild,
                        onUpdateHover,
                        onUpdateLeave,
                        refreshCatalog,
                        useSessions,
                        collapsedIds,
                        toggleCollapse,
                        t,
                      }),
                ),
              ),
              leavingCards.map(({ key, entry }) =>
                h(
                  Leaving,
                  { key: `leaving:${key}` },
                  h(Chip, {
                    summary: entry.summary,
                    now,
                    openChild: noop,
                    update: entry.update,
                    onUpdateHover: noop,
                    onUpdateLeave: noop,
                    onDismiss: noop,
                    onRetry: noop,
                    onPause: noop,
                    busy: null,
                    canControl: false,
                    t,
                  }),
                ),
              ),
            )
          : null,
        hoverInfo !== null && typeof window !== 'undefined'
          ? h(
              'div',
              {
                className: 'dsh-sp-pop',
                style: {
                  left: Math.max(16, Math.min(hoverInfo.rect.left, window.innerWidth - 540)),
                  bottom: window.innerHeight - hoverInfo.rect.top + 8,
                },
                onMouseEnter: keepHoverOpen,
                onMouseLeave: onUpdateLeave,
              },
              h(
                'div',
                { className: 'dsh-sp-pop-head' },
                hoverInfo.update.kind
                  ? h(
                      'span',
                      {
                        className: 'dsh-sp-kind',
                        style: { '--dsh-sp-kind': KIND_COLOR[hoverInfo.update.kind] ?? KIND_COLOR.progress },
                      },
                      t(`kind.${hoverInfo.update.kind}`),
                    )
                  : null,
                h('span', { className: 'dsh-sp-pop-label' }, childLabel(hoverInfo.summary)),
              ),
              h('div', { className: 'dsh-sp-pop-body' }, h(UpdateBody, { update: hoverInfo.update, t })),
            )
          : null,
      );
    }

    // cordis service-access guard: dotted sub-services must be injected by
    // their full name (the official session-controller declares both
    // 'remote' and 'remote.subagents' the same way).
    const inject = ['sessions', 'slots', 'locale', 'remote', 'remote.subagents'];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'subagent-progress: dictionaries');
      const sessions = ctx.sessions;
      /**
       * One control round-trip against a continuable child, through the
       * subagent remotes directly. The generic session prompt/cancel routes
       * refuse subagent-owned sessions by design ("owned by subagent
       * routing"), and the session face only routes through subagents.* once
       * the user has navigated into the child — so cards construct the
       * continuable address themselves. 'retry' queues a fresh turn (the
       * failed turn left the child idle, so queueing wakes it); 'pause'
       * interrupts the active turn. Returns false when the control channel
       * could not deliver, so the caller can fall back to opening the child.
       */
      const controlChild = async (parentSessionId, childId, action, promptText) => {
        try {
          const subagents = ctx.remote?.subagents;
          if (!subagents) {
            console.error('[subagent-progress] control channel unavailable: ctx.remote.subagents is missing');
            return false;
          }
          if (action === 'retry') {
            const result = await subagents.prompt({
              requestId: crypto.randomUUID(),
              parentSessionId,
              childSessionId: childId,
              mode: 'continuable',
              delivery: 'queue',
              content: [{ type: 'text', text: promptText }],
            });
            if (result?.ok !== true) {
              console.error('[subagent-progress] subagents.prompt rejected', { parentSessionId, childId, result });
              return false;
            }
            return true;
          }
          const result = await subagents.interruptByParent(childId, parentSessionId, 'continuable');
          if (result?.ok !== true) {
            console.error('[subagent-progress] subagents.interruptByParent rejected', {
              parentSessionId,
              childId,
              result,
            });
            return false;
          }
          return true;
        } catch (error) {
          console.error('[subagent-progress] control call threw', { parentSessionId, childId, action, error });
          return false;
        }
      };
      ctx.slots.inject('conversation.input.dock', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.dock',
            id: 'subagent-progress',
            order: 10,
            locale: NS,
            inject: (sessionId) => ({
              controlChild,
              // Per-level catalog pull: any tree level (root, child, …) asks
              // for ITS OWN parent id so nested catalogs load on demand.
              refreshCatalog: (parentId) => sessions.refreshSubagents?.(parentId ?? sessionId),
              openChild: (parentId, childId, mode) => {
                // Catalog-addressed navigation keeps the official lineage
                // breadcrumb and read-only composer behavior intact; fall
                // back to a plain open while the catalog is unavailable.
                if (mode === 'one-shot' || mode === 'continuable') {
                  sessions.openSubagent({ parentSessionId: parentId, childSessionId: childId, mode });
                } else {
                  sessions.open(childId);
                }
              },
            }),
          },
          SubagentProgressDock,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
