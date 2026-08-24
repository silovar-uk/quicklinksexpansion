(() => {
  'use strict';

  function isPlainAltQ(event) {
    if (!event || event.isComposing || event.keyCode === 229) return false;
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    const key = String(event.key || '').toLowerCase();
    return event.code === 'KeyQ' || key === 'q';
  }

  function isPromptMode(doc) {
    return !!doc?.body?.classList?.contains?.('mode-prompts');
  }

  function shouldHandlePromptSelect(event, doc) {
    return isPlainAltQ(event) && isPromptMode(doc);
  }

  function focusFirstVisiblePrompt(doc) {
    if (!doc?.querySelectorAll) return false;
    const actions = [...doc.querySelectorAll('#prompt-list .prompt-card [data-prompt-copy]')];
    const firstVisible = actions.find(action => {
      if (!action) return false;
      if (typeof action.getClientRects !== 'function') return true;
      return action.getClientRects().length > 0;
    });
    if (!firstVisible) return false;

    try {
      firstVisible.focus({ preventScroll: true });
    } catch (_) {
      firstVisible.focus();
    }
    firstVisible.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return true;
  }

  const api = Object.freeze({
    isPlainAltQ,
    isPromptMode,
    shouldHandlePromptSelect,
    focusFirstVisiblePrompt
  });

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Window capture runs before the mature sidepanel.js document-capture handler.
    // In Prompt mode only, consume Alt+Q here so it cannot fall through to
    // focusTopVisibleLink(), which intentionally switches the panel to Links.
    window.addEventListener('keydown', event => {
      if (!shouldHandlePromptSelect(event, document)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      focusFirstVisiblePrompt(document);
    }, true);
  }

  globalThis.QuickLinksPromptShortcutFocus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
