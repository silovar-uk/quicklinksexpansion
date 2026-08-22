const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function extractBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `missing marker: ${startMarker}`);
  assert.ok(end > start, `missing marker: ${endMarker}`);
  return source.slice(start, end);
}

function loadStorageMergeApi() {
  const snippet = extractBetween('function cloneStorageValue', 'async function commitStorageState');
  const context = { console, JSON, Map, Set, Object, Math, Number, Date };
  context.globalThis = context;
  vm.runInNewContext(
    `${snippet}\nglobalThis.__api = { mergeRecordArray, mergeStringArray, mergeObjectValue };`,
    context,
    { filename: 'background-storage-merge.js' }
  );
  return context.__api;
}

function loadDynamicUrlApi() {
  const snippet = extractBetween("const QUICK_LINKS_DYNAMIC_PROTOCOL = 'quicklinks:';", 'function createBuiltInLink');
  const context = { console, URL, Date, Intl, Object, String, Number, Math };
  context.globalThis = context;
  vm.runInNewContext(
    `${snippet}\nglobalThis.__api = { parseBacklogCalendarRange, buildBacklogUpdatedRangeUrl, resolveQuickLinksDynamicUrl };`,
    context,
    { filename: 'background-dynamic-url.js' }
  );
  return context.__api;
}

test('record merge keeps remote-only records and applies local field edits', () => {
  const api = loadStorageMergeApi();
  const base = [{ id: 'a', title: 'old', clickCount: 2 }];
  const current = [{ id: 'a', title: 'new', clickCount: 3 }];
  const remote = [
    { id: 'a', title: 'old', clickCount: 4 },
    { id: 'b', title: 'remote-only', clickCount: 1 }
  ];
  const merged = api.mergeRecordArray(remote, base, current);
  assert.deepEqual(JSON.parse(JSON.stringify(merged)), [
    { id: 'a', title: 'new', clickCount: 5 },
    { id: 'b', title: 'remote-only', clickCount: 1 }
  ]);
});

test('local deletion wins over a stale remote record', () => {
  const api = loadStorageMergeApi();
  const merged = api.mergeRecordArray([{ id: 'a', title: 'remote' }], [{ id: 'a', title: 'base' }], []);
  assert.deepEqual(JSON.parse(JSON.stringify(merged)), []);
});

test('string-array merge preserves remote additions but respects local removals', () => {
  const api = loadStorageMergeApi();
  const merged = api.mergeStringArray(['A', 'B', 'C'], ['A', 'B'], ['A', 'D']);
  assert.deepEqual(Array.from(merged), ['A', 'D', 'C']);
});

test('object merge applies local edits and deletions over remote state', () => {
  const api = loadStorageMergeApi();
  const merged = api.mergeObjectValue(
    { red: '#f00', blue: '#00f', green: '#0f0' },
    { red: '#faa', blue: '#00f' },
    { red: '#f11' }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(merged)), { red: '#f11', green: '#0f0' });
});

test('Backlog dynamic range parser accepts 1..366 calendar days only', () => {
  const api = loadDynamicUrlApi();
  assert.equal(api.parseBacklogCalendarRange('quicklinks://backlog/updated?range=last-2-calendar-days').dayCount, 2);
  assert.equal(api.parseBacklogCalendarRange('quicklinks://backlog/updated?range=last-367-calendar-days'), null);
  assert.equal(api.parseBacklogCalendarRange('https://example.com/'), null);
});

test('Backlog dynamic URL resolves using JST calendar boundaries', () => {
  const api = loadDynamicUrlApi();
  const now = new Date('2026-08-22T01:30:00.000Z'); // 2026-08-22 10:30 JST
  const resolved = new URL(api.resolveQuickLinksDynamicUrl(
    'quicklinks://backlog/updated?range=last-2-calendar-days',
    now
  ));
  assert.equal(resolved.hostname, 'urawa-cr.backlog.com');
  assert.equal(resolved.searchParams.get('updatedRange.begin'), '2026/08/21');
  assert.equal(resolved.searchParams.get('updatedRange.end'), '2026/08/22');
  assert.deepEqual(resolved.searchParams.getAll('statusId'), ['1', '2', '3']);
});
