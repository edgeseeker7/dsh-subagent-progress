// Self-check for lib/client.js: the entry must register its text update panel
// into conversation.input.dock, and update clicks must navigate through the
// catalog-addressed sessions.openSubagent (falling back to sessions.open only
// when the catalog mode is unknown). Run: node test-client.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('./lib/client.js', import.meta.url), 'utf8');

let entry = null;
const sandbox = {
  window: {
    __ModuleLoader__: {
      load: (e) => {
        entry = e;
      }
    }
  }
};
vm.runInNewContext(code, sandbox);
assert.ok(entry, 'client bundle did not call window.__ModuleLoader__.load');
assert.equal(entry.id, 'dsh-subagent-progress');
assert.match(code, /lastUpdate/);
assert.match(code, /flatMap/);
assert.doesNotMatch(code, /MAX_CHIPS|dsh-sp-chip/);

const reactStub = {
  createElement: () => ({}),
  useMemo: (f) => f(),
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {},
  useId: () => 'test-id'
};
const exports_ = entry.factory((name) => {
  assert.equal(name, 'react', `unexpected require("${name}")`);
  return reactStub;
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
assert.equal(typeof component, 'function');

const { openChild } = options.inject('parent-1');
openChild('child-1', 'one-shot');
openChild('child-2', 'continuable');
openChild('child-3', null);
assert.equal(JSON.stringify(calls.openSubagent), JSON.stringify([
  { parentSessionId: 'parent-1', childSessionId: 'child-1', mode: 'one-shot' },
  { parentSessionId: 'parent-1', childSessionId: 'child-2', mode: 'continuable' }
]));
assert.equal(JSON.stringify(calls.open), JSON.stringify(['child-3']));

console.log('ok: registers text update panel; update clicks use openSubagent with catalog address');
