/* dsh-subagent-progress (client half).
 *
 * Renders a text update panel into the `conversation.input.dock` slot
 * (full-width, directly above the composer card): one line per direct subagent
 * with a model-authored notify_user update. Clicking a line opens the child
 * session through the official catalog-addressed navigation.
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
    const zh = {
      'panel.aria': '子代理汇报',
      'panel.empty': '子代理尚未汇报进展',
      'panel.open': '打开子代理会话',
      'kind.progress': '进展',
      'kind.eta': '预期',
      'kind.finding': '发现'
    };
    const en = {
      'panel.aria': 'Subagent updates',
      'panel.empty': 'No subagent updates yet',
      'panel.open': 'Open subagent session',
      'kind.progress': 'progress',
      'kind.eta': 'eta',
      'kind.finding': 'finding'
    };

    const CSS = `
.dsh-sp-panel { display: flex; flex-direction: column; gap: 2px; padding: 4px 8px; }
.dsh-sp-update {
  display: flex; gap: 7px; align-items: baseline; min-width: 0;
  font-size: 13px; line-height: 20px; white-space: nowrap;
}
.dsh-sp-update:hover { background: var(--dsh-bg-hover, rgba(127,127,127,.08)); }
.dsh-sp-update-kind { flex: none; font-size: 11px; font-weight: 600; opacity: .7; }
.dsh-sp-update-label { flex: none; font-weight: 600; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.dsh-sp-update-message { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.dsh-sp-update-button { display: flex; min-width: 0; padding: 0; border: 0; color: inherit; background: none; text-align: left; cursor: pointer; }
`;

    function ensureStyles() {
      if (typeof document === 'undefined') return;
      if (document.getElementById(STYLE_ID)) return;
      const tag = document.createElement('style');
      tag.id = STYLE_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    function childLabel(summary) {
      const identity = summary.projectionValues?.subagent;
      if (identity && typeof identity.label === 'string' && identity.label !== '') return identity.label;
      if (typeof summary.title === 'string' && summary.title !== '') return summary.title;
      if (typeof summary.displayTitle === 'string' && summary.displayTitle !== '') return summary.displayTitle;
      return summary.id.slice(0, 8);
    }

    const KIND_ICON = { progress: '•', eta: '◷', finding: '◆' };

    function SubagentProgressDock({ sessionId, useSessions, openChild, t }) {
      const byId = useSessions((state) => state.byId);
      const catalog = useSessions((state) => state.subagentsByParent[sessionId]);
      const modeOf = (childId) => catalog?.entries?.find((entry) => entry.id === childId)?.mode ?? null;
      const updates = React.useMemo(() => Object.values(byId)
        .filter((summary) => summary?.origin === 'subagent' && summary.parentId === sessionId)
        .flatMap((summary) => {
          const update = summary.projectionValues?.subagentProgress?.lastUpdate;
          return update ? [{ summary, update }] : [];
        })
        .sort((a, b) => b.update.at - a.update.at), [byId, sessionId]);

      if (updates.length === 0) return null;
      return h('div', { className: 'dsh-sp-panel', role: 'status', 'aria-label': t('panel.aria') },
        updates.map(({ summary, update }) => h('button', {
          key: `${summary.id}:${update.at}`,
          type: 'button', className: 'dsh-sp-update-button',
          title: t('panel.open'), onClick: () => openChild(summary.id, modeOf(summary.id))
        }, h('span', { className: 'dsh-sp-update' },
          h('span', { className: 'dsh-sp-update-kind' }, `${KIND_ICON[update.kind] ?? '•'} ${t(`kind.${update.kind}`)}`),
          h('span', { className: 'dsh-sp-update-label' }, childLabel(summary)),
          h('span', { className: 'dsh-sp-update-message' }, update.message)
        )))
      );
    }

    const inject = ['sessions', 'slots', 'locale'];

    function apply(ctx) {
      ensureStyles();
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
                // back to a plain open only while the catalog is unavailable.
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
