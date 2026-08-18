(() => {
  if (window.__quickLinksLogRelayTogglePanelLoaded) return;
  window.__quickLinksLogRelayTogglePanelLoaded = true;

  const Shortcuts = globalThis.QuickLinksShortcuts;
  const PRESENCE_MESSAGE = 'logRelayPanelPresence';
  let heartbeatTimer = null;
  let lastReported = null;

  async function currentWindowId() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.windowId ?? null;
    } catch (_) {
      return null;
    }
  }

  function isRelayActive() {
    return document.body?.classList.contains('log-relay-active') === true;
  }

  async function reportPresence(force = false) {
    const active = isRelayActive();
    if (!force && active === lastReported) return;
    const windowId = await currentWindowId();
    if (!Number.isInteger(windowId)) return;
    lastReported = active;
    try {
      await chrome.runtime.sendMessage({ type: PRESENCE_MESSAGE, windowId, active });
    } catch (_) {}
  }

  async function closePanel() {
    const windowId = await currentWindowId();
    if (!Number.isInteger(windowId)) return false;
    if (typeof chrome.sidePanel?.close !== 'function') return false;
    await chrome.sidePanel.close({ windowId });
    return true;
  }

  const observer = new MutationObserver(() => {
    reportPresence(false).catch(() => {});
  });

  function start() {
    if (!document.body) return;
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    reportPresence(true).catch(() => {});
    heartbeatTimer = setInterval(() => {
      if (isRelayActive()) reportPresence(true).catch(() => {});
    }, 15000);
  }

  // Run before log-relay-panel.js's document-level handler. When Log Relay is
  // already visible, the same shortcut closes the Chrome side panel itself.
  window.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229 || event.repeat) return;
    if (!Shortcuts?.matches?.(event, Shortcuts.registry?.log?.open)) return;
    if (!isRelayActive()) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    closePanel().catch(error => {
      console.info('[Log Relay] サイドパネルを閉じられませんでした。', error);
    });
  }, true);

  window.addEventListener('pagehide', () => {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    lastReported = false;
    currentWindowId().then(windowId => {
      if (!Number.isInteger(windowId)) return;
      chrome.runtime.sendMessage({ type: PRESENCE_MESSAGE, windowId, active: false }).catch(() => {});
    }).catch(() => {});
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
