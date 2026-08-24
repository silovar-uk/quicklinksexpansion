'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPlainAltQ,
  shouldHandlePromptSelect,
  focusFirstVisiblePrompt
} = require('../prompt-shortcut-focus.js');

function altQEvent(overrides = {}) {
  return {
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    code: 'KeyQ',
    key: 'q',
    isComposing: false,
    keyCode: 81,
    ...overrides
  };
}

function fakeDocument(mode = 'mode-prompts', actions = []) {
  return {
    body: {
      classList: {
        contains(value) {
          return value === mode;
        }
      }
    },
    querySelectorAll(selector) {
      assert.equal(selector, '#prompt-list .prompt-card [data-prompt-copy]');
      return actions;
    }
  };
}

test('Alt+Q is handled only as a plain Alt shortcut', () => {
  assert.equal(isPlainAltQ(altQEvent()), true);
  assert.equal(isPlainAltQ(altQEvent({ shiftKey: true })), false);
  assert.equal(isPlainAltQ(altQEvent({ ctrlKey: true })), false);
  assert.equal(isPlainAltQ(altQEvent({ isComposing: true })), false);
});

test('Prompt selection shortcut does not apply outside Prompt mode', () => {
  assert.equal(shouldHandlePromptSelect(altQEvent(), fakeDocument('mode-prompts')), true);
  assert.equal(shouldHandlePromptSelect(altQEvent(), fakeDocument('mode-links')), false);
  assert.equal(shouldHandlePromptSelect(altQEvent(), fakeDocument('mode-reds')), false);
});

test('first visible Prompt copy action receives focus', () => {
  let hiddenFocused = false;
  let visibleFocused = false;
  let scrolled = false;
  const hidden = {
    getClientRects: () => [],
    focus: () => { hiddenFocused = true; }
  };
  const visible = {
    getClientRects: () => [{}],
    focus: () => { visibleFocused = true; },
    scrollIntoView: () => { scrolled = true; }
  };

  const result = focusFirstVisiblePrompt(fakeDocument('mode-prompts', [hidden, visible]));
  assert.equal(result, true);
  assert.equal(hiddenFocused, false);
  assert.equal(visibleFocused, true);
  assert.equal(scrolled, true);
});

test('empty Prompt list is a safe no-op', () => {
  assert.equal(focusFirstVisiblePrompt(fakeDocument('mode-prompts', [])), false);
});
