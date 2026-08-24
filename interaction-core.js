(() => {
  'use strict';

  const ACTIONS = Object.freeze({
    SELECT_PRIMARY: 'SELECT_PRIMARY',
    MOVE_PRIMARY_PREV: 'MOVE_PRIMARY_PREV',
    MOVE_PRIMARY_NEXT: 'MOVE_PRIMARY_NEXT'
  });

  const PRIMARY_ROLE_BY_MODE = Object.freeze({
    links: 'link',
    prompts: 'prompt',
    reds: 'search',
    log: 'log'
  });

  function normalizeMode(mode) {
    const value = String(mode || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(PRIMARY_ROLE_BY_MODE, value) ? value : '';
  }

  function getPrimaryRole(mode) {
    const normalized = normalizeMode(mode);
    return normalized ? PRIMARY_ROLE_BY_MODE[normalized] : '';
  }

  function isPlainAltShortcut(event, code, key) {
    if (!event || event.isComposing || event.keyCode === 229) return false;
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    const eventKey = String(event.key || '').toLowerCase();
    return event.code === code || eventKey === key;
  }

  function getKeyboardAction(event) {
    if (!event || event.isComposing || event.keyCode === 229) return '';
    if (isPlainAltShortcut(event, 'KeyQ', 'q')) return ACTIONS.SELECT_PRIMARY;

    const noModifier = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (!noModifier) return '';
    if (event.key === 'ArrowUp') return ACTIONS.MOVE_PRIMARY_PREV;
    if (event.key === 'ArrowDown') return ACTIONS.MOVE_PRIMARY_NEXT;
    return '';
  }

  function getMoveDirection(action) {
    if (action === ACTIONS.MOVE_PRIMARY_PREV) return -1;
    if (action === ACTIONS.MOVE_PRIMARY_NEXT) return 1;
    return 0;
  }

  const api = Object.freeze({
    ACTIONS,
    PRIMARY_ROLE_BY_MODE,
    normalizeMode,
    getPrimaryRole,
    isPlainAltShortcut,
    getKeyboardAction,
    getMoveDirection
  });

  globalThis.QuickLinksInteractionCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
