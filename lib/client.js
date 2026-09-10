/* dsh-subagent-progress (client half).
 *
 * Renders the subagent progress dock into the `conversation.input.dock` slot
 * (composer-aligned, directly above the composer card):
 *
 *   ┌ glass chips: one per RUNNING direct subagent — status dot, label,
 *   │ turn/step, last tool, elapsed, latest preview. A stopped child's chip
 *   │ disappears; nothing lingers.
 *   └ update bar: the freshest notify_user update worth showing — any kind
 *     from a still-running child, or an important `finding` left behind by a
 *     finished one. With nothing running and no finding, the dock vanishes.
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
    /** How long an orphaned finding stays visible after it was posted. */
    const FINDING_TTL_MS = 3 * 60 * 1000;
    /** Maximum update rows (one per child) shown under the cards. */
    const MAX_UPDATES = 3;

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
      'dock.close': '暂时关闭,有新活动时重新出现',
      'card.close': '关闭此卡片,有新活动时重新出现',
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
      'dock.close': 'Dismiss; reappears on new activity',
      'card.close': 'Dismiss this card; reappears on new activity',
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
/* The close control is a real button, not a ghost glyph: glass circle with
   border and shadow, placed INSIDE the dock's top-right corner with a safety
   gutter so it never collides with card status text or row content. */
.dsh-sp-close {
  position: absolute; top: 4px; right: 4px; z-index: 2;
  width: 22px; height: 22px; padding: 0;
  display: grid; place-items: center;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1, rgba(127,127,127,.35)) 75%, transparent);
  background: color-mix(in srgb, var(--dsw-specific-menu, rgba(255,255,255,.8)) 80%, transparent);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  box-shadow: 0 1px 4px rgba(15,18,30,.1);
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px; font-weight: 600; line-height: 1; cursor: pointer;
  opacity: .85;
  transition: opacity .12s, color .12s, box-shadow .12s, transform .12s;
}
.dsh-sp-close:hover, .dsh-sp-close:focus-visible {
  opacity: 1;
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 3px 10px rgba(15,18,30,.16);
  transform: translateY(-1px);
  outline: none;
}
@keyframes dsh-sp-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ---- glass cards: uniform grid, any count aligns ---- */
.dsh-sp-chips {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 8px;
  /* Two rows visible, more scroll inside the dock. */
  max-height: 208px;
  overflow-y: auto;
  scrollbar-width: thin;
  /* Right gutter keeps card status text clear of the corner close button. */
  padding-right: 24px;
}
.dsh-sp-card {
  min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
  padding: 7px 12px; border-radius: 14px;
  font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary);
  text-align: left;
  background: color-mix(in srgb, var(--dsw-specific-menu, rgba(255,255,255,.72)) 62%, transparent);
  -webkit-backdrop-filter: blur(12px) saturate(1.5);
  backdrop-filter: blur(12px) saturate(1.5);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1, rgba(127,127,127,.35)) 70%, transparent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.22), 0 1px 4px rgba(15,18,30,.06);
  cursor: pointer; overflow: hidden;
  transition: transform .15s ease-out, box-shadow .15s ease-out, border-color .15s ease-out;
}
.dsh-sp-card:hover, .dsh-sp-card:focus-visible {
  transform: translateY(-1px);
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l1, rgba(127,127,127,.5));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.3), 0 4px 12px rgba(15,18,30,.12);
  outline: none;
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
.dsh-sp-dot.dsh-sp-failed {
  background: var(--dsw-alias-state-error-primary, #e5484d);
  animation: dsh-sp-pulse-failed 2.2s ease-in-out infinite;
}
@keyframes dsh-sp-pulse-failed {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-error-primary, #e5484d) 40%, transparent); }
  55% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--dsw-alias-state-error-primary, #e5484d) 0%, transparent); }
}
.dsh-sp-failure {
  font-size: 11px; line-height: 1.5;
  color: var(--dsw-alias-state-error-primary, #e5484d);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-sp-card-actions {
  display: flex; gap: 6px; align-items: center;
}
.dsh-sp-action {
  appearance: none; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.5));
  background: transparent; border-radius: 999px;
  padding: 1px 10px; font-size: 11px; line-height: 18px;
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
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-sp-meta {
  font-variant-numeric: tabular-nums; font-size: 11px;
  color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-sp-preview {
  color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 17px;
  min-height: 17px;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
  overflow: hidden; overflow-wrap: anywhere; white-space: nowrap; text-overflow: ellipsis;
}
/* The child's latest update lives inside its own card, separated by a
   hairline — one element per subagent, no competing rows. */
.dsh-sp-card-update {
  display: flex; align-items: baseline; gap: 7px; min-width: 0;
  margin-top: 4px; padding-top: 5px;
  border-top: .5px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25));
  font-size: 12px; line-height: 18px;
  min-height: 24px;
}
.dsh-sp-card-update-empty {
  color: var(--dsw-alias-label-tertiary);
}
.dsh-sp-card-update-message {
  min-width: 0; flex: 1; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; white-space: nowrap; text-overflow: ellipsis;
  overflow: hidden;
}
/* One type scale across the whole dock: MarkdownText brings the host's
   markdown typography (~14px), which reads as a different font next to the
   card's 11-12px chrome. Force its descendants to inherit our scale;
   code/pre keep their monospace family. */
