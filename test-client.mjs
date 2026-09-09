// Self-check for lib/client.js: the dock must register into
// conversation.input.dock, render one glass chip per direct child (passive
// observation) plus a kind-badged update bar for the freshest notify_user
// update, and navigate through catalog-addressed openSubagent.
// Run: node test-client.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('./lib/client.js', import.meta.url), 'utf8');

let entry = null;
const sandbox = { window: { __ModuleLoader__: { load: (e) => { entry = e; } } } };
vm.runInNewContext(code, sandbox);
assert.ok(entry, 'client bundle did not call window.__ModuleLoader__.load');
assert.equal(entry.id, 'dsh-subagent-progress');

// Structure: chips (passive observation) + update bar (active reporting).
assert.match(code, /dsh-sp-chip/, 'glass chip rendering missing');
assert.match(code, /dsh-sp-update/, 'update bar rendering missing');
assert.match(code, /lastUpdate/, 'must consume the notify_user projection field');
assert.match(code, /subagentTiming/, 'chips must show elapsed time from the official timing projection');
assert.match(code, /conversation\.input\.dock/, 'must register into conversation.input.dock');
assert.match(code, /openSubagent/, 'must prefer catalog-addressed navigation');
assert.match(code, /entry\.kind === 'child'/, 'catalog mode lookup must filter to real children');
assert.match(code, /dataset\.pluginCss/, 'stylesheet must be tagged for HMR claiming');
assert.match(code, /MarkdownText/, 'update messages must render via the host MarkdownText primitive');
assert.match(code, /--dsh-composer-card-max-width/, 'dock must align with the composer card geometry');
assert.match(code, /justify-content: center/, 'chips row must be centered');
assert.match(code, /@media \(max-width: 720px\)/, 'responsive rules missing');

const reactStub = {
  createElement: (...args) => ({ args }),
  useMemo: (f) => f(),
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {},
  useId: () => 'test-id'
};
const exports_ = entry.factory((name) => {
  if (name === 'react') return reactStub;
  // No primitives in the stub environment → MarkdownText falls back to plain text.
  if (name === '@deepseek-ai/dsh-client-ui-primitives') return {};
  throw new Error(`unexpected require("${name}")`);
});
assert.deepEqual([...exports_.inject].sort(), ['locale', 'sessions', 'slots']);

const calls = { openSubagent: [], open: [], registered: [] };
const ctx = {
  effect: (fn) => fn(),
  locale: { register: () => {} },
  sessions: {
    openSubagent: (address) => calls.openSubagent.push(address),
    open: (id) => calls.open.push(id)
  },
  slots: {
    inject: (slot, fn) => {
      assert.equal(slot, 'conversation.input.dock');
      fn();
    },
    register: (options, component) => {
      calls.registered.push({ options, component });
    }
  }
};
exports_.apply(ctx);

assert.equal(calls.registered.length, 1);
const { options, component } = calls.registered[0];
assert.equal(options.name, 'conversation.input.dock');
assert.equal(options.id, 'subagent-progress');
assert.equal(options.locale, 'subagent-progress');
assert.equal(typeof component, 'function');

// Navigation: catalog mode known → openSubagent; unknown → plain open.
const { openChild } = options.inject('parent-1');
openChild('child-1', 'one-shot');
openChild('child-2', 'continuable');
openChild('child-3', null);
assert.equal(JSON.stringify(calls.openSubagent), JSON.stringify([
  { parentSessionId: 'parent-1', childSessionId: 'child-1', mode: 'one-shot' },
  { parentSessionId: 'parent-1', childSessionId: 'child-2', mode: 'continuable' }
]));
assert.equal(JSON.stringify(calls.open), JSON.stringify(['child-3']));

console.log('test-client: all assertions passed');
