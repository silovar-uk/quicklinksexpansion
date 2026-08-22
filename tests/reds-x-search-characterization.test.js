const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

test('mature sidepanel owns effective X URL construction without runtime override', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'sidepanel.js'), 'utf8');

  assert.match(source, /QuickLinksRedsXSearchCore/);
  assert.match(source, /Core\.buildXSearchUrl/);
  assert.match(source, /accountInput \? accountInput\.value : Core\.DEFAULT_X_ACCOUNT/);
  assert.match(source, /getElementById\('reds-x'\)\?\.addEventListener\('click', runRedsXSearchSidepanel\)/);
  assert.match(source, /if \(isXSearchShortcut\) runRedsXSearchSidepanel\(\)/);
  assert.match(source, /if \(message\.action === 'search-x'\) runRedsXSearchSidepanel\(\)/);
});

test('X polish no longer overrides mature functions or capture-intercepts the X button', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'reds-x-search-polish.js'), 'utf8');

  assert.doesNotMatch(source, /buildRedsXUrlSidepanel\s*=\s*buildXSearchUrl/);
  assert.doesNotMatch(source, /runRedsXSearchSidepanel\s*=\s*runXSearch/);
  assert.doesNotMatch(source, /stopImmediatePropagation\(\)/);
  assert.doesNotMatch(source, /installFunctionOverrides|installButtonGuard/);
  assert.match(source, /if \(typeof runRedsXSearchSidepanel === 'function'\)/);
  assert.match(source, /runRedsXSearchSidepanel\(\)/);
});