.dsh-sp-card-update-message :where(*:not(code):not(pre):not(kbd)),
.dsh-sp-update-message :where(*:not(code):not(pre):not(kbd)) {
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

/* ---- latest update bar ----
   The kind color owns the whole bar, not just the badge: a faint kind-tinted
   glass makes progress / eta / finding scannable at a glance, while the
   surface stays glass rather than a solid color block. */
.dsh-sp-update {
  display: flex; align-items: baseline; gap: 8px; min-width: 0;
  padding: 5px 11px; border-radius: 12px;
  font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary);
  background:
    color-mix(in srgb, var(--dsh-sp-kind, var(--dsw-alias-state-business-primary, #4176e6)) 8%, transparent),
    color-mix(in srgb, var(--dsw-specific-menu, rgba(255,255,255,.72)) 55%, transparent);
  -webkit-backdrop-filter: blur(12px) saturate(1.5);
  backdrop-filter: blur(12px) saturate(1.5);
  border: 1px solid color-mix(in srgb, var(--dsh-sp-kind, var(--dsw-alias-state-business-primary, #4176e6)) 28%, transparent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.2), 0 1px 4px rgba(15,18,30,.05);
  cursor: pointer; overflow: hidden;
  animation: dsh-sp-flash .8s ease-out;
  transition: transform .15s ease-out, box-shadow .15s ease-out;
}
.dsh-sp-update:hover, .dsh-sp-update:focus-visible {
  transform: translateY(-1px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.3), 0 4px 12px rgba(15,18,30,.12);
  outline: none;
}
@keyframes dsh-sp-flash {
  from {
    background:
      color-mix(in srgb, var(--dsh-sp-kind, var(--dsw-alias-state-business-primary, #4176e6)) 26%, transparent),
      color-mix(in srgb, var(--dsw-specific-menu, rgba(255,255,255,.72)) 55%, transparent);
  }
}
.dsh-sp-kind {
  flex: none; display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600; line-height: 16px;
  color: var(--dsh-sp-kind, var(--dsw-alias-state-business-primary, #4176e6));
  background: color-mix(in srgb, var(--dsh-sp-kind, var(--dsw-alias-state-business-primary, #4176e6)) 13%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsh-sp-kind, var(--dsw-alias-state-business-primary, #4176e6)) 30%, transparent);
}
.dsh-sp-update-label {
  flex: none; font-weight: 600; color: var(--dsw-alias-label-primary);
  max-width: 150px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-sp-update-message {
  min-width: 0; flex: 1; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; white-space: nowrap; text-overflow: ellipsis;
  overflow: hidden;
}
/* The message is host-rendered Markdown: neutralize block margins so one-line
   updates stay one line, and let longer findings wrap naturally. */
.dsh-sp-update-message :where(p, ul, ol) { margin: 0; }
.dsh-sp-update-message :where(ul, ol) { padding-left: 18px; }
.dsh-sp-update-message :where(pre) {
  margin: 4px 0; padding: 6px 8px; border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover);
  overflow-x: auto; font-size: 11.5px;
}
.dsh-sp-update-message :where(code) { font-size: 11.5px; }
.dsh-sp-button-reset {
  display: flex; width: 100%; min-width: 0; padding: 0; border: 0; color: inherit;
  background: none; text-align: left; font: inherit; cursor: pointer;
}
.dsh-sp-button-reset > .dsh-sp-update { flex: 1; padding-right: 26px; }

/* Per-card close affordance (cards and orphan rows). */
.dsh-sp-card-close {
  flex: none; width: 18px; height: 18px; padding: 0;
  display: grid; place-items: center;
  border: 0; border-radius: 999px; background: transparent;
  color: var(--dsw-alias-label-dimmed, #a7adbb);
  font-size: 12px; font-weight: 600; line-height: 1; cursor: pointer; opacity: .6;
  transition: opacity .12s, color .12s, background-color .12s;
}
.dsh-sp-card-close:hover, .dsh-sp-card-close:focus-visible {
  opacity: 1;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
  outline: none;
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
  .dsh-sp-update { flex-wrap: wrap; row-gap: 2px; }
  .dsh-sp-update-message { flex-basis: 100%; -webkit-line-clamp: 2; }
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
        failure !== null || live
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

    function SubagentProgressDock({ sessionId, useSessions, openChild, controlChild, t }) {
      const byId = useSessions((state) => state.byId);
      const catalog = useSessions((state) => state.subagentsByParent[sessionId]);
      const modeOf = (childId) =>
        // Only real children carry a navigation mode; diagnostic catalog
        // entries must fall through to the plain-open path.
        catalog?.entries?.find((entry) => entry.kind === 'child' && entry.id === childId)?.mode ?? null;
      const children = React.useMemo(() => {
        const out = [];
        for (const summary of Object.values(byId)) {
          if (summary?.origin === 'subagent' && summary.parentId === sessionId) out.push(summary);
        }
        return out;
      }, [byId, sessionId]);

      // Visibility contract: chips exist while their subagent runs, and a
      // just-finished child lingers for a short grace window (derived purely
      // from the projection's updatedAt, so it survives reloads). The update
      // bar surfaces the freshest update from a live or grace-period child,
      // or an important `finding` left behind by a finished one. The close
      // button dismisses the dock until any NEW activity arrives.
      const running = React.useMemo(() => children.filter(isLive), [children]);

      // A child whose last turn ended in an error (e.g. 429 overload) keeps
      // its card past the grace window — with retry/open actions — until the
      // user dismisses it or a new turn/start clears the failure durably.
      const failed = React.useMemo(
        () => children.filter((summary) => !isLive(summary) && summary.projectionValues?.subagentProgress?.failure),
        [children],
      );

      const [now, setNow] = React.useState(() => Date.now());
      const [dismissedAt, setDismissedAt] = React.useState(null);
      /** Per-card dismissal: childId → epoch ms when its card was closed. */
      const [dismissedChildren, setDismissedChildren] = React.useState({});
      const dismissChild = (childId) => setDismissedChildren((map) => ({ ...map, [childId]: Date.now() }));

      /** Per-card in-flight control action: childId → 'retry' | 'pause' | null. */
      const [busyChildren, setBusyChildren] = React.useState({});
      const actOnChild = async (childId, action) => {
        setBusyChildren((map) => ({ ...map, [childId]: action }));
        try {
          const ok = await controlChild(childId, action, t('action.retryPrompt'));
          // The control channel could not reach the child: land the user in
          // the child's own session so the action can be taken manually.
          if (!ok) openChild(childId, modeOf(childId));
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
          children.filter((summary) => {
            if (isLive(summary) || failedIds.has(summary.id)) return false;
            const updatedAt = summary.projectionValues?.subagentProgress?.updatedAt ?? 0;
            return updatedAt > 0 && now - updatedAt < GRACE_MS;
          }),
        [children, now],
      );

      const displayed = React.useMemo(() => {
        const out = [...running, ...failed, ...recentlyStopped];
        out.sort((a, b) => {
          const liveDiff = (isLive(b) ? 1 : 0) - (isLive(a) ? 1 : 0);
          if (liveDiff !== 0) return liveDiff;
          const failA = a.projectionValues?.subagentProgress?.failure ? 1 : 0;
          const failB = b.projectionValues?.subagentProgress?.failure ? 1 : 0;
          if (failB !== failA) return failB - failA;
          return (
            (b.projectionValues?.subagentProgress?.updatedAt ?? 0) -
            (a.projectionValues?.subagentProgress?.updatedAt ?? 0)
          );
        });
        return out;
      }, [running, failed, recentlyStopped]);

      const anyLive = running.length > 0;
      const graceActive = recentlyStopped.length > 0;

      // One unified card per child: the latest update lives INSIDE its card.
      // Standalone rows remain only for orphaned findings — and even those
      // expire: an important result lingers FINDING_TTL_MS after it was
      // posted, then disappears like everything else.
      const recentlyIds = new Set(recentlyStopped.map((summary) => summary.id));
      const updateByChild = new Map();
      for (const summary of children) {
        const update = summary.projectionValues?.subagentProgress?.lastUpdate;
        if (!update) continue;
        const worthShowing =
          isLive(summary) ||
          recentlyIds.has(summary.id) ||
          (update.kind === 'finding' && now - update.at <= FINDING_TTL_MS);
        if (worthShowing) updateByChild.set(summary.id, update);
      }

      // Per-card dismissal: hidden until THAT child has newer activity.
      const childLastActivity = (summary) =>
        Math.max(summary.projectionValues?.subagentProgress?.updatedAt ?? 0, updateByChild.get(summary.id)?.at ?? 0);
      const isChildDismissed = (summary) => {
        const at = dismissedChildren[summary.id];
        return at !== undefined && childLastActivity(summary) <= at;
      };
      const visibleDisplayed = displayed.filter((summary) => !isChildDismissed(summary));

      const displayedIds = new Set(visibleDisplayed.map((summary) => summary.id));
      const orphanUpdates = [];
      for (const summary of children) {
        const update = updateByChild.get(summary.id);
        if (update && !displayedIds.has(summary.id) && !isChildDismissed(summary))
          orphanUpdates.push({ summary, update });
      }
      orphanUpdates.sort((a, b) => b.update.at - a.update.at);
      const shownOrphans = orphanUpdates.slice(0, MAX_UPDATES);

      // Keep ticking while anything time-bound is on screen: grace cards or
      // a finding approaching its TTL must hide themselves on schedule.
      const findingActive = shownOrphans.length > 0;
      React.useEffect(() => {
        if (!anyLive && !graceActive && !findingActive) return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
      }, [anyLive, graceActive, findingActive]);

      if (visibleDisplayed.length === 0 && shownOrphans.length === 0) return null;

      // A dismissal holds until any relevant activity is NEWER than it — new
      // work always revives the dock on its own.
      let lastActivity = 0;
      for (const update of updateByChild.values()) lastActivity = Math.max(lastActivity, update.at);
      for (const summary of displayed) {
        lastActivity = Math.max(lastActivity, summary.projectionValues?.subagentProgress?.updatedAt ?? 0);
      }
      if (dismissedAt !== null && lastActivity <= dismissedAt) return null;

      const shown = visibleDisplayed;

      return h(
        'div',
        { className: 'dsh-sp-dock', role: 'status', 'aria-label': t('dock.aria') },
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-sp-close',
            title: t('dock.close'),
            'aria-label': t('dock.close'),
            onClick: () => setDismissedAt(Date.now()),
          },
          '×',
        ),
        shown.length > 0
          ? h(
              'div',
              { className: 'dsh-sp-chips' },
              shown.map((summary) =>
                h(Chip, {
                  key: summary.id,
                  summary,
                  now,
                  openChild: (childId) => openChild(childId, modeOf(childId)),
                  update: updateByChild.get(summary.id) ?? null,
                  onUpdateHover,
                  onUpdateLeave,
                  onDismiss: () => dismissChild(summary.id),
                  onRetry: () => actOnChild(summary.id, 'retry'),
                  onPause: () => actOnChild(summary.id, 'pause'),
                  busy: busyChildren[summary.id] ?? null,
                  t,
                }),
              ),
            )
          : null,
        shownOrphans.map(({ summary, update }) =>
          h(
            // A div with button semantics: the Markdown body may contain its
            // own interactive elements (code-copy buttons), which must not
            // nest inside a real <button>.
            'div',
            {
              // Remount on each new update so the flash animation replays.
              key: `${summary.id}:${update.at}`,
              role: 'button',
              tabIndex: 0,
              className: 'dsh-sp-button-reset',
              title: t('chip.open'),
              onClick: () => openChild(summary.id, modeOf(summary.id)),
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openChild(summary.id, modeOf(summary.id));
                }
              },
            },
            h(
              'span',
              {
                className: 'dsh-sp-update',
                style: { '--dsh-sp-kind': KIND_COLOR[update.kind] ?? KIND_COLOR.progress },
              },
              h('span', { className: 'dsh-sp-kind' }, t(`kind.${update.kind}`)),
              h('span', { className: 'dsh-sp-update-label' }, childLabel(summary)),
              h(
                'span',
                {
                  className: 'dsh-sp-update-message',
                  onMouseEnter: (event) =>
                    onUpdateHover({ summary, update, rect: event.currentTarget.getBoundingClientRect() }),
                  onMouseLeave: onUpdateLeave,
                },
                h(UpdateBody, { update, t }),
              ),
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
                    dismissChild(summary.id);
                  },
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      dismissChild(summary.id);
                    }
                  },
                },
                '×',
              ),
            ),
          ),
        ),
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

    const inject = ['sessions', 'slots', 'locale'];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'subagent-progress: dictionaries');
      const sessions = ctx.sessions;
      /**
       * Resolve the controllable session face for one child. binding() covers
       * materialized sessions; scope()+sessionOf() reaches the rest through
       * the scope tree. Either face exposes prompt()/cancel() 1:1.
       */
      const faceOf = (childId) => {
        if (typeof sessions.binding === 'function') {
          const face = sessions.binding(childId)?.session;
          if (face) return face;
        }
        if (typeof sessions.scope === 'function' && typeof sessions.sessionOf === 'function') {
          const scope = sessions.scope(childId);
          if (scope) return sessions.sessionOf(scope) ?? null;
        }
        return null;
      };
      /**
       * One control round-trip against a child session: 'retry' queues a
       * fresh turn with the given prompt text (the failed turn left the child
       * idle, so queueing wakes it), 'pause' cancels the active turn through
       * subagents.interruptByParent. Returns false when the control channel
       * could not deliver, so the caller can fall back to opening the child.
       */
      const controlChild = async (childId, action, promptText) => {
        const face = faceOf(childId);
        if (!face) return false;
        try {
          if (action === 'retry') {
            const result = await face.prompt([{ type: 'text', text: promptText }], 'queue');
            return result?.ok === true;
          }
          const result = await face.cancel();
          return result?.ok === true;
        } catch {
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
              openChild: (childId, mode) => {
                // Catalog-addressed navigation keeps the official lineage
                // breadcrumb and read-only composer behavior intact; fall
                // back to a plain open while the catalog is unavailable.
                if (mode === 'one-shot' || mode === 'continuable') {
                  sessions.openSubagent({ parentSessionId: sessionId, childSessionId: childId, mode });
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
