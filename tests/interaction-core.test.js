'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../interaction-core.js');
const Bridge = require('../interaction-bridge.js');

function classList(values = []) {
  const set = new Set(values);
  return {
    contains(value) { return set.has(value); }
  };
}

function makeElement(owner, options = {}) {
  const attributes = new Map();
  return {
    classList: classList(options.classes || []),
    getClientRects: () => options.hidden ? [] : [{}],
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name); },
    focus() { owner.activeElement = this; },
    scrollIntoView() { this.scrolled = true; }
  };
}

function makeSidepanel(mode, counts = {}) {
  const doc = {
    activeElement: null,
    body: { classList: classList([`mode-${mode}`]) },
    head: null,
    _styles: new Map(),
    _nodes: new Map(),
    getElementById(id) { return this._nodes.get(id) || null; },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        id: '',
        textContent: '',
        setAttribute() {},
      };
    },
    querySelectorAll(selector) {
      return this._selectorMap?.get(selector) || [];
    }
  };
  doc.head = {
    querySelector(selector) {
      const id = selector.startsWith('#') ? selector.slice(1) : '';
      return doc._styles.get(id) || null;
    },
    appendChild(node) {
      if (node.id) doc._styles.set(node.id, node);
    }
  };
  doc._selectorMap = new Map();

  const links = Array.from({ length: counts.links || 0 }, () => makeElement(doc));
  const prompts = Array.from({ length: counts.prompts || 0 }, () => makeElement(doc));
  const reds = Array.from({ length: counts.reds ?? 1 }, () => makeElement(doc));
  doc._selectorMap.set(Bridge.SELECTORS.sidepanel.links, links);
  doc._selectorMap.set(Bridge.SELECTORS.sidepanel.prompts, prompts);
  doc._selectorMap.set(Bridge.SELECTORS.sidepanel.reds, reds);
  return { doc, links, prompts, reds };
}

function makeFloating(mode, counts = {}) {
  const doc = {
    activeElement: null,
    _styles: new Map(),
    createElement(tag) {
      return { tagName: tag.toUpperCase(), id: '', textContent: '' };
    },
    getElementById(id) {
      return id === 'quick-links-floating-host' ? host : null;
    }
  };
  const root = {
    activeElement: null,
    _styles: new Map(),
    _selectorMap: new Map(),
    querySelector(selector) {
      if (selector === `#ql-pane-${mode}.active`) return { active: true };
      if (selector.startsWith('#qpl-interaction-focus-style')) return this._styles.get('qpl-interaction-focus-style') || null;
      return null;
    },
    querySelectorAll(selector) {
      return this._selectorMap.get(selector) || [];
    },
    appendChild(node) {
      if (node.id) this._styles.set(node.id, node);
    }
  };
  const host = { shadowRoot: root };

  const links = Array.from({ length: counts.links || 0 }, () => makeElement(root));
  const prompts = Array.from({ length: counts.prompts || 0 }, () => makeElement(root));
  const reds = Array.from({ length: counts.reds ?? 1 }, () => makeElement(root));
  root._selectorMap.set(Bridge.SELECTORS.floating.links, links);
  root._selectorMap.set(Bridge.SELECTORS.floating.prompts, prompts);
  root._selectorMap.set(Bridge.SELECTORS.floating.reds, reds);
  return { doc, root, links, prompts, reds };
}

function keyEvent(overrides = {}) {
  let prevented = false;
  let stopped = false;
  return {
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    code: 'KeyQ',
    key: 'q',
    isComposing: false,
    keyCode: 81,
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; },
    get prevented() { return prevented; },
    get stopped() { return stopped; },
    ...overrides
  };
}

test('interaction core maps Alt+Q to SELECT_PRIMARY only for plain Alt', () => {
  assert.equal(Core.getKeyboardAction(keyEvent()), Core.ACTIONS.SELECT_PRIMARY);
  assert.equal(Core.getKeyboardAction(keyEvent({ shiftKey: true })), '');
  assert.equal(Core.getKeyboardAction(keyEvent({ ctrlKey: true })), '');
  assert.equal(Core.getKeyboardAction(keyEvent({ isComposing: true })), '');
});

test('primary role is mode-driven instead of Links-hardcoded', () => {
  assert.equal(Core.getPrimaryRole('links'), 'link');
  assert.equal(Core.getPrimaryRole('prompts'), 'prompt');
  assert.equal(Core.getPrimaryRole('reds'), 'search');
  assert.equal(Core.getPrimaryRole('unknown'), '');
});

test('Side Panel Prompt Alt+Q focuses Prompt #1 and never changes mode', () => {
  const { doc, prompts } = makeSidepanel('prompts', { prompts: 2 });
  const event = keyEvent();
  assert.equal(Bridge.handleKeyboardEvent(event, doc), true);
  assert.equal(doc.activeElement, prompts[0]);
  assert.equal(Bridge.sidepanelMode(doc), 'prompts');
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
});

test('Floating Prompt Alt+Q focuses Prompt #1', () => {
  const { doc, root, prompts } = makeFloating('prompts', { prompts: 2 });
  const event = keyEvent();
  assert.equal(Bridge.handleKeyboardEvent(event, doc), true);
  assert.equal(root.activeElement, prompts[0]);
  assert.equal(Bridge.floatingMode(root), 'prompts');
});

test('empty Prompt list consumes Alt+Q as a safe no-op', () => {
  const { doc } = makeSidepanel('prompts', { prompts: 0 });
  const event = keyEvent();
  assert.equal(Bridge.handleKeyboardEvent(event, doc), true);
  assert.equal(doc.activeElement, null);
  assert.equal(event.prevented, true);
});

test('Links Alt+Q and ArrowDown use the same primary-target contract', () => {
  const { doc, links } = makeSidepanel('links', { links: 3 });
  assert.equal(Bridge.handleKeyboardEvent(keyEvent(), doc), true);
  assert.equal(doc.activeElement, links[0]);

  const down = keyEvent({ altKey: false, code: 'ArrowDown', key: 'ArrowDown', keyCode: 40 });
  assert.equal(Bridge.handleKeyboardEvent(down, doc), true);
  assert.equal(doc.activeElement, links[1]);
});

test('Prompt ArrowDown moves between Prompt primary actions after Alt+Q', () => {
  const { doc, prompts } = makeSidepanel('prompts', { prompts: 3 });
  Bridge.handleKeyboardEvent(keyEvent(), doc);
  const down = keyEvent({ altKey: false, code: 'ArrowDown', key: 'ArrowDown', keyCode: 40 });
  assert.equal(Bridge.handleKeyboardEvent(down, doc), true);
  assert.equal(doc.activeElement, prompts[1]);
});

test('REDS Alt+Q focuses the current mode search instead of switching to Links', () => {
  const { doc, reds } = makeSidepanel('reds', { reds: 1 });
  const event = keyEvent();
  assert.equal(Bridge.handleKeyboardEvent(event, doc), true);
  assert.equal(doc.activeElement, reds[0]);
  assert.equal(Bridge.sidepanelMode(doc), 'reds');
});
