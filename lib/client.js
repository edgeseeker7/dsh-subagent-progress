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

    const zh = {
      'dock.aria': '子代理进度',
      'chip.turn': '轮 {turn}',
      'chip.step': '步 {step}',
      'chip.running': '运行中',
      'chip.idle': '空闲',
      'chip.open': '打开子代理会话',
      'more': '+{count}',
      'duration.seconds': '{seconds}s',
      'duration.minutes': '{minutes}m{seconds}s',
      'duration.hours': '{hours}h{minutes}m',
      'kind.progress': '进展',
      'kind.eta': '预期',
      'kind.finding': '发现',
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
      'chip.open': 'Open subagent session',
      'more': '+{count}',
      'duration.seconds': '{seconds}s',
      'duration.minutes': '{minutes}m {seconds}s',
      'duration.hours': '{hours}h {minutes}m',
      'kind.progress': 'progress',
      'kind.eta': 'eta',
      'kind.finding': 'finding',
      'md.copy': 'Copy',
      'md.copied': 'Copied',
      'md.footnotes': 'Footnotes'
    };

    const CSS = `
/* Geometry copied from the official input.dock children so the dock aligns
   exactly with the composer card instead of spanning the full window. */
.dsh-sp-dock {
  box-sizing: border-box;
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

/* ---- latest update bar ---- */
.dsh-sp-update {
  display: flex; align-items: baseline; gap: 8px; min-width: 0;
  padding: 5px 11px; border-radius: 12px;
  font-size: 12.5px; line-height: 19px; color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-specific-menu, rgba(255,255,255,.72)) 55%, transparent);
  -webkit-backdrop-filter: blur(12px) saturate(1.5);
  backdrop-filter: blur(12px) saturate(1.5);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1, rgba(127,127,127,.3)) 65%, transparent);
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
  from { background: color-mix(in srgb, var(--dsh-sp-kind, #0ea5e9) 22%, transparent); }
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

    function Chip({ summary, now, openChild, t }) {
      const progress = summary.projectionValues?.subagentProgress;
      const timing = summary.projectionValues?.subagentTiming;
      const live = isLive(summary);
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

      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-sp-chip',
          title: t('chip.open'),
          onClick: () => openChild(summary.id)
        },
        h('span', { className: live ? 'dsh-sp-dot dsh-sp-live' : 'dsh-sp-dot' }),
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

      // Visibility contract: chips exist only while their subagent RUNS — a
      // stopped child's chip disappears instead of lingering. The update bar
      // surfaces the freshest update that is either from a still-running child
      // (any kind) or an important result (a `finding`) worth keeping visible
      // after its child finished. With nothing running and no finding to
      // show, the whole dock disappears.
      const running = React.useMemo(() => {
        const out = children.filter(isLive);
        out.sort(
          (a, b) =>
            (b.projectionValues?.subagentProgress?.updatedAt ?? 0) -
            (a.projectionValues?.subagentProgress?.updatedAt ?? 0)
        );
        return out;
      }, [children]);

      const anyLive = running.length > 0;
      const [now, setNow] = React.useState(() => Date.now());
      React.useEffect(() => {
        if (!anyLive) return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
      }, [anyLive]);

      let latest = null;
      for (const summary of children) {
        const update = summary.projectionValues?.subagentProgress?.lastUpdate;
        if (!update) continue;
        const worthShowing = isLive(summary) || update.kind === 'finding';
        if (worthShowing && (latest === null || update.at > latest.update.at)) latest = { summary, update };
      }

      if (running.length === 0 && latest === null) return null;
      const shown = running.slice(0, MAX_CHIPS);
      const hidden = running.length - shown.length;

      return h(
        'div',
        { className: 'dsh-sp-dock', role: 'status', 'aria-label': t('dock.aria') },
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
