/* dsh-subagent-progress — projection unit (host).
 *
 * The passive-observation half: folds every subagent child session's
 * committed events into the small client-visible `subagentProgress` state
 * (turn/step, tool calls, latest action, updates, distilled failures). The
 * unit carries a `wire` view, so the host's SessionControlController
 * broadcasts every change to connected browsers with no extra push code.
 *
 * The fold is event-driven and synchronous per the projection contract; for
 * non-subagent sessions it returns the initial state reference untouched, so
 * top-level sessions produce zero downstream work and a `null` wire value.
 */
import { z } from 'zod';

const PREVIEW_LENGTH = 160;
/** Maximum characters kept from one notify_user message. */
const NOTIFY_LENGTH = 280;
/** Maximum characters kept from one tool-call's key argument. */
const ACTION_ARG_LENGTH = 60;
/** The model-facing tool name subagent children receive. */
export const NOTIFY_TOOL = 'notify_user';
/** Communication tools whose content is a model-authored progress signal. */
export const COMM_TOOLS = new Set([NOTIFY_TOOL, 'send_message', 'report']);

const updateSchema = z.object({
  /** Coarse category the model assigned to its update. */
  kind: z.enum(['progress', 'eta', 'finding']),
  /** The model-authored update text, single-line normalized. */
  message: z.string(),
  /** Epoch ms of the tool/call event this update was folded from. */
  at: z.number().int().nonnegative(),
});

const actionSchema = z.object({
  /** Tool name of the most recent non-communication call. */
  name: z.string(),
  /** Its key argument, distilled per tool (command / path / pattern / …). */
  arg: z.string().nullable(),
});

const failureSchema = z.object({
  /** Provider/harness error code (e.g. RATE_LIMIT), if one was reported. */
  code: z.string().nullable(),
  /** One-line distilled error for the card. */
  message: z.string(),
  /** Fuller error text for the hover popover. */
  full: z.string(),
  /** Epoch ms of the failing turn/end event. */
  at: z.number().int().nonnegative(),
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
  /** Most recent non-communication tool call with its key argument. */
  lastAction: actionSchema.nullable(),
  /** Short preview of the latest assistant text, if any. */
  lastText: z.string().nullable(),
  /** Latest notify_user update, if the child ever reported one. */
  lastUpdate: updateSchema.nullable(),
  /** Total notify_user updates the child has sent. */
  updateCount: z.number().int().nonnegative(),
  /** Whether a turn is currently open (turn/start without turn/end). */
  active: z.boolean(),
  /** Distilled failure of the last errored turn; null when healthy or running. */
  failure: failureSchema.nullable(),
  /** Epoch ms of the last event folded into this state; 0 for the empty log. */
  updatedAt: z.number().int().nonnegative(),
});

const viewSchema = z
  .object({
    turn: z.number().int().nonnegative(),
    step: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
    lastTool: z.string().nullable(),
    lastAction: actionSchema.nullable(),
    lastText: z.string().nullable(),
    lastUpdate: updateSchema.nullable(),
    updateCount: z.number().int().nonnegative(),
    active: z.boolean(),
    failure: failureSchema.nullable(),
    updatedAt: z.number().int().nonnegative(),
  })
  .nullable();

function normalizeText(text, limit) {
  const joined = String(text).replace(/\s+/g, ' ').trim();
  if (joined.length === 0) return null;
  return joined.length <= limit ? joined : `${joined.slice(0, limit - 1)}…`;
}

/**
 * Like normalizeText but newline-preserving: collapses spaces/tabs and 3+
 * consecutive newlines while keeping the line structure intact. Update
 * messages are rendered as Markdown on the client — flattening newlines
 * would destroy lists and every other block construct.
 */
