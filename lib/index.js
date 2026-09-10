/* dsh-subagent-progress (host half).
 *
 * One plugin, two cooperating halves — see projection.js (passive
 * observation) and notify.js (active reporting) for the details.
 */

export const name = 'dsh-subagent-progress';
export const inject = ['sessionProjections', 'systemPrompt', 'tools'];

import { installNotifyUser } from './notify.js';
import { NOTIFY_TOOL, subagentProgressProjection } from './projection.js';

// Named export for offline fold verification; the cordis loader only uses
// the plugin's name/inject/apply surface.
export { subagentProgressProjection };

/**
 * Plugin entry: register the projection unit and the child-scoped tool
 * installer. Change broadcast, reconnect baselines, and the persisted fold
 * cache are all owned by the framework.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.sessionProjections.register(subagentProgressProjection);
  ctx.on('agent/created', ({ agent }) => {
    if (agent.session.header.origin !== 'subagent') return;
    try {
      installNotifyUser(agent);
    } catch (error) {
      ctx.logger.warn(`subagent-progress: failed to install ${NOTIFY_TOOL} for ${agent.id}`, error);
    }
  });
}
