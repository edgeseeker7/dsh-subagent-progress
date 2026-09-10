/* dsh-subagent-progress — notify_user installer (host).
 *
 * The active-reporting half: installs a child-scoped `notify_user` tool plus
 * its usage guidance into every subagent agent's own scope (the same pattern
 * as the official `@deepseek-ai/dsh-tool-subagent-report`: registrations
 * through the agent-scoped `agent.ctx`, invisible to parent and siblings,
 * unwound automatically on agent disposal). Each report lands in the child's
 * durable session log as an ordinary `tool/call` event, so the projection
 * fold (see projection.js) picks it up through the same channel.
 */
import { randomUUID } from 'node:crypto';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { COMM_TOOLS, NOTIFY_TOOL } from './projection.js';

/** Prompt-section placement: right after the central TOOL_REPORT slot (2900). */
const NOTIFY_SECTION_ORDER = 2910;
/**
 * Cadence nudge: after this many consecutive non-communication tool
 * executions without any notify_user/send_message/report call, attach a
 * reminder to the tool result (the official repeat-tool-reminder pattern).
 */
const NOTIFY_NUDGE_EVERY = 6;
const NOTIFY_NUDGE_TEXT =
  'You have gone several tool calls without updating the user. Send ONE single-sentence notify_user update now — the one most important fact right now (done / happening / left). Then continue working; reporting never ends your turn.';

/**
 * Install the notify_user tool and its usage guidance into one subagent
 * agent's scope. Both registrations live on `agent.ctx`, so they are visible
 * only to that child and unwind automatically when the agent is disposed —
 * the official child-scoped contribution pattern.
 * @param {import('@deepseek-ai/dsh-agent').Agent} agent - the child agent.
 */
export function installNotifyUser(agent) {
  agent.ctx.systemPrompt.section({
    name: `tool:${NOTIFY_TOOL}`,
    order: NOTIFY_SECTION_ORDER,
    text: "You have a notify_user tool that renders on the user's interface while you work — the user cannot see your transcript, ONLY these updates. Call it after finishing each distinct piece of work, every few tool calls during long stretches, when you can estimate remaining work, the moment a key finding surfaces, and once before you finish. EVERY message must be ONE single sentence a reader grasps in two seconds: the one most important fact right now (what just finished, what is happening, or what is left). Right shape: '读完 3/5 个文件,正在核验投影契约' / '预计还需 2 分钟' / '根因:缓存键未含分区号'. Strictly one sentence — no lists, no multi-point summaries, no background, no process narration. Reporting never ends your turn; do not repeat a message that was already accepted.",
  });

  // Cadence nudge (official repeat-tool-reminder pattern): count this child's
  // tool executions since its last communication call; every
  // NOTIFY_NUDGE_EVERY calls without one, attach a reminder to that tool
  // result. Scoped to this agent via agent.ctx; disposed with it.
  let executionsSinceComm = 0;
  agent.ctx.on('tools/post-execute', async (exec, _result, next) => {
    let nudge = null;
    if (COMM_TOOLS.has(exec.name)) {
      executionsSinceComm = 0;
    } else {
      executionsSinceComm += 1;
      if (executionsSinceComm >= NOTIFY_NUDGE_EVERY) {
        executionsSinceComm = 0;
        nudge = {
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: NOTIFY_NUDGE_TEXT }],
          source: { kind: 'plugin', plugin: name, form: 'notice', summary: 'notify_user cadence nudge' },
        };
      }
    }
    const downstream = await next();
    if (nudge === null) return downstream;
    if (downstream.kind === 'block') {
      return {
        kind: 'block',
        feedback: downstream.feedback,
        additionalContexts: [nudge, ...(downstream.additionalContexts ?? [])],
      };
    }
    return {
      ...downstream,
      additionalContexts: [nudge, ...(downstream.additionalContexts ?? [])],
    };
  });

  agent.ctx.tools.register(
    defineTool({
      name: NOTIFY_TOOL,
      description:
        "Send ONE single-sentence status update that is rendered live on the user's interface — readable in two seconds. Say the one most important fact right now: what just finished, what is happening, or what remains. Right shape: '读完 3/5 个文件,正在核验投影契约' / '打包分析预计还需 2 分钟' / '根因已定位:缓存键未含分区号'. The user cannot see your transcript — only what you send here. Strictly one sentence: no lists, no multiple points, no background, no process narration. Reporting does not end your turn, and a failed call may still have been displayed, so do not blindly repeat it.",
      parameters: {
        message: {
          type: 'string',
          required: true,
          description:
            'One single sentence: the most important fact right now (done / happening / left). No lists, no extra context.',
        },
        kind: {
          type: 'string',
          enum: ['progress', 'eta', 'finding'],
          description:
            'progress = staged milestone report; eta = expectation management about remaining work; finding = a key discovery. Defaults to progress.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            accepted: { type: 'boolean', required: true },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text: value.accepted ? 'update displayed to the user' : 'update was not displayed',
          },
        ],
      },
      isConcurrencySafe: () => true,
      async execute(args) {
        // No delivery channel needed here: this call is already durable in the
        // child's session log as a tool/call event, and the subagentProgress
        // projection fold picks it up from there for live UI broadcast.
        return { accepted: typeof args.message === 'string' && args.message.trim().length > 0 };
      },
    }),
  );
}
