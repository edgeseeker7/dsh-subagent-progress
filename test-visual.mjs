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
const api = entry.factory((name) => {
  if (name !== 'react') throw new Error(`unexpected require("${name}")`);
  return React;
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
      subagentProgress: { turn: 1, step: 20, toolCalls: 23, lastTool: 'bash', lastText: '我先按步骤逐个读文件。', lastUpdate: { kind: 'progress', message: '已读完插件全部 5 个文件,正在对照 dsh 框架源码核验 host 半的投影契约与事件形状。', at: NOW - 8000 }, updateCount: 3, active: true, updatedAt: NOW - 1000 },
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
    id: 'child-gamma', origin: 'subagent', parentId: 'root', running: false,
    displayTitle: '调研子agent进度机制',
    projectionValues: {
      subagent: { mode: 'one-shot', label: '调研进度机制', seq: 1 },
      subagentProgress: { turn: 2, step: 11, toolCalls: 18, lastTool: 'read', lastText: null, lastUpdate: { kind: 'finding', message: '关键发现:投影变更本来就会被广播到浏览器,不需要自己写推送。', at: NOW - 600000 }, updateCount: 4, active: false, updatedAt: NOW - 600000 },
      subagentTiming: { settledMs: 345000 }
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
    --dsw-specific-menu: #ffffff;
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
    margin-top: 14px; height: 84px; border-radius: 16px;
    background: rgba(255,255,255,.8); border: 1px solid rgba(28,35,51,.1);
    display: flex; align-items: center; padding: 0 20px;
    color: #a7adbb; font-size: 14px;
  }
  .frame { max-width: 980px; margin: 0 auto; }
  ${css}
</style></head>
<body><div class="frame">
  ${markup}
  <div class="mock-composer">发消息或做任务… / 调用指令 @ 文件或对话</div>
</div></body></html>`;

writeFileSync(new URL('./visual-test.html', import.meta.url), html);
console.log('visual-test.html written, markup length:', markup.length);
