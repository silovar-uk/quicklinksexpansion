const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('sidepanel wrapper loads the consolidated shell and not the retired toolbar polish', () => {
  const wrapper = read('sidepanel-wrapper.js');
  assert.match(wrapper, /sidepanel-shell\.css/);
  assert.match(wrapper, /sidepanel-shell\.js/);
  assert.doesNotMatch(wrapper, /sidepanel-toolbar-polish/);
});

test('quiet shell hides persistent brand chrome and keeps shared search compact', () => {
  const css = read('sidepanel-shell.css');
  assert.match(css, /header \.brand-icon,[\s\S]*header h1 \{[\s\S]*display: none !important;/);
  assert.match(css, /\.search-input \{[\s\S]*height: 32px !important;/);
  assert.match(css, /header \{[\s\S]*box-shadow: none !important;/);
});

test('mode navigation is a four-column flat tab strip', () => {
  const css = read('sidepanel-shell.css');
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) !important;/);
  assert.match(css, /border-bottom: 2px solid transparent !important;/);
  assert.match(css, /\.app-mode-tabs \.app-mode-btn\.active\.links/);
  assert.match(css, /#log-relay-mode\.app-mode-btn\.active/);
});

test('shell preserves the compact add-current behavior and normalizes mode labels', () => {
  const js = read('sidepanel-shell.js');
  assert.match(js, /toolbar\.insertBefore\(addButton, toolbar\.firstChild\)/);
  assert.match(js, /'mode-links': 'Links'/);
  assert.match(js, /'mode-reds': 'REDS'/);
  assert.match(js, /'mode-prompts': 'Prompt'/);
  assert.match(js, /'log-relay-mode': 'LOG'/);
});

test('design tokens expose semantic shell controls instead of layout rules', () => {
  const tokens = read('qpl-design-tokens.css');
  assert.match(tokens, /--qpl-control-h-sm: 24px;/);
  assert.match(tokens, /--qpl-focus-ring:/);
  assert.match(tokens, /--qpl-mode-log:/);
  assert.doesNotMatch(tokens, /\.app-mode-tabs/);
});