function normalizeMarkdown(text, limit) {
  const joined = String(text)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

function parseArguments(rawArguments) {
  try {
    const args = JSON.parse(rawArguments);
    return args !== null && typeof args === 'object' ? args : null;
  } catch {
    return null;
  }
}

const HEADLINE_LENGTH = 120;
/** Maximum characters of the card failure line / its popover body. */
const FAILURE_LINE_LENGTH = 120;
const FAILURE_FULL_LENGTH = 1000;

/**
 * Distill a turn/end error reason into a card-friendly failure. The raw
 * message often embeds a provider JSON envelope (`429 {"error":{...}}`) and a
 * per-request id — strip both so the line says WHAT happened, and keep the
 * unmodified (bounded) raw text for the hover popover.
 */
function turnFailure(error, at) {
  const raw = typeof error?.message === 'string' && error.message.length > 0 ? error.message : 'unknown error';
  const code = typeof error?.code === 'string' && error.code.length > 0 ? error.code : null;
  let text = raw;
  const envelope = raw.match(/^\s*(\d{3})\s*(\{.*\})\s*$/s);
  if (envelope !== null) {
    try {
      const inner = JSON.parse(envelope[2])?.error?.message;
      if (typeof inner === 'string' && inner.length > 0) text = `${envelope[1]} ${inner}`;
    } catch {
      // Keep the raw text when the envelope is not parseable JSON.
    }
  }
  text = text.replace(/request id: [^,]+, /, '');
  return {
    code,
    message: normalizeText(text, FAILURE_LINE_LENGTH) ?? 'unknown error',
    full: normalizeMarkdown(raw, FAILURE_FULL_LENGTH) ?? raw.slice(0, FAILURE_FULL_LENGTH),
    at,
  };
}

/**
 * Parse one communication call (notify_user, send_message, report) into a
 * foldable update. notify_user messages are authored FOR the user's display
 * and keep their full (markdown) body; send_message/report carry the child's
 * FULL report to its parent, which the dock distills to the first
 * non-empty line — the headline, not the whole conclusion.
 */
function commUpdate(toolName, rawArguments, at) {
  const args = parseArguments(rawArguments);
  if (args === null) return null;
  const raw = toolName === 'send_message' ? args.message : toolName === 'report' ? args.output : args.message;
  if (typeof raw !== 'string') return null;
  const kind = toolName === NOTIFY_TOOL && (args.kind === 'eta' || args.kind === 'finding') ? args.kind : 'progress';
  if (toolName !== NOTIFY_TOOL) {
    const firstLine = raw.split('\n').find((line) => line.trim().length > 0);
    if (firstLine === undefined) return null;
    const message = normalizeText(firstLine, HEADLINE_LENGTH);
    return message === null ? null : { kind, message, at };
  }
  const message = normalizeMarkdown(raw, NOTIFY_LENGTH);
  if (message === null) return null;
  return { kind, message, at };
}

/**
 * Distill one non-communication tool call into {name, arg}: the key argument
 * that tells the user WHAT the call works on, not just which tool it is.
 */
function actionArg(toolName, rawArguments) {
  const args = parseArguments(rawArguments);
  if (args === null) return { name: toolName, arg: null };
  const raw =
    (typeof args.command === 'string' && args.command) ||
    (typeof args.file_path === 'string' && args.file_path) ||
    (typeof args.pattern === 'string' && args.pattern) ||
    (typeof args.query === 'string' && args.query) ||
    (Array.isArray(args.queries) && typeof args.queries[0] === 'string' && args.queries[0]) ||
    (typeof args.url === 'string' && args.url) ||
    (typeof args.description === 'string' && args.description) ||
    (typeof args.prompt === 'string' && args.prompt) ||
    null;
  return { name: toolName, arg: raw === null ? null : normalizeText(raw, ACTION_ARG_LENGTH) };
}

export const subagentProgressProjection = {
  key: 'subagentProgress',
  stateSchema,
  init(header) {
    return {
      isSubagent: header.origin === 'subagent',
      turn: 0,
      step: 0,
      toolCalls: 0,
      lastTool: null,
      lastAction: null,
      lastText: null,
      lastUpdate: null,
      updateCount: 0,
      active: false,
      failure: null,
      updatedAt: 0,
    };
  },
  apply(state, event) {
    // Non-subagent sessions never change: same reference, zero downstream work.
    if (!state.isSubagent) return state;
    switch (event.type) {
      case 'turn/start':
        // A new turn is the durable retry signal: any earlier failure clears.
        return { ...state, turn: event.data.turn, active: true, failure: null, updatedAt: event.time };
      case 'turn/end': {
        const reason = event.data?.reason;
        if (reason?.kind === 'error') {
          return { ...state, active: false, failure: turnFailure(reason.error, event.time), updatedAt: event.time };
        }
        return { ...state, active: false, failure: null, updatedAt: event.time };
      }
      case 'step/start':
        return { ...state, step: event.data.step, updatedAt: event.time };
      case 'tool/call': {
        // A nameless call never falls back to the previous tool name — that
        // could misattribute it as a notify_user call and parse its arguments.
        if (typeof event.data.name !== 'string') {
          return { ...state, toolCalls: state.toolCalls + 1, updatedAt: event.time };
        }
        const toolName = event.data.name;
        // Communication calls (notify_user / send_message / report) are
        // model-authored progress signals, not "actions"; fold their content.
        if (COMM_TOOLS.has(toolName)) {
          const update = commUpdate(toolName, event.data.arguments, event.time);
          if (update !== null) {
            return {
              ...state,
              toolCalls: state.toolCalls + 1,
              lastTool: toolName,
              lastUpdate: update,
              updateCount: state.updateCount + 1,
              updatedAt: event.time,
            };
          }
          return {
            ...state,
            toolCalls: state.toolCalls + 1,
            lastTool: toolName,
            updatedAt: event.time,
          };
        }
        return {
          ...state,
          toolCalls: state.toolCalls + 1,
          lastTool: toolName,
          lastAction: actionArg(toolName, event.data.arguments),
          updatedAt: event.time,
        };
      }
      case 'assistant/message': {
        const preview = assistantPreview(event.data.message);
        // No visible text → same reference → no broadcast. Bumping updatedAt
        // here would turn every committed event into a host-wide heartbeat,
        // contradicting the minimal-traffic design goal.
        if (preview === null) return state;
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
          lastAction: state.lastAction,
          lastText: state.lastText,
          lastUpdate: state.lastUpdate,
          updateCount: state.updateCount,
          active: state.active,
          failure: state.failure,
          updatedAt: state.updatedAt,
        };
        cache.set(state, view);
        return view;
      };
    })(),
  },
  // v6: failure — turn/end with reason.kind 'error' folds into a distilled
  // failure (code/line/full) so the client can keep the card and offer
  // retry/open actions; v5 preserved update newlines (normalizeMarkdown).
  stateVersion: 6,
};
