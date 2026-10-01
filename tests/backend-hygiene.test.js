'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = path => fs.readFileSync(path, 'utf8');

test('runtime composition loads app contract before dependent modules', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const scripts = manifest.content_scripts?.[0]?.js || [];
  assert.equal(scripts[0], 'app-contract.js');
  assert.ok(scripts.indexOf('app-contract.js') < scripts.indexOf('interaction-core.js'));
  assert.ok(scripts.indexOf('app-contract.js') < scripts.indexOf('content-floating-search.js'));

  const background = read('background-wrapper.js');
  assert.ok(background.indexOf("'app-contract.js'") < background.indexOf("'side-panel-presence-background.js'"));
  assert.ok(background.indexOf("'side-panel-presence-background.js'") < background.indexOf("'background.js'"));
  assert.ok(background.indexOf("'ui-context-background.js'") < background.indexOf("'background.js'"));

  const sidepanel = read('sidepanel-wrapper.js');
  assert.ok(sidepanel.indexOf("loadScript('app-contract.js')") < sidepanel.indexOf("loadScript('interaction-core.js')"));
  assert.ok(sidepanel.includes("loadScript('ui-context-sidepanel.js')"));
});

test('side-panel presence is event-driven on supported Chrome with heartbeat fallback only', () => {
  const presence = read('side-panel-presence-background.js');
  const background = read('background.js');
  const sidepanel = read('sidepanel.js');

  assert.match(presence, /sidePanel\.onOpened\.addListener/);
  assert.match(presence, /sidePanel\.onClosed\.addListener/);
  assert.match(presence, /storage\.session/);
  assert.match(presence, /requiresHeartbeat/);
  assert.doesNotMatch(background, /function updateSidePanelHeartbeat/);
  assert.match(sidepanel, /needsLegacySidePanelHeartbeat/);
});

test('new install defaults contain no historical club-specific seed', () => {
  const background = read('background.js');
  const rules = read('default-auto-project-rules.json');
  assert.match(background, /const INITIAL_ITEMS = \[\];/);
  assert.doesNotMatch(background, /urawa-reds\.co\.jp/i);
  assert.doesNotMatch(rules, /urawa-reds\.co\.jp/i);
  assert.doesNotMatch(rules, /"projectName": "クラブ発信"/);
});

test('retired REDS compatibility files are gone', () => {
  assert.equal(fs.existsSync('reds-x-search-core.js'), false);
  assert.equal(fs.existsSync('reds-x-search-polish.js'), false);
});

test('floating to sidepanel handoff preserves context through session storage', () => {
  const background = read('ui-context-background.js');
  const floating = read('content-floating-search.js');
  const sidepanel = read('sidepanel.js');
  const restore = read('ui-context-sidepanel.js');

  assert.match(background, /HANDOFF_TO_SIDE_PANEL/);
  assert.match(background, /storage\.session/);
  assert.match(floating, /buildFloatingUiContext/);
  assert.match(floating, /HANDOFF_TO_SIDE_PANEL/);
  assert.match(sidepanel, /QuickLinksSidepanelApi/);
  assert.match(restore, /applyUiContext/);
});

test('mode selector uses a neutral shared visual language', () => {
  const css = read('qpl-design-tokens.css');
  assert.match(css, /modes behave like one workspace selector/);
  assert.match(css, /background: #eef2f6 !important/);
  assert.match(css, /\.app-mode-tabs \.app-mode-btn\.active/);
});
