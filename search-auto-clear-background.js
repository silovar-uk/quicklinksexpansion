// Shared search auto-clear lifecycle.
// Clears the shared Links / Reds / Prompt search query 3 minutes after the latest edit.
(() => {
  const SHARED_SEARCH_STATE_KEY = 'sharedSearchState';
  const SEARCH_AUTO_CLEAR_ALARM = 'quick-links-shared-search-auto-clear';
  const SEARCH_AUTO_CLEAR_MS = 3 * 60 * 1000;
  const WRITER_ID = 'background-search-auto-clear';

  function normalizeState(result) {
    const state = result?.[SHARED_SEARCH_STATE_KEY];
    if (state && typeof state === 'object') {
      return {
        query: String(state.query || ''),
        revision: Number(state.revision || 0),
        updatedAt: Number(state.updatedAt || 0)
      };
    }
    return {
      query: String(result?.sharedSearchQuery || ''),
      revision: 0,
      updatedAt: 0
    };
  }

  async function clearAlarm() {
    try {
      await chrome.alarms.clear(SEARCH_AUTO_CLEAR_ALARM);
    } catch (_) {}
  }

  async function scheduleFromState(state) {
    await clearAlarm();
    if (!state.query) return;

    const updatedAt = Number(state.updatedAt || Date.now());
    const expiresAt = updatedAt + SEARCH_AUTO_CLEAR_MS;
    if (expiresAt <= Date.now()) {
      await clearIfExpired();
      return;
    }

    chrome.alarms.create(SEARCH_AUTO_CLEAR_ALARM, { when: expiresAt });
  }

  async function clearIfExpired() {
    const result = await chrome.storage.local.get(['sharedSearchQuery', SHARED_SEARCH_STATE_KEY]);
    const state = normalizeState(result);
    if (!state.query) {
      await clearAlarm();
      return;
    }

    const updatedAt = Number(state.updatedAt || 0);
    if (updatedAt > 0 && updatedAt + SEARCH_AUTO_CLEAR_MS > Date.now()) {
      await scheduleFromState(state);
      return;
    }

    const now = Date.now();
    const clearedState = {
      query: '',
      revision: state.revision + 1,
      writerId: WRITER_ID,
      updatedAt: now
    };

    await chrome.storage.local.set({
      sharedSearchQuery: '',
      [SHARED_SEARCH_STATE_KEY]: clearedState
    });
    await clearAlarm();
  }

  async function refreshSchedule() {
    const result = await chrome.storage.local.get(['sharedSearchQuery', SHARED_SEARCH_STATE_KEY]);
    await scheduleFromState(normalizeState(result));
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!changes.sharedSearchQuery && !changes[SHARED_SEARCH_STATE_KEY]) return;
    refreshSchedule().catch(error => {
      console.warn('[Quick Links] 検索語の自動クリア予約に失敗しました。', error);
    });
  });

  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name !== SEARCH_AUTO_CLEAR_ALARM) return;
    clearIfExpired().catch(error => {
      console.warn('[Quick Links] 検索語の自動クリアに失敗しました。', error);
    });
  });

  chrome.runtime.onStartup.addListener(() => {
    refreshSchedule().catch(() => {});
  });

  chrome.runtime.onInstalled.addListener(() => {
    refreshSchedule().catch(() => {});
  });

  refreshSchedule().catch(error => {
    console.warn('[Quick Links] 検索語の自動クリア初期化に失敗しました。', error);
  });
})();
