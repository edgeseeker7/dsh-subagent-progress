/* dsh-subagent-progress (client half).
 *
 * Renders a compact strip of progress chips into the conversation header's
 * `utilities` slot: one chip per direct subagent child of the session being
 * viewed, fed by the host half's `subagentProgress` projection plus the
 * official `subagent`/`subagentTiming` projections. Clicking a chip opens the
 * child session.
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

    const NS = 'subagent-progress';
    const STYLE_ID = 'dsh-subagent-progress-styles';
    const MAX_CHIPS = 3;

    const zh = {
      'strip.aria': '子代理进度',
      'chip.turn': '轮 {turn}',
      'chip.step': '步 {step}',
      'chip.tools': '{count} 次工具调用',
      'chip.idle': '空闲',
      'chip.running': '运行中',
      'chip.open': '打开子代理会话',
      'more': '+{count} 个子代理',
      'duration.seconds': '{seconds}s',
      'duration.minutes': '{minutes}m{seconds}s',
      'duration.hours': '{hours}h{minutes}m',
      'kind.progress': '进展',
      'kind.eta': '预期',
      'kind.finding': '发现'
    };
    const en = {
      'strip.aria': 'Subagent progress',
      'chip.turn': 'turn {turn}',
      'chip.step': 'step {step}',
      'chip.tools': '{count} tool calls',
      'chip.idle': 'idle',
      'chip.running': 'running',
      'chip.open': 'Open subagent session',
      'more': '+{count} more subagents',
      'duration.seconds': '{seconds}s',
      'duration.minutes': '{minutes}m {seconds}s',
      'duration.hours': '{hours}h {minutes}m',
      'kind.progress': 'progress',
      'kind.eta': 'eta',
      'kind.finding': 'finding'
    };

    const CSS = `
.dsh-sp-strip { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.dsh-sp-chip {
  display: inline-flex; align-items: center; gap: 6px; max-width: 420px;
  padding: 2px 10px; border-radius: 999px; font-size: 12px; line-height: 20px;
  border: 1px solid var(--dsh-border, rgba(127,127,127,.35));
  background: var(--dsh-bg-subtle, rgba(127,127,127,.08));
  color: inherit; cursor: pointer; white-space: nowrap; overflow: hidden;
}
.dsh-sp-chip:hover { background: var(--dsh-bg-hover, rgba(127,127,127,.16)); }
.dsh-sp-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: #9e9e9e; }
.dsh-sp-dot.dsh-sp-live { background: #22c55e; animation: dsh-sp-pulse 1.6s ease-in-out infinite; }
.dsh-sp-label { font-weight: 600; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
.dsh-sp-meta { opacity: .75; overflow: hidden; text-overflow: ellipsis; }
.dsh-sp-preview { opacity: .55; font-style: italic; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
.dsh-sp-more { font-size: 12px; opacity: .6; padding: 2px 4px; }
.dsh-sp-update {
  display: flex; gap: 6px; align-items: baseline; margin-top: 4px;
  font-size: 12px; line-height: 18px; opacity: .85;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dsh-sp-update-kind { flex: none; font-weight: 600; }
.dsh-sp-update-label { flex: none; opacity: .7; }
.dsh-sp-update-message { overflow: hidden; text-overflow: ellipsis; }
@keyframes dsh-sp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
`;

    function ensureStyles() {
      if (typeof document === 'undefined') return;
      if (document.getElementById(STYLE_ID)) return;
      const tag = document.createElement('style');
      tag.id = STYLE_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

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

    function Chip({ summary, now, openChild, t }) {
      const progress = summary.projectionValues?.subagentProgress;
      const timing = summary.projectionValues?.subagentTiming;
      const live = summary.running === true || progress?.active === true;
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

      // A model-authored notify_user update outranks the raw transcript preview.
      const preview = progress?.lastUpdate?.message ?? progress?.lastText;

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

    const KIND_ICON = { progress: '📈', eta: '⏳', finding: '💡' };

    function SubagentProgressUtilities({ sessionId, useSessions, openChild, t }) {
      const byId = useSessions((state) => state.byId);
      const children = React.useMemo(() => {
        const out = [];
        for (const summary of Object.values(byId)) {
          if (summary?.origin === 'subagent' && summary.parentId === sessionId) out.push(summary);
        }
        out.sort((a, b) => {
          const aLive = (a.running === true || a.projectionValues?.subagentProgress?.active === true) ? 1 : 0;
          const bLive = (b.running === true || b.projectionValues?.subagentProgress?.active === true) ? 1 : 0;
          if (aLive !== bLive) return bLive - aLive;
          return (b.projectionValues?.subagentProgress?.updatedAt ?? 0) - (a.projectionValues?.subagentProgress?.updatedAt ?? 0);
        });
        return out;
      }, [byId, sessionId]);

      const anyLive = children.some((s) => s.running === true || s.projectionValues?.subagentProgress?.active === true);
      const [now, setNow] = React.useState(() => Date.now());
      React.useEffect(() => {
        if (!anyLive) return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
      }, [anyLive]);

      if (children.length === 0) return null;
      const shown = children.slice(0, MAX_CHIPS);
      const hidden = children.length - shown.length;

      // The freshest notify_user update across all children, surfaced as its
      // own line — the headline of the strip.
      let latest = null;
      for (const summary of children) {
        const update = summary.projectionValues?.subagentProgress?.lastUpdate;
        if (update && (latest === null || update.at > latest.update.at)) latest = { summary, update };
      }

      return h(
        'div',
        { role: 'status', 'aria-label': t('strip.aria') },
        h(
          'div',
          { className: 'dsh-sp-strip' },
          shown.map((summary) => h(Chip, { key: summary.id, summary, now, openChild, t })),
          hidden > 0 ? h('span', { className: 'dsh-sp-more' }, t('more', { count: hidden })) : null
        ),
        latest !== null
          ? h(
              'div',
              { className: 'dsh-sp-update' },
              h('span', { className: 'dsh-sp-update-kind' }, `${KIND_ICON[latest.update.kind] ?? '📈'} ${t(`kind.${latest.update.kind}`)}`),
              h('span', { className: 'dsh-sp-update-label' }, childLabel(latest.summary)),
              h('span', { className: 'dsh-sp-update-message' }, latest.update.message)
            )
          : null
      );
    }

    const inject = ['sessions', 'slots', 'locale'];

    function apply(ctx) {
      ensureStyles();
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'subagent-progress: dictionaries');
      const sessions = ctx.sessions;
      ctx.slots.inject('conversation.session.header.utilities', () =>
        ctx.slots.register(
          {
            name: 'conversation.session.header.utilities',
            id: 'subagent-progress',
            order: 10,
            locale: NS,
            inject: () => ({ openChild: (id) => sessions.open(id) })
          },
          SubagentProgressUtilities
        )
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
