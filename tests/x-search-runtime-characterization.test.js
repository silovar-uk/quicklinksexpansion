const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../x-search-core.js');

function queryFrom(url) {
  return url ? new URL(url).searchParams.get('q') : '';
}

test('generic X search has no default account or club-specific query', () => {
  assert.equal(queryFrom(core.buildXSearchUrl({ allWords: '生成AI' })), '生成AI');
  assert.equal(core.buildXSearchUrl({ allWords: '', fromAccount: '' }), '');
});

test('X account normalization accepts @handle and x/twitter profile URLs', () => {
  assert.equal(core.normalizeAccount('@OpenAI'), 'OpenAI');
  assert.equal(core.normalizeAccount('https://x.com/ManUtd'), 'ManUtd');
  assert.equal(core.normalizeAccount('https://twitter.com/Arsenal/status/123'), 'Arsenal');
});

test('keyword + explicit account uses the selected from: account', () => {
  assert.equal(queryFrom(core.buildXSearchUrl({ allWords:'生成AI', fromAccount:'OpenAI' })), '生成AI from:OpenAI');
});

test('X date range keeps start inclusive and end as next-day exclusive', () => {
  assert.equal(
    queryFrom(core.buildXSearchUrl({ allWords:'生成AI', fromAccount:'OpenAI', start:'2026-09-01', end:'2026-09-30' })),
    '生成AI from:OpenAI since:2026-09-01 until:2026-10-01'
  );
});

test('sidepanel uses generic X core and no club-specific fallback', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'sidepanel.js'), 'utf8');
  assert.match(source, /QuickLinksXSearchCore/);
  assert.match(source, /Core\.buildXSearchUrl/);
  assert.match(source, /QuickLinksXSearchSidepanel/);
  assert.doesNotMatch(source, /site:urawa-reds\.co\.jp/);
  assert.doesNotMatch(source, /REDSOFFICIAL/);
  assert.doesNotMatch(source, /runRedsGoogleSearchSidepanel/);
});

test('retired REDS compatibility modules are not part of runtime composition', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const wrapper = fs.readFileSync(path.join(__dirname, '..', 'sidepanel-wrapper.js'), 'utf8');
  const scripts = (manifest.content_scripts || []).flatMap(entry => entry.js || []);
  assert.equal(scripts.some(file => file.startsWith('reds-x-search-')), false);
  assert.equal(wrapper.includes("reds-x-search-core.js"), false);
  assert.equal(wrapper.includes("reds-x-search-polish.js"), false);
});
