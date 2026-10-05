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
  const contractIndex = scripts.indexOf('app-contract.js');
  const coreIndex = scripts.indexOf('interaction-core.js');
  const bridgeIndex = scripts.indexOf('interaction-bridge.js');
  const floatingIndex = scripts.indexOf('content-floating-search.js');

  assert.ok(contractIndex >= 0, 'app-contract.js must be in content_scripts');
  assert.ok(coreIndex > contractIndex, 'interaction-core.js must load after app-contract.js');
  assert.ok(bridgeIndex > coreIndex, 'interaction-bridge.js must load after interaction-core.js');
  assert.ok(floatingIndex > bridgeIndex, 'content-floating-search.js must load after the interaction bridge');
  assert.equal(scripts.includes('prompt-shortcut-focus.js'), false, 'retired Prompt-only shortcut shim must not be loaded');
});

test('sidepanel wrapper loads the shared interaction runtime in contract order', () => {
  const wrapper = read('sidepanel-wrapper.js');
  const contractIndex = wrapper.indexOf("loadScript('app-contract.js')");
  const coreIndex = wrapper.indexOf("loadScript('interaction-core.js')");
  const bridgeIndex = wrapper.indexOf("loadScript('interaction-bridge.js')");

  assert.ok(contractIndex >= 0, 'sidepanel wrapper must load app-contract.js');
  assert.ok(coreIndex > contractIndex, 'interaction-core.js must load after app-contract.js');
  assert.ok(bridgeIndex > coreIndex, 'sidepanel wrapper must load interaction-bridge.js after the core');
  assert.equal(wrapper.includes("loadScript('prompt-shortcut-focus.js')"), false, 'retired Prompt-only shim must not be loaded');
});

test('shared focus tokens are present for keyboard-first UI', () => {
  const css = read('qpl-design-tokens.css');
  for (const token of ['--qpl-focus-color', '--qpl-focus-width', '--qpl-focus-offset']) {
    assert.ok(css.includes(token), `${token} must exist`);
  }
});

test('Floating POP plain Escape is a one-step-back action and collapse preserves focus', () => {
  const floating = read('content-floating-search.js');

  assert.ok(floating.includes("if (event.key === 'Escape' && noModifier)"), 'plain Escape must have a Floating POP handler');
  assert.ok(floating.includes('if (closeTopFloatingOverlay()) return;'), 'Escape must close the top overlay before collapsing');
  assert.ok(floating.includes('if (searchProjectFilterExpanded) {'), 'Escape must respect the project-filter layer');
  assert.ok(floating.includes('collapseFloatingPanel();'), 'Escape must collapse the expanded POP when no inner layer remains');
  assert.ok(floating.includes("shadow?.getElementById('ql-open-panel')"), 'collapse must restore focus to the launcher');
  assert.ok(floating.includes('小さくする（Esc / Alt+W）'), 'the visible collapse control must surface Esc as the primary hint');
});
