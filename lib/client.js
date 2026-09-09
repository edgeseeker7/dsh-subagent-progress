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
    const MAX_CHIPS = 4;
    /** How long a just-finished child's chip lingers before the dock hides. */
    const GRACE_MS = 30 * 1000;

    const zh = {
      'dock.aria': '子代理进度',
      'chip.turn': '轮 {turn}',
      'chip.step': '步 {step}',
      'chip.running': '运行中',
      'chip.idle': '空闲',
      'chip.stalled': '{minutes} 分钟无新事件',
      'chip.open': '打开子代理会话',
      'more': '+{count}',
      'duration.seconds': '{seconds}s',
      'duration.minutes': '{minutes}m{seconds}s',
      'duration.hours': '{hours}h{minutes}m',
      'kind.progress': '进展',
      'kind.eta': '预期',
      'kind.finding': '发现',
      'dock.close': '暂时关闭,有新活动时重新出现',
      'md.copy': '复制',
      'md.copied': '已复制',
      'md.footnotes': '脚注'
    };
    const en = {
      'dock.aria': 'Subagent progress',
      'chip.turn': 'turn {turn}',
      'chip.step': 'step {step}',
      'chip.running': 'running',
      'chip.idle': 'idle',
      'chip.stalled': 'no new events for {minutes}m',
      'chip.open': 'Open subagent session',
      'more': '+{count}',
      'duration.seconds': '{seconds}s',
      'duration.minutes': '{minutes}m {seconds}s',
      'duration.hours': '{hours}h {minutes}m',
      'kind.progress': 'progress',
      'kind.eta': 'eta',
      'kind.finding': 'finding',
      'dock.close': 'Dismiss; reappears on new activity',
      'md.copy': 'Copy',
      'md.copied': 'Copied',
      'md.footnotes': 'Footnotes'
    };

    const CSS = `
/* Geometry copied from the official input.dock children so the dock aligns
   exactly with the composer card instead of spanning the full window. */
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
.dsh-sp-close {
  position: absolute; top: -2px; right: 2px; z-index: 1;
  width: 20px; height: 20px; padding: 0;
  display: grid; place-items: center;
  border: 0; border-radius: 999px;
  background: transparent; color: var(--dsw-alias-label-dimmed, #a7adbb);
  font-size: 14px; line-height: 1; cursor: pointer;
  opacity: .55;
  transition: opacity .12s, background-color .12s, color .12s;
}
.dsh-sp-close:hover, .dsh-sp-close:focus-visible {
  opacity: 1;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
  outline: none;
}
@keyframes dsh-sp-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ---- glass chips ---- */
.dsh-sp-chips {
  display: flex; flex-wrap: wrap; gap: 6px;
  align-items: center; justify-content: center; min-width: 0;
}
.dsh-sp-chip {
  display: inline-flex; align-items: center; gap: 7px; min-width: 0; max-width: 460px;
  padding: 4px 11px; border-radius: 999px;
  font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-specific-menu, rgba(255,255,255,.72)) 62%, transparent);
  -webkit-backdrop-filter: blur(12px) saturate(1.5);
  backdrop-filter: blur(12px) saturate(1.5);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1, rgba(127,127,127,.35)) 70%, transparent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.22), 0 1px 4px rgba(15,18,30,.06);
  cursor: pointer; white-space: nowrap; overflow: hidden;
  transition: transform .15s ease-out, box-shadow .15s ease-out, border-color .15s ease-out;
}
.dsh-sp-chip:hover, .dsh-sp-chip:focus-visible {
  transform: translateY(-1px);
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l1, rgba(127,127,127,.5));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.3), 0 4px 12px rgba(15,18,30,.12);
  outline: none;
}
.dsh-sp-dot {
  width: 7px; height: 7px; border-radius: 50%; flex: none;
  background: var(--dsw-alias-label-dimmed, #9aa0ab);
}
.dsh-sp-dot.dsh-sp-live {
  background: #22c55e;
  animation: dsh-sp-pulse 1.7s ease-in-out infinite;
}
@keyframes dsh-sp-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,.45); }
  55% { box-shadow: 0 0 0 5px rgba(34,197,94,0); }
}
/* Running but silent for a while: amber means "no new events", a stall
   warning rather than a decoration; slower, calmer pulse than active work. */
.dsh-sp-dot.dsh-sp-stalled {
  background: #f59e0b;
  animation: dsh-sp-pulse-stalled 2.6s ease-in-out infinite;
}
@keyframes dsh-sp-pulse-stalled {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,.4); }
  55% { box-shadow: 0 0 0 4px rgba(245,158,11,0); }
}
.dsh-sp-label {
  font-weight: 600; color: var(--dsw-alias-label-primary);
  max-width: 150px; overflow: hidden; text-overflow: ellipsis;
}
.dsh-sp-meta {
  font-variant-numeric: tabular-nums; font-size: 11px;
  color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis;
}
.dsh-sp-preview {
  font-style: italic; color: var(--dsw-alias-label-tertiary);
  max-width: 190px; overflow: hidden; text-overflow: ellipsis;
}
.dsh-sp-more {
  font-size: 11px; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary); padding: 2px 4px;
}

/* ---- latest update bar ----
   The kind color owns the whole bar, not just the badge: a faint kind-tinted
   glass makes progress / eta / finding scannable at a glance, while the
   surface stays glass rather than a solid color block. */
.dsh-sp-update {
  display: flex; align-items: baseline; gap: 8px; min-width: 0;
  padding: 5px 11px; border-radius: 12px;
  font-size: 12.5px; line-height: 19px; color: var(--dsw-alias-label-secondary);
  background:
    color-mix(in srgb, var(--dsh-sp-kind, #0ea5e9) 8%, transparent),
    color-mix(in srgb, var(--dsw-specific-menu, rgba(255,255,255,.72)) 55%, transparent);
  -webkit-backdrop-filter: blur(12px) saturate(1.5);
  backdrop-filter: blur(12px) saturate(1.5);
  border: 1px solid color-mix(in srgb, var(--dsh-sp-kind, #0ea5e9) 28%, transparent);
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
      color-mix(in srgb, var(--dsh-sp-kind, #0ea5e9) 26%, transparent),
      color-mix(in srgb, var(--dsw-specific-menu, rgba(255,255,255,.72)) 55%, transparent);
  }
}
.dsh-sp-kind {
  flex: none; display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600; line-height: 16px;
  color: var(--dsh-sp-kind, #0ea5e9);
  background: color-mix(in srgb, var(--dsh-sp-kind, #0ea5e9) 13%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsh-sp-kind, #0ea5e9) 30%, transparent);
}
.dsh-sp-update-label {
  flex: none; font-weight: 600; color: var(--dsw-alias-label-primary);
  max-width: 150px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-sp-update-message { min-width: 0; flex: 1; overflow-wrap: anywhere; }
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
  display: flex; min-width: 0; padding: 0; border: 0; color: inherit;
  background: none; text-align: left; font: inherit; cursor: pointer;
}

/* ---- responsive ---- */
@media (max-width: 720px) {
  .dsh-sp-chip { max-width: 100%; }
  .dsh-sp-preview { display: none; }
  .dsh-sp-update { flex-wrap: wrap; row-gap: 2px; }
  .dsh-sp-update-message { flex-basis: 100%; }
}
`;

    // Official-style injection at module materialization: tagged so the client
    // module system can claim the stylesheet across HMR reloads.
    const CSS_TAG_ID = 'dsh-subagent-progress/dock.css';
    if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css=${JSON.stringify(CSS_TAG_ID)}]`) === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-subagent-progress';
      tag.dataset.pluginCss = CSS_TAG_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    const KIND_COLOR = { progress: '#0ea5e9', eta: '#f59e0b', finding: '#8b5cf6' };

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

    function Chip({ summary, now, openChild, t }) {
      const progress = summary.projectionValues?.subagentProgress;
      const timing = summary.projectionValues?.subagentTiming;
      const live = isLive(summary);
      const stalled =
        live && typeof progress?.updatedAt === 'number' && progress.updatedAt > 0 && now - progress.updatedAt > STALL_MS;
      let elapsed = null;
      if (timing?.active) elapsed = now - timing.active.since;
      else if (typeof timing?.settledMs === 'number' && timing.settledMs > 0) elapsed = timing.settledMs;

      const meta = [];
      if (progress && progress.turn > 0) {
        meta.push(`${t('chip.turn', { turn: progress.turn })}·${t('chip.step', { step: progress.step })}`);
        if (progress.lastTool) meta.push(progress.lastTool);
      }
      meta.push(live ? t('chip.running') : t('chip.idle'));
      if (elapsed !== null) meta.push(formatDuration(elapsed, t));

      // A model-authored notify_user update outranks the raw transcript
      // preview; strip markdown markers so the one-line preview stays clean.
      const rawPreview = progress?.lastUpdate?.message ?? progress?.lastText;
      const preview = rawPreview?.replace(/[*`#]+/g, '').replace(/\s+/g, ' ').trim() || null;

      const dotClass = stalled ? 'dsh-sp-dot dsh-sp-stalled' : live ? 'dsh-sp-dot dsh-sp-live' : 'dsh-sp-dot';
      const title = stalled
        ? `${t('chip.open')} · ${t('chip.stalled', { minutes: Math.floor((now - progress.updatedAt) / 60000) })}`
        : t('chip.open');

      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-sp-chip',
          title,
          onClick: () => openChild(summary.id)
        },
        h('span', { className: dotClass }),
        h('span', { className: 'dsh-sp-label' }, childLabel(summary)),
        h('span', { className: 'dsh-sp-meta' }, meta.join(' · ')),
        preview ? h('span', { className: 'dsh-sp-preview' }, `“${preview}”`) : null
      );
    }

    function SubagentProgressDock({ sessionId, useSessions, openChild, t }) {
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

      const [now, setNow] = React.useState(() => Date.now());
      const [dismissedAt, setDismissedAt] = React.useState(null);

      const recentlyStopped = React.useMemo(
        () =>
          children.filter((summary) => {
            if (isLive(summary)) return false;
            const updatedAt = summary.projectionValues?.subagentProgress?.updatedAt ?? 0;
            return updatedAt > 0 && now - updatedAt < GRACE_MS;
          }),
        [children, now]
      );

      const displayed = React.useMemo(() => {
        const out = [...running, ...recentlyStopped];
        out.sort((a, b) => {
          const liveDiff = (isLive(b) ? 1 : 0) - (isLive(a) ? 1 : 0);
          if (liveDiff !== 0) return liveDiff;
          return (b.projectionValues?.subagentProgress?.updatedAt ?? 0) - (a.projectionValues?.subagentProgress?.updatedAt ?? 0);
        });
        return out;
      }, [running, recentlyStopped]);

      const anyLive = running.length > 0;
      const graceActive = recentlyStopped.length > 0;
      React.useEffect(() => {
        if (!anyLive && !graceActive) return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
      }, [anyLive, graceActive]);

      const recentlyIds = new Set(recentlyStopped.map((summary) => summary.id));
      let latest = null;
      for (const summary of children) {
        const update = summary.projectionValues?.subagentProgress?.lastUpdate;
        if (!update) continue;
        const worthShowing = isLive(summary) || update.kind === 'finding' || recentlyIds.has(summary.id);
        if (worthShowing && (latest === null || update.at > latest.update.at)) latest = { summary, update };
      }

      if (displayed.length === 0 && latest === null) return null;

      // A dismissal holds until any relevant activity is NEWER than it — new
      // work always revives the dock on its own.
      let lastActivity = latest?.update.at ?? 0;
      for (const summary of displayed) {
        lastActivity = Math.max(lastActivity, summary.projectionValues?.subagentProgress?.updatedAt ?? 0);
      }
      if (dismissedAt !== null && lastActivity <= dismissedAt) return null;

      const shown = displayed.slice(0, MAX_CHIPS);
      const hidden = displayed.length - shown.length;

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
            onClick: () => setDismissedAt(Date.now())
          },
          '×'
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
                  t
                })
              ),
              hidden > 0 ? h('span', { className: 'dsh-sp-more' }, t('more', { count: hidden })) : null
            )
          : null,
        latest !== null
          ? h(
              // A div with button semantics: the Markdown body may contain its
              // own interactive elements (code-copy buttons), which must not
              // nest inside a real <button>.
              'div',
              {
                // Remount on each new update so the flash animation replays.
                key: `${latest.summary.id}:${latest.update.at}`,
                role: 'button',
                tabIndex: 0,
                className: 'dsh-sp-button-reset',
                title: t('chip.open'),
                onClick: () => openChild(latest.summary.id, modeOf(latest.summary.id)),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openChild(latest.summary.id, modeOf(latest.summary.id));
                  }
                }
              },
              h(
                'span',
                {
                  className: 'dsh-sp-update',
                  style: { '--dsh-sp-kind': KIND_COLOR[latest.update.kind] ?? KIND_COLOR.progress }
                },
                h('span', { className: 'dsh-sp-kind' }, t(`kind.${latest.update.kind}`)),
                h('span', { className: 'dsh-sp-update-label' }, childLabel(latest.summary)),
                h(
                  'span',
                  { className: 'dsh-sp-update-message' },
                  MarkdownText !== null
                    ? h(MarkdownText, {
                        text: latest.update.message,
                        labels: {
                          code: { copyLabel: t('md.copy'), copiedLabel: t('md.copied') },
                          footnotes: t('md.footnotes')
                        }
                      })
                    : latest.update.message
                )
              )
            )
          : null
      );
    }

    const inject = ['sessions', 'slots', 'locale'];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'subagent-progress: dictionaries');
      const sessions = ctx.sessions;
      ctx.slots.inject('conversation.input.dock', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.dock',
            id: 'subagent-progress',
            order: 10,
            locale: NS,
            inject: (sessionId) => ({
              openChild: (childId, mode) => {
                // Catalog-addressed navigation keeps the official lineage
                // breadcrumb and read-only composer behavior intact; fall
                // back to a plain open while the catalog is unavailable.
                if (mode === 'one-shot' || mode === 'continuable') {
                  sessions.openSubagent({ parentSessionId: sessionId, childSessionId: childId, mode });
                } else {
                  sessions.open(childId);
                }
              }
            })
          },
          SubagentProgressDock
        )
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
