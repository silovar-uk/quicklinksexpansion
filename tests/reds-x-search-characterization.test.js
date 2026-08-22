const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'reds-x-search-polish.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const instrumentationMarker = "  if (document.readyState === 'loading') {";
assert.ok(source.includes(instrumentationMarker), 'X search module initialization marker changed');

function loadModule(values = {}) {
  const elements = new Map();
  const makeInput = value => ({ value: String(value ?? ''), focus() {}, addEventListener() {} });
  elements.set('reds-search', makeInput(values.keyword));
  elements.set('reds-x-account', makeInput(values.account));
  elements.set('reds-date-start', makeInput(values.start));
  elements.set('reds-date-end', makeInput(values.end));

  const document = {
    readyState: 'loading',
    documentElement: {},
    head: { appendChild() {} },
    getElementById(id) { return elements.get(id) || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { id: '', textContent: '', addEventListener() {}, querySelector() { return null; } }; },
    addEventListener() {}
  };

  const context = {
    console,
    document,
    chrome: { tabs: { create: async () => true } },
    MutationObserver: class { observe() {} disconnect() {} },
    URL,
    Date,
    setTimeout,
    clearTimeout
  };
  context.window = context;
  context.globalThis = context;

  const instrumented = source.replace(
    instrumentationMarker,
    `  globalThis.__redsXTestApi = { DEFAULT_X_ACCOUNT, normalizeAccount, addDaysToDateValue, buildXSearchUrl };\n\n${instrumentationMarker}`
  );
  vm.runInNewContext(instrumented, context, { filename: 'reds-x-search-polish.js' });

  return { api: context.__redsXTestApi, elements };
}

function queryFrom(url) {
  return url ? new URL(url).searchParams.get('q') : '';
}

test('REDSOFFICIAL remains the default X account', () => {
  const { api } = loadModule();
  assert.equal(api.DEFAULT_X_ACCOUNT, 'REDSOFFICIAL');
});

test('X account normalization accepts @handle and x/twitter profile URLs', () => {
  const { api } = loadModule();
  assert.equal(api.normalizeAccount('@REDSOFFICIAL'), 'REDSOFFICIAL');
  assert.equal(api.normalizeAccount('https://x.com/ManUtd'), 'ManUtd');
  assert.equal(api.normalizeAccount('https://twitter.com/Arsenal/status/123'), 'Arsenal');
});

test('keyword + account uses the current from: account', () => {
  const { api } = loadModule({ keyword: '移籍', account: 'REDSOFFICIAL' });
  assert.equal(queryFrom(api.buildXSearchUrl()), '移籍 from:REDSOFFICIAL');
});

test('blank keyword searches the account name itself', () => {
  const { api } = loadModule({ keyword: '   ', account: '@REDSOFFICIAL' });
  assert.equal(queryFrom(api.buildXSearchUrl()), 'REDSOFFICIAL');
});

test('keyword-only search still works when account is blank', () => {
  const { api } = loadModule({ keyword: '浦和レッズ', account: '' });
  assert.equal(queryFrom(api.buildXSearchUrl()), '浦和レッズ');
});

test('both X fields blank produces no search URL', () => {
  const { api } = loadModule({ keyword: '', account: '' });
  assert.equal(api.buildXSearchUrl(), '');
});

test('X date range keeps start inclusive and end as next-day exclusive', () => {
  const { api } = loadModule({
    keyword: '移籍',
    account: 'REDSOFFICIAL',
    start: '2026-08-20',
    end: '2026-08-22'
  });
  assert.equal(
    queryFrom(api.buildXSearchUrl()),
    '移籍 from:REDSOFFICIAL since:2026-08-20 until:2026-08-23'
  );
});
