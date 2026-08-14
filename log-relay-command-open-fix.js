(() => {
  const Core = globalThis.QuickLinksLogRelayCore;
  if (!Core) return;

  const COMMAND_OPEN = 'quick-links-open-log';
  const { OPEN_REQUEST_KEY } = Core;

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command !== COMMAND_OPEN) return;

    const windowId = tab?.windowId;
    if (!Number.isInteger(windowId)) return;

    const request = {
      nonce: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      requestedAt: Date.now(),
      windowId
    };

    // sidePanel.open() must remain in the original keyboard user-gesture task.
    // Do not await tabs.query(), storage, or any other async work before opening.
    try {
      const area = chrome.storage.session || chrome.storage.local;
      const requestPromise = area.set({ [OPEN_REQUEST_KEY]: request });
      const openPromise = chrome.sidePanel.open({ windowId });
      Promise.allSettled([requestPromise, openPromise]).then(results => {
        const openResult = results[1];
        if (openResult?.status === 'rejected') {
          console.info('[Log Relay] Alt+Shift+M の即時サイドパネル起動に失敗しました。', openResult.reason);
        }
      });
    } catch (error) {
      console.info('[Log Relay] Alt+Shift+M の即時サイドパネル起動に失敗しました。', error);
    }
  });
})();
