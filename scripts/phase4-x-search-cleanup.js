const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);

function replaceExactly(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one target block, found ${count}`);
  return source.replace(before, after);
}

// 1) Mature sidepanel owns X-search URL construction.
{
  const file = 'sidepanel.js';
  let source = read(file);
  const before = `function buildRedsXUrlSidepanel() {\n  const query = String(redsQuery || '').trim();\n  if (!query) return '';\n  let xQuery = \`${'${query}'} from:REDSOFFICIAL\`;\n  if (redsDateStart) xQuery += \` since:${'${redsDateStart}'}\`;\n  if (redsDateEnd) xQuery += \` until:${'${addDaysToDateInputSidepanel(redsDateEnd, 1)}'}\`;\n  return \`https://x.com/search?q=${'${encodeURIComponent(xQuery)}'}&f=live\`;\n}\n`;
  const after = `function buildRedsXUrlSidepanel() {\n  const Core = globalThis.QuickLinksRedsXSearchCore;\n  if (Core?.buildXSearchUrl) {\n    const accountInput = document.getElementById('reds-x-account');\n    return Core.buildXSearchUrl({\n      keyword: redsQuery,\n      account: accountInput?.value || Core.DEFAULT_X_ACCOUNT,\n      start: redsDateStart,\n      end: redsDateEnd\n    });\n  }\n\n  // The wrapper normally loads the shared X-search core immediately after the mature page.\n  // Keep the previous query path only as a transient startup fallback.\n  const query = String(redsQuery || '').trim();\n  if (!query) return '';\n  let xQuery = \`${'${query}'} from:REDSOFFICIAL\`;\n  if (redsDateStart) xQuery += \` since:${'${redsDateStart}'}\`;\n  if (redsDateEnd) xQuery += \` until:${'${addDaysToDateInputSidepanel(redsDateEnd, 1)}'}\`;\n  return \`https://x.com/search?q=${'${encodeURIComponent(xQuery)}'}&f=live\`;\n}\n`;
  source = replaceExactly(source, before, after, 'sidepanel X URL builder');
  write(file, source);
}

// 2) Polish becomes UI-only: no mature function override, no capture-phase X button interception.
{
  const file = 'reds-x-search-polish.js';
  let source = read(file);

  const logicStart = source.indexOf('  function currentKeyword() {');
  const logicEnd = source.indexOf('  function updateButtonState() {');
  if (logicStart < 0 || logicEnd <= logicStart) throw new Error('polish: X logic block not found');
  source = source.slice(0, logicStart)
    + `  function currentAccount() {\n    return Core.normalizeAccount(document.getElementById(ACCOUNT_INPUT_ID)?.value || '');\n  }\n\n`
    + source.slice(logicEnd);

  source = replaceExactly(
    source,
    `    const canSearch = !!(currentKeyword() || currentAccount());`,
    `    const keyword = String(document.getElementById('reds-search')?.value || '').trim();\n    const canSearch = !!(keyword || currentAccount());`,
    'polish button state'
  );

  source = replaceExactly(
    source,
    `      runXSearch();`,
    `      if (typeof runRedsXSearchSidepanel === 'function') runRedsXSearchSidepanel();`,
    'polish account Enter handler'
  );

  const overrideStart = source.indexOf('  function installFunctionOverrides() {');
  const initStart = source.indexOf('  function initialize() {');
  if (overrideStart < 0 || initStart <= overrideStart) throw new Error('polish: override/guard block not found');
  source = source.slice(0, overrideStart) + source.slice(initStart);
  source = source.replace('    installFunctionOverrides();\n', '');
  source = source.replace('    installButtonGuard();\n', '');

  if (/stopImmediatePropagation\(\)/.test(source)) throw new Error('polish still contains stopImmediatePropagation');
  if (/buildRedsXUrlSidepanel\s*=/.test(source) || /runRedsXSearchSidepanel\s*=/.test(source)) {
    throw new Error('polish still overrides mature X-search functions');
  }
  write(file, source);
}

// 3) Characterization tests also pin the new ownership boundary.
{
  const file = 'tests/reds-x-search-characterization.test.js';
  let source = read(file);
  if (!source.includes("const fs = require('node:fs');")) {
    source = replaceExactly(
      source,
      `const assert = require('node:assert/strict');\n`,
      `const assert = require('node:assert/strict');\nconst fs = require('node:fs');\nconst path = require('node:path');\n`,
      'X test imports'
    );
  }
  const marker = `test('mature sidepanel owns effective X URL construction without runtime override'`;
  if (!source.includes(marker)) {
    source += `\n\ntest('mature sidepanel owns effective X URL construction without runtime override', () => {\n  const sidepanelSource = fs.readFileSync(path.join(__dirname, '..', 'sidepanel.js'), 'utf8');\n  assert.match(sidepanelSource, /QuickLinksRedsXSearchCore/);\n  assert.match(sidepanelSource, /Core\\.buildXSearchUrl/);\n});\n\ntest('X polish no longer overrides mature functions or capture-intercepts the X button', () => {\n  const polishSource = fs.readFileSync(path.join(__dirname, '..', 'reds-x-search-polish.js'), 'utf8');\n  assert.doesNotMatch(polishSource, /buildRedsXUrlSidepanel\\s*=\\s*buildXSearchUrl/);\n  assert.doesNotMatch(polishSource, /runRedsXSearchSidepanel\\s*=\\s*runXSearch/);\n  assert.doesNotMatch(polishSource, /stopImmediatePropagation\\(\\)/);\n});\n`;
  }
  write(file, source);
}

console.log('PHASE 4 X-search ownership cleanup applied.');
