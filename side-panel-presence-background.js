(() => {
  'use strict';

  const Contract = globalThis.QuickLinksContract;
  if (!Contract) throw new Error('QuickLinksContract is required before side-panel-presence-background.js');

  const { MESSAGES, SESSION, STORAGE } = Contract;
  const LEGACY_TTL_MS = 2200;
  const nativeEventsSupported = !!(
    chrome.sidePanel?.onOpened?.addListener
    && chrome.sidePanel?.onClosed?.addListener
  );

  function normalizeMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result = {};
    Object.entries(value).forEach(([windowId, state]) => {
      const id = Number(windowId);
      if (!Number.isInteger(id) || id < 0) return;
      if (state === true || Number(state) > 0) result[String(id)] = state === true ? true : Number(state);
    });
    return result;
  }

  async function readSessionMap() {
    if (!chrome.storage?.session) return {};
    try {
      const data = await chrome.storage.session.get([SESSION.SIDE_PANEL_PRESENCE]);
      return normalizeMap(data[SESSION.SIDE_PANEL_PRESENCE]);
    } catch (_) {
      return {};
    }
  }

  async function writeSessionPresence(windowId, open) {
    if (!chrome.storage?.session || !Number.isInteger(windowId)) return {};
    const map = await readSessionMap();
    if (open) map[String(windowId)] = true;
    else delete map[String(windowId)];
    await chrome.storage.session.set({ [SESSION.SIDE_PANEL_PRESENCE]: map });
    return map;
  }

  async function broadcastPresence(windowId, open) {
    if (!Number.isInteger(windowId)) return;
    let tabs = [];
    try { tabs = await chrome.tabs.query({ windowId }); } catch (_) {}
    await Promise.allSettled(
      tabs
        .filter(tab => Number.isInteger(tab?.id))
        .map(tab => chrome.tabs.sendMessage(tab.id, {
          type: MESSAGES.SIDE_PANEL_PRESENCE_CHANGED,
          windowId,
          open: open === true
        }))
    );
  }

  async function setNativePresence(windowId, open) {
    if (!Number.isInteger(windowId)) return;
    await writeSessionPresence(windowId, open);
    await broadcastPresence(windowId, open);
  }

  async function getLegacyHeartbeatState(windowId) {
    const data = await chrome.storage.local.get([STORAGE.LEGACY_SIDE_PANEL_HEARTBEATS]);
    const map = normalizeMap(data[STORAGE.LEGACY_SIDE_PANEL_HEARTBEATS]);
    const heartbeat = Number(map[String(windowId)] || 0);
    const open = !!heartbeat && (Date.now() - heartbeat) < LEGACY_TTL_MS;
    return { open, heartbeat, source: 'heartbeat', requiresHeartbeat: true };
  }

  async function updateLegacyHeartbeat(windowId, visible) {
    const data = await chrome.storage.local.get([STORAGE.LEGACY_SIDE_PANEL_HEARTBEATS]);
    const map = normalizeMap(data[STORAGE.LEGACY_SIDE_PANEL_HEARTBEATS]);
    const now = Date.now();
    Object.keys(map).forEach(key => {
      const timestamp = Number(map[key] || 0);
      if (!timestamp || now - timestamp > LEGACY_TTL_MS * 4) delete map[key];
    });
    if (visible) map[String(windowId)] = now;
    else delete map[String(windowId)];
    await chrome.storage.local.set({ [STORAGE.LEGACY_SIDE_PANEL_HEARTBEATS]: map });
    await broadcastPresence(windowId, visible);
  }

  async function getState(windowId) {
    if (!Number.isInteger(windowId)) return { open:false, heartbeat:0, source:'unknown', requiresHeartbeat:!nativeEventsSupported };
    if (!nativeEventsSupported) return getLegacyHeartbeatState(windowId);
    const map = await readSessionMap();
    return {
      open: map[String(windowId)] === true,
      heartbeat: 0,
      source: 'sidePanel-event',
      requiresHeartbeat: false
    };
  }

  if (nativeEventsSupported) {
    chrome.sidePanel.onOpened.addListener(info => {
      if (Number.isInteger(info?.windowId)) {
        setNativePresence(info.windowId, true).catch(error => {
          console.warn('[Quick Links] failed to record side-panel open event', error);
        });
      }
    });
    chrome.sidePanel.onClosed.addListener(info => {
      if (Number.isInteger(info?.windowId)) {
        setNativePresence(info.windowId, false).catch(error => {
          console.warn('[Quick Links] failed to record side-panel close event', error);
        });
      }
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === MESSAGES.GET_SIDE_PANEL_STATE) {
      (async () => {
        try {
          let windowId = sender.tab?.windowId;
          if (!Number.isInteger(windowId)) {
            const currentWindow = await chrome.windows.getLastFocused();
            windowId = currentWindow?.id;
          }
          if (!Number.isInteger(windowId)) throw new Error('No window available');
          const state = await getState(windowId);
          sendResponse({ ok:true, windowId, ...state });
        } catch (error) {
          sendResponse({
            ok:false,
            error:String(error),
            windowId:null,
            open:false,
            heartbeat:0,
            source:'error',
            requiresHeartbeat:!nativeEventsSupported
          });
        }
      })();
      return true;
    }

    if (message?.type === MESSAGES.LEGACY_SIDE_PANEL_HEARTBEAT) {
      if (nativeEventsSupported) {
        sendResponse?.({ ok:true, ignored:true, source:'sidePanel-event' });
        return false;
      }
      (async () => {
        try {
          let windowId = Number(message.windowId);
          if (!Number.isFinite(windowId) && Number.isInteger(sender.tab?.windowId)) windowId = sender.tab.windowId;
          if (!Number.isFinite(windowId)) throw new Error('No window available');
          await updateLegacyHeartbeat(windowId, message.visible !== false);
          sendResponse({ ok:true, windowId, source:'heartbeat' });
        } catch (error) {
          sendResponse({ ok:false, error:String(error) });
        }
      })();
      return true;
    }

    return undefined;
  });

  globalThis.QuickLinksSidePanelPresence = Object.freeze({
    nativeEventsSupported,
    getState
  });
})();
