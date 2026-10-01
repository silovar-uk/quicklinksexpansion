const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../x-search-core.js');

test('plain keyword search has no account or club-specific default', () => {
  assert.equal(Core.buildXSearchQuery({ allWords: '生成AI' }), '生成AI');
  assert.equal(
    Core.buildXSearchUrl({ allWords: '生成AI' }),
    'https://x.com/search?q=%E7%94%9F%E6%88%90AI&f=live'
  );
});

test('advanced fields compile to X query syntax', () => {
  assert.equal(
    Core.buildXSearchQuery({
      allWords: '生成AI',
      exactPhrase: '業務改善',
      anyWords: 'Gemini Claude',
      excludeWords: '広告 PR',
      hashtags: 'AI DX',
      fromAccount: '@OpenAI',
      toAccount: 'google',
      mentions: 'Microsoft',
      language: 'ja',
      start: '2026-09-01',
      end: '2026-09-30'
    }),
    '生成AI "業務改善" (Gemini OR Claude) -広告 -PR #AI #DX from:OpenAI to:google @Microsoft lang:ja since:2026-09-01 until:2026-10-01'
  );
});

test('account URLs normalize without forcing a default account', () => {
  assert.equal(Core.normalizeAccount('https://x.com/OpenAI'), 'OpenAI');
  assert.equal(Core.normalizeAccount('@OpenAI'), 'OpenAI');
  assert.equal(Core.normalizeAccount(''), '');
});

test('query mirror describes the intended search', () => {
  const summary = Core.buildSummary({
    allWords: '生成AI',
    excludeWords: '広告',
    fromAccount: 'OpenAI',
    start: '2026-09-01',
    end: '2026-09-30'
  });
  assert.match(summary, /生成AI/);
  assert.match(summary, /広告/);
  assert.match(summary, /@OpenAI/);
  assert.match(summary, /2026-09-01/);
});

test('advanced filter count excludes the main keyword', () => {
  assert.equal(Core.getActiveFilterCount({ allWords: '生成AI' }), 0);
  assert.equal(Core.getActiveFilterCount({ allWords: '生成AI', language: 'ja', start: '2026-09-01' }), 2);
});
