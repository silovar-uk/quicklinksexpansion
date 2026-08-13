const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../log-relay-core.js');
const shortcuts = require('../shortcut-registry.js');

function entry(overrides = {}) {
  return {
    id: 'lr-test', memo: 'memo', status: 'inbox',
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
    ...overrides
  };
}

test('move to trash sets trashedAt', () => {
  const next = core.moveToStatus(entry(), 'trash', '2026-08-13T01:00:00.000Z');
  assert.equal(next.status, 'trash');
  assert.equal(next.trashedAt, '2026-08-13T01:00:00.000Z');
});

test('restore from trash removes trashedAt', () => {
  const next = core.moveToStatus(entry({ status: 'trash', trashedAt: '2026-08-13T01:00:00.000Z' }), 'inbox', '2026-08-13T02:00:00.000Z');
  assert.equal(next.status, 'inbox');
  assert.equal(Object.hasOwn(next, 'trashedAt'), false);
});

test('trash survives before 24h and expires at 24h', () => {
  const trashed = entry({ status: 'trash', trashedAt: '2026-08-13T01:00:00.000Z' });
  const start = Date.parse(trashed.trashedAt);
  assert.equal(core.isTrashExpired(trashed, start + core.TRASH_TTL_MS - 1), false);
  assert.equal(core.isTrashExpired(trashed, start + core.TRASH_TTL_MS), true);
});

test('sort direction is deterministic', () => {
  const list = [entry({ id: 'b', createdAt: '2026-08-13T02:00:00.000Z' }), entry({ id: 'a', createdAt: '2026-08-13T01:00:00.000Z' })];
  assert.deepEqual(core.sortEntries(list, 'asc').map(x => x.id), ['a', 'b']);
  assert.deepEqual(core.sortEntries(list, 'desc').map(x => x.id), ['b', 'a']);
});

test('index normalization removes blanks and duplicates', () => {
  assert.deepEqual(core.normalizeIndex(['a', 'a', '', 'b', null]), ['a', 'b']);
});

test('Alt+M matches Log capture shortcut', () => {
  assert.equal(shortcuts.matches({ altKey: true, shiftKey: false, ctrlKey: false, metaKey: false, code: 'KeyM', key: 'm' }, shortcuts.registry.log.add), true);
  assert.equal(shortcuts.matches({ altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, code: 'KeyM', key: 'M' }, shortcuts.registry.log.add), false);
});

test('Alt+Shift+M matches Log panel shortcut', () => {
  assert.equal(shortcuts.matches({ altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, code: 'KeyM', key: 'M' }, shortcuts.registry.log.open), true);
  assert.equal(shortcuts.matches({ altKey: true, shiftKey: false, ctrlKey: false, metaKey: false, code: 'KeyM', key: 'm' }, shortcuts.registry.log.open), false);
});

test('Alt+Shift+1..5 maps to the five Log views', () => {
  for (const [key, view] of Object.entries({ 1: 'all', 2: 'inbox', 3: 'hold', 4: 'done', 5: 'trash' })) {
    assert.equal(shortcuts.getLogView({ altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, key }), view);
  }
});
