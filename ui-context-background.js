(() => {
  'use strict';

  const Contract = globalThis.QuickLinksContract;
  if (!Contract) throw new Error('QuickLinksContract is required before ui-context-background.js');

  const { MESSAGES, SESSION } = Contract;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== MESSAGES.HANDOFF_TO_SIDE_PANEL) return undefined;

    (async () => {
      try {
        let windowId = sender.tab?.windowId;
        if (!Number.isInteger(windowId)) {
          const lastFocused = await chrome.windows.getLastFocused();
          windowId = lastFocused?.id;
        }
        if (!Number.isInteger(windowId)) throw new Error('No window available');

        const context = Contract.normalizeUiContext({
          ...(message.context || {}),
          createdAt: Date.now()
        });

        const area = chrome.storage.session || chrome.storage.local;
        // Start open() in the original user-gesture task; persist context in parallel.
        const persistPromise = area.set({ [SESSION.UI_CONTEXT]: context });
        const openPromise = chrome.sidePanel.open({ windowId });
        await Promise.all([persistPromise, openPromise]);

        sendResponse({ ok:true, windowId, context });
      } catch (error) {
        sendResponse({ ok:false, error:error?.message || String(error) });
      }
    })();

    return true;
  });
})();
