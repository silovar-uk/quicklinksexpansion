(() => {
  const Core = globalThis.QuickLinksLogRelayCore;
  if (!Core) throw new Error('QuickLinksLogRelayCore is required before log-relay-toggle-background.js');

  const COMMAND_TOGGLE = 'quick-links-toggle-log';
  const PRESENCE_MESSAGE = 'logRelayPanelPresence';
  const { OPEN_REQUEST_KEY } = Core;

  const activeWindows = new Set();
  const pendingOpenWindows = new Set();

  function isWindowId(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function setPresence(windowId, active) {
    if (!isWindowId(windowId)) return;
    if (active) {
      activeWindows.add(windowId);
      pendingOpenWindows.delete(windowId);
    } else {
      activeWindows.delete(windowId);
      pendingOpenWindows.delete(windowId);
    }
  }

  function makeOpenRequest(windowId) {
    return {
      nonce: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      requestedAt: Date.now(),
      windowId
    };
  }

  function openRelay(windowId) {
    if (!isWindowId(windowId)) return Promise.resolve(false);
    pendingOpenWindows.add(windowId);

    const area = chrome.storage.session || chrome.storage.local;
    const request = makeOpenRequest(windowId);

    // open() must be started in the original keyboard gesture task.
    const requestPromise = area.set({ [OPEN_REQUEST_KEY]: request });
    const openPromise = chrome.sidePanel.open({ windowId });

    return Promise.all([requestPromise, openPromise])
      .then(() => true)
      .catch(error => {
        pendingOpenWindows.delete(windowId);
        throw error;
      });
  }

  function closeRelay(windowId) {
    if (!isWindowId(windowId)) return Promise.resolve(false);
    pendingOpenWindows.delete(windowId);

    const area = chrome.storage.session || chrome.storage.local;
    const clearPromise = area.remove(OPEN_REQUEST_KEY).catch(() => {});

    if (typeof chrome.sidePanel?.close !== 'function') {
      activeWindows.delete(windowId);
      return clearPromise.then(() => false);
    }

    const closePromise = chrome.sidePanel.close({ windowId });
    return Promise.allSettled([clearPromise, closePromise]).then(results => {
      const closeResult = results[1];
      if (closeResult?.status === 'rejected') throw closeResult.reason;
      activeWindows.delete(windowId);
      return true;
    });
  }

  function toggleRelay(windowId) {
    if (activeWindows.has(windowId) || pendingOpenWindows.has(windowId)) {
      return closeRelay(windowId);
    }
    return openRelay(windowId);
  }

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command !== COMMAND_TOGGLE) return;

    const directWindowId = tab?.windowId;
    if (isWindowId(directWindowId)) {
      toggleRelay(directWindowId).catch(error => {
        console.info('[Log Relay] Alt+Shift+M のトグルに失敗しました。', error);
      });
      return;
    }

    // Closing does not require a user gesture. This fallback mainly covers unusual
    // environments where commands.onCommand does not include the active tab.
    chrome.tabs.query({ active: true, currentWindow: true })
      .then(([activeTab]) => {
        const windowId = activeTab?.windowId;
        if (!isWindowId(windowId)) return;
        if (activeWindows.has(windowId) || pendingOpenWindows.has(windowId)) {
          return closeRelay(windowId);
        }
        console.info('[Log Relay] windowIdを同期取得できなかったため、今回はパネルを開きません。');
        return undefined;
      })
      .catch(error => console.info('[Log Relay] トグル対象ウィンドウを取得できませんでした。', error));
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== PRESENCE_MESSAGE) return undefined;
    setPresence(message.windowId, message.active === true);
    sendResponse?.({ ok: true });
    return false;
  });

  if (chrome.sidePanel?.onClosed?.addListener) {
    chrome.sidePanel.onClosed.addListener(info => {
      setPresence(info?.windowId, false);
    });
  }
})();
