'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPlainAltQ,
  isPromptMode,
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

function fakeSidepanelDocument(mode = 'mode-prompts', actions = []) {
  return {
    body: {
      classList: {
        contains(value) {
          return value === mode;
        }
      }
    },
    getElementById() { return null; },
    querySelectorAll(selector) {
      assert.equal(selector, '#prompt-list .prompt-card [data-prompt-copy]');
      return actions;
    }
  };
}

function fakeFloatingDocument({ active = true, actions = [] } = {}) {
  const promptPane = { classList: { contains: value => active && value === 'active' } };
  const promptTab = { classList: { contains: value => active && value === 'active-prompts' } };
  const root = {
    querySelector(selector) {
      if (selector === '#ql-pane-prompts') return promptPane;
      if (selector === '#ql-tab-prompts') return promptTab;
      return null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, '#ql-prompt-list .ql-prompt-card [data-prompt-copy]');
      return actions;
    }
  };
  return {
    body: { classList: { contains: () => false } },
    getElementById(id) {
      return id === 'quick-links-floating-host' ? { shadowRoot: root } : null;
    },
    querySelectorAll() { return []; }
  };
}

function visibleAction() {
  const state = { focused: false, scrolled: false };
  return {
    state,
    getClientRects: () => [{}],
    focus: () => { state.focused = true; },
    scrollIntoView: () => { state.scrolled = true; }
  };
}

test('Alt+Q is handled only as a plain Alt shortcut', () => {
  assert.equal(isPlainAltQ(altQEvent()), true);
  assert.equal(isPlainAltQ(altQEvent({ shiftKey: true })), false);
  assert.equal(isPlainAltQ(altQEvent({ ctrlKey: true })), false);
  assert.equal(isPlainAltQ(altQEvent({ isComposing: true })), false);
});

test('Prompt mode is detected in both sidepanel and floating popup', () => {
  assert.equal(isPromptMode(fakeSidepanelDocument('mode-prompts')), true);
  assert.equal(isPromptMode(fakeSidepanelDocument('mode-links')), false);
  assert.equal(isPromptMode(fakeFloatingDocument({ active: true })), true);
  assert.equal(isPromptMode(fakeFloatingDocument({ active: false })), false);
});

test('Prompt selection shortcut does not apply outside Prompt mode', () => {
  assert.equal(shouldHandlePromptSelect(altQEvent(), fakeSidepanelDocument('mode-prompts')), true);
  assert.equal(shouldHandlePromptSelect(altQEvent(), fakeSidepanelDocument('mode-links')), false);
  assert.equal(shouldHandlePromptSelect(altQEvent(), fakeFloatingDocument({ active: true })), true);
  assert.equal(shouldHandlePromptSelect(altQEvent(), fakeFloatingDocument({ active: false })), false);
});

test('first visible sidepanel Prompt copy action receives focus', () => {
  let hiddenFocused = false;
  const hidden = {
    getClientRects: () => [],
    focus: () => { hiddenFocused = true; }
  };
  const visible = visibleAction();

  const result = focusFirstVisiblePrompt(fakeSidepanelDocument('mode-prompts', [hidden, visible]));
  assert.equal(result, true);
  assert.equal(hiddenFocused, false);
  assert.equal(visible.state.focused, true);
  assert.equal(visible.state.scrolled, true);
});

test('first visible floating Prompt copy action receives focus', () => {
  const visible = visibleAction();
  const result = focusFirstVisiblePrompt(fakeFloatingDocument({ active: true, actions: [visible] }));
  assert.equal(result, true);
  assert.equal(visible.state.focused, true);
  assert.equal(visible.state.scrolled, true);
});

test('empty Prompt list is a safe no-op', () => {
  assert.equal(focusFirstVisiblePrompt(fakeSidepanelDocument('mode-prompts', [])), false);
  assert.equal(focusFirstVisiblePrompt(fakeFloatingDocument({ active: true, actions: [] })), false);
});
