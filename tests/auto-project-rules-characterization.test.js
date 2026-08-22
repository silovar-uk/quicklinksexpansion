const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadApi() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'auto-project-rules.js'), 'utf8');
  const context = { console, URL, Date, Math };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'auto-project-rules.js' });
  return context.QuickLinksAutoRules;
}

test('bare LINE WORKS channel ID becomes the canonical send URL', () => {
  const api = loadApi();
  assert.equal(
    api.normalizeIncomingUrl('123456789'),
    'https://line.worksmobile.com/message/send?version=26&channelId=123456789'
  );
});

test('LINE WORKS URLs with the same channelId canonicalize to one identity', () => {
  const api = loadApi();
  const a = 'https://line.worksmobile.com/message/send?version=26&channelId=123456789';
  const b = 'https://talk.worksmobile.com/join?foo=1&channelId=123456789';
  assert.equal(api.canonicalizeComparableUrl(a), 'lineworks-channel:123456789');
  assert.equal(api.canonicalizeComparableUrl(b), 'lineworks-channel:123456789');
});

test('LINE WORKS UUID channel IDs are normalized case-insensitively', () => {
  const api = loadApi();
  const upper = 'AA48CC5F-B262-7C3B-54B4-E10B84C61B99';
  assert.equal(api.normalizeLineWorksChannelId(upper), upper.toLowerCase());
});

test('built-in quicklinks:// dynamic URL remains a valid stored link', () => {
  const api = loadApi();
  const dynamicUrl = 'quicklinks://backlog/updated?range=last-2-calendar-days';
  const result = api.normalizeAndValidateLinkInput({ url: dynamicUrl, title: 'Backlog' });
  assert.equal(result.ok, true);
  assert.equal(result.url, dynamicUrl);
  assert.equal(api.canonicalizeComparableUrl(dynamicUrl), dynamicUrl);
});

test('unsafe URL schemes remain rejected', () => {
  const api = loadApi();
  const result = api.normalizeAndValidateLinkInput({ url: 'javascript:alert(1)' });
  assert.equal(result.ok, false);
});
