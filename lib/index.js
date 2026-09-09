import { z } from 'zod';
import { defineTool } from '@deepseek-ai/dsh-tools';

/**
 * dsh-subagent-progress (host half).
 *
 * One plugin, two cooperating halves:
 *
 * 1. Passive observation — folds every subagent child session's committed
 *    events into a small client-visible `subagentProgress` projection: which
 *    turn/step the child is on, how many tool calls it has made, the most
 *    recent tool name, and a short preview of its latest assistant text. The
 *    unit carries a `wire` view, so the host's SessionControlController
 *    broadcasts every change to connected browsers with no extra push code.
 *
 * 2. Active reporting — installs a child-scoped `notify_user` tool plus its
 *    usage guidance into every subagent agent's own scope (the same pattern
 *    as the official `@deepseek-ai/dsh-tool-subagent-report`: registrations
 *    through the agent-scoped `agent.ctx`, invisible to parent and siblings,
 *    unwound automatically on agent disposal). The model is encouraged to
 *    report staged progress, ETA/expectation management, and key findings.
 *    Those calls land in the child's durable session log as ordinary
 *    `tool/call` events, so the SAME projection fold picks them up — durable,
 *    replayable, and broadcast through the existing channel.
 *
 * The fold is event-driven and synchronous per the projection contract; for
 * non-subagent sessions it returns the initial state reference untouched, so
 * top-level sessions produce zero downstream work and a `null` wire value.
 */

export const name = 'dsh-subagent-progress';
export const inject = ['sessionProjections', 'systemPrompt', 'tools'];

/** Maximum characters kept from the child's latest assistant text. */
const PREVIEW_LENGTH = 160;
/** Maximum characters kept from one notify_user message. */
const NOTIFY_LENGTH = 280;
/** The model-facing tool name subagent children receive. */
const NOTIFY_TOOL = 'notify_user';
/** Prompt-section placement: right after the central TOOL_REPORT slot (2900). */
const NOTIFY_SECTION_ORDER = 2910;

const updateSchema = z.object({
  /** Coarse category the model assigned to its update. */
  kind: z.enum(['progress', 'eta', 'finding']),
  /** The model-authored update text, single-line normalized. */
  message: z.string(),
  /** Epoch ms of the tool/call event this update was folded from. */
  at: z.number().int().nonnegative()
});

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
  /** Latest notify_user update, if the child ever reported one. */
  lastUpdate: updateSchema.nullable(),
  /** Total notify_user updates the child has sent. */
  updateCount: z.number().int().nonnegative(),
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
  lastUpdate: updateSchema.nullable(),
  updateCount: z.number().int().nonnegative(),
  active: z.boolean(),
  updatedAt: z.number().int().nonnegative()
}).nullable();

/** Collapse whitespace and bound one model-authored text fragment. */
function normalizeText(text, limit) {
  const joined = String(text).replace(/\s+/g, ' ').trim();
  if (joined.length === 0) return null;
  return joined.length <= limit ? joined : `${joined.slice(0, limit - 1)}…`;
}

/** Extract a single-line preview from an assistant message's text blocks. */
function assistantPreview(message) {
  const content = message?.content;
  if (!Array.isArray(content)) return null;
  const parts = [];
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text);
  }
  const joined = parts.join(' ');
  return normalizeText(joined, PREVIEW_LENGTH);
}

/** Parse one notify_user call's raw arguments into a foldable update. */
function notifyUpdate(rawArguments, at) {
  let args;
  try {
    args = JSON.parse(rawArguments);
  } catch {
    return null;
  }
  if (args === null || typeof args !== 'object' || typeof args.message !== 'string') return null;
  const message = normalizeText(args.message, NOTIFY_LENGTH);
  if (message === null) return null;
  const kind = args.kind === 'eta' || args.kind === 'finding' ? args.kind : 'progress';
  return { kind, message, at };
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
      lastUpdate: null,
      updateCount: 0,
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
      case 'tool/call': {
        const toolName = typeof event.data.name === 'string' ? event.data.name : state.lastTool;
        if (toolName === NOTIFY_TOOL) {
          const update = notifyUpdate(event.data.arguments, event.time);
          if (update !== null) {
            return {
              ...state,
              toolCalls: state.toolCalls + 1,
              lastTool: toolName,
              lastUpdate: update,
              updateCount: state.updateCount + 1,
              updatedAt: event.time
            };
          }
        }
        return {
          ...state,
          toolCalls: state.toolCalls + 1,
          lastTool: toolName,
          updatedAt: event.time
        };
      }
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
          lastUpdate: state.lastUpdate,
          updateCount: state.updateCount,
          active: state.active,
          updatedAt: state.updatedAt
        };
        cache.set(state, view);
        return view;
      };
    })()
  },
  stateVersion: 2
};

/**
 * Install the notify_user tool and its usage guidance into one subagent
 * agent's scope. Both registrations live on `agent.ctx`, so they are visible
 * only to that child and unwind automatically when the agent is disposed —
 * the official child-scoped contribution pattern.
 * @param {import('@deepseek-ai/dsh-agent').Agent} agent - the child agent.
 */
function installNotifyUser(agent) {
  agent.ctx.systemPrompt.section({
    name: `tool:${NOTIFY_TOOL}`,
    order: NOTIFY_SECTION_ORDER,
    text: 'You have a notify_user tool that renders short updates directly on the user\'s interface while you work. Use it proactively — the user cannot see your transcript, only these updates. Call it: (1) at staged milestones with one-line progress reports; (2) to manage expectations when you can estimate how much work remains; (3) to share key findings the moment they surface. Keep each message under one line, factual, and free of jargon about your internal tooling. Reporting never ends your turn; do not repeat a message that was already accepted.'
  });
  agent.ctx.tools.register(defineTool({
    name: NOTIFY_TOOL,
    description: 'Send a short status update that is rendered live on the user\'s interface. Call this proactively while working: staged progress reports at milestones, expectation management about how much work remains, and key findings as soon as they surface. The user cannot see your transcript — only what you send here. Keep messages under one line. Reporting does not end your turn, and a failed call may still have been displayed, so do not blindly repeat it.',
    parameters: {
      message: {
        type: 'string',
        required: true,
        description: 'One-line user-facing update: what you just did, what remains, or what you found.'
      },
      kind: {
        type: 'string',
        enum: ['progress', 'eta', 'finding'],
        description: 'progress = staged milestone report; eta = expectation management about remaining work; finding = a key discovery. Defaults to progress.'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          accepted: { type: 'boolean', required: true }
        }
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.accepted
          ? 'update displayed to the user'
          : 'update was not displayed'
      }]
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      // No delivery channel needed here: this call is already durable in the
      // child's session log as a tool/call event, and the subagentProgress
      // projection fold picks it up from there for live UI broadcast.
      return { accepted: typeof args.message === 'string' && args.message.trim().length > 0 };
    }
  }));
}

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
