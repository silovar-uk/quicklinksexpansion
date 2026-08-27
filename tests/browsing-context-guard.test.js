const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const guard = require('../link-browsing-context-guard.js');

test('background-open intent covers Ctrl/Cmd click and middle click', () => {
  assert.equal(guard.isBackgroundOpenEvent({ type: 'click', ctrlKey: true, metaKey: false }), true);
  assert.equal(guard.isBackgroundOpenEvent({ type: 'click', ctrlKey: false, metaKey: true }), true);
  assert.equal(guard.isBackgroundOpenEvent({ type: 'auxclick', button: 1 }), true);
  assert.equal(guard.isBackgroundOpenEvent({ type: 'click', ctrlKey: false, metaKey: false }), false);
  assert.equal(guard.isBackgroundOpenEvent({ type: 'auxclick', button: 2 }), false);
});

test('background keyboard activation is recognized without stealing plain Enter', () => {
  assert.equal(guard.isBackgroundOpenEvent({ type: 'keydown', key: 'Enter', ctrlKey: true }), true);
  assert.equal(guard.isBackgroundOpenEvent({ type: 'keydown', key: ' ', metaKey: true }), true);
  assert.equal(guard.isBackgroundOpenEvent({ type: 'keydown', key: 'Enter', ctrlKey: false, metaKey: false }), false);
});

test('anchored scroll keeps the clicked item at the same visual offset', () => {
  assert.equal(guard.computeAnchoredScrollTop({
    scrollTop: 0,
    anchorTopBefore: 80,
    anchorTopAfter: 420,
    maxScrollTop: 1000
  }), 340);

  assert.equal(guard.computeAnchoredScrollTop({
    scrollTop: 300,
    anchorTopBefore: 120,
    anchorTopAfter: 60,
    maxScrollTop: 1000
  }), 240);
});

test('anchored scroll clamps to valid scroll bounds', () => {
  assert.equal(guard.computeAnchoredScrollTop({ scrollTop: 20, anchorTopBefore: 100, anchorTopAfter: 0, maxScrollTop: 500 }), 0);
  assert.equal(guard.computeAnchoredScrollTop({ scrollTop: 490, anchorTopBefore: 0, anchorTopAfter: 100, maxScrollTop: 500 }), 500);
});

test('runtime loaders include the browsing-context guard on both surfaces', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
  const wrapper = fs.readFileSync(path.join(repoRoot, 'sidepanel-wrapper.js'), 'utf8');
  const scripts = manifest.content_scripts.flatMap(entry => entry.js || []);
  const floatingIndex = scripts.indexOf('content-floating-search.js');
  const guardIndex = scripts.indexOf('link-browsing-context-guard.js');

  assert.notEqual(floatingIndex, -1);
  assert.ok(guardIndex > floatingIndex, 'floating guard must load after content-floating-search.js');
  assert.match(wrapper, /loadScript\('link-browsing-context-guard\.js'\)/);
});
