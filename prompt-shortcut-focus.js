(() => {
  'use strict';

  function isPlainAltQ(event) {
    if (!event || event.isComposing || event.keyCode === 229) return false;
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    const key = String(event.key || '').toLowerCase();
    return event.code === 'KeyQ' || key === 'q';
  }

  function getFloatingPromptRoot(doc) {
    const host = doc?.getElementById?.('quick-links-floating-host');
    const root = host?.shadowRoot;
    if (!root) return null;
    const promptPane = root.querySelector?.('#ql-pane-prompts');
    const promptTab = root.querySelector?.('#ql-tab-prompts');
    const active = !!promptPane?.classList?.contains?.('active')
      || !!promptTab?.classList?.contains?.('active-prompts');
    return active ? root : null;
  }

  function isPromptMode(doc) {
    const sidepanelPrompt = !!doc?.body?.classList?.contains?.('mode-prompts');
    return sidepanelPrompt || !!getFloatingPromptRoot(doc);
  }

  function shouldHandlePromptSelect(event, doc) {
    return isPlainAltQ(event) && isPromptMode(doc);
  }

  function firstVisible(actions) {
    return [...(actions || [])].find(action => {
      if (!action) return false;
      if (typeof action.getClientRects !== 'function') return true;
      return action.getClientRects().length > 0;
    }) || null;
  }

  function focusAction(action) {
    if (!action) return false;
    try {
      action.focus({ preventScroll: true });
    } catch (_) {
      action.focus();
    }
    action.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return true;
  }

  function focusFirstVisiblePrompt(doc) {
    if (!doc) return false;

    const sidepanelAction = firstVisible(
      doc.querySelectorAll?.('#prompt-list .prompt-card [data-prompt-copy]') || []
    );
    if (sidepanelAction) return focusAction(sidepanelAction);

    const floatingRoot = getFloatingPromptRoot(doc);
    const floatingAction = firstVisible(
      floatingRoot?.querySelectorAll?.('#ql-prompt-list .ql-prompt-card [data-prompt-copy]') || []
    );
    return focusAction(floatingAction);
  }

  const api = Object.freeze({
    isPlainAltQ,
    getFloatingPromptRoot,
    isPromptMode,
    shouldHandlePromptSelect,
    focusFirstVisiblePrompt
  });

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Capture at window so Prompt-mode Alt+Q is consumed before the mature
    // sidepanel/document and floating-popup/document handlers, both of which
    // otherwise route Alt+Q to the Links list.
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
