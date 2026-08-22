const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../reds-x-search-core.js');

function queryFrom(url) {
  return url ? new URL(url).searchParams.get('q') : '';
}

test('REDSOFFICIAL remains the default X account', () => {
  assert.equal(core.DEFAULT_X_ACCOUNT, 'REDSOFFICIAL');
});

test('X account normalization accepts @handle and x/twitter profile URLs', () => {
  assert.equal(core.normalizeAccount('@REDSOFFICIAL'), 'REDSOFFICIAL');
  assert.equal(core.normalizeAccount('https://x.com/ManUtd'), 'ManUtd');
  assert.equal(core.normalizeAccount('https://twitter.com/Arsenal/status/123'), 'Arsenal');
});

test('keyword + account uses the current from: account', () => {
  assert.equal(
    queryFrom(core.buildXSearchUrl({ keyword: '移籍', account: 'REDSOFFICIAL' })),
    '移籍 from:REDSOFFICIAL'
  );
});

test('blank keyword searches the account name itself', () => {
  assert.equal(
    queryFrom(core.buildXSearchUrl({ keyword: '   ', account: '@REDSOFFICIAL' })),
    'REDSOFFICIAL'
  );
});

test('keyword-only search still works when account is blank', () => {
  assert.equal(
    queryFrom(core.buildXSearchUrl({ keyword: '浦和レッズ', account: '' })),
    '浦和レッズ'
  );
});

test('both X fields blank produces no search URL', () => {
  assert.equal(core.buildXSearchUrl({ keyword: '', account: '' }), '');
});

test('X date range keeps start inclusive and end as next-day exclusive', () => {
  assert.equal(
    queryFrom(core.buildXSearchUrl({
      keyword: '移籍',
      account: 'REDSOFFICIAL',
      start: '2026-08-20',
      end: '2026-08-22'
    })),
    '移籍 from:REDSOFFICIAL since:2026-08-20 until:2026-08-23'
  );
});
