import { z } from 'zod';

/**
 * dsh-subagent-progress (host half).
 *
 * Folds every subagent child session's committed events into a small
 * client-visible `subagentProgress` projection: which turn/step the child is
 * on, how many tool calls it has made, the most recent tool name, and a short
 * preview of its latest assistant text. The unit carries a `wire` view, so the
 * host's SessionControlController broadcasts every change to connected
 * browsers with no extra push code — the client half reads it from
 * `useSessions((s) => s.byId[childId].projectionValues.subagentProgress)`.
 *
 * The fold is event-driven and synchronous per the projection contract; for
 * non-subagent sessions it returns the initial state reference untouched, so
 * top-level sessions produce zero downstream work and a `null` wire value.
 */

export const name = 'dsh-subagent-progress';
export const inject = ['sessionProjections'];

/** Maximum characters kept from the child's latest assistant text. */
const PREVIEW_LENGTH = 160;

const stateSchema = z.object({
  /** Whether the projected session is a subagent child (from its immutable header). */
  isSubagent: z.boolean(),
  /** Current (or last) 1-based turn number; 0 before the first turn. */
  turn: z.number().int().nonnegative(),
  /** Current (or last) 1-based step within the turn; 0 before the first step. */
  step: z.number().int().nonnegative(),
  /** Total tool calls the child has requested. */
  toolCalls: z.number().int().nonnegative(),
  /** Name of the most recently requested tool, if any. */
  lastTool: z.string().nullable(),
  /** Short preview of the latest assistant text, if any. */
  lastText: z.string().nullable(),
  /** Whether a turn is currently open (turn/start without turn/end). */
  active: z.boolean(),
  /** Epoch ms of the last event folded into this state; 0 for the empty log. */
  updatedAt: z.number().int().nonnegative()
});

const viewSchema = z.object({
  turn: z.number().int().nonnegative(),
  step: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  lastTool: z.string().nullable(),
  lastText: z.string().nullable(),
  active: z.boolean(),
  updatedAt: z.number().int().nonnegative()
}).nullable();

/** Extract a single-line preview from an assistant message's text blocks. */
function assistantPreview(message) {
  const content = message?.content;
  if (!Array.isArray(content)) return null;
  const parts = [];
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text);
  }
  const joined = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (joined.length === 0) return null;
  return joined.length <= PREVIEW_LENGTH ? joined : `${joined.slice(0, PREVIEW_LENGTH - 1)}…`;
}

const subagentProgressProjection = {
  key: 'subagentProgress',
  stateSchema,
  init(header) {
    return {
      isSubagent: header.origin === 'subagent',
      turn: 0,
      step: 0,
      toolCalls: 0,
      lastTool: null,
      lastText: null,
      active: false,
      updatedAt: 0
    };
  },
  apply(state, event) {
    // Non-subagent sessions never change: same reference, zero downstream work.
    if (!state.isSubagent) return state;
    switch (event.type) {
      case 'turn/start':
        return { ...state, turn: event.data.turn, active: true, updatedAt: event.time };
      case 'turn/end':
        return { ...state, active: false, updatedAt: event.time };
      case 'step/start':
        return { ...state, step: event.data.step, updatedAt: event.time };
      case 'tool/call':
        return {
          ...state,
          toolCalls: state.toolCalls + 1,
          lastTool: typeof event.data.name === 'string' ? event.data.name : state.lastTool,
          updatedAt: event.time
        };
      case 'assistant/message': {
        const preview = assistantPreview(event.data.message);
        if (preview === null) return { ...state, updatedAt: event.time };
        return { ...state, lastText: preview, updatedAt: event.time };
      }
      default:
        return state;
    }
  },
  wire: {
    viewSchema,
    view: (() => {
      // The drive suppresses publication on Object.is-equal raw view results,
      // so an object-valued view must reuse its reference across internal-only
      // state changes. Key the cache by state reference (apply returns the
      // same reference when uninterested, a fresh object on change) so the
      // memo stays correct with many sessions interleaved.
      const cache = new WeakMap();
      return (state) => {
        if (!state.isSubagent) return null;
        const hit = cache.get(state);
        if (hit !== undefined) return hit;
        const view = {
          turn: state.turn,
          step: state.step,
          toolCalls: state.toolCalls,
          lastTool: state.lastTool,
          lastText: state.lastText,
          active: state.active,
          updatedAt: state.updatedAt
        };
        cache.set(state, view);
        return view;
      };
    })()
  },
  stateVersion: 1
};

/**
 * Plugin entry: register the projection unit. Change broadcast, reconnect
 * baselines, and the persisted fold cache are all owned by the framework.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.sessionProjections.register(subagentProgressProjection);
}
