(() => {
  const Core = globalThis.QuickLinksLogRelayCore;
  if (!Core) throw new Error('QuickLinksLogRelayCore is required before log-relay-background.js');

  const COMMAND_ADD = 'quick-links-add-log';
  const COMMAND_OPEN = 'quick-links-open-log';
  const MESSAGE_CAPTURE = 'logRelayOpenCapture';
  const MESSAGE_PANEL = 'logRelayOpenPanel';
  const STORE_MESSAGE = 'logRelayStore';
  const TRASH_ALARM = 'logRelayTrashPurge';
  const { ENTRY_PREFIX, INDEX_KEY, SORT_KEY, OPEN_REQUEST_KEY, TRASH_TTL_MS, STATUS } = Core;

  let mutationQueue = Promise.resolve();

  function enqueueMutation(work) {
    const task = mutationQueue.then(work, work);
    mutationQueue = task.catch(() => {});
    return task;
  }

  async function queryActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  }

  async function openCapture() {
    try {
      const tab = await queryActiveTab();
      if (!tab?.id) return false;
      await chrome.tabs.sendMessage(tab.id, { type: MESSAGE_CAPTURE });
      return true;
    } catch (error) {
      console.info('[Log Relay] このページでは入力UIを開けません。', error);
      return false;
    }
  }

  async function setOpenRequest(request) {
    const area = chrome.storage.session || chrome.storage.local;
    await area.set({ [OPEN_REQUEST_KEY]: request });
  }

  async function openLogPanel(windowId) {
    let targetWindowId = Number.isInteger(windowId) ? windowId : null;
    if (targetWindowId == null) {
      const tab = await queryActiveTab();
      targetWindowId = tab?.windowId ?? null;
    }
    if (targetWindowId == null) return false;

    await setOpenRequest({
      nonce: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      requestedAt: Date.now(),
      windowId: targetWindowId
    });
    await chrome.sidePanel.open({ windowId: targetWindowId });
    return true;
  }

  async function rebuildIndex() {
    const all = await chrome.storage.local.get(null);
    const entries = Object.entries(all)
      .filter(([key]) => key.startsWith(ENTRY_PREFIX))
      .map(([key, value]) => Core.normalizeEntry(value, key.slice(ENTRY_PREFIX.length)))
      .filter(Boolean)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const ids = entries.map(entry => entry.id);
    await chrome.storage.local.set({ [INDEX_KEY]: ids });
    return ids;
  }

  async function getIndex() {
    const stored = await chrome.storage.local.get(INDEX_KEY);
    if (!Array.isArray(stored[INDEX_KEY])) return rebuildIndex();
    const normalized = Core.normalizeIndex(stored[INDEX_KEY]);
    if (normalized.length !== stored[INDEX_KEY].length) await chrome.storage.local.set({ [INDEX_KEY]: normalized });
    return normalized;
  }

  async function readEntries(ids) {
    const normalizedIds = Core.normalizeIndex(ids);
    if (!normalizedIds.length) return [];
    const keys = normalizedIds.map(Core.storageKey);
    const stored = await chrome.storage.local.get(keys);
    return normalizedIds
      .map(id => Core.normalizeEntry(stored[Core.storageKey(id)], id))
      .filter(Boolean);
  }

  async function listEntries() {
    await mutationQueue;
    await purgeExpiredTrash(false);
    let ids = await getIndex();
    let entries = await readEntries(ids);
    if (entries.length !== ids.length) {
      ids = await rebuildIndex();
      entries = await readEntries(ids);
    }
    const stored = await chrome.storage.local.get(SORT_KEY);
    const sortDirection = stored[SORT_KEY] === 'asc' ? 'asc' : 'desc';
    return { entries, sortDirection };
  }

  async function addLog(memo) {
    const text = String(memo || '').trim();
    if (!text) throw new Error('ログ本文が空です。');
    const now = new Date().toISOString();
    const entry = Core.normalizeEntry({
      id: Core.makeId(), memo: text, status: 'inbox', createdAt: now, updatedAt: now
    });
    const ids = await getIndex();
    const nextIndex = [entry.id, ...ids.filter(id => id !== entry.id)];
    await chrome.storage.local.set({
      [Core.storageKey(entry.id)]: entry,
      [INDEX_KEY]: nextIndex
    });
    return entry;
  }

  async function updateMemo(id, memo) {
    const text = String(memo || '').trim();
    if (!text) throw new Error('ログ本文が空です。');
    const key = Core.storageKey(id);
    const stored = await chrome.storage.local.get(key);
    const current = Core.normalizeEntry(stored[key], id);
    if (!current) throw new Error('ログが見つかりません。');
    const next = { ...current, memo: text, updatedAt: new Date().toISOString() };
    await chrome.storage.local.set({ [key]: next });
    return next;
  }

  async function moveMany(ids, status) {
    if (!STATUS[status]) throw new Error('不正な状態です。');
    const targets = await readEntries(ids);
    if (!targets.length) return [];
    const now = new Date().toISOString();
    const updates = {};
    const moved = [];
    for (const entry of targets) {
      const next = Core.moveToStatus(entry, status, now);
      if (!next) continue;
      updates[Core.storageKey(next.id)] = next;
      moved.push(next);
    }
    if (Object.keys(updates).length) await chrome.storage.local.set(updates);
    await scheduleNextTrashPurge();
    return moved;
  }

  async function hardDeleteMany(ids) {
    const normalizedIds = Core.normalizeIndex(ids);
    if (!normalizedIds.length) return 0;
    const index = await getIndex();
    const removeSet = new Set(normalizedIds);
    await chrome.storage.local.remove(normalizedIds.map(Core.storageKey));
    await chrome.storage.local.set({ [INDEX_KEY]: index.filter(id => !removeSet.has(id)) });
    await scheduleNextTrashPurge();
    return normalizedIds.length;
  }

  async function setSortDirection(direction) {
    const next = direction === 'asc' ? 'asc' : 'desc';
    await chrome.storage.local.set({ [SORT_KEY]: next });
    return next;
  }

  async function getTrashEntries() {
    const ids = await getIndex();
    const entries = await readEntries(ids);
    return entries.filter(entry => entry.status === 'trash');
  }

  async function scheduleNextTrashPurge() {
    const trashEntries = await getTrashEntries();
    if (!trashEntries.length) {
      await chrome.alarms.clear(TRASH_ALARM);
      return;
    }
    const expiries = trashEntries
      .map(entry => Date.parse(entry.trashedAt || entry.updatedAt) + TRASH_TTL_MS)
      .filter(Number.isFinite);
    if (!expiries.length) return;
    chrome.alarms.create(TRASH_ALARM, { when: Math.max(Date.now() + 1000, Math.min(...expiries)) });
  }

  async function purgeExpiredTrash(reschedule = true) {
    const ids = await getIndex();
    const entries = await readEntries(ids);
    const expired = entries.filter(entry => Core.isTrashExpired(entry));
    if (expired.length) {
      const expiredIds = new Set(expired.map(entry => entry.id));
      await chrome.storage.local.remove(expired.map(entry => Core.storageKey(entry.id)));
      await chrome.storage.local.set({ [INDEX_KEY]: ids.filter(id => !expiredIds.has(id)) });
    }
    if (reschedule) await scheduleNextTrashPurge();
    return expired.length;
  }

  async function handleStoreAction(action, payload = {}) {
    switch (action) {
      case 'list':
        return listEntries();
      case 'add':
        return enqueueMutation(() => addLog(payload.memo));
      case 'updateMemo':
        return enqueueMutation(() => updateMemo(payload.id, payload.memo));
      case 'moveMany':
        return enqueueMutation(() => moveMany(payload.ids, payload.status));
      case 'deleteMany':
        return enqueueMutation(() => hardDeleteMany(payload.ids));
      case 'setSort':
        return enqueueMutation(() => setSortDirection(payload.direction));
      case 'rebuildIndex':
        return enqueueMutation(() => rebuildIndex());
      default:
        throw new Error(`Unknown Log Relay action: ${action}`);
    }
  }

  chrome.commands.onCommand.addListener(async command => {
    if (command === COMMAND_ADD) {
      await openCapture();
      return;
    }
    if (command === COMMAND_OPEN) {
      try { await openLogPanel(); }
      catch (error) { console.info('[Log Relay] サイドパネルを開けませんでした。', error); }
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === MESSAGE_PANEL) {
      openLogPanel(sender?.tab?.windowId)
        .then(() => sendResponse({ ok: true }))
        .catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }

    if (message?.type === STORE_MESSAGE) {
      handleStoreAction(message.action, message.payload)
        .then(data => sendResponse({ ok: true, data }))
        .catch(error => {
          console.warn('[Log Relay] データ操作に失敗しました。', message.action, error);
          sendResponse({ ok: false, error: String(error?.message || error) });
        });
      return true;
    }

    return undefined;
  });

  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name !== TRASH_ALARM) return;
    enqueueMutation(() => purgeExpiredTrash(true))
      .catch(error => console.warn('[Log Relay] ゴミ箱自動削除に失敗しました。', error));
  });

  chrome.runtime.onInstalled.addListener(() => {
    enqueueMutation(async () => {
      await rebuildIndex();
      await purgeExpiredTrash(true);
    }).catch(error => console.warn('[Log Relay] 初期データ整理に失敗しました。', error));
  });

  chrome.runtime.onStartup.addListener(() => {
    enqueueMutation(() => purgeExpiredTrash(true))
      .catch(error => console.warn('[Log Relay] 起動時ゴミ箱整理に失敗しました。', error));
  });

  enqueueMutation(async () => {
    await getIndex();
    await purgeExpiredTrash(true);
  }).catch(error => console.warn('[Log Relay] 初期化に失敗しました。', error));
})();
