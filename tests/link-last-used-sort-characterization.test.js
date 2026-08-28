const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sidepanel = fs.readFileSync('sidepanel.js', 'utf8');
const floating = fs.readFileSync('content-floating-search.js', 'utf8');
const background = fs.readFileSync('background.js', 'utf8');

function safeTime(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : 0;
}

function compareLastUsed(a, b) {
  const lastUsedDiff = safeTime(b.lastClickedAt) - safeTime(a.lastClickedAt);
  if (lastUsedDiff !== 0) return lastUsedDiff;
  const addedDiff = safeTime(b.addedAt) - safeTime(a.addedAt);
  if (addedDiff !== 0) return addedDiff;
  return String(b.id || '').localeCompare(String(a.id || ''));
}

test('Side Panel and Floating POP both expose LAST_USED as 使用順', () => {
  assert.ok(sidepanel.includes("['DATE', 'PROJECT', 'CLICKS', 'LAST_USED']"));
  assert.ok(floating.includes("['DATE', 'PROJECT', 'CLICKS', 'LAST_USED']"));
  assert.ok(sidepanel.includes("case 'LAST_USED':"));
  assert.ok(sidepanel.includes("label.textContent = '使用順'"));
  assert.ok(floating.includes("if (normalized === 'LAST_USED') return { icon: '↺', label: '使用順' };"));
  assert.ok(sidepanel.includes("if (mode === 'CLICKS') return 'LAST_USED';"));
  assert.ok(floating.includes("if (normalized === 'CLICKS') return 'LAST_USED';"));
});

test('both surfaces sort LAST_USED from lastClickedAt and fall back to addedAt', () => {
  assert.ok(sidepanel.includes("currentSortMode === 'LAST_USED'"));
  assert.ok(sidepanel.includes('getLinkSortTimeSidepanel(a.lastClickedAt)'));
  assert.ok(sidepanel.includes('getLinkSortTimeSidepanel(a.addedAt)'));
  assert.ok(floating.includes("currentSortMode === 'LAST_USED'"));
  assert.ok(floating.includes('getFloatingLinkSortTime(b.lastClickedAt)'));
  assert.ok(floating.includes('getFloatingLinkSortTime(b.addedAt)'));

  const ordered = [
    { id: 'unused-new', addedAt: '2026-08-27T00:00:00.000Z', lastClickedAt: null },
    { id: 'used-old', addedAt: '2026-08-20T00:00:00.000Z', lastClickedAt: '2026-08-26T00:00:00.000Z' },
    { id: 'invalid-new', addedAt: '2026-08-28T00:00:00.000Z', lastClickedAt: 'not-a-date' },
    { id: 'used-new', addedAt: '2026-08-10T00:00:00.000Z', lastClickedAt: '2026-08-28T00:00:00.000Z' },
    { id: 'unused-old', addedAt: '2026-08-01T00:00:00.000Z' }
  ].sort(compareLastUsed).map(item => item.id);

  assert.deepEqual(ordered, ['used-new', 'used-old', 'invalid-new', 'unused-new', 'unused-old']);
});

test('LAST_USED ordering is deterministic when timestamps tie', () => {
  const ordered = [
    { id: 'a', addedAt: '2026-08-28T00:00:00.000Z', lastClickedAt: '2026-08-28T01:00:00.000Z' },
    { id: 'b', addedAt: '2026-08-28T00:00:00.000Z', lastClickedAt: '2026-08-28T01:00:00.000Z' }
  ].sort(compareLastUsed).map(item => item.id);
  assert.deepEqual(ordered, ['b', 'a']);
});

test('existing atomic click path remains the owner of lastClickedAt', () => {
  assert.ok(background.includes('async function recordItemClickAtomic(id)'));
  assert.ok(background.includes('lastClickedAt: now'));
  assert.ok(background.includes('clickCount: Math.max(0, Number(normalized?.clickCount || 0)) + 1'));
});
