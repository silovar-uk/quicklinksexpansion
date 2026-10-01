(() => {
  'use strict';

  const Contract = globalThis.QuickLinksContract;
  if (!Contract) throw new Error('QuickLinksContract is required before ui-context-sidepanel.js');

  const MAX_AGE_MS = 60 * 1000;

  async function restoreHandoffContext() {
    const api = globalThis.QuickLinksSidepanelApi;
    if (!api?.applyUiContext) return false;

    const area = chrome.storage.session || chrome.storage.local;
    let data;
    try {
      data = await area.get([Contract.SESSION.UI_CONTEXT]);
    } catch (_) {
      return false;
    }

    const raw = data?.[Contract.SESSION.UI_CONTEXT];
    if (!raw || typeof raw !== 'object') return false;

    try { await area.remove(Contract.SESSION.UI_CONTEXT); } catch (_) {}

    const context = Contract.normalizeUiContext(raw);
    if (!Number.isFinite(context.createdAt) || Date.now() - context.createdAt > MAX_AGE_MS) return false;

    api.applyUiContext(context);
    document.documentElement.dataset.qplHandoffRestored = 'true';
    return true;
  }

  restoreHandoffContext().catch(error => {
    console.warn('[Quick Links] UI context handoff restore failed', error);
  });

  globalThis.QuickLinksUiContextSidepanel = Object.freeze({ restoreHandoffContext });
})();
