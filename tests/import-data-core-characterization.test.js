const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadApi() {
  const context = { console, URL, Date, Math, Map, Set, Object, String, Number, Array };
  context.globalThis = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'auto-project-rules.js'), 'utf8'),
    context,
    { filename: 'auto-project-rules.js' }
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'quick-links-import-core.js'), 'utf8'),
    context,
    { filename: 'quick-links-import-core.js' }
  );
  return context.QuickLinksImportCore;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('import core accepts current backup and legacy data shapes', () => {
  const api = loadApi();
  const backup = {
    quickLinks: { items: [{ id: 'link' }], autoProjectRules: [{ id: 'rule' }] },
    promptMemos: { items: [{ id: 'prompt' }], categories: ['仕事'] }
  };

  assert.deepEqual(plain(api.normalizeImportedQuickLinkItems(backup)), [{ id: 'link' }]);
  assert.deepEqual(plain(api.normalizeImportedAutoProjectRules(backup)), [{ id: 'rule' }]);
  assert.deepEqual(plain(api.normalizeImportedPromptMemoItems(backup)), [{ id: 'prompt' }]);
  assert.deepEqual(plain(api.normalizeImportedPromptCategories(backup)), ['仕事']);
  assert.deepEqual(plain(api.normalizeImportedQuickLinkItems([{ id: 'legacy-link' }])), [{ id: 'legacy-link' }]);
});

test('Quick Link duplicate key preserves active/archive separation and canonical URL identity', () => {
  const api = loadApi();
  const canonical = 'https://line.worksmobile.com/message/send?version=26&channelId=123456789';
  const alternate = 'https://talk.worksmobile.com/join?channelId=123456789';
  const base = { title: 'Team  Link', projectName: 'Work', note: 'memo', archived: false };

  assert.equal(
    api.getQuickLinkDuplicateKey({ ...base, url: canonical }),
    api.getQuickLinkDuplicateKey({ ...base, title: 'Team Link', url: alternate })
  );
  assert.notEqual(
    api.getQuickLinkDuplicateKey({ ...base, url: canonical }),
    api.getQuickLinkDuplicateKey({ ...base, url: canonical, archived: true })
  );
});

test('Quick Link compaction merges usage history without changing the surviving display record', () => {
  const api = loadApi();
  const result = api.compactDuplicateQuickLinks([
    {
      id: 'first', title: 'Same Link', url: 'https://example.com/path', projectName: '仕事', note: '',
      addedAt: '2026-08-20T00:00:00.000Z', lastClickedAt: '2026-08-21T00:00:00.000Z',
      clickCount: 2, clickHistory: ['2026-08-21T00:00:00.000Z'], favoriteType: 'normal'
    },
    {
      id: 'second', title: 'Same  Link', url: 'https://example.com/path', projectName: '仕事', note: '',
      addedAt: '2026-08-19T00:00:00.000Z', lastClickedAt: '2026-08-22T00:00:00.000Z',
      clickCount: 5, clickHistory: ['2026-08-20T00:00:00.000Z', '2026-08-22T00:00:00.000Z'],
      favoriteType: 'temp', favoriteExpiry: '2026-08-24T00:00:00.000Z'
    }
  ]);

  assert.equal(result.removed, 1);
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].id, 'first');
  assert.equal(result.list[0].addedAt, '2026-08-19T00:00:00.000Z');
  assert.equal(result.list[0].lastClickedAt, '2026-08-22T00:00:00.000Z');
  assert.equal(result.list[0].clickCount, 5);
  assert.equal(result.list[0].favoriteType, 'temp');
  assert.deepEqual(plain(result.list[0].clickHistory), [
    '2026-08-20T00:00:00.000Z',
    '2026-08-21T00:00:00.000Z',
    '2026-08-22T00:00:00.000Z'
  ]);
});

test('Prompt compaction keeps one exact memo and merges usage timestamps and count', () => {
  const api = loadApi();
  const result = api.compactDuplicatePromptMemos([
    {
      id: 'first', title: ' Draft ', body: 'line 1\r\nline 2', categoryName: '仕事',
      createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-21T00:00:00.000Z', copyCount: 2
    },
    {
      id: 'second', title: 'Draft', body: 'line 1\nline 2', categoryName: '仕事',
      createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z',
      lastCopiedAt: '2026-08-22T01:00:00.000Z', copyCount: 4
    }
  ]);

  assert.equal(result.removed, 1);
  assert.equal(result.list[0].id, 'first');
  assert.equal(result.list[0].createdAt, '2026-08-19T00:00:00.000Z');
  assert.equal(result.list[0].updatedAt, '2026-08-22T00:00:00.000Z');
  assert.equal(result.list[0].lastCopiedAt, '2026-08-22T01:00:00.000Z');
  assert.equal(result.list[0].copyCount, 4);
});

test('project normalization keeps 未分類 first and removes duplicates', () => {
  const api = loadApi();
  assert.deepEqual(
    plain(api.normalizeProjectsFromItems(['仕事', '未分類', '仕事'], [{ projectName: '個人' }, { projectName: '' }])),
    ['未分類', '仕事', '個人']
  );
});

test('sidepanel loads and owns import behavior through the extracted core', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel.html'), 'utf8');
  const sidepanel = fs.readFileSync(path.join(__dirname, '..', 'sidepanel.js'), 'utf8');
  const autoRulesIndex = html.indexOf('<script src="auto-project-rules.js"></script>');
  const importCoreIndex = html.indexOf('<script src="quick-links-import-core.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');

  assert.ok(autoRulesIndex >= 0 && autoRulesIndex < importCoreIndex);
  assert.ok(importCoreIndex < sidepanelIndex);
  assert.match(sidepanel, /const QuickLinksImportCore = globalThis\.QuickLinksImportCore/);
  assert.doesNotMatch(sidepanel, /function compactDuplicateQuickLinks\(/);
  assert.doesNotMatch(sidepanel, /function mergePromptMemoRecord\(/);
});
