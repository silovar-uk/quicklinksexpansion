(() => {
  const COMMAND_ADD = 'quick-links-add-log';
  const COMMAND_OPEN = 'quick-links-open-log';
  const MESSAGE_CAPTURE = 'logRelayOpenCapture';
  const MESSAGE_PANEL = 'logRelayOpenPanel';
  const ENTRY_PREFIX = 'logRelayEntry:';
  const OPEN_REQUEST_KEY = 'logRelayOpenPanelRequest';
  const TRASH_ALARM = 'logRelayTrashPurge';
  const TRASH_TTL_MS = 24 * 60 * 60 * 1000;

  function parseTime(value) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : NaN;
  }

  async function queryActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  }

  async function openCapture() {
    try {
      const tab = await queryActiveTab();
      if (!tab?.id) return;
      await chrome.tabs.sendMessage(tab.id, { type: MESSAGE_CAPTURE });
    } catch (error) {
      console.info('[Log Relay] このページでは入力UIを開けません。', error);
    }
  }

  async function openLogPanel(windowId) {
    let targetWindowId = Number.isInteger(windowId) ? windowId : null;
    if (targetWindowId == null) {
      const tab = await queryActiveTab();
      targetWindowId = tab?.windowId ?? null;
    }
    if (targetWindowId == null) return false;

    const request = {
      nonce: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      requestedAt: Date.now(),
      windowId: targetWindowId
    };
    await chrome.storage.local.set({ [OPEN_REQUEST_KEY]: request });
    await chrome.sidePanel.open({ windowId: targetWindowId });
    return true;
  }

  async function getTrashEntries() {
    const all = await chrome.storage.local.get(null);
    return Object.entries(all)
      .filter(([key, value]) => key.startsWith(ENTRY_PREFIX) && value?.status === 'trash')
      .map(([key, value]) => {
        const trashedAt = parseTime(value?.trashedAt) || parseTime(value?.updatedAt) || parseTime(value?.createdAt);
        return { key, value, trashedAt };
      })
      .filter(item => Number.isFinite(item.trashedAt));
  }

  async function scheduleNextTrashPurge() {
    const trashEntries = await getTrashEntries();
    if (!trashEntries.length) {
      await chrome.alarms.clear(TRASH_ALARM);
      return;
    }
    const nextExpiry = Math.min(...trashEntries.map(item => item.trashedAt + TRASH_TTL_MS));
    const when = Math.max(Date.now() + 1000, nextExpiry);
    chrome.alarms.create(TRASH_ALARM, { when });
  }

  async function purgeExpiredTrash() {
    const now = Date.now();
    const trashEntries = await getTrashEntries();
    const expiredKeys = trashEntries
      .filter(item => item.trashedAt + TRASH_TTL_MS <= now)
      .map(item => item.key);
    if (expiredKeys.length) await chrome.storage.local.remove(expiredKeys);
    await scheduleNextTrashPurge();
  }

  chrome.commands.onCommand.addListener(async command => {
    if (command === COMMAND_ADD) {
      await openCapture();
      return;
    }
    if (command === COMMAND_OPEN) {
      try {
        await openLogPanel();
      } catch (error) {
        console.info('[Log Relay] サイドパネルを開けませんでした。', error);
      }
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== MESSAGE_PANEL) return undefined;
    openLogPanel(sender?.tab?.windowId)
      .then(() => sendResponse({ ok: true }))
      .catch(error => {
        console.info('[Log Relay] サイドパネルを開けませんでした。', error);
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  });

  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name !== TRASH_ALARM) return;
    purgeExpiredTrash().catch(error => console.warn('[Log Relay] ゴミ箱自動削除に失敗しました。', error));
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!Object.keys(changes).some(key => key.startsWith(ENTRY_PREFIX))) return;
    scheduleNextTrashPurge().catch(error => console.warn('[Log Relay] ゴミ箱タイマー更新に失敗しました。', error));
  });

  chrome.runtime.onInstalled.addListener(() => {
    purgeExpiredTrash().catch(error => console.warn('[Log Relay] 初期ゴミ箱整理に失敗しました。', error));
  });

  chrome.runtime.onStartup.addListener(() => {
    purgeExpiredTrash().catch(error => console.warn('[Log Relay] 起動時ゴミ箱整理に失敗しました。', error));
  });

  purgeExpiredTrash().catch(error => console.warn('[Log Relay] ゴミ箱整理に失敗しました。', error));
})();
