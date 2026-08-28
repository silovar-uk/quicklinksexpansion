const fs = require('fs');

function replaceOnce(source, search, replacement, label) {
  if (typeof search === 'string') {
    const first = source.indexOf(search);
    if (first < 0) throw new Error(`${label}: target not found`);
    if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label}: target is not unique`);
    return source.slice(0, first) + replacement + source.slice(first + search.length);
  }
  const matches = source.match(new RegExp(search.source, search.flags.includes('g') ? search.flags : search.flags + 'g')) || [];
  if (matches.length !== 1) throw new Error(`${label}: expected 1 match, got ${matches.length}`);
  return source.replace(search, replacement);
}

function patchFile(path, patches) {
  let source = fs.readFileSync(path, 'utf8');
  for (const [search, replacement, label] of patches) {
    source = replaceOnce(source, search, replacement, `${path} / ${label}`);
  }
  fs.writeFileSync(path, source);
}

const sidepanelSortOld = `  // ソート処理
  displayItems.sort((a, b) => {
    // ユーザーが選択した現在のソートモード（新着順・分類順・回数順）のみに従う
    if (currentSortMode === 'PROJECT') {
      if (a.projectName < b.projectName) return -1;
      if (a.projectName > b.projectName) return 1;
      return new Date(b.addedAt) - new Date(a.addedAt);
    } else if (currentSortMode === 'CLICKS') {
      const countA = a.clickCount || 0;
      const countB = b.clickCount || 0;
      if (countA !== countB) return countB - countA;
      return new Date(b.addedAt) - new Date(a.addedAt);
    } else {
      return new Date(b.addedAt) - new Date(a.addedAt);
    }
  });`;

const sidepanelSortNew = `  // ソート処理
  displayItems.sort((a, b) => {
    // ユーザーが選択した現在のソートモード（新着順・分類順・回数順・使用順）のみに従う
    if (currentSortMode === 'PROJECT') {
      if (a.projectName < b.projectName) return -1;
      if (a.projectName > b.projectName) return 1;
      return new Date(b.addedAt) - new Date(a.addedAt);
    } else if (currentSortMode === 'CLICKS') {
      const countA = a.clickCount || 0;
      const countB = b.clickCount || 0;
      if (countA !== countB) return countB - countA;
      return new Date(b.addedAt) - new Date(a.addedAt);
    } else if (currentSortMode === 'LAST_USED') {
      const lastUsedA = getLinkSortTimeSidepanel(a.lastClickedAt);
      const lastUsedB = getLinkSortTimeSidepanel(b.lastClickedAt);
      if (lastUsedA !== lastUsedB) return lastUsedB - lastUsedA;
      const addedA = getLinkSortTimeSidepanel(a.addedAt);
      const addedB = getLinkSortTimeSidepanel(b.addedAt);
      if (addedA !== addedB) return addedB - addedA;
      return String(b.id || '').localeCompare(String(a.id || ''));
    } else {
      return new Date(b.addedAt) - new Date(a.addedAt);
    }
  });`;

const sidepanelModesOld = `// リンク一覧は選択中の並び順（追加日／分類／回数）で表示するため、カードの手動ドラッグは行いません。

function normalizeLinkSortModeSidepanel(value) {
  return ['DATE', 'PROJECT', 'CLICKS'].includes(value) ? value : 'DATE';
}

function getNextLinkSortModeSidepanel(value = currentSortMode) {
  const mode = normalizeLinkSortModeSidepanel(value);
  if (mode === 'DATE') return 'PROJECT';
  if (mode === 'PROJECT') return 'CLICKS';
  return 'DATE';
}`;

const sidepanelModesNew = `// リンク一覧は選択中の並び順（追加日／分類／回数／使用）で表示するため、カードの手動ドラッグは行いません。

function getLinkSortTimeSidepanel(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : 0;
}

function normalizeLinkSortModeSidepanel(value) {
  return ['DATE', 'PROJECT', 'CLICKS', 'LAST_USED'].includes(value) ? value : 'DATE';
}

function getNextLinkSortModeSidepanel(value = currentSortMode) {
  const mode = normalizeLinkSortModeSidepanel(value);
  if (mode === 'DATE') return 'PROJECT';
  if (mode === 'PROJECT') return 'CLICKS';
  if (mode === 'CLICKS') return 'LAST_USED';
  return 'DATE';
}`;

const sidepanelButtonOld = `    case 'CLICKS':
      icon.textContent = '🔥';
      label.textContent = '回数順';
      break;
    case 'DATE':`;

const sidepanelButtonNew = `    case 'CLICKS':
      icon.textContent = '🔥';
      label.textContent = '回数順';
      break;
    case 'LAST_USED':
      icon.textContent = '🕘';
      label.textContent = '使用順';
      break;
    case 'DATE':`;

patchFile('sidepanel.js', [
  ["// ソートモード: 'DATE' (日付), 'PROJECT' (分類), 'CLICKS' (回数)", "// ソートモード: 'DATE' (日付), 'PROJECT' (分類), 'CLICKS' (回数), 'LAST_USED' (最終使用)", 'sort mode comment'],
  [sidepanelSortOld, sidepanelSortNew, 'link comparator'],
  [sidepanelModesOld, sidepanelModesNew, 'sort mode helpers'],
  [sidepanelButtonOld, sidepanelButtonNew, 'sort button presentation']
]);

const floatingModesOld = `  function normalizeLinkSortMode(value) {
    return ['DATE', 'PROJECT', 'CLICKS'].includes(value) ? value : 'DATE';
  }

  function getLinkSortPresentation(mode = currentSortMode) {
    const normalized = normalizeLinkSortMode(mode);
    if (normalized === 'PROJECT') return { icon: '▦', label: '分類順' };
    if (normalized === 'CLICKS') return { icon: '↗', label: '回数順' };
    return { icon: '◷', label: '追加日順' };
  }

  function getNextLinkSortMode(mode = currentSortMode) {
    const normalized = normalizeLinkSortMode(mode);
    if (normalized === 'DATE') return 'PROJECT';
    if (normalized === 'PROJECT') return 'CLICKS';
    return 'DATE';
  }`;

const floatingModesNew = `  function normalizeLinkSortMode(value) {
    return ['DATE', 'PROJECT', 'CLICKS', 'LAST_USED'].includes(value) ? value : 'DATE';
  }

  function getLinkSortPresentation(mode = currentSortMode) {
    const normalized = normalizeLinkSortMode(mode);
    if (normalized === 'PROJECT') return { icon: '▦', label: '分類順' };
    if (normalized === 'CLICKS') return { icon: '↗', label: '回数順' };
    if (normalized === 'LAST_USED') return { icon: '↺', label: '使用順' };
    return { icon: '◷', label: '追加日順' };
  }

  function getNextLinkSortMode(mode = currentSortMode) {
    const normalized = normalizeLinkSortMode(mode);
    if (normalized === 'DATE') return 'PROJECT';
    if (normalized === 'PROJECT') return 'CLICKS';
    if (normalized === 'CLICKS') return 'LAST_USED';
    return 'DATE';
  }`;

const floatingComparatorOld = `  function compareFloatingItems(a, b) {
    if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
    if (currentSortMode === 'PROJECT') {
      const projectDiff = String(a.projectName || '未分類').localeCompare(String(b.projectName || '未分類'), 'ja');
      if (projectDiff !== 0) return projectDiff;
    } else if (currentSortMode === 'CLICKS') {
      const clickDiff = Number(b.clickCount || 0) - Number(a.clickCount || 0);
      if (clickDiff !== 0) return clickDiff;
    }
    return new Date(b.addedAt || 0) - new Date(a.addedAt || 0);
  }`;

const floatingComparatorNew = `  function getFloatingLinkSortTime(value) {
    const time = Date.parse(String(value || ''));
    return Number.isFinite(time) ? time : 0;
  }

  function compareFloatingItems(a, b) {
    if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
    if (currentSortMode === 'PROJECT') {
      const projectDiff = String(a.projectName || '未分類').localeCompare(String(b.projectName || '未分類'), 'ja');
      if (projectDiff !== 0) return projectDiff;
    } else if (currentSortMode === 'CLICKS') {
      const clickDiff = Number(b.clickCount || 0) - Number(a.clickCount || 0);
      if (clickDiff !== 0) return clickDiff;
    } else if (currentSortMode === 'LAST_USED') {
      const lastUsedDiff = getFloatingLinkSortTime(b.lastClickedAt) - getFloatingLinkSortTime(a.lastClickedAt);
      if (lastUsedDiff !== 0) return lastUsedDiff;
      const addedDiff = getFloatingLinkSortTime(b.addedAt) - getFloatingLinkSortTime(a.addedAt);
      if (addedDiff !== 0) return addedDiff;
      return String(b.id || '').localeCompare(String(a.id || ''));
    }
    return new Date(b.addedAt || 0) - new Date(a.addedAt || 0);
  }`;

patchFile('content-floating-search.js', [
  [floatingModesOld, floatingModesNew, 'sort mode helpers and presentation'],
  [floatingComparatorOld, floatingComparatorNew, 'floating comparator']
]);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
manifest.version = '1.15.10';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

const behaviorPath = 'CURRENT_BEHAVIOR.md';
let behavior = fs.readFileSync(behaviorPath, 'utf8');
behavior = behavior.replace('Baseline: **v1.15.8**', 'Baseline: **v1.15.10**');
const linkHeading = `## Links and URL normalization\n\n`;
if (!behavior.includes(linkHeading)) throw new Error('CURRENT_BEHAVIOR.md link heading not found');
behavior = behavior.replace(linkHeading, `${linkHeading}- Link sort modes are added date / project / click count / last used.\n- Last-used sort uses valid \`lastClickedAt\` descending; never-used or invalid timestamps come after used links and fall back to added date descending.\n- Side Panel and Floating POP must interpret the persisted link sort mode with the same meaning.\n\n`);
fs.writeFileSync(behaviorPath, behavior);

const testSource = `const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sidepanel = fs.readFileSync('sidepanel.js', 'utf8');
const floating = fs.readFileSync('content-floating-search.js', 'utf8');
const background = fs.readFileSync('background.js', 'utf8');

function safeTime(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : 0;
}

function compareLastUsed(a, b) {
  const lastUsedDiff = safeTime(b.lastClickedAt) - safeTime(a.lastClickedAt);
  if (lastUsedDiff !== 0) return lastUsedDiff;
  const addedDiff = safeTime(b.addedAt) - safeTime(a.addedAt);
  if (addedDiff !== 0) return addedDiff;
  return String(b.id || '').localeCompare(String(a.id || ''));
}

test('Side Panel and Floating POP both expose LAST_USED as 使用順', () => {
  assert.match(sidepanel, /\['DATE', 'PROJECT', 'CLICKS', 'LAST_USED'\]/);
  assert.match(floating, /\['DATE', 'PROJECT', 'CLICKS', 'LAST_USED'\]/);
  assert.match(sidepanel, /case 'LAST_USED':[\s\S]*?label\.textContent = '使用順'/);
  assert.match(floating, /normalized === 'LAST_USED'[\s\S]*?label: '使用順'/);
  assert.match(sidepanel, /mode === 'CLICKS'\) return 'LAST_USED'/);
  assert.match(floating, /normalized === 'CLICKS'\) return 'LAST_USED'/);
});

test('both surfaces sort LAST_USED from lastClickedAt and fall back to addedAt', () => {
  assert.match(sidepanel, /currentSortMode === 'LAST_USED'[\s\S]*?lastClickedAt[\s\S]*?addedAt/);
  assert.match(floating, /currentSortMode === 'LAST_USED'[\s\S]*?lastClickedAt[\s\S]*?addedAt/);

  const ordered = [
    { id: 'unused-new', addedAt: '2026-08-27T00:00:00.000Z', lastClickedAt: null },
    { id: 'used-old', addedAt: '2026-08-20T00:00:00.000Z', lastClickedAt: '2026-08-26T00:00:00.000Z' },
    { id: 'invalid-new', addedAt: '2026-08-28T00:00:00.000Z', lastClickedAt: 'not-a-date' },
    { id: 'used-new', addedAt: '2026-08-10T00:00:00.000Z', lastClickedAt: '2026-08-28T00:00:00.000Z' },
    { id: 'unused-old', addedAt: '2026-08-01T00:00:00.000Z' }
  ].sort(compareLastUsed).map(item => item.id);

  assert.deepEqual(ordered, ['used-new', 'used-old', 'invalid-new', 'unused-new', 'unused-old']);
});

test('LAST_USED ordering is deterministic when timestamps tie', () => {
  const ordered = [
    { id: 'a', addedAt: '2026-08-28T00:00:00.000Z', lastClickedAt: '2026-08-28T01:00:00.000Z' },
    { id: 'b', addedAt: '2026-08-28T00:00:00.000Z', lastClickedAt: '2026-08-28T01:00:00.000Z' }
  ].sort(compareLastUsed).map(item => item.id);
  assert.deepEqual(ordered, ['b', 'a']);
});

test('existing atomic click path remains the owner of lastClickedAt', () => {
  assert.match(background, /async function recordItemClickAtomic\(id\)/);
  assert.match(background, /lastClickedAt: now/);
  assert.match(background, /clickCount: Math\.max\(0, Number\(normalized\?\.clickCount \|\| 0\)\) \+ 1/);
});
`;
fs.writeFileSync('tests/link-last-used-sort-characterization.test.js', testSource);

console.log('Implemented LAST_USED link sort on Side Panel and Floating POP.');
