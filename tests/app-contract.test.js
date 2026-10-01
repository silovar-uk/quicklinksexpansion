const test = require('node:test');
const assert = require('node:assert/strict');
const Contract = require('../app-contract.js');

test('product vocabulary uses x-search while keeping reds as a compatibility alias', () => {
  assert.equal(Contract.canonicalMode('x-search'), 'x-search');
  assert.equal(Contract.canonicalMode('reds'), 'x-search');
  assert.equal(Contract.domModeKey('x-search'), 'reds');
  assert.equal(Contract.modeFromDomKey('reds'), 'x-search');
});

test('legacy Chrome command id maps to the canonical X-search action', () => {
  assert.equal(Contract.COMMANDS.OPEN_X_SEARCH, 'quick-links-open-reds');
  assert.equal(Contract.FLOATING_ACTION_BY_COMMAND[Contract.COMMANDS.OPEN_X_SEARCH], 'open-x-search');
});

test('ui handoff context is normalized around canonical modes', () => {
  assert.deepEqual(
    Contract.normalizeUiContext({ mode:'reds', query:'AI', selectedId:123, projectFilter:'仕事', createdAt:1 }),
    { mode:'x-search', query:'AI', selectedId:'123', projectFilter:'仕事', promptCategory:'', createdAt:1 }
  );
});
