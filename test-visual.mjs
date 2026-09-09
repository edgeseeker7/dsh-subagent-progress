// Visual test: render the dock with real React to static markup, wrap it in a
// mock host page (dsw theme variables + a colorful backdrop so the glass blur
// is visible), and write visual-test.html for headless-chromium screenshots.
// Run: node test-visual.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const code = readFileSync(new URL('./lib/client.js', import.meta.url), 'utf8');
let entry = null;
vm.runInNewContext(code, { window: { __ModuleLoader__: { load: (e) => { entry = e; } } } });
// Minimal MarkdownText stub for the visual test: renders a tiny subset
// (**bold**, `code`, - lists) so the screenshot exercises the markdown path.
const MarkdownTextStub = ({ text }) => {
  const lines = String(text).split('\n');
  const inline = (s, key) => {
    const parts = [];
    let rest = s;
    let i = 0;
    while (rest.length > 0) {
      let m = rest.match(/^\*\*([^*]+)\*\*/);
      if (m) { parts.push(React.createElement('strong', { key: `${key}-${i++}` }, m[1])); rest = rest.slice(m[0].length); continue; }
      m = rest.match(/^`([^`]+)`/);
      if (m) { parts.push(React.createElement('code', { key: `${key}-${i++}` }, m[1])); rest = rest.slice(m[0].length); continue; }
      m = rest.match(/^[^*`]+|^[*`](?!.*)/);
      parts.push(rest.slice(0, m[0].length));
      rest = rest.slice(m[0].length);
      i++;
    }
    return parts;
  };
  if (lines.length === 1) return React.createElement('span', {}, inline(lines[0], 'l'));
  return React.createElement(
    'ul',
    {},
    lines.map((line, idx) => React.createElement('li', { key: idx }, inline(line.replace(/^-\s*/, ''), idx)))
  );
};
const api = entry.factory((name) => {
  if (name === 'react') return React;
  if (name === '@deepseek-ai/dsh-client-ui-primitives') return { MarkdownText: MarkdownTextStub };
  throw new Error(`unexpected require("${name}")`);
});

let registered = null;
api.apply({
  effect: (fn) => fn(),
  locale: { register: () => {} },
  sessions: { open: () => {}, openSubagent: () => {} },
  slots: { inject: (_slot, fn) => { fn(); }, register: (options, component) => { registered = { options, component }; } }
});
const { component: Dock } = registered;

const NOW = Date.now();
const zh = {
  'dock.aria': '子代理进度', 'chip.turn': '轮 {turn}', 'chip.step': '步 {step}',
  'chip.running': '运行中', 'chip.idle': '空闲', 'chip.open': '打开子代理会话',
  'more': '+{count}', 'duration.seconds': '{seconds}s', 'duration.minutes': '{minutes}m{seconds}s',
  'duration.hours': '{hours}h{minutes}m', 'kind.progress': '进展', 'kind.eta': '预期', 'kind.finding': '发现'
};
const t = (key, params = {}) => Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, v), zh[key] ?? key);

const summaries = {
  a: {
    id: 'child-alpha', origin: 'subagent', parentId: 'root', running: true,
    displayTitle: '评审 dsh-subagent-progress 架构',
    projectionValues: {
      subagent: { mode: 'continuable', label: '评审插件架构', seq: 1 },
      subagentProgress: { turn: 1, step: 20, toolCalls: 23, lastTool: 'bash', lastText: '我先按步骤逐个读文件。', lastUpdate: { kind: 'progress', message: '已读完 **5 个文件**,正在核验 host 半的投影契约。', at: NOW - 8000 }, updateCount: 3, active: true, updatedAt: NOW - 1000 },
      subagentTiming: { settledMs: 0, active: { since: NOW - 153000, through: NOW } }
    }
  },
  b: {
    id: 'child-beta', origin: 'subagent', parentId: 'root', running: true,
    displayTitle: '调研 dsh 上下文注入机制',
    projectionValues: {
      subagent: { mode: 'one-shot', label: '调研上下文注入', seq: 1 },
      subagentProgress: { turn: 3, step: 7, toolCalls: 41, lastTool: 'grep', lastText: '找到了 assemble 的实现位置。', lastUpdate: { kind: 'eta', message: '还剩约三分之一的包要核对,预计 2 分钟。', at: NOW - 60000 }, updateCount: 2, active: true, updatedAt: NOW - 5000 },
      subagentTiming: { settledMs: 0, active: { since: NOW - 402000, through: NOW } }
    }
  },
  c: {
    // Stopped with no update: must disappear entirely (no chip, no bar).
    id: 'child-gamma', origin: 'subagent', parentId: 'root', running: false,
    displayTitle: '调研子agent进度机制',
    projectionValues: {
      subagent: { mode: 'one-shot', label: '已完成的调研', seq: 1 },
      subagentProgress: { turn: 2, step: 11, toolCalls: 18, lastTool: 'read', lastText: null, lastUpdate: null, updateCount: 0, active: false, updatedAt: NOW - 600000 },
      subagentTiming: { settledMs: 345000 }
    }
  },
  e: {
    // Running but silent for 10 minutes: chip stays, dot turns amber (stalled).
    id: 'child-epsilon', origin: 'subagent', parentId: 'root', running: true,
    displayTitle: '长任务执行',
    projectionValues: {
      subagent: { mode: 'one-shot', label: '长任务执行', seq: 1 },
      subagentProgress: { turn: 1, step: 2, toolCalls: 2, lastTool: 'bash', lastText: null, lastUpdate: null, updateCount: 0, active: true, updatedAt: NOW - 600000 },
      subagentTiming: { settledMs: 0, active: { since: NOW - 620000, through: NOW } }
    }
  },
  d: {
    // Stopped but left an important result: no chip, yet its finding stays on
    // the bar (it is the freshest important update).
    id: 'child-delta', origin: 'subagent', parentId: 'root', running: false,
    displayTitle: '安全审查',
    projectionValues: {
      subagent: { mode: 'one-shot', label: '安全审查', seq: 1 },
      subagentProgress: { turn: 1, step: 6, toolCalls: 9, lastTool: 'grep', lastText: null, lastUpdate: { kind: 'finding', message: '**关键发现**:`tool/call` 事件直接落日志,投影折叠后自动广播:\n- 持久化、可回放\n- 零额外推送代码', at: NOW - 2000 }, updateCount: 2, active: false, updatedAt: NOW - 300000 },
      subagentTiming: { settledMs: 96000 }
    }
  }
};
const useSessions = (sel) => sel({ byId: summaries, subagentsByParent: {} });
const { openChild } = registered.options.inject('root');
const markup = renderToStaticMarkup(
  React.createElement(Dock, { sessionId: 'root', useSessions, openChild, t })
);

// Extract the stylesheet from the client bundle source.
const css = code.match(/const CSS = `([\s\S]*?)`;\n/)[1];

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
  :root {
    --dsw-alias-label-primary: #1c2333;
    --dsw-alias-label-secondary: #3d465c;
    --dsw-alias-label-tertiary: #7b8499;
    --dsw-alias-label-dimmed: #a7adbb;
    --dsw-alias-border-l1: rgba(28,35,51,.18);
    --dsw-alias-interactive-bg-hover: rgba(28,35,51,.06);
    --dsw-specific-menu: #ffffff;
    /* composer geometry the dock aligns to (mirrors the host) */
    --dsh-composer-side-clearance: 16px;
    --dsh-composer-card-max-width: 780px;
    --dsh-composer-dock-inset: 8px;
  }
  * { margin: 0; box-sizing: border-box; }
  /* freeze animations at their final state for the static screenshot */
  *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; }
  body {
    font-family: -apple-system, "PingFang SC", "Noto Sans CJK SC", sans-serif;
    padding: 40px; min-height: 100vh;
    /* colorful backdrop so the frosted glass has something to blur */
    background:
      radial-gradient(600px 300px at 15% 20%, rgba(99,140,255,.35), transparent 70%),
      radial-gradient(500px 280px at 80% 15%, rgba(196,120,255,.28), transparent 70%),
      radial-gradient(700px 360px at 55% 85%, rgba(94,220,200,.3), transparent 70%),
      #f3f5f9;
  }
  .mock-composer {
    box-sizing: border-box;
    width: calc(100% - 2 * var(--dsh-composer-side-clearance));
    max-width: var(--dsh-composer-card-max-width);
    margin: 14px auto 0; height: 84px; border-radius: 16px;
    background: rgba(255,255,255,.8); border: 1px solid rgba(28,35,51,.1);
    display: flex; align-items: center; padding: 0 20px;
    color: #a7adbb; font-size: 14px;
  }
  .frame { max-width: 1080px; margin: 0 auto; }
  ${css}
</style></head>
<body><div class="frame">
  ${markup}
  <div class="mock-composer">发消息或做任务… / 调用指令 @ 文件或对话</div>
</div></body></html>`;

writeFileSync(new URL('./visual-test.html', import.meta.url), html);

// Visibility contract assertions: chips only for running children; a stopped
// child vanishes unless its important finding is the freshest thing to show.
import assert from 'node:assert/strict';
const chipCount = (markup.match(/dsh-sp-chip"/g) ?? []).length;
assert.equal(chipCount, 3, `expected 3 chips (running children only), got ${chipCount}`);
assert.ok(markup.includes('评审插件架构'), 'running child alpha missing');
assert.ok(markup.includes('调研上下文注入'), 'running child beta missing');
assert.ok(markup.includes('dsh-sp-stalled'), 'silent-but-running child must show the amber stalled dot');
assert.ok(!markup.includes('已完成的调研'), 'stopped child without update must vanish');
assert.ok(markup.includes('安全审查'), 'stopped child with a fresh finding must stay on the bar');
assert.ok(markup.includes('dsh-sp-update'), 'update bar missing');

console.log('visual-test.html written, markup length:', markup.length);
console.log('visibility assertions passed: 2 chips (running only), stopped child hidden, finding persists on bar');
