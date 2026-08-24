'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('content script loads interaction core and bridge before floating runtime', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const scripts = manifest.content_scripts?.[0]?.js || [];
  const coreIndex = scripts.indexOf('interaction-core.js');
  const bridgeIndex = scripts.indexOf('interaction-bridge.js');
  const floatingIndex = scripts.indexOf('content-floating-search.js');

  assert.ok(coreIndex >= 0, 'interaction-core.js must be in content_scripts');
  assert.ok(bridgeIndex > coreIndex, 'interaction-bridge.js must load after interaction-core.js');
  assert.ok(floatingIndex > bridgeIndex, 'content-floating-search.js must load after the interaction bridge');
  assert.equal(scripts.includes('prompt-shortcut-focus.js'), false, 'retired Prompt-only shortcut shim must not be loaded');
});

test('sidepanel wrapper loads the shared interaction runtime in contract order', () => {
  const wrapper = read('sidepanel-wrapper.js');
  const coreIndex = wrapper.indexOf("loadScript('interaction-core.js')");
  const bridgeIndex = wrapper.indexOf("loadScript('interaction-bridge.js')");

  assert.ok(coreIndex >= 0, 'sidepanel wrapper must load interaction-core.js');
  assert.ok(bridgeIndex > coreIndex, 'sidepanel wrapper must load interaction-bridge.js after the core');
  assert.equal(wrapper.includes("loadScript('prompt-shortcut-focus.js')"), false, 'retired Prompt-only shim must not be loaded');
});

test('shared focus tokens are present for keyboard-first UI', () => {
  const css = read('qpl-design-tokens.css');
  for (const token of ['--qpl-focus-color', '--qpl-focus-width', '--qpl-focus-offset']) {
    assert.ok(css.includes(token), `${token} must exist`);
  }
});
