(() => {
  if (window.top !== window) return;

  const SHARED_SEARCH_STATE_KEY = 'sharedSearchState';
  const STORAGE_KEYS = ['items', 'projects', 'projectColors', 'currentSortMode', 'floatingSearchEnabled', 'sidePanelHeartbeatsByWindow', 'promptMemos', 'promptCategories', 'promptSortMode', 'sharedSearchQuery', SHARED_SEARCH_STATE_KEY, 'autoProjectRules'];
  const RESULT_LIMIT = 30;
  const SIDE_PANEL_HEARTBEAT_TTL_MS = 2200;
  const SHARED_SEARCH_INPUT_IDS = new Set(['ql-search-input', 'ql-reds-query', 'ql-prompt-search']);
  const FLOATING_TAB_ORDER = ['links', 'reds', 'prompts'];
  const CLEAR_SEARCH_SHORTCUT_DEDUP_MS = 500;
  const OPEN_TAB_SHORTCUT_DEDUP_MS = 450;

  let items = [];
  let promptMemos = [];
  let promptCategories = ['未分類'];
  let promptCategoryFilter = 'ALL';
  let projects = ['未分類'];
  let projectColors = {};
  let currentSortMode = 'DATE';
  let autoProjectRules = [];
  let floatingSearchEnabled = true;
  let currentWindowId = null;
  let sidePanelHeartbeatsByWindow = {};
  let lastPanelVisibleState = null;
  let mode = 'icon'; // hidden | icon | panel
  let userDismissed = false;
  let sharedSearchQuery = '';
  let sharedSearchPersistTimer = null;
  let sharedSearchComposing = false;
  let searchQuery = '';
  // Links検索中だけ使う二次分類フィルター。通常時は小さく、Alt+F中だけ候補を一覧表示。
  let searchProjectFilter = 'ALL';
  // Alt+F中だけ、検索結果に含まれる分類を1〜2段で一覧表示する。
  let searchProjectFilterExpanded = false;
  let promptSearchQuery = '';
  let promptSortMode = 'POPULAR';
  let promptEditingId = null;
  let promptDraft = null;
  let promptSaveInFlight = false;
  let promptCopyFeedbackId = null;
  let promptCopyFeedbackTimer = null;
  let editingId = null;
  let editingDraft = null;
  let editSaveInFlight = false;
  // 編集中のURLが別の登録済みリンクと重複した場合、確認後だけ上書きできるようにする。
  let pendingEditOverwriteId = null;
  let addDraft = null;
  let addSaveInFlight = false;
  let activeTab = 'links';
  let redsQuery = '';
  let redsDateStart = '';
  let redsDateEnd = '';
  let host = null;
  let shadow = null;
  let shortcutScopeActive = false;
  let floatingNotice = null;
  let floatingNoticeTimer = null;
  const SHARED_SEARCH_WRITER_ID = `floating-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let sharedSearchRevision = 0;
  let sharedSearchUpdatedAt = 0;
  let sharedSearchLocalEditAt = 0;
  let storageSyncState = {};
  let lastClearSearchShortcutAt = 0;
  let lastOpenTabShortcutAt = 0;
  let lastOpenTabShortcutAction = '';
  let extensionContextUnavailable = false;
  let extensionContextNoticeShown = false;
  let extensionContextLogShown = false;
  let extensionContextNoticePending = false;

  const EXTENSION_CONTEXT_ERROR_CODE = 'QUICK_LINKS_EXTENSION_CONTEXT_UNAVAILABLE';
  const EXTENSION_CONTEXT_NOTICE = '拡張機能の更新後は、このページを再読み込みしてください。リンクは開けますが、再読み込みまで保存はできません。';

  function cloneStateValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  let shieldBound = false;
  let shortcutListenersBound = false;

  // 初期化より前に定義する。Prompt描画時のTDZを防ぐ。
  const PROMPT_CATEGORY_PALETTE = [
    { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', cardBg: '#f8fbff', cardBorder: '#bfdbfe' },
    { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca', cardBg: '#fff7f7', cardBorder: '#fecaca' },
    { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', cardBg: '#f8fff9', cardBorder: '#bbf7d0' },
    { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe', cardBg: '#fbfaff', cardBorder: '#ddd6fe' },
    { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc', cardBg: '#f6feff', cardBorder: '#a5f3fc' },
    { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', cardBg: '#fffaf5', cardBorder: '#fed7aa' },
    { bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8', cardBg: '#fff8fb', cardBorder: '#fbcfe8' },
    { bg: '#fefce8', text: '#854d0e', border: '#fde68a', cardBg: '#fffdf2', cardBorder: '#fde68a' }
  ];


  // --- 動的リンク表示 ---
  function isDynamicQuickLinkUrl(url) {
    return String(url || '').startsWith('quicklinks://');
  }

  function getBacklogDynamicRangeDays(url) {
    try {
      const parsed = new URL(String(url || ''));
      if (parsed.protocol !== 'quicklinks:' || parsed.hostname !== 'backlog' || parsed.pathname !== '/updated') return null;
      const match = String(parsed.searchParams.get('range') || '').match(/^last-([1-9]\d*)-calendar-days?$/);
      if (!match) return null;
      const dayCount = Number(match[1]);
      return Number.isSafeInteger(dayCount) && dayCount >= 1 && dayCount <= 366 ? dayCount : null;
    } catch (_) {
      return null;
    }
  }

  function getReadableLinkUrl(url) {
    const days = getBacklogDynamicRangeDays(url);
    if (days === 1) return 'Backlog検索｜更新日：今日（自動更新）';
    if (days === 2) return 'Backlog検索｜更新日：昨日〜今日（自動更新）';
    if (days) return `Backlog検索｜更新日：直近${days}日（自動更新）`;
    return String(url || '');
  }

  function getJstCalendarParts(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now);
    const values = Object.fromEntries(parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]));
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day)
    };
  }

  function shiftJstCalendarDate(days, now = new Date()) {
    const { year, month, day } = getJstCalendarParts(now);
    const shifted = new Date(Date.UTC(year, month - 1, day));
    shifted.setUTCDate(shifted.getUTCDate() + Number(days || 0));
    return shifted.toISOString().slice(0, 10);
  }

  function resolveQuickLinkLocally(value, now = new Date()) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (!isDynamicQuickLinkUrl(raw)) return raw;

    const dayCount = getBacklogDynamicRangeDays(raw);
    if (!dayCount) return '';
    const endParts = getJstCalendarParts(now);
    const endDate = `${endParts.year}-${String(endParts.month).padStart(2, '0')}-${String(endParts.day).padStart(2, '0')}`;
    const startDate = shiftJstCalendarDate(-(dayCount - 1), now);
    const target = new URL('https://urawa-cr.backlog.com/FindIssueAllOver.action');
    target.searchParams.set('allOver', 'true');
    target.searchParams.set('limit', '20');
    target.searchParams.set('limitDate.unspecified', 'false');
    target.searchParams.set('offset', '0');
    target.searchParams.set('order', 'false');
    target.searchParams.set('simpleSearch', 'false');
    target.searchParams.set('sort', 'UPDATED');
    target.searchParams.set('startDate.unspecified', 'false');
    target.searchParams.append('statusId', '1');
    target.searchParams.append('statusId', '2');
    target.searchParams.append('statusId', '3');
    target.searchParams.set('updatedRange.begin', startDate.replace(/-/g, '/'));
    target.searchParams.set('updatedRange.end', endDate.replace(/-/g, '/'));
    return target.toString();
  }

  function getChromeRuntime() {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || typeof chrome.runtime.sendMessage !== 'function') return null;
      return chrome.runtime;
    } catch (_) {
      return null;
    }
  }

  function createExtensionContextError(cause) {
    const error = new Error(EXTENSION_CONTEXT_NOTICE);
    error.code = EXTENSION_CONTEXT_ERROR_CODE;
    error.cause = cause;
    return error;
  }

  function isExtensionContextError(error) {
    if (error?.code === EXTENSION_CONTEXT_ERROR_CODE) return true;
    const message = String(error?.message || error || '');
    return /Extension context invalidated|context (?:has been |is )?invalidated|Cannot read properties of (?:undefined|null).*sendMessage/i.test(message);
  }

  function flushExtensionContextNotice() {
    if (!extensionContextNoticePending || extensionContextNoticeShown || typeof showFloatingNotice !== 'function' || !host) return;
    extensionContextNoticePending = false;
    extensionContextNoticeShown = true;
    showFloatingNotice(EXTENSION_CONTEXT_NOTICE, 'error', 9000);
  }

  function markExtensionContextUnavailable(error) {
    extensionContextUnavailable = true;
    extensionContextNoticePending = true;
    if (!extensionContextLogShown) {
      extensionContextLogShown = true;
      console.info('[Quick Links] 拡張機能の更新により、このページの旧コンテンツスクリプトは保存機能を停止しました。ページ再読み込み後に復旧します。', error || '');
    }
    flushExtensionContextNotice();
  }

  async function sendRuntimeMessage(message) {
    if (extensionContextUnavailable) throw createExtensionContextError();
    const runtime = getChromeRuntime();
    if (!runtime) {
      const error = createExtensionContextError();
      markExtensionContextUnavailable(error);
      throw error;
    }
    try {
      return await runtime.sendMessage(message);
    } catch (error) {
      if (isExtensionContextError(error)) {
        markExtensionContextUnavailable(error);
        throw createExtensionContextError(error);
      }
      throw error;
    }
  }

  function openUrlDirectly(url) {
    const resolvedUrl = resolveQuickLinkLocally(url);
    if (!resolvedUrl) return false;
    try {
      const parsed = new URL(resolvedUrl, window.location.href);
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
      const anchor = document.createElement('a');
      anchor.href = parsed.toString();
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.style.display = 'none';
      (document.body || document.documentElement).appendChild(anchor);
      anchor.click();
      anchor.remove();
      return true;
    } catch (_) {
      return false;
    }
  }

  function getChromeStorageLocal() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return null;
      return chrome.storage.local;
    } catch (_) {
      return null;
    }
  }

  function hasChromeStorageChangeListener() {
    try {
      return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.onChanged;
    } catch (_) {
      return false;
    }
  }

  async function storageGet(keys, fallback = {}) {
    const local = getChromeStorageLocal();
    if (!local) {
      console.warn('[Quick Links] chrome.storage.local が使えないため、ページ側ポップの初期化を一時スキップします。ページ再読み込み、または拡張機能の再読み込み後に再度お試しください。');
      return fallback;
    }
    try {
      return await local.get(keys);
    } catch (error) {
      if (isExtensionContextError(error)) markExtensionContextUnavailable(error);
      else console.warn('[Quick Links] chrome.storage.local.get に失敗しました。', error);
      return fallback;
    }
  }

  async function storageSet(values, options = {}) {
    if (!values || typeof values !== 'object') return true;
    const base = {};
    const current = {};
    Object.entries(values).forEach(([key, value]) => {
      base[key] = cloneStateValue(storageSyncState[key]);
      current[key] = cloneStateValue(value);
    });
    try {
      const response = await sendRuntimeMessage({
        type: 'quickLinksCommitState',
        payload: { base, current, replaceKeys: options.replaceKeys || [] }
      });
      if (!response?.ok) throw new Error(response?.error || '保存に失敗しました。');
      Object.entries(response.updates || current).forEach(([key, value]) => {
        storageSyncState[key] = cloneStateValue(value);
        if (key === 'items') items = Array.isArray(value) ? value : [];
        if (key === 'projects') projects = Array.isArray(value) ? value : ['未分類'];
        if (key === 'projectColors') projectColors = value || {};
        if (key === 'currentSortMode') currentSortMode = normalizeLinkSortMode(value);
        if (key === 'promptMemos') promptMemos = Array.isArray(value) ? value : [];
        if (key === 'promptCategories') promptCategories = normalizePromptCategories(value);
        if (key === 'promptSortMode') promptSortMode = normalizePromptSortMode(value);
        if (key === 'autoProjectRules') autoProjectRules = QuickLinksAutoRules.normalizeRules(value);
      });
      return true;
    } catch (error) {
      const contextUnavailable = isExtensionContextError(error);
      if (!contextUnavailable) console.warn('[Quick Links] 保存に失敗しました。', error);
      Object.entries(base).forEach(([key, value]) => {
        storageSyncState[key] = cloneStateValue(value);
        if (key === 'items') items = Array.isArray(value) ? value : [];
        if (key === 'projects') projects = Array.isArray(value) ? value : ['未分類'];
        if (key === 'projectColors') projectColors = value || {};
        if (key === 'currentSortMode') currentSortMode = normalizeLinkSortMode(value);
        if (key === 'promptMemos') promptMemos = Array.isArray(value) ? value : [];
        if (key === 'promptCategories') promptCategories = normalizePromptCategories(value);
        if (key === 'promptSortMode') promptSortMode = normalizePromptSortMode(value);
      });
      if (contextUnavailable) {
        markExtensionContextUnavailable(error);
      } else if (typeof showFloatingNotice === 'function') {
        showFloatingNotice('保存に失敗したため、保存前の状態へ戻しました', 'error', 4000);
      }
      if (mode === 'panel') render();
      return false;
    }
  }

  async function init() {
    const data = await storageGet(STORAGE_KEYS);
    items = Array.isArray(data.items) ? data.items.map((item, index) => QuickLinksAutoRules.normalizeQuickLinkItem(item, index)).filter(Boolean) : [];
    promptMemos = Array.isArray(data.promptMemos) ? data.promptMemos.map(memo => QuickLinksAutoRules.createPromptMemo(memo, memo)).filter(result => result.ok).map(result => result.memo) : [];
    promptCategories = normalizePromptCategories(data.promptCategories);
    promptSortMode = normalizePromptSortMode(data.promptSortMode);
    projects = data.projects || ['未分類'];
    projectColors = data.projectColors || {};
    currentSortMode = normalizeLinkSortMode(data.currentSortMode);
    if (Array.isArray(data.autoProjectRules)) {
      autoProjectRules = QuickLinksAutoRules.normalizeRules(data.autoProjectRules);
    } else {
      try {
        const response = await sendRuntimeMessage({ type: 'quickLinksEnsureAutoProjectRules' });
        autoProjectRules = response?.ok && Array.isArray(response.rules)
          ? QuickLinksAutoRules.normalizeRules(response.rules)
          : [];
      } catch (error) {
        if (!isExtensionContextError(error)) {
          console.warn('[Quick Links] URL自動分類ルールの初期化をバックグラウンドへ依頼できませんでした。', error);
        }
        autoProjectRules = [];
      }
    }
    floatingSearchEnabled = data.floatingSearchEnabled !== false;
    sidePanelHeartbeatsByWindow = normalizeSidePanelHeartbeats(data.sidePanelHeartbeatsByWindow);
    await resolveCurrentWindowState();
    const searchState = data[SHARED_SEARCH_STATE_KEY];
    if (searchState && typeof searchState === 'object') {
      sharedSearchRevision = Number(searchState.revision || 0);
      sharedSearchUpdatedAt = Number(searchState.updatedAt || 0);
      applySharedSearchQuery(searchState.query || '', { skipPersist: true });
    } else {
      applySharedSearchQuery(data.sharedSearchQuery || '', { skipPersist: true });
    }
    STORAGE_KEYS.forEach(key => { storageSyncState[key] = cloneStateValue(data[key]); });
    storageSyncState.items = cloneStateValue(items);
    storageSyncState.projects = cloneStateValue(projects);
    storageSyncState.projectColors = cloneStateValue(projectColors);
    storageSyncState.currentSortMode = currentSortMode;
    storageSyncState.promptMemos = cloneStateValue(promptMemos);
    storageSyncState.promptCategories = cloneStateValue(promptCategories);
    storageSyncState.promptSortMode = promptSortMode;
    storageSyncState.autoProjectRules = cloneStateValue(autoProjectRules);

    createHost();
    bindStorageSync();
    window.setInterval(() => {
      const visible = isSidePanelEffectivelyOpen();
      if (visible !== lastPanelVisibleState) render();
    }, 1000);
    render();
    flushExtensionContextNotice();
  }

  function bindStorageSync() {
    if (!hasChromeStorageChangeListener()) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const changeKeys = Object.keys(changes);
      const onlySharedSearchChanged = changeKeys.length > 0 && changeKeys.every(key => key === 'sharedSearchQuery' || key === SHARED_SEARCH_STATE_KEY);
      const onlyHeartbeatChanged = changeKeys.length === 1 && !!changes.sidePanelHeartbeatsByWindow;
      const sidePanelVisibleBefore = isSidePanelEffectivelyOpen();

      if (changes.items) items = (Array.isArray(changes.items.newValue) ? changes.items.newValue : []).map((item, index) => QuickLinksAutoRules.normalizeQuickLinkItem(item, index)).filter(Boolean);
      if (changes.promptMemos) promptMemos = (Array.isArray(changes.promptMemos.newValue) ? changes.promptMemos.newValue : []).map(memo => QuickLinksAutoRules.createPromptMemo(memo, memo)).filter(result => result.ok).map(result => result.memo);
      if (changes.promptCategories) promptCategories = normalizePromptCategories(changes.promptCategories.newValue);
      if (changes.promptSortMode) promptSortMode = normalizePromptSortMode(changes.promptSortMode.newValue);
      if (changes.projects) projects = changes.projects.newValue || ['未分類'];
      if (changes.projectColors) projectColors = changes.projectColors.newValue || {};
      if (changes.currentSortMode) currentSortMode = normalizeLinkSortMode(changes.currentSortMode.newValue);
      if (changes.autoProjectRules) autoProjectRules = QuickLinksAutoRules.normalizeRules(changes.autoProjectRules.newValue);
      if (changes.floatingSearchEnabled) {
        const wasEnabled = floatingSearchEnabled;
        floatingSearchEnabled = changes.floatingSearchEnabled.newValue !== false;
        if (!wasEnabled && floatingSearchEnabled && userDismissed) {
          userDismissed = false;
          mode = 'icon';
        }
      }
      if (changes.sidePanelHeartbeatsByWindow) sidePanelHeartbeatsByWindow = normalizeSidePanelHeartbeats(changes.sidePanelHeartbeatsByWindow.newValue);
      Object.entries(changes).forEach(([key, change]) => {
        storageSyncState[key] = cloneStateValue(change.newValue);
      });
      const incomingSearchState = changes[SHARED_SEARCH_STATE_KEY]?.newValue;
      const incomingUpdatedAt = Number(incomingSearchState?.updatedAt || 0);
      const activeInput = shadow && isSharedSearchInputElement(shadow.activeElement);
      if (incomingSearchState && incomingUpdatedAt > sharedSearchUpdatedAt
        && !(activeInput && incomingUpdatedAt < sharedSearchLocalEditAt)) {
        sharedSearchRevision = Number(incomingSearchState.revision || 0);
        sharedSearchUpdatedAt = incomingUpdatedAt;
        applySharedSearchQuery(incomingSearchState.query || '', { skipPersist: true });
      } else if (!changes[SHARED_SEARCH_STATE_KEY] && changes.sharedSearchQuery && !activeInput) {
        const nextSharedSearchQuery = String(changes.sharedSearchQuery.newValue || '');
        if (nextSharedSearchQuery !== sharedSearchQuery) applySharedSearchQuery(nextSharedSearchQuery, { skipPersist: true });
      }

      if (onlyHeartbeatChanged) {
        const sidePanelVisibleAfter = isSidePanelEffectivelyOpen();
        if (sidePanelVisibleAfter !== sidePanelVisibleBefore || sidePanelVisibleAfter !== lastPanelVisibleState) render();
        return;
      }

      // IME変換中・検索欄編集中に shadow.innerHTML を作り直すと、未確定文字が m のように確定されるため避ける。
      if (onlySharedSearchChanged && isSharedSearchInputActive()) {
        updateActiveSharedSearchPane();
        return;
      }
      render();
    });
  }

  function applySharedSearchQuery(value, options = {}) {
    sharedSearchQuery = String(value || '');
    searchQuery = sharedSearchQuery;
    if (!searchQuery.trim()) {
      searchProjectFilter = 'ALL';
      searchProjectFilterExpanded = false;
    }
    promptSearchQuery = sharedSearchQuery;
    redsQuery = sharedSearchQuery;
    if (!options.skipPersist) {
      sharedSearchLocalEditAt = Date.now();
      persistSharedSearchQuery(sharedSearchQuery);
    }
  }


  function isSharedSearchInputElement(element) {
    return !!element && SHARED_SEARCH_INPUT_IDS.has(element.id);
  }

  function isSharedSearchInputActive() {
    return !!shadow && isSharedSearchInputElement(shadow.activeElement);
  }

  function updateActiveSharedSearchPane() {
    if (!shadow || mode !== 'panel') return;
    if (activeTab === 'links') updatePanelResults();
    if (activeTab === 'prompts') updatePromptMemoList();
  }

  function bindSharedSearchComposition(input, afterCommit) {
    if (!input) return;
    input.addEventListener('compositionstart', () => {
      sharedSearchComposing = true;
    });
    input.addEventListener('compositionend', (e) => {
      sharedSearchComposing = false;
      applySharedSearchQuery(e.target.value || '');
      if (typeof afterCommit === 'function') afterCommit();
    });
  }

  function shouldIgnoreSharedSearchInputEvent(e) {
    return sharedSearchComposing || e.isComposing;
  }

  function persistSharedSearchQuery(querySnapshot) {
    if (sharedSearchPersistTimer) window.clearTimeout(sharedSearchPersistTimer);
    const nextRevision = sharedSearchRevision + 1;
    const updatedAt = Date.now();
    sharedSearchRevision = nextRevision;
    sharedSearchUpdatedAt = updatedAt;
    const state = {
      query: String(querySnapshot || ''),
      revision: nextRevision,
      writerId: SHARED_SEARCH_WRITER_ID,
      updatedAt
    };
    sharedSearchPersistTimer = window.setTimeout(() => {
      storageSet({ sharedSearchQuery: state.query, [SHARED_SEARCH_STATE_KEY]: state });
    }, 120);
  }

  function createHost() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'quick-links-floating-host';
    host.style.position = 'fixed';
    host.style.right = '16px';
    host.style.bottom = '16px';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';
    shadow = host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);
    bindShortcutShield();
    bindFloatingKeyboardShortcuts();
  }


  function showFloatingNotice(message, type = 'info', timeoutMs = 3200) {
    floatingNotice = { message: String(message || ''), type };
    if (floatingNoticeTimer) window.clearTimeout(floatingNoticeTimer);
    render();
    floatingNoticeTimer = window.setTimeout(() => {
      floatingNotice = null;
      floatingNoticeTimer = null;
      render();
    }, timeoutMs);
  }


  function normalizeLinkSortMode(value) {
    return ['DATE', 'PROJECT', 'CLICKS'].includes(value) ? value : 'DATE';
  }

  function getLinkSortPresentation(mode = currentSortMode) {
    const normalized = normalizeLinkSortMode(mode);
    if (normalized === 'PROJECT') return { icon: '▦', label: '分類順' };
    if (normalized === 'CLICKS') return { icon: '↗', label: '回数順' };
    return { icon: '◷', label: '追加日順' };
  }

  function getNextLinkSortMode(mode = currentSortMode) {
    const normalized = normalizeLinkSortMode(mode);
    if (normalized === 'DATE') return 'PROJECT';
    if (normalized === 'PROJECT') return 'CLICKS';
    return 'DATE';
  }

  async function cycleFloatingLinkSort() {
    currentSortMode = getNextLinkSortMode(currentSortMode);
    const nextMode = currentSortMode;
    const saved = await storageSet({ currentSortMode: nextMode });
    if (!saved) return false;
    if (mode === 'panel' && activeTab === 'links') render();
    const presentation = getLinkSortPresentation(nextMode);
    showFloatingNotice(`並びを${presentation.label}へ変更しました`, 'info', 1800);
    return true;
  }

  async function routeSortToSidepanelOrFallback() {
    try {
      const response = await sendRuntimeMessage({
        type: 'quickLinksSidepanelShortcut',
        action: 'cycle-sort',
        windowId: currentWindowId
      });
      if (response?.ok) return true;
    } catch (_) {}
    return cycleFloatingLinkSort();
  }


  async function routeSearchProjectFilterToSidepanelOrFallback() {
    try {
      const response = await sendRuntimeMessage({
        type: 'quickLinksSidepanelShortcut',
        action: 'focus-search-project-filter',
        windowId: currentWindowId
      });
      if (response?.ok) return true;
    } catch (_) {}
    return focusFloatingSearchProjectFilter();
  }

  function clearAndFocusFloatingSearch() {
    const now = Date.now();
    if (now - lastClearSearchShortcutAt < CLEAR_SEARCH_SHORTCUT_DEDUP_MS) return true;
    lastClearSearchShortcutAt = now;

    const hadSearchQuery = !!sharedSearchQuery;
    if (hadSearchQuery) applySharedSearchQuery('');

    if (mode !== 'panel') {
      clearFloatingOverlays();
      userDismissed = false;
      mode = 'panel';
      shortcutScopeActive = true;
    }
    render();
    focusFloatingTabInput();
    if (hadSearchQuery) showFloatingNotice('検索をクリアしました', 'info', 1800);
    return true;
  }

  async function routeClearSearchToSidepanelOrFallback() {
    try {
      const response = await sendRuntimeMessage({
        type: 'quickLinksSidepanelShortcut',
        action: 'clear-search',
        windowId: currentWindowId
      });
      if (response?.ok) return true;
    } catch (_) {}
    return clearAndFocusFloatingSearch();
  }

  function bindFloatingKeyboardShortcuts() {
    if (shortcutListenersBound || !host) return;
    shortcutListenersBound = true;

    const updateScope = (event) => {
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      shortcutScopeActive = path.includes(host);
    };

    document.addEventListener('pointerdown', updateScope, true);
    document.addEventListener('focusin', updateScope, true);
    document.addEventListener('keydown', handleFloatingKeyboardShortcut, true);
  }

  function isPlainAltLetterShortcut(event, code, key) {
    return !!event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && !event.shiftKey
      && (event.code === code || String(event.key || '').toLowerCase() === key);
  }

  async function routeRedsSearchToSidepanelOrFallback(searchType) {
    try {
      const response = await sendRuntimeMessage({
        type: 'quickLinksSidepanelShortcut',
        action: searchType === 'x' ? 'search-x' : 'search-site',
        windowId: currentWindowId
      });
      if (response?.ok) return true;
    } catch (_) {}

    // サイドパネルの状態判定が古い場合でも、ショートカットを無反応にしない。
    return runFloatingRedsSearchShortcut(searchType);
  }

  function handleFloatingKeyboardShortcut(event) {
    if (event.isComposing || event.keyCode === 229) return;

    // Chrome commandが一時的に届かない場合のフォールバック。
    // 折りたたみ／完全非表示の状態でも、ページ側にフォーカスがあればAlt+1/2/3で再表示する。
    const directOpenAction = event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && !event.shiftKey
      && !event.repeat
      ? ({ Digit1: 'open-links', Numpad1: 'open-links', Digit2: 'open-reds', Numpad2: 'open-reds', Digit3: 'open-prompts', Numpad3: 'open-prompts' }[event.code]
        || ({ '1': 'open-links', '2': 'open-reds', '3': 'open-prompts' }[String(event.key || '')]))
      : '';
    if (directOpenAction) {
      const popupCurrentlyVisible = !!host
        && host.style.display !== 'none'
        && (mode === 'icon' || mode === 'panel');
      // サイドパネルが本当に表示中ならPOPを出さず、Chrome command側のパネル切替へ任せる。
      // ただし画面上にランチャー／POPが見えている場合は、古いheartbeatで操作を止めない。
      if (!isSidePanelEffectivelyOpen() || popupCurrentlyVisible) {
        consumeFloatingShortcut(event);
        executeFloatingShortcutCommand(directOpenAction, { explicitUserAction: true });
        return;
      }
    }

    // サイドパネル表示中にページ側へフォーカスがあっても、検索ショートカットをパネルへ渡す。
    if (isSidePanelEffectivelyOpen()) {
      const isSiteShortcut = isPlainAltLetterShortcut(event, 'KeyS', 's');
      const isXShortcut = isPlainAltLetterShortcut(event, 'KeyX', 'x');
      const isSortShortcut = isPlainAltLetterShortcut(event, 'KeyO', 'o');
      const isProjectFilterShortcut = isPlainAltLetterShortcut(event, 'KeyF', 'f');
      const isClearShortcut = event.altKey
        && !event.ctrlKey
        && !event.metaKey
        && !event.shiftKey
        && (event.code === 'Digit4' || event.code === 'Numpad4' || String(event.key || '') === '4');
      if ((isSiteShortcut || isXShortcut || isSortShortcut || isProjectFilterShortcut || isClearShortcut) && !event.repeat) {
        consumeFloatingShortcut(event);
        if (isClearShortcut) routeClearSearchToSidepanelOrFallback();
        else if (isProjectFilterShortcut) routeSearchProjectFilterToSidepanelOrFallback();
        else if (isSortShortcut) routeSortToSidepanelOrFallback();
        else routeRedsSearchToSidepanelOrFallback(isXShortcut ? 'x' : 'site');
      }
      return;
    }

    if (!floatingSearchEnabled) return;

    const noModifier = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    const active = shadow?.activeElement;
    const activeProjectChip = active?.matches?.('[data-search-project-filter-chip]') ? active : null;
    if (noModifier && activeProjectChip && event.key === 'Enter') {
      consumeFloatingShortcut(event);
      searchProjectFilterExpanded = false;
      updatePanelResults();
      setTimeout(() => focusTopFloatingLink(), 0);
      return;
    }
    if (noModifier && activeProjectChip && event.key === 'Escape') {
      consumeFloatingShortcut(event);
      closeFloatingSearchProjectFilterMenu({ focusCompact: true });
      return;
    }
    if (noModifier && active?.id === 'ql-search-project-filter' && event.key === 'Enter') {
      consumeFloatingShortcut(event);
      openFloatingSearchProjectFilterMenu();
      return;
    }

    if (noModifier && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      if ((activeProjectChip || active?.id === 'ql-search-project-filter') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        consumeFloatingShortcut(event);
        cycleFloatingSearchProjectFilter(event.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      if (navigateFocusedFloatingLink(event.key)) {
        consumeFloatingShortcut(event);
        return;
      }
    }

    const noCommandModifier = !event.ctrlKey && !event.metaKey;

    if (event.altKey && noCommandModifier && !event.shiftKey
      && (event.code === 'Digit4' || event.code === 'Numpad4' || String(event.key || '') === '4')
      && !event.repeat) {
      consumeFloatingShortcut(event);
      clearAndFocusFloatingSearch();
      return;
    }

    // Alt+5はページ側のフォールバック。Alt+4をChrome commandへ昇格したため、
    // POPを完全非表示にする既存操作は、ページまたはPOPにフォーカスがある場合に直接処理する。
    if (event.altKey && noCommandModifier && !event.shiftKey
      && (event.code === 'Digit5' || event.code === 'Numpad5' || String(event.key || '') === '5')
      && !event.repeat) {
      consumeFloatingShortcut(event);
      closeFloatingPanel();
      return;
    }

    if (isPlainAltLetterShortcut(event, 'KeyO', 'o') && !event.repeat) {
      consumeFloatingShortcut(event);
      cycleFloatingLinkSort();
      return;
    }

    if (isPlainAltLetterShortcut(event, 'KeyF', 'f') && !event.repeat
      && mode === 'panel' && activeTab === 'links' && String(searchQuery || '').trim()) {
      consumeFloatingShortcut(event);
      focusFloatingSearchProjectFilter();
      return;
    }

    if (event.altKey && noCommandModifier && !event.shiftKey && event.code === 'KeyQ') {
      consumeFloatingShortcut(event);
      focusTopFloatingLink();
      return;
    }

    if (event.altKey && noCommandModifier && !event.shiftKey && event.code === 'KeyN') {
      consumeFloatingShortcut(event);
      openNewItemFromShortcut();
      return;
    }

    const isSiteSearchShortcut = isPlainAltLetterShortcut(event, 'KeyS', 's');
    const isXSearchShortcut = isPlainAltLetterShortcut(event, 'KeyX', 'x');
    if ((isSiteSearchShortcut || isXSearchShortcut) && !event.repeat) {
      consumeFloatingShortcut(event);
      runFloatingRedsSearchShortcut(isXSearchShortcut ? 'x' : 'site');
      return;
    }

    // Alt+WでPOPを小さくする。
    if (event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey
      && (event.code === 'KeyW' || String(event.key || '').toLowerCase() === 'w') && mode === 'panel'
      && !event.repeat) {
      consumeFloatingShortcut(event);
      if (closeTopFloatingOverlay()) return;
      collapseFloatingPanel();
      return;
    }

    // 以下はPOPを操作中だけ有効。通常ページ側のEscや矢印操作を奪わない。
    if (mode !== 'panel') return;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const eventInsidePopup = !!host && path.includes(host);
    if (!shortcutScopeActive && !eventInsidePopup) return;

    const hasOverlay = !!(addDraft || promptDraft || editingId);

    if (event.altKey && noCommandModifier && !event.shiftKey && !hasOverlay) {
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        consumeFloatingShortcut(event);
        cycleFloatingTab(event.code === 'ArrowRight' ? 1 : -1);
        return;
      }
    }

    if (event.key === 'Escape' && !event.altKey && !event.shiftKey && noCommandModifier && hasOverlay) {
      consumeFloatingShortcut(event);
      closeTopFloatingOverlay();
    }
  }

  function consumeFloatingShortcut(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function closeTopFloatingOverlay() {
    if (promptDraft) {
      promptDraft = null;
      render();
      return true;
    }
    if (editingId) {
      editingId = null;
      editingDraft = null;
      render();
      return true;
    }
    if (addDraft) {
      addDraft = null;
      render();
      return true;
    }
    return false;
  }

  function clearFloatingOverlays() {
    addDraft = null;
    promptDraft = null;
    editingId = null;
    editingDraft = null;
    searchProjectFilterExpanded = false;
  }

  function focusFloatingTabInput() {
    const focusId = {
      links: 'ql-search-input',
      reds: 'ql-reds-query',
      prompts: 'ql-prompt-search'
    }[activeTab];
    if (!focusId) return;
    window.setTimeout(() => shadow?.getElementById(focusId)?.focus(), 0);
  }

  function runFloatingRedsSearchShortcut(searchType) {
    clearFloatingOverlays();
    userDismissed = false;
    mode = 'panel';
    activeTab = 'reds';
    shortcutScopeActive = true;
    render();
    window.setTimeout(() => {
      if (searchType === 'x') runRedsXSearch();
      else runRedsGoogleSearch();
    }, 0);
    return true;
  }

  function focusTopFloatingLink() {
    if (!floatingSearchEnabled || isSidePanelEffectivelyOpen()) return false;
    clearFloatingOverlays();
    userDismissed = false;
    mode = 'panel';
    activeTab = 'links';
    shortcutScopeActive = true;
    render();
    window.setTimeout(() => {
      const firstLink = shadow?.querySelector('#ql-list [data-open-url]');
      if (!firstLink) return;
      try {
        firstLink.focus({ preventScroll: true });
      } catch (_) {
        firstLink.focus();
      }
      firstLink.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, 0);
    return true;
  }

  function focusFloatingLinkControl(element) {
    if (!element) return false;
    try {
      element.focus({ preventScroll: true });
    } catch (_) {
      element.focus();
    }
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return true;
  }

  function moveFocusedFloatingLink(direction) {
    const activeLink = shadow?.activeElement;
    if (!activeLink?.matches?.('#ql-list [data-open-url]')) return false;

    const visibleLinks = [...(shadow?.querySelectorAll('#ql-list [data-open-url]') || [])]
      .filter(link => link.getClientRects().length > 0);
    const currentIndex = visibleLinks.indexOf(activeLink);
    if (currentIndex < 0 || visibleLinks.length === 0) return false;

    // 一覧の端では止める。末尾から先頭へは循環させない。
    const nextIndex = Math.max(0, Math.min(visibleLinks.length - 1, currentIndex + direction));
    const nextLink = visibleLinks[nextIndex];
    if (nextLink && nextLink !== activeLink) focusFloatingLinkControl(nextLink);
    return true;
  }

  function navigateFocusedFloatingLink(eventKey) {
    const active = shadow?.activeElement;
    const card = active?.closest?.('#ql-list .ql-item');
    if (!card) return false;

    const link = card.querySelector('[data-open-url]');
    const copyButton = card.querySelector('[data-copy-url]');
    const editButton = card.querySelector('[data-edit-id]');

    if (active === link) {
      if (eventKey === 'ArrowUp' || eventKey === 'ArrowDown') {
        return moveFocusedFloatingLink(eventKey === 'ArrowDown' ? 1 : -1);
      }
      if (eventKey === 'ArrowRight') return focusFloatingLinkControl(copyButton);
      return false;
    }

    if (active === copyButton) {
      if (eventKey === 'ArrowLeft') return focusFloatingLinkControl(link);
      if (eventKey === 'ArrowDown') return editButton ? focusFloatingLinkControl(editButton) : true;
      if (eventKey === 'ArrowUp') return true;
      return false;
    }

    if (active === editButton) {
      if (eventKey === 'ArrowLeft') return focusFloatingLinkControl(link);
      if (eventKey === 'ArrowUp') return copyButton ? focusFloatingLinkControl(copyButton) : true;
      if (eventKey === 'ArrowDown') return true;
      return false;
    }

    return false;
  }

  function openFloatingTab(nextTab, options = {}) {
    if (!FLOATING_TAB_ORDER.includes(nextTab)) return false;
    const popupCurrentlyVisible = !!host
      && host.style.display !== 'none'
      && (mode === 'icon' || mode === 'panel');
    // 明示的なショートカット操作で、すでにランチャーが見えている場合は、
    // 終了直後の古いheartbeatだけを理由に開く操作を拒否しない。
    const blockedBySidePanel = isSidePanelEffectivelyOpen()
      && !(options.explicitUserAction && popupCurrentlyVisible);
    if (!floatingSearchEnabled || blockedBySidePanel) return false;
    clearFloatingOverlays();
    userDismissed = false;
    mode = 'panel';
    activeTab = nextTab;
    shortcutScopeActive = true;
    render();
    focusFloatingTabInput();
    return true;
  }

  function switchFloatingTab(nextTab) {
    if (!FLOATING_TAB_ORDER.includes(nextTab) || mode !== 'panel') return;
    if (nextTab !== 'links') searchProjectFilterExpanded = false;
    activeTab = nextTab;
    render();
    focusFloatingTabInput();
  }

  function executeFloatingShortcutCommand(action, options = {}) {
    const tabByAction = {
      'open-links': 'links',
      'open-reds': 'reds',
      'open-prompts': 'prompts'
    };
    if (tabByAction[action]) {
      const now = Date.now();
      if (action === lastOpenTabShortcutAction
        && (now - lastOpenTabShortcutAt) < OPEN_TAB_SHORTCUT_DEDUP_MS) return true;
      lastOpenTabShortcutAction = action;
      lastOpenTabShortcutAt = now;
      return openFloatingTab(tabByAction[action], {
        explicitUserAction: options.explicitUserAction !== false
      });
    }
    if (action === 'clear-search') {
      // サイドパネルが開いているウインドウでは、backgroundから同時に届く
      // floating側の命令ではPOPを復活させない。検索欄の処理はsidepanel側へ任せる。
      if (!floatingSearchEnabled || isSidePanelEffectivelyOpen()) return false;
      return clearAndFocusFloatingSearch();
    }
    if (action === 'hide') {
      closeFloatingPanel();
      return true;
    }
    return false;
  }

  function cycleFloatingTab(direction) {
    const currentIndex = Math.max(0, FLOATING_TAB_ORDER.indexOf(activeTab));
    const nextIndex = (currentIndex + direction + FLOATING_TAB_ORDER.length) % FLOATING_TAB_ORDER.length;
    switchFloatingTab(FLOATING_TAB_ORDER[nextIndex]);
  }

  function collapseFloatingPanel() {
    clearFloatingOverlays();
    userDismissed = false;
    mode = 'icon';
    shortcutScopeActive = false;
    render();
  }

  function closeFloatingPanel() {
    clearFloatingOverlays();
    userDismissed = true;
    mode = 'hidden';
    shortcutScopeActive = false;
    render();
  }

  function bindShortcutShield() {
    if (!shadow || shieldBound) return;
    shieldBound = true;
    const shieldTypes = [
      'keydown', 'keypress', 'keyup',
      'beforeinput', 'input',
      'compositionstart', 'compositionupdate', 'compositionend',
      'paste', 'cut'
    ];

    shieldTypes.forEach(type => {
      shadow.addEventListener(type, shieldKeyboardEvent, false);
    });
  }

  function shieldKeyboardEvent(e) {
    if (!isEditableEventTarget(e.target)) return;
    e.stopPropagation();
  }

  function isEditableEventTarget(target) {
    if (!target || !(target instanceof Element)) return false;
    if (target.closest('.ql-search, .ql-input, .ql-textarea')) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable === true;
  }

  function normalizeSidePanelHeartbeats(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result = {};
    Object.entries(value).forEach(([windowId, heartbeat]) => {
      const timestamp = Number(heartbeat || 0);
      if (timestamp > 0) result[String(windowId)] = timestamp;
    });
    return result;
  }

  async function resolveCurrentWindowState() {
    try {
      const response = await sendRuntimeMessage({ type: 'quickLinksGetSidePanelWindowState' });
      if (response?.ok && typeof response.windowId === 'number') {
        currentWindowId = response.windowId;
        if (Number(response.heartbeat || 0) > 0) {
          sidePanelHeartbeatsByWindow[String(currentWindowId)] = Number(response.heartbeat);
        }
      }
    } catch (_) {}
  }

  function isSidePanelEffectivelyOpen() {
    if (typeof currentWindowId !== 'number') return false;
    const heartbeat = Number(sidePanelHeartbeatsByWindow[String(currentWindowId)] || 0);
    return !!heartbeat && (Date.now() - heartbeat) < SIDE_PANEL_HEARTBEAT_TTL_MS;
  }

  function captureOverlayDrafts() {
    if (!shadow) return;
    if (addDraft) captureAddDraftInputs();
    if (promptDraft) {
      const title = shadow.getElementById('ql-prompt-title');
      const category = shadow.getElementById('ql-prompt-category');
      const body = shadow.getElementById('ql-prompt-body');
      if (title) promptDraft.title = title.value;
      if (category) promptDraft.categoryName = category.value || '未分類';
      if (body) promptDraft.body = body.value;
    }
    if (editingId) {
      const source = editingDraft || items.find(item => item.id === editingId) || { id: editingId };
      const title = shadow.getElementById('ql-edit-title');
      const url = shadow.getElementById('ql-edit-url');
      const project = shadow.getElementById('ql-edit-project');
      const note = shadow.getElementById('ql-edit-note');
      editingDraft = {
        ...source, id: editingId,
        title: title ? title.value : source.title,
        url: url ? url.value : source.url,
        projectName: project ? (project.value || '未分類') : source.projectName,
        note: note ? note.value : source.note
      };
    }
  }

  function render() {
    if (!host || !shadow) return;
    captureOverlayDrafts();

    const sidePanelVisible = isSidePanelEffectivelyOpen();
    const activeBefore = shadow.activeElement?.id || '';
    const searchBefore = shadow.getElementById('ql-search-input');
    const searchSelection = searchBefore
      ? { start: searchBefore.selectionStart ?? null, end: searchBefore.selectionEnd ?? null }
      : null;

    lastPanelVisibleState = sidePanelVisible;
    if (!floatingSearchEnabled || sidePanelVisible || mode === 'hidden') {
      host.style.display = 'none';
      return;
    }

    host.style.display = 'block';
    host.style.pointerEvents = 'none';

    const filtered = getFilteredItems();
    const searchFilterMatchedItems = String(searchQuery || '').trim() ? getSearchMatchedItems() : [];
    const searchProjectFilterCount = searchProjectFilter === 'ALL'
      ? searchFilterMatchedItems.length
      : searchFilterMatchedItems.filter(item => (String(item?.projectName || '未分類').trim() || '未分類') === searchProjectFilter).length;
    const listHtml = filtered.length
      ? filtered.map(renderItem).join('')
      : `<div class="ql-empty">${searchQuery ? '一致するリンクが見つかりません' : '表示できるリンクがありません'}</div>`;
    const filteredPrompts = getFilteredPromptMemos();
    const promptListHtml = filteredPrompts.length
      ? filteredPrompts.map(renderPromptMemoCard).join('')
      : `<div class="ql-empty">${promptSearchQuery ? '一致するプロンプトが見つかりません' : 'プロンプトメモがありません'}</div>`;

    const projectOptions = projects.map(p => `<option value="${escapeHtml(p)}"></option>`).join('');
    const promptCategoryOptions = getPromptCategories().map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
    const promptFilterHtml = renderPromptCategoryFilters();
    const linkSortPresentation = getLinkSortPresentation(currentSortMode);
    const editingItem = editingId ? (editingDraft || items.find(item => item.id === editingId)) : null;

    shadow.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }
        .ql-wrap {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #1f2937;
          pointer-events: auto;
        }
        .ql-toast {
          position: relative;
          z-index: 1200;
          max-width: 320px;
          margin: 0 0 8px auto;
          border-radius: 10px;
          padding: 9px 11px;
          font-size: 11px;
          font-weight: 800;
          line-height: 1.45;
          background: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
        }
        .ql-toast.warning { background:#fffbeb; color:#92400e; border-color:#fbbf24; }
        .ql-toast.success { background:#f0fdf4; color:#166534; border-color:#bbf7d0; }
        .ql-duplicate-hint {
          display:none;
          margin-top:6px;
          border:1px solid #fbbf24;
          background:#fffbeb;
          color:#92400e;
          border-radius:8px;
          padding:8px 9px;
          font-size:10px;
          line-height:1.45;
          font-weight:800;
        }
        .ql-duplicate-hint.visible { display:block; }
        .ql-duplicate-hint.archived { background:#f8fafc; color:#475569; border-color:#cbd5e1; }
        .ql-duplicate-hint.flash { animation: qlDuplicateFlash .42s ease 0s 2 alternate; }

        .ql-modal-notice {
          border:1px solid #fbbf24;
          background:#fffbeb;
          color:#92400e;
          border-radius:9px;
          padding:8px 9px;
          font-size:10px;
          font-weight:800;
          line-height:1.45;
        }
        .ql-modal-notice.success { background:#f0fdf4; color:#166534; border-color:#bbf7d0; }
        .ql-edit-overwrite-warning {
          border:1px solid #f59e0b;
          background:#fffbeb;
          color:#78350f;
          border-radius:10px;
          padding:9px 10px;
          font-size:10px;
          line-height:1.5;
        }
        .ql-edit-overwrite-warning strong { display:block; margin-bottom:3px; font-size:10.5px; }
        .ql-edit-overwrite-actions { display:flex; justify-content:flex-end; gap:6px; margin-top:8px; }
        .ql-edit-overwrite-actions button { border-radius:8px; padding:6px 8px; font-size:10px; font-weight:800; cursor:pointer; }
        .ql-edit-overwrite-cancel { border:1px solid #d6d3d1; background:white; color:#57534e; }
        .ql-edit-overwrite-confirm { border:1px solid #d97706; background:#d97706; color:white; }
        @keyframes qlDuplicateFlash { from { transform:scale(1); } to { transform:scale(1.015); box-shadow:0 0 0 3px rgba(245,158,11,.22); } }
        .ql-launcher {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          justify-content: flex-end;
        }
        .ql-launcher-main {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .ql-launcher-close {
          position: absolute;
          top: -6px;
          right: -6px;
          z-index: 2;
          width: 20px;
          height: 20px;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          color: #dc2626;
          box-shadow: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 16px;
          font-weight: 900;
          line-height: 1;
          opacity: .7;
          text-shadow: 0 1px 2px rgba(255,255,255,.95), 0 0 1px rgba(127,29,29,.18);
          transition: opacity .12s ease, color .12s ease;
        }
        .ql-launcher-close:hover,
        .ql-launcher-close:focus-visible {
          background: transparent;
          color: #b91c1c;
          opacity: 1;
          box-shadow: none;
          outline: none;
        }
        .ql-launcher-close:focus-visible {
          text-decoration: underline;
          text-decoration-thickness: 2px;
          text-underline-offset: 3px;
        }
        .ql-launcher-close:active {
          color: #7f1d1d;
          opacity: 1;
          box-shadow: none;
        }
        .ql-launcher-action {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
        }
        .ql-launcher-key {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 14px;
          padding: 0 4px;
          border: 1px solid #cbd5e1;
          border-bottom-width: 2px;
          border-radius: 4px;
          background: rgba(255,255,255,.96);
          color: #475569;
          font-family: inherit;
          font-size: 7px;
          font-weight: 800;
          line-height: 1;
          white-space: nowrap;
          box-shadow: 0 4px 10px rgba(15,23,42,.16);
        }
        .ql-add-btn,
        .ql-icon-btn {
          border: none;
          border-radius: 999px;
          color: white;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
          box-shadow: 0 10px 22px rgba(15, 23, 42, 0.28);
        }
        .ql-icon-btn {
          width: 48px;
          height: 48px;
          background: #c81e1e;
        }
        .ql-add-btn {
          width: 38px;
          height: 38px;
          background: #6b7280;
          font-size: 22px;
          font-weight: 800;
          line-height: 1;
        }
        .ql-icon-btn:hover { transform: none; box-shadow: 0 10px 22px rgba(15, 23, 42, 0.28); background: #c81e1e; }
        .ql-add-btn:hover { transform: translateY(-1px); box-shadow: 0 14px 28px rgba(15, 23, 42, 0.24); background: #4b5563; }
        .ql-panel {
          width: 320px;
          background: #fff1f2;
          border: 1px solid #fecaca;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 20px 48px rgba(15, 23, 42, 0.22);
        }
        .ql-header {
          background: #c81e1e;
          color: white;
          padding: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .ql-title-wrap { min-width: 0; }
        .ql-title { font-size: 13px; font-weight: 700; line-height: 1.2; }
        .ql-sub { font-size: 11px; color: rgba(255,255,255,0.72); margin-top: 2px; }
        .ql-header-actions { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; }
        .ql-panel-open-btn {
          width: 30px;
          height: 30px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          background: rgba(255,255,255,0.10);
          color: white;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }
        .ql-panel-open-btn:hover { background: rgba(255,255,255,0.18); }
        .ql-header-btn {
          min-width: 30px; height: 30px; border: none; border-radius: 8px; cursor: pointer;
          background: rgba(255,255,255,0.08); color: white; font-size: 15px; line-height: 1;
          display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 0 6px;
        }
        .ql-header-btn.ql-with-shortcut { width: auto; }
        .ql-header-btn:hover { background: rgba(255,255,255,0.16); }
        .ql-collapse-btn {
          background: #2563eb;
          box-shadow: 0 6px 14px rgba(37, 99, 235, 0.34);
          font-weight: 800;
        }
        .ql-collapse-btn:hover { background: #1d4ed8; }
        .ql-body { padding: 10px; background: #fff1f2; }
        .ql-tabs {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 6px;
        }
        .ql-key {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 15px;
          padding: 0 4px;
          border: 1px solid currentColor;
          border-bottom-width: 2px;
          border-radius: 4px;
          background: rgba(255,255,255,0.82);
          color: #64748b;
          font-family: inherit;
          font-size: 8px;
          font-weight: 800;
          line-height: 1;
          white-space: nowrap;
          box-shadow: 0 1px 1px rgba(15,23,42,0.05);
        }
        .ql-header-btn .ql-key {
          min-height: 13px;
          padding: 0 3px;
          background: rgba(255,255,255,.14);
          color: white;
          border-color: rgba(255,255,255,.42);
          box-shadow: none;
          font-size: 7px;
        }
        .ql-tab-btn .ql-key {
          flex: 0 0 auto;
          background: rgba(255,255,255,.58);
          color: currentColor;
          border-color: currentColor;
          box-shadow: none;
        }
        .ql-tab-btn.active-links .ql-key,
        .ql-tab-btn.active-reds .ql-key,
        .ql-tab-btn.active-prompts .ql-key {
          background: rgba(255,255,255,.16);
          color: white;
          border-color: rgba(255,255,255,.5);
        }
        .ql-tab-label {
          display: block;
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 10px;
          line-height: 1.05;
        }
        .ql-tab-btn {
          border: 1px solid #e5e7eb;
          background: rgba(255,255,255,0.82);
          color: #374151;
          border-radius: 10px;
          padding: 7px 5px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
        }
        .ql-tab-btn:hover { transform: translateY(-1px); }
        .ql-tab-btn#ql-tab-links {
          background: #eff6ff;
          border-color: #bfdbfe;
          color: #1d4ed8;
        }
        .ql-tab-btn#ql-tab-reds {
          background: #fee2e2;
          border-color: #fca5a5;
          color: #b91c1c;
        }
        .ql-tab-btn#ql-tab-prompts {
          background: #fef3c7;
          border-color: #fcd34d;
          color: #92400e;
        }
        .ql-tab-btn.active-links {
          background: #2563eb !important;
          border-color: #1d4ed8 !important;
          color: white !important;
          box-shadow: 0 3px 10px rgba(37, 99, 235, 0.22);
        }
        .ql-tab-btn.active-reds {
          background: #dc2626 !important;
          border-color: #b91c1c !important;
          color: white !important;
          box-shadow: 0 3px 10px rgba(220, 38, 38, 0.22);
        }
        .ql-tab-btn.active-prompts {
          background: #d97706 !important;
          border-color: #b45309 !important;
          color: white !important;
          box-shadow: 0 3px 10px rgba(217, 119, 6, 0.24);
        }
        .ql-pane { display: none; }
        .ql-pane.active { display: block; }
        .ql-search-row { position: relative; margin-bottom: 8px; }
        .ql-search, .ql-reds-input, .ql-date-input {
          width: 100%; border: 1px solid #d8e0e9; border-radius: 11px; padding: 10px 92px 10px 12px;
          font-size: 13px; outline: none; background: rgba(255,255,255,.88); color: #172033;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.72);
          transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
        }
        .ql-date-input { padding: 9px 10px; }
        .ql-search:hover, .ql-reds-input:hover { background: #fff; border-color:#cbd5e1; }
        .ql-search:focus, .ql-reds-input:focus, .ql-date-input:focus {
          background:#fff; border-color: #e06464; box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.11), 0 7px 16px rgba(15,23,42,.06);
        }
        .ql-clear {
          position: absolute; top: 50%; right: 58px; transform: translateY(-50%);
          width: 24px; height: 24px; border: 1px solid #e2e8f0; border-radius: 7px; cursor: pointer;
          background: rgba(248,250,252,.95); color: #64748b; display: ${searchQuery ? 'inline-flex' : 'none'};
          align-items: center; justify-content: center; padding: 0; font-size: 12px;
        }
        .ql-clear:hover { background: #eef2f6; color: #0f172a; }
        .ql-search-key {
          position:absolute; right:7px; top:50%; transform:translateY(-50%);
          display:inline-flex; align-items:center; justify-content:center; min-height:20px; padding:0 6px;
          border:1px solid #cbd5e1; border-bottom-width:2px; border-radius:6px;
          background:rgba(248,250,252,.94); color:#64748b; font-family:inherit; font-size:8px; font-weight:800; line-height:1;
          pointer-events:none; white-space:nowrap; box-shadow:0 1px 2px rgba(15,23,42,.04);
        }
        .ql-result-meta {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 11px; color: #64748b; margin-bottom: 8px; padding: 0 2px;
          gap: 8px;
        }
        .ql-result-tools {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
          min-width: 0;
        }
        .ql-sort-toggle {
          min-height: 24px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          border: 1px solid #d8e0e9;
          border-radius: 8px;
          background: #fff;
          color: #475569;
          font: inherit;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
        }
        .ql-sort-toggle:hover { background: #f8fafc; border-color: #cbd5e1; }
        .ql-sort-toggle:focus-visible {
          outline: 2px solid #2563eb;
          outline-offset: 1px;
        }
        .ql-sort-icon { font-size: 11px; line-height: 1; }
        .ql-sort-toggle kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 17px;
          padding: 0 4px;
          border: 1px solid #cbd5e1;
          border-bottom-width: 2px;
          border-radius: 5px;
          background: #f8fafc;
          color: #64748b;
          font-family: inherit;
          font-size: 7px;
          font-weight: 800;
          line-height: 1;
        }
        .ql-search-project-filter {
          min-height: 24px;
          max-width: 110px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 2px 4px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #f8fafc;
          color: #475569;
          font: inherit;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
          min-width: 0;
        }
        .ql-search-project-filter[hidden] { display:none !important; }
        .ql-search-project-filter:hover { background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8; }
        .ql-search-project-filter:focus-visible { outline:2px solid #2563eb; outline-offset:1px; background:#eff6ff; }
        .ql-search-project-filter-label {
          min-width:0;
          max-width:30px;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .ql-search-project-filter-count {
          flex:0 0 auto;
          min-width:13px;
          padding:1px 3px;
          border-radius:999px;
          background:#e2e8f0;
          color:#475569;
          font-size:8px;
          font-weight:900;
          line-height:1.25;
          text-align:center;
        }
        .ql-search-project-filter:hover .ql-search-project-filter-count,
        .ql-search-project-filter:focus-visible .ql-search-project-filter-count { background:#dbeafe; color:#1d4ed8; }
        .ql-search-project-filter kbd {
          display:inline-flex;
          align-items:center;
          justify-content:center;
          min-height:17px;
          padding:0 3px;
          border:1px solid #cbd5e1;
          border-bottom-width:2px;
          border-radius:5px;
          background:#fff;
          color:#64748b;
          font-family:inherit;
          font-size:7px;
          font-weight:800;
        }
        .ql-search-project-filter-arrows { color:#94a3b8; letter-spacing:-2px; font-size:9px; }
        .ql-search-project-filter-menu {
          margin: -3px 0 8px;
          padding: 5px;
          display: flex;
          flex-wrap: wrap;
          align-content: flex-start;
          gap: 4px;
          max-height: 58px;
          overflow-y: auto;
          scrollbar-width: thin;
          border: 1px solid #dbe5f0;
          border-radius: 9px;
          background: rgba(248,250,252,.98);
        }
        .ql-search-project-filter-menu[hidden] { display:none !important; }
        .ql-search-project-chip {
          min-width: 0;
          max-width: 142px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 0 6px;
          border: 1px solid #d8e0e9;
          border-radius: 999px;
          background: #fff;
          color: #475569;
          font: inherit;
          font-size: 9px;
          font-weight: 750;
          cursor: pointer;
          white-space: nowrap;
        }
        .ql-search-project-chip:hover { border-color:#bfdbfe; background:#eff6ff; color:#1d4ed8; }
        .ql-search-project-chip.active {
          border-color:#93c5fd;
          background:#dbeafe;
          color:#1d4ed8;
        }
        .ql-search-project-chip:focus-visible {
          outline:2px solid #2563eb;
          outline-offset:1px;
        }
        .ql-search-project-chip-label {
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .ql-search-project-chip-count {
          flex:0 0 auto;
          min-width:14px;
          padding:1px 4px;
          border-radius:999px;
          background:#f1f5f9;
          color:#64748b;
          font-size:8px;
          font-weight:900;
          line-height:1.2;
          text-align:center;
        }
        .ql-search-project-chip.active .ql-search-project-chip-count {
          background:rgba(255,255,255,.72);
          color:#1d4ed8;
        }
        .ql-list-navigation-hint {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #64748b;
          font-size: 9px;
          white-space: nowrap;
        }
        .ql-list-navigation-hint kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 18px;
          padding: 0 5px;
          border: 1px solid #cbd5e1;
          border-bottom-width: 2px;
          border-radius: 5px;
          background: rgba(248,250,252,.96);
          color: #475569;
          font-family: inherit;
          font-size: 8px;
          font-weight: 800;
          line-height: 1;
          box-shadow: 0 1px 2px rgba(15,23,42,.04);
        }
        .ql-list-navigation-arrows {
          color: #94a3b8;
          font-weight: 800;
          letter-spacing: -1px;
        }
        .ql-prompt-sort-wrap {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #92400e;
          font-size: 10px;
          white-space: nowrap;
        }
        .ql-prompt-sort {
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid #fcd34d;
          background: #fffbeb;
          color: #92400e;
          border-radius: 999px;
          padding: 4px 20px 4px 8px;
          font-size: 10px;
          font-weight: 800;
          max-width: 118px;
          outline: none;
          cursor: pointer;
          background-image: linear-gradient(45deg, transparent 50%, #92400e 50%), linear-gradient(135deg, #92400e 50%, transparent 50%);
          background-position: calc(100% - 10px) 50%, calc(100% - 6px) 50%;
          background-size: 4px 4px, 4px 4px;
          background-repeat: no-repeat;
        }
        .ql-prompt-sort:focus {
          border-color: #d97706;
          box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.14);
        }
        .ql-list { max-height: 188px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 2px; }
        .ql-quick-date-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          margin-bottom: 8px;
        }
        .ql-quick-date-btn {
          border: 1px solid #fca5a5;
          background: white;
          color: #991b1b;
          border-radius: 999px;
          padding: 6px 8px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          min-width: 0;
          white-space: nowrap;
        }
        .ql-quick-date-btn:hover { background: #fee2e2; }
        .ql-date-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr);
          gap: 6px;
          align-items: center;
          margin-bottom: 10px;
        }
        .ql-date-sep {
          font-size: 12px;
          color: #7f1d1d;
          text-align: center;
          width: 18px;
        }
        .ql-date-input {
          min-width: 0;
          font-size: 12px;
          padding: 8px 8px;
        }
        .ql-reds-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .ql-reds-note {
          font-size: 10px;
          color: #7f1d1d;
          margin-top: 8px;
          line-height: 1.4;
        }
        .ql-reds-btn {
          border: none;
          border-radius: 10px;
          padding: 7px 12px 6px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .ql-reds-btn.ql-with-shortcut {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          min-height: 48px;
        }
        .ql-reds-btn .ql-key {
          background: rgba(255,255,255,.14);
          color: white;
          border-color: rgba(255,255,255,.5);
          box-shadow: none;
        }
        .ql-reds-btn.primary {
          background: #dc2626;
          color: white;
        }
        .ql-reds-btn.primary:hover { background: #b91c1c; }
        .ql-reds-btn.secondary {
          background: #111827;
          color: white;
        }
        .ql-reds-btn.secondary:hover { background: #000; }

        .ql-prompt-actions {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: center;
          margin-bottom: 8px;
        }
        .ql-prompt-add-btn {
          border: none;
          border-radius: 10px;
          background: #d97706;
          color: white;
          font-size: 12px;
          font-weight: 800;
          padding: 8px 9px;
          cursor: pointer;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
        }
        .ql-prompt-add-btn .ql-key {
          min-height: 13px;
          padding: 0 3px;
          background: rgba(255,255,255,.16);
          color: white;
          border-color: rgba(255,255,255,.52);
          box-shadow: none;
          font-size: 7px;
        }
        .ql-prompt-add-btn:hover { background: #b45309; }
        .ql-prompt-filter-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
        .ql-prompt-filter-btn { border: 1px solid #fde68a; background: #fff; color: #92400e; border-radius: 999px; padding: 5px 8px; font-size: 10px; font-weight: 800; cursor: pointer; max-width: 100%; }
        .ql-prompt-filter-btn.active { background: #d97706; border-color: #b45309; color: white; }
        .ql-prompt-filter-btn:hover { filter: brightness(0.97); }
        .ql-prompt-badge { display: inline-flex; align-self: flex-start; border: 1px solid #fde68a; background: #fff7ed; color: #92400e; border-radius: 999px; padding: 3px 8px; font-size: 10px; font-weight: 800; }
        .ql-prompt-list { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 2px; }
        .ql-prompt-card {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 12px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 7px;
          box-shadow: 0 3px 8px rgba(146, 64, 14, 0.08);
        }
        .ql-prompt-card-title { font-size: 13px; font-weight: 800; color: #78350f; line-height: 1.35; }
        .ql-prompt-card-body {
          font-size: 11px;
          color: #57534e;
          line-height: 1.45;
          max-height: 48px;
          overflow: hidden;
          white-space: pre-wrap;
        }
        .ql-prompt-card-meta { display: flex; justify-content: space-between; gap: 8px; font-size: 10px; color: #a16207; }
        .ql-prompt-card-actions { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; }
        .ql-prompt-card-btn {
          border: none;
          border-radius: 8px;
          padding: 7px 8px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          background: white;
          color: #92400e;
          border: 1px solid #fde68a;
        }
        .ql-prompt-card-btn.primary { background: #d97706; color: white; border-color: #d97706; }
        .ql-prompt-card-btn.copied { background: #16a34a !important; color: white !important; border-color: #15803d !important; box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.16); transform: translateY(1px) scale(0.98); }
        .ql-prompt-card.copied { outline: 2px solid rgba(22, 163, 74, 0.35); box-shadow: 0 6px 14px rgba(22, 163, 74, 0.14); }
        .ql-prompt-card-btn.danger { color: #b91c1c; border-color: #fecaca; }
        .ql-prompt-add-btn, .ql-reds-btn, .ql-quick-date, .ql-prompt-card-btn { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ql-prompt-card-btn:hover { filter: brightness(0.97); }
        .ql-char-count { font-size: 10px; color: #64748b; text-align: right; margin-top: -2px; }
        .ql-item {
          background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px;
          display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: start;
        }
        .ql-item-actions { display: flex; flex-direction: column; gap: 6px; }
        .ql-item:hover { border-color: #fca5a5; box-shadow: 0 4px 10px rgba(220, 38, 38, 0.10); }
        .ql-open { min-width: 0; cursor: pointer; border-radius: 8px; outline: none; }
        .ql-open:focus-visible {
          box-shadow: 0 0 0 3px rgba(37,99,235,.18);
          outline: 2px solid #2563eb;
          outline-offset: 3px;
        }
        .ql-item:focus-within { border-color: #60a5fa; }
        .ql-item-title {
          font-size: 13px; font-weight: 600; color: #1f2937; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px;
        }
        .ql-item-url {
          font-size: 10px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        .ql-item-note {
          font-size: 10px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 4px;
        }
        .ql-badge {
          display: inline-flex; align-items: center; max-width: 100%; margin-bottom: 6px;
          border-radius: 999px; font-size: 10px; font-weight: 700; padding: 3px 8px; border: 1px solid #e2e8f0;
        }
        .ql-badge-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
        .ql-badge-archived {
          display: inline-flex; align-items: center;
          border-radius: 999px; font-size: 10px; font-weight: 700; padding: 3px 8px;
          background: #e5e7eb; color: #475569; border: 1px solid #cbd5e1;
        }
        .ql-edit-btn, .ql-copy-link-btn {
          border: none; border-radius: 8px; padding: 7px 9px;
          cursor: pointer; font-size: 12px; font-weight: 700; white-space: nowrap;
        }
        .ql-edit-btn { background: #eff6ff; color: #1d4ed8; }
        .ql-edit-btn:hover { background: #dbeafe; }
        .ql-copy-link-btn { background: #ecfdf5; color: #047857; }
        .ql-copy-link-btn:hover { background: #d1fae5; }
        .ql-edit-btn:focus-visible, .ql-copy-link-btn:focus-visible {
          outline: 2px solid #2563eb;
          outline-offset: 2px;
          box-shadow: 0 0 0 3px rgba(37,99,235,.16);
        }
        .ql-empty {
          background: white; border: 1px dashed #fda4af; border-radius: 12px; padding: 18px 14px; text-align: center;
          font-size: 12px; color: #64748b;
        }
        .ql-modal-layer {
          position: fixed; inset: 0; background: rgba(15, 23, 42, 0.18); display: flex; align-items: flex-end; justify-content: flex-end;
          padding: 16px; pointer-events: auto;
        }
        .ql-modal {
          width: 320px; max-height: calc(100vh - 32px); background: white; border: 1px solid #dbe2ea; border-radius: 16px; overflow: hidden;
          box-shadow: 0 20px 48px rgba(15, 23, 42, 0.22);
        }
        .ql-modal-header {
          background: #c81e1e; color: white; padding: 12px; display: flex; align-items: center; justify-content: space-between;
        }
        .ql-modal-title { font-size: 13px; font-weight: 700; }
        .ql-modal-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; overflow-y:auto; }

        .ql-modal-mode-switch { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; padding: 5px; }
        .ql-modal-mode-btn { border: none; border-radius: 9px; padding: 8px 10px; font-size: 11px; font-weight: 800; cursor: pointer; background: transparent; color: #991b1b; white-space: nowrap; }
        .ql-modal-mode-btn.active { background: #c81e1e; color: white; box-shadow: 0 2px 8px rgba(200, 30, 30, 0.18); }
        .ql-modal-section { display: none; flex-direction: column; gap: 8px; }
        .ql-modal-section.active { display: flex; }
        .ql-char-count { font-size: 10px; color: #92400e; text-align: right; margin-top: -4px; }
        .ql-modal-hint { font-size: 10px; color: #64748b; margin-top: -2px; }
        .ql-auto-project-hint {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          margin-top: -3px; padding: 6px 8px; border: 1px solid #bfdbfe; border-radius: 8px;
          background: #eff6ff; color: #1e40af; font-size: 9px; line-height: 1.35;
        }
        .ql-auto-project-hint.manual { background: #f8fafc; border-color: #cbd5e1; color: #475569; }
        .ql-auto-project-reapply {
          flex: 0 0 auto; border: 1px solid #bfdbfe; border-radius: 6px; background: white;
          color: #1d4ed8; padding: 3px 6px; font-size: 9px; font-weight: 800; cursor: pointer;
        }
        .ql-auto-project-reapply:hover { background: #dbeafe; }
        .ql-edit-layer {
          position: fixed; inset: 0; background: rgba(15, 23, 42, 0.18); display: flex; align-items: flex-end; justify-content: flex-end;
          padding: 16px; pointer-events: auto;
        }
        .ql-edit-modal {
          width: 320px; max-height: calc(100vh - 32px); background: white; border: 1px solid #dbe2ea; border-radius: 16px; overflow: hidden;
          box-shadow: 0 20px 48px rgba(15, 23, 42, 0.22);
        }
        .ql-edit-header {
          background: #c81e1e; color: white; padding: 12px; display: flex; align-items: center; justify-content: space-between;
        }
        .ql-edit-title { font-size: 13px; font-weight: 700; }
        .ql-edit-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; overflow-y:auto; }
        .ql-label { font-size: 11px; color: #475569; font-weight: 700; margin-bottom: -2px; }
        .ql-input, .ql-textarea {
          width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 9px 10px; font-size: 13px;
          outline: none; background: white; color: #1f2937;
        }
        .ql-input::placeholder, .ql-textarea::placeholder { color: #94a3b8; opacity: 1; }
        .ql-input:focus, .ql-textarea:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); }
        .ql-textarea { min-height: 72px; resize: vertical; font-family: inherit; }
        .ql-edit-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
        .ql-edit-actions.split { justify-content: space-between; align-items: center; }
        .ql-edit-actions-main { display: flex; justify-content: flex-end; gap: 8px; }
        .ql-btn-secondary, .ql-btn-primary, .ql-btn-danger {
          border-radius: 10px; padding: 9px 12px; font-size: 12px; font-weight: 700; cursor: pointer;
        }
        .ql-btn-secondary { border: 1px solid #cbd5e1; background: white; color: #475569; }
        .ql-btn-primary { border: none; background: #2563eb; color: white; }
        .ql-btn-danger { border: 1px solid #fecaca; background: #fff1f2; color: #b91c1c; }
        .ql-btn-secondary:hover { background: #f8fafc; }
        .ql-btn-primary:hover { background: #1d4ed8; }
        .ql-btn-primary:disabled { opacity: .68; cursor: wait; background: #64748b; }
        .ql-btn-danger:hover { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }

        /* v1.12.5: POPの展開・縮小は即時切り替え */
        .ql-wrap, .ql-panel, .ql-launcher {
          animation: none !important;
          transition: none !important;
        }

        /* v1.12.4 visual refinement */
        .ql-panel {
          width: 326px;
          background: #f8fafc;
          border-color: #dde4ec;
          border-radius: 18px;
          box-shadow: 0 24px 60px rgba(15,23,42,.24), 0 2px 8px rgba(15,23,42,.08);
        }
        .ql-header {
          background: linear-gradient(135deg, #a81616 0%, #c81e1e 55%, #db3b3b 100%);
          padding: 13px 14px;
          box-shadow: inset 0 -1px 0 rgba(255,255,255,.08);
        }
        .ql-title { font-size: 13px; font-weight: 800; letter-spacing: .01em; }
        .ql-sub { color: rgba(255,255,255,.74); }
        .ql-header-btn, .ql-panel-open-btn { border:1px solid rgba(255,255,255,.10); }
        .ql-header-btn:hover, .ql-panel-open-btn:hover { border-color:rgba(255,255,255,.20); }
        .ql-body { padding: 11px; background: #f8fafc; }
        .ql-tabs { gap: 7px; margin-bottom: 8px; }
        .ql-tab-btn {
          border-radius: 12px;
          border-color: #dde4ec;
          box-shadow: 0 1px 2px rgba(15,23,42,.04);
          min-height: 49px;
        }
        .ql-tab-btn:hover { box-shadow:0 7px 16px rgba(15,23,42,.08); }
        .ql-tab-btn.active-links { background:linear-gradient(145deg,#3978ec,#2563eb)!important; }
        .ql-tab-btn.active-reds { background:linear-gradient(145deg,#d83b3b,#b91c1c)!important; }
        .ql-tab-btn.active-prompts { background:linear-gradient(145deg,#e89a22,#d97706)!important; }
        .ql-item, .ql-prompt-card {
          border-radius: 13px;
          border-color: #dde4ec;
          box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 5px 14px rgba(15,23,42,.035);
          transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
        }
        .ql-item:hover, .ql-prompt-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 24px rgba(15,23,42,.10);
        }
        .ql-item:hover { border-color:#f4b4b4; }
        .ql-item-title { color:#172033; font-weight:650; }
        .ql-badge { border-radius:999px; }
        .ql-edit-btn, .ql-copy-link-btn, .ql-prompt-card-btn, .ql-reds-btn { border-radius:9px; }
        .ql-launcher .ql-icon-btn,
        .ql-launcher .ql-icon-btn:hover,
        .ql-launcher .ql-icon-btn:focus-visible {
          background:linear-gradient(145deg,#d63a3a,#b91c1c);
          transform:none;
        }


        /* v1.12.14: POPも色味を保ちながら静かな階層へ整理 */
        .ql-panel {
          border-radius: 14px;
          /* POP本体は浮遊要素なので影を維持 */
          box-shadow: 0 20px 46px rgba(15,23,42,.20), 0 2px 7px rgba(15,23,42,.07);
        }
        .ql-header {
          background: linear-gradient(135deg, #b61f1f 0%, #c81e1e 64%, #ce2f2f 100%);
          box-shadow: none;
        }
        .ql-tab-btn {
          border-radius: 10px;
          box-shadow: none;
          transform: none;
        }
        .ql-tab-btn:hover { box-shadow: none; transform: none; }
        .ql-tab-btn.active-links {
          background: linear-gradient(145deg,#2f6fe4,#2563eb)!important;
          box-shadow: none !important;
        }
        .ql-tab-btn.active-reds {
          background: linear-gradient(145deg,#c93333,#b91c1c)!important;
          box-shadow: none !important;
        }
        .ql-tab-btn.active-prompts {
          background: linear-gradient(145deg,#df8b16,#d97706)!important;
          box-shadow: none !important;
        }

        /* 角丸を 6 / 10 / 14px の3段階へ整理 */
        .ql-key,
        .ql-launcher-key,
        .ql-header-btn,
        .ql-panel-open-btn,
        .ql-launcher-close { border-radius: 6px; }
        .ql-input,
        .ql-textarea,
        .ql-search-input,
        .ql-tab-btn,
        .ql-edit-btn,
        .ql-copy-link-btn,
        .ql-prompt-card-btn,
        .ql-prompt-add-btn,
        .ql-reds-btn,
        .ql-quick-date,
        .ql-btn-secondary,
        .ql-btn-primary,
        .ql-btn-danger,
        .ql-modal-mode-btn { border-radius: 10px; }
        .ql-panel,
        .ql-item,
        .ql-prompt-card,
        .ql-empty,
        .ql-modal,
        .ql-edit-modal,
        .ql-modal-mode-switch { border-radius: 14px; }

        /* 一覧カードは影を外し、境界線で軽く区切る */
        .ql-item,
        .ql-prompt-card {
          border: 1px solid #dde4ec;
          border-left: 3px solid transparent;
          box-shadow: none;
          transform: none;
          transition: border-color .14s ease, background .14s ease;
        }
        .ql-item:hover,
        .ql-prompt-card:hover {
          transform: none;
          box-shadow: none;
        }
        .ql-item:hover {
          border-color: #efc7c7;
          border-left-color: #efc7c7;
          background: #fff;
        }
        .ql-prompt-card:hover { border-color: #efd58d; }

        /* Alt+Qと矢印操作の選択位置は左線で明確化 */
        .ql-item:focus-within {
          background: #fffafa;
          border-color: #efcaca;
          border-left-color: #dc2626;
          box-shadow: none;
        }
        .ql-open:focus-visible {
          outline: 2px solid rgba(37,99,235,.78);
          outline-offset: 2px;
          box-shadow: none;
          border-radius: 6px;
        }

        /* カード内操作は通常時を軽くし、ホバー・フォーカスでだけ強調 */
        .ql-edit-btn,
        .ql-copy-link-btn {
          border: 1px solid #e8edf3;
          background: #fbfcfe;
          color: #667085;
          box-shadow: none;
        }
        .ql-copy-link-btn:hover {
          background: #ecfdf5;
          color: #047857;
          border-color: #a7f3d0;
        }
        .ql-edit-btn:hover {
          background: #eff6ff;
          color: #1d4ed8;
          border-color: #bfdbfe;
        }
        .ql-edit-btn:focus-visible,
        .ql-copy-link-btn:focus-visible {
          outline: 2px solid #2563eb;
          outline-offset: 1px;
          border-color: #93c5fd;
          box-shadow: none;
        }

        /* POP内の装飾影は外し、影はPOP本体とランチャーに限定 */
        .ql-tab-btn,
        .ql-item,
        .ql-prompt-card,
        .ql-key,
        .ql-collapse-btn,
        .ql-modal-mode-btn.active,
        .ql-prompt-card-btn,
        .ql-prompt-card-btn.copied,
        .ql-prompt-card.copied {
          box-shadow: none !important;
        }
        .ql-launcher .ql-icon-btn,
        .ql-launcher .ql-icon-btn:hover,
        .ql-launcher .ql-icon-btn:focus-visible {
          background: linear-gradient(145deg,#c92323,#b91c1c);
          transform: none;
          /* 折りたたみランチャーは浮遊要素なので影を維持 */
          box-shadow: 0 10px 22px rgba(15,23,42,.26);
        }

      </style>
      <div class="ql-wrap">
        ${floatingNotice && !addDraft && !promptDraft && !editingItem ? `<div class="ql-toast ${floatingNotice.type === 'warning' ? 'warning' : (floatingNotice.type === 'success' ? 'success' : '')}" role="status" aria-live="polite">${escapeHtml(floatingNotice.message)}</div>` : ''}
        ${mode === 'icon' ? `
          <div class="ql-launcher">
            <button class="ql-add-btn" id="ql-open-add" title="現在のページを追加（Alt+N）" aria-label="現在のページを追加（Alt+N）">+</button>
            <div class="ql-launcher-main">
              <button class="ql-launcher-close" id="ql-hide-launcher" title="右下POPを完全に隠す（Alt+5）" aria-label="右下POPを完全に隠す（Alt+5）">×</button>
              <button class="ql-icon-btn" id="ql-open-panel" title="Quick Linksを検索" aria-label="Quick Linksを検索">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7"></circle>
                  <path d="M20 20l-3.5-3.5"></path>
                </svg>
              </button>
            </div>
          </div>
        ` : `
          <div class="ql-panel" role="dialog" aria-label="Quick Links検索">
            <div class="ql-header">
              <div class="ql-title-wrap">
                <div class="ql-title">Quick Links 検索</div>
              </div>
              <div class="ql-header-actions">
                <button class="ql-panel-open-btn" id="ql-open-sidepanel" title="サイドパネルを開く" aria-label="サイドパネルを開く">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="2"></rect>
                    <path d="M9 4v16"></path>
                  </svg>
                </button>
                <button class="ql-header-btn ql-with-shortcut" id="ql-close" title="完全に隠す（Alt+5）"><span aria-hidden="true">×</span><kbd class="ql-key">Alt+5</kbd></button>
                <button class="ql-header-btn ql-collapse-btn ql-with-shortcut" id="ql-collapse" title="小さくする（Alt+W）"><span aria-hidden="true">−</span><kbd class="ql-key">Alt+W</kbd></button>
              </div>
            </div>
            <div class="ql-body">
              <div class="ql-tabs">
                <button class="ql-tab-btn ${activeTab === 'links' ? 'active-links' : ''}" id="ql-tab-links" title="Quick Links（Alt+1）"><span class="ql-tab-label">🔗 Links</span><kbd class="ql-key">Alt+1</kbd></button>
                <button class="ql-tab-btn ${activeTab === 'reds' ? 'active-reds' : ''}" id="ql-tab-reds" title="REDS Search（Alt+2）"><span class="ql-tab-label">⚽ REDS</span><kbd class="ql-key">Alt+2</kbd></button>
                <button class="ql-tab-btn ${activeTab === 'prompts' ? 'active-prompts' : ''}" id="ql-tab-prompts" title="Prompt Memo（Alt+3）"><span class="ql-tab-label">📝 Prompt</span><kbd class="ql-key">Alt+3</kbd></button>
              </div>
              <div class="ql-pane ${activeTab === 'links' ? 'active' : ''}" id="ql-pane-links">
                <div class="ql-search-row">
                  <input class="ql-search" id="ql-search-input" type="text" placeholder="検索（タイトル・URL・備考...）" value="${escapeHtml(searchQuery)}">
                  <button class="ql-clear" id="ql-clear-search" title="検索をクリア" aria-label="検索をクリア"><span aria-hidden="true">×</span></button>
                  <kbd class="ql-search-key" title="検索をクリア／検索欄へ移動">Alt+4</kbd>
                </div>
                <div class="ql-result-meta">
                  <span id="ql-result-count">${filtered.length}件</span>
                  <span class="ql-result-tools">
                    <button class="ql-search-project-filter" id="ql-search-project-filter" type="button" ${String(searchQuery || '').trim() ? '' : 'hidden'} title="検索結果の分類：${escapeHtml(searchProjectFilter === 'ALL' ? 'すべて' : searchProjectFilter)}（${searchProjectFilterCount}件）｜Alt+Fで候補を一覧" aria-label="検索結果の分類 ${escapeHtml(searchProjectFilter === 'ALL' ? 'すべて' : searchProjectFilter)}、${searchProjectFilterCount}件。Alt+Fで分類候補を一覧表示" aria-expanded="${searchProjectFilterExpanded ? 'true' : 'false'}">
                      <span class="ql-search-project-filter-label" id="ql-search-project-filter-label">${escapeHtml(searchProjectFilter === 'ALL' ? 'すべて' : searchProjectFilter)}</span>
                      <span class="ql-search-project-filter-count" id="ql-search-project-filter-count" aria-hidden="true">${searchProjectFilterCount}</span>
                      <kbd>Alt+F</kbd><span class="ql-search-project-filter-arrows" aria-hidden="true">←→</span>
                    </button>
                    <button class="ql-sort-toggle" id="ql-sort-toggle" type="button" title="並び替え（Alt+O）">
                      <span class="ql-sort-icon" aria-hidden="true">${linkSortPresentation.icon}</span>
                      <span id="ql-sort-label">${linkSortPresentation.label}</span>
                      <kbd>Alt+O</kbd>
                    </button>
                    <span class="ql-list-navigation-hint" title="Alt+Qで先頭を選択。上下でリンク移動、右でコピー、コピーから下で編集、左でリンクへ戻る">
                      <span>選択</span><kbd>Alt+Q</kbd><span class="ql-list-navigation-arrows" aria-hidden="true">↑↓</span>
                    </span>
                  </span>
                </div>
                <div class="ql-search-project-filter-menu" id="ql-search-project-filter-menu" ${searchProjectFilterExpanded && String(searchQuery || '').trim() ? '' : 'hidden'} aria-label="検索結果の分類候補">
                  ${searchProjectFilterExpanded ? renderFloatingSearchProjectFilterMenuHtml(searchFilterMatchedItems) : ''}
                </div>
                <div class="ql-list" id="ql-list">${listHtml}</div>
              </div>
              <div class="ql-pane ${activeTab === 'reds' ? 'active' : ''}" id="ql-pane-reds">
                <div class="ql-search-row">
                  <input class="ql-reds-input" id="ql-reds-query" type="text" placeholder="例：チケット、試合結果、移籍" value="${escapeHtml(redsQuery)}">
                  <button class="ql-clear" id="ql-clear-reds-search" title="検索をクリア" aria-label="検索をクリア" style="display:${redsQuery ? 'inline-flex' : 'none'}"><span aria-hidden="true">×</span></button>
                  <kbd class="ql-search-key" title="検索をクリア／検索欄へ移動">Alt+4</kbd>
                </div>
                <div class="ql-quick-date-row">
                  <button class="ql-quick-date-btn" data-reds-range="today">今日</button>
                  <button class="ql-quick-date-btn" data-reds-range="yesterday">昨日</button>
                  <button class="ql-quick-date-btn" data-reds-range="week">1週間</button>
                  <button class="ql-quick-date-btn" data-reds-range="month">1ヶ月前〜</button>
                  <button class="ql-quick-date-btn" data-reds-range="year">1年以内</button>
                  <button class="ql-quick-date-btn" data-reds-range="older">1年前以前</button>
                </div>
                <div class="ql-date-row">
                  <input class="ql-date-input" id="ql-reds-date-start" type="date" value="${escapeHtml(redsDateStart)}">
                  <div class="ql-date-sep">〜</div>
                  <input class="ql-date-input" id="ql-reds-date-end" type="date" value="${escapeHtml(redsDateEnd)}">
                </div>
                <div class="ql-reds-actions">
                  <button class="ql-reds-btn primary ql-with-shortcut" id="ql-reds-google" title="サイト検索（Alt+S）"><span>🌐 サイト内</span><kbd class="ql-key">Alt+S</kbd></button>
                  <button class="ql-reds-btn secondary ql-with-shortcut" id="ql-reds-x" title="X検索（Alt+X）"><span>𝕏 公式X</span><kbd class="ql-key">Alt+X</kbd></button>
                </div>
                <div class="ql-quick-date-row" style="margin-top:8px;">
                  <button class="ql-quick-date-btn" id="ql-reds-date-clear">クリア</button>
                </div>
              </div>
              <div class="ql-pane ${activeTab === 'prompts' ? 'active' : ''}" id="ql-pane-prompts">
                <div class="ql-prompt-actions">
                  <div class="ql-search-row" style="margin-bottom:0;">
                    <input class="ql-search" id="ql-prompt-search" type="text" placeholder="検索（タイトル・本文）" value="${escapeHtml(promptSearchQuery)}">
                    <button class="ql-clear" id="ql-clear-prompt-search" title="検索をクリア" aria-label="検索をクリア" style="display:${promptSearchQuery ? 'inline-flex' : 'none'}"><span aria-hidden="true">×</span></button>
                    <kbd class="ql-search-key" title="検索をクリア／検索欄へ移動">Alt+4</kbd>
                  </div>
                  <button class="ql-prompt-add-btn" id="ql-prompt-new" title="新規プロンプト（Alt+N）">＋ 新規 <kbd class="ql-key">Alt+N</kbd></button>
                </div>
                <div class="ql-prompt-filter-row" id="ql-prompt-filter-row">${promptFilterHtml}</div>
                <div class="ql-result-meta">
                  <span id="ql-prompt-count">${filteredPrompts.length}件</span>
                  <label class="ql-prompt-sort-wrap" title="プロンプトメモの並び順">
                    並び
                    <select class="ql-prompt-sort" id="ql-prompt-sort-mode">
                      <option value="POPULAR" ${promptSortMode === 'POPULAR' ? 'selected' : ''}>よく使う</option>
                      <option value="ADDED" ${promptSortMode === 'ADDED' ? 'selected' : ''}>追加順</option>
                    </select>
                  </label>
                </div>
                <div class="ql-prompt-list" id="ql-prompt-list">${promptListHtml}</div>
              </div>
            </div>
          </div>
        `}
        ${addDraft ? renderAddModal(projectOptions) : ''}
        ${promptDraft ? renderPromptMemoModal(promptDraft) : ''}
        ${editingItem ? renderEditModal(editingItem, projectOptions) : ''}
      </div>
    `;

    // 新規追加モーダルは、折りたたみランチャー上だけでなく、
    // 展開中のPOPから Alt+N で開いた場合にも同じイベントを結び付ける。
    // 以前は mode === 'icon' の分岐内だけで登録していたため、展開中は
    // 「追加」ボタンが表示されてもクリックが反応しないことがあった。
    if (addDraft) bindAddModalEvents();

    if (mode === 'icon') {
      shadow.getElementById('ql-open-add')?.addEventListener('click', openAddModal);
      shadow.getElementById('ql-hide-launcher')?.addEventListener('click', closeFloatingPanel);
      shadow.getElementById('ql-open-panel')?.addEventListener('click', () => {
        openFloatingTab('links', { explicitUserAction: true });
      });
      return;
    }

    shadow.getElementById('ql-open-sidepanel')?.addEventListener('click', openSidePanel);
    shadow.getElementById('ql-close')?.addEventListener('click', closeFloatingPanel);
    shadow.getElementById('ql-collapse')?.addEventListener('click', collapseFloatingPanel);
    shadow.getElementById('ql-tab-links')?.addEventListener('click', () => switchFloatingTab('links'));
    shadow.getElementById('ql-tab-reds')?.addEventListener('click', () => switchFloatingTab('reds'));
    shadow.getElementById('ql-tab-prompts')?.addEventListener('click', () => switchFloatingTab('prompts'));
    shadow.getElementById('ql-sort-toggle')?.addEventListener('click', () => cycleFloatingLinkSort());
    shadow.getElementById('ql-search-project-filter')?.addEventListener('click', () => {
      if (searchProjectFilterExpanded) closeFloatingSearchProjectFilterMenu({ focusCompact: true });
      else openFloatingSearchProjectFilterMenu();
    });
    shadow.getElementById('ql-search-project-filter-menu')?.addEventListener('click', (e) => {
      const chip = e.target?.closest?.('[data-search-project-filter-chip]');
      if (!chip) return;
      const value = chip.getAttribute('data-search-project-filter-chip') || 'ALL';
      selectFloatingSearchProjectFilter(value, { closeMenu: true });
    });

    if (activeTab === 'links') {
      const linksSearchInput = shadow.getElementById('ql-search-input');
      bindSharedSearchComposition(linksSearchInput, updatePanelResults);
      linksSearchInput?.addEventListener('input', (e) => {
        if (shouldIgnoreSharedSearchInputEvent(e)) return;
        applySharedSearchQuery(e.target.value || '');
        updatePanelResults();
      });
      shadow.getElementById('ql-search-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const first = getFilteredItems()[0];
          if (first) openItem(first.url, first.id, { active: !(e.ctrlKey || e.metaKey), keepPanelOpen: true });
        } else if (e.key === 'Escape' && e.altKey) {
          collapseFloatingPanel();
        }
      });
      shadow.getElementById('ql-clear-search')?.addEventListener('click', () => {
        applySharedSearchQuery('');
        updatePanelResults();
        setTimeout(() => shadow.getElementById('ql-search-input')?.focus(), 0);
      });
      bindPanelListEvents();
    } else if (activeTab === 'reds') {
      const redsSearchInput = shadow.getElementById('ql-reds-query');
      bindSharedSearchComposition(redsSearchInput);
      redsSearchInput?.addEventListener('input', (e) => {
        if (shouldIgnoreSharedSearchInputEvent(e)) return;
        applySharedSearchQuery(e.target.value || '');
      });
      shadow.getElementById('ql-reds-query')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runRedsGoogleSearch();
        } else if (e.key === 'Escape' && e.altKey) {
          collapseFloatingPanel();
        }
      });
      shadow.getElementById('ql-clear-reds-search')?.addEventListener('click', () => {
        applySharedSearchQuery('');
        render();
        setTimeout(() => shadow.getElementById('ql-reds-query')?.focus(), 0);
      });
      shadow.getElementById('ql-reds-date-start')?.addEventListener('input', (e) => {
        redsDateStart = e.target.value || '';
      });
      shadow.getElementById('ql-reds-date-end')?.addEventListener('input', (e) => {
        redsDateEnd = e.target.value || '';
      });
      shadow.querySelectorAll('[data-reds-range]').forEach(btn => {
        btn.addEventListener('click', () => applyRedsQuickDate(btn.getAttribute('data-reds-range')));
      });
      shadow.getElementById('ql-reds-date-clear')?.addEventListener('click', () => {
        redsDateStart = '';
        redsDateEnd = '';
        render();
      });
      shadow.getElementById('ql-reds-google')?.addEventListener('click', runRedsGoogleSearch);
      shadow.getElementById('ql-reds-x')?.addEventListener('click', runRedsXSearch);
    } else if (activeTab === 'prompts') {
      bindPromptMemoEvents();
    }

    if (promptDraft) {
      bindPromptMemoModalEvents();
    }

    if (editingItem) {
      shadow.getElementById('ql-cancel-edit')?.addEventListener('click', closeEdit);
      shadow.getElementById('ql-close-edit')?.addEventListener('click', closeEdit);
      shadow.getElementById('ql-save-edit')?.addEventListener('click', () => saveEdit(false));
      shadow.getElementById('ql-confirm-edit-overwrite')?.addEventListener('click', () => saveEdit(true));
      shadow.getElementById('ql-cancel-edit-overwrite')?.addEventListener('click', () => {
        pendingEditOverwriteId = null;
        render();
        setTimeout(() => shadow.getElementById('ql-edit-url')?.focus(), 0);
      });
      ['ql-edit-title', 'ql-edit-url', 'ql-edit-project', 'ql-edit-note'].forEach((id) => {
        shadow.getElementById(id)?.addEventListener('keydown', (e) => {
          if (e.isComposing || e.keyCode === 229) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            closeEdit();
            return;
          }
          if (e.key !== 'Enter') return;
          if (id === 'ql-edit-note' && e.shiftKey) return;
          e.preventDefault();
          e.stopPropagation();
          saveEdit();
        });
      });
      shadow.getElementById('ql-edit-url')?.addEventListener('input', () => {
        if (!pendingEditOverwriteId) return;
        pendingEditOverwriteId = null;
        shadow.getElementById('ql-edit-overwrite-warning')?.remove();
      });
      shadow.getElementById('ql-delete-edit')?.addEventListener('click', deleteEditingItem);
      shadow.getElementById('ql-edit-layer')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'ql-edit-layer') closeEdit();
      });
    }

    if (activeBefore === 'ql-search-input' && !editingItem && activeTab === 'links') {
      const nextSearch = shadow.getElementById('ql-search-input');
      if (nextSearch) {
        nextSearch.focus();
        if (searchSelection && searchSelection.start != null && searchSelection.end != null) {
          try {
            nextSearch.setSelectionRange(searchSelection.start, searchSelection.end);
          } catch (_) {}
        }
      }
    } else if (activeBefore === 'ql-search-project-filter' && !editingItem && activeTab === 'links' && String(searchQuery || '').trim()) {
      shadow.getElementById('ql-search-project-filter')?.focus({ preventScroll: true });
    } else if (activeBefore === 'ql-reds-query' && !editingItem && activeTab === 'reds') {
      shadow.getElementById('ql-reds-query')?.focus();
    } else if (activeBefore === 'ql-prompt-search' && !promptDraft && activeTab === 'prompts') {
      shadow.getElementById('ql-prompt-search')?.focus();
    } else if (activeBefore === 'ql-edit-title' && editingItem) {
      shadow.getElementById('ql-edit-title')?.focus();
    }
  }

  function updatePanelResults() {
    if (!shadow || mode !== 'panel') return;
    const listEl = shadow.getElementById('ql-list');
    const countEl = shadow.getElementById('ql-result-count');
    const clearBtn = shadow.getElementById('ql-clear-search');
    if (!listEl || !countEl) return;

    updateFloatingSearchProjectFilterControl();
    const filtered = getFilteredItems();
    countEl.textContent = `${filtered.length}件`;
    if (clearBtn) {
      clearBtn.style.display = searchQuery ? 'inline-flex' : 'none';
    }
    listEl.innerHTML = filtered.length
      ? filtered.map(renderItem).join('')
      : `<div class="ql-empty">${searchQuery ? '一致するリンクが見つかりません' : '表示できるリンクがありません'}</div>`;
    bindPanelListEvents();
  }

  function bindPanelListEvents() {
    shadow.querySelectorAll('[data-open-url]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        openItem(
          el.getAttribute('data-open-url'),
          el.getAttribute('data-open-id'),
          {
            active: !(e.ctrlKey || e.metaKey),
            keepPanelOpen: true
          }
        );
      });
      el.addEventListener('auxclick', (e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        openItem(
          el.getAttribute('data-open-url'),
          el.getAttribute('data-open-id'),
          {
            active: false,
            keepPanelOpen: true
          }
        );
      });
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        openItem(
          el.getAttribute('data-open-url'),
          el.getAttribute('data-open-id'),
          {
            active: !(e.ctrlKey || e.metaKey),
            keepPanelOpen: true
          }
        );
      });
    });
    shadow.querySelectorAll('[data-copy-url]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = el.getAttribute('data-copy-url');
        el.disabled = true;
        try {
          const resolvedUrl = await resolveLinkUrlForCopy(url);
          await writeTextToClipboardFloating(resolvedUrl);
          showFloatingNotice('リンクをコピーしました', 'success', 1800);
        } catch (error) {
          console.warn('[Quick Links] リンクのコピーに失敗しました。', error);
          showFloatingNotice('リンクをコピーできませんでした', 'warning', 2600);
        } finally {
          if (el.isConnected) el.disabled = false;
        }
      });
    });
    shadow.querySelectorAll('[data-edit-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        editingId = el.getAttribute('data-edit-id');
        pendingEditOverwriteId = null;
        const item = items.find(entry => entry.id === editingId);
        editingDraft = item ? { ...item } : null;
        render();
        setTimeout(() => shadow.getElementById('ql-edit-title')?.focus(), 0);
      });
    });
  }


  function normalizePromptCategories(value) {
    const base = Array.isArray(value) ? value : [];
    const merged = ['未分類', ...base, ...((promptMemos || []).map(m => getPromptMemoCategory(m)))];
    return Array.from(new Set(merged.map(v => String(v || '').trim()).filter(Boolean)));
  }

  function getPromptMemoCategory(memo) {
    return String(memo?.categoryName || memo?.projectName || '未分類').trim() || '未分類';
  }

  function categoryInputValue(name) {
    const value = String(name || '').trim();
    return value && value !== '未分類' ? value : '';
  }

  function getPromptCategories() {
    return normalizePromptCategories(promptCategories);
  }

  function addPromptCategory(name) {
    const categoryName = String(name || '').trim() || '未分類';
    return normalizePromptCategories([...promptCategories, categoryName]);
  }


  function hashPromptCategoryName(name) {
    const str = String(name || '未分類');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function getPromptCategoryColor(name) {
    const categoryName = String(name || '未分類').trim() || '未分類';
    if (categoryName === '未分類') {
      return { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb', cardBg: '#ffffff', cardBorder: '#e5e7eb' };
    }
    return PROMPT_CATEGORY_PALETTE[hashPromptCategoryName(categoryName) % PROMPT_CATEGORY_PALETTE.length];
  }

  function promptCategoryButtonStyle(categoryName, active) {
    const colors = getPromptCategoryColor(categoryName);
    if (active) {
      return `background:${colors.text};color:white;border-color:${colors.text};box-shadow:0 2px 7px rgba(15,23,42,0.12);`;
    }
    return `background:${colors.bg};color:${colors.text};border-color:${colors.border};`;
  }

  function promptCategoryBadgeStyle(categoryName) {
    const colors = getPromptCategoryColor(categoryName);
    return `background:${colors.bg};color:${colors.text};border-color:${colors.border};`;
  }

  function promptCategoryCardStyle(categoryName) {
    const colors = getPromptCategoryColor(categoryName);
    return `background:${colors.cardBg};border-color:${colors.cardBorder};`;
  }

  function renderPromptCategoryFilters() {
    const categories = getPromptCategories();
    const total = (promptMemos || []).length;
    const allActive = promptCategoryFilter === 'ALL' ? ' active' : '';
    const buttons = [`<button class="ql-prompt-filter-btn${allActive}" style="${promptCategoryButtonStyle('すべて', promptCategoryFilter === 'ALL')}" data-prompt-category="ALL">すべて (${total})</button>`];
    categories.forEach(category => {
      const count = (promptMemos || []).filter(memo => getPromptMemoCategory(memo) === category).length;
      const active = promptCategoryFilter === category ? ' active' : '';
      buttons.push(`<button class="ql-prompt-filter-btn${active}" style="${promptCategoryButtonStyle(category, promptCategoryFilter === category)}" data-prompt-category="${escapeHtml(category)}">${escapeHtml(category)} (${count})</button>`);
    });
    return buttons.join('');
  }

  function bindPromptCategoryFilterEvents() {
    shadow.querySelectorAll('[data-prompt-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        promptCategoryFilter = btn.getAttribute('data-prompt-category') || 'ALL';
        updatePromptMemoList();
      });
    });
  }

  function normalizePromptSortMode(value) {
    return value === 'ADDED' ? 'ADDED' : 'POPULAR';
  }

  function getPromptMemoAddedTime(memo) {
    const raw = memo?.createdAt || memo?.addedAt || memo?.updatedAt || '';
    const time = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function getPromptMemoUpdatedTime(memo) {
    const raw = memo?.updatedAt || memo?.createdAt || memo?.addedAt || '';
    const time = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function getFilteredPromptMemos() {
    const q = normalizeString(promptSearchQuery || '');
    let list = Array.isArray(promptMemos) ? [...promptMemos] : [];
    if (promptCategoryFilter !== 'ALL') {
      list = list.filter(memo => getPromptMemoCategory(memo) === promptCategoryFilter);
    }
    if (q) {
      list = list.filter(memo =>
        normalizeString(memo.title || '').includes(q) ||
        normalizeString(memo.body || '').includes(q) ||
        normalizeString(getPromptMemoCategory(memo)).includes(q)
      );
    }
    return list.sort((a, b) => {
      if (promptSortMode === 'ADDED') {
        const addedDiff = getPromptMemoAddedTime(b) - getPromptMemoAddedTime(a);
        if (addedDiff !== 0) return addedDiff;
        return String(b.id || '').localeCompare(String(a.id || ''));
      }
      const useDiff = Number(b.copyCount || 0) - Number(a.copyCount || 0);
      if (useDiff !== 0) return useDiff;
      const updatedDiff = getPromptMemoUpdatedTime(b) - getPromptMemoUpdatedTime(a);
      if (updatedDiff !== 0) return updatedDiff;
      return getPromptMemoAddedTime(b) - getPromptMemoAddedTime(a);
    });
  }

  function renderPromptMemoCard(memo) {
    const body = String(memo.body || '');
    const preview = body.length > 120 ? body.slice(0, 120) + '…' : body;
    const categoryName = getPromptMemoCategory(memo);
    const copied = promptCopyFeedbackId === memo.id;
    const copyLabel = copied ? 'コピー済み' : 'コピー';
    return `
      <div class="ql-prompt-card${copied ? ' copied' : ''}" style="${promptCategoryCardStyle(categoryName)}" data-prompt-id="${escapeHtml(memo.id)}">
        <div class="ql-prompt-badge" style="${promptCategoryBadgeStyle(categoryName)}">${escapeHtml(categoryName)}</div>
        <div class="ql-prompt-card-title">${escapeHtml(memo.title || '無題のプロンプト')}</div>
        <div class="ql-prompt-card-body">${escapeHtml(preview || '本文なし')}</div>
        <div class="ql-prompt-card-meta">
          <span>${body.length.toLocaleString()}文字</span>
          <span>コピー ${Number(memo.copyCount || 0).toLocaleString()}回</span>
        </div>
        <div class="ql-prompt-card-actions">
          <button class="ql-prompt-card-btn primary${copied ? ' copied' : ''}" data-prompt-copy="${escapeHtml(memo.id)}">${copyLabel}</button>
          <button class="ql-prompt-card-btn" data-prompt-edit="${escapeHtml(memo.id)}">編集</button>
          <button class="ql-prompt-card-btn danger" data-prompt-delete="${escapeHtml(memo.id)}">削除</button>
        </div>
      </div>
    `;
  }

  function updatePromptMemoList() {
    if (!shadow || mode !== 'panel') return;
    const listEl = shadow.getElementById('ql-prompt-list');
    const countEl = shadow.getElementById('ql-prompt-count');
    const clearBtn = shadow.getElementById('ql-clear-prompt-search');
    const filterEl = shadow.getElementById('ql-prompt-filter-row');
    if (!listEl || !countEl) return;
    if (filterEl) filterEl.innerHTML = renderPromptCategoryFilters();
    bindPromptCategoryFilterEvents();
    const filtered = getFilteredPromptMemos();
    countEl.textContent = `${filtered.length}件`;
    if (clearBtn) clearBtn.style.display = promptSearchQuery ? 'inline-flex' : 'none';
    listEl.innerHTML = filtered.length
      ? filtered.map(renderPromptMemoCard).join('')
      : `<div class="ql-empty">${promptSearchQuery ? '一致するプロンプトが見つかりません' : 'プロンプトメモがありません'}</div>`;
    bindPromptMemoCardEvents();
  }

  function bindPromptMemoEvents() {
    bindPromptCategoryFilterEvents();
    const promptSearchInput = shadow.getElementById('ql-prompt-search');
    bindSharedSearchComposition(promptSearchInput, updatePromptMemoList);
    promptSearchInput?.addEventListener('input', (e) => {
      if (shouldIgnoreSharedSearchInputEvent(e)) return;
      applySharedSearchQuery(e.target.value || '');
      updatePromptMemoList();
    });
    shadow.getElementById('ql-prompt-search')?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && e.altKey) {
        collapseFloatingPanel();
      }
    });
    shadow.getElementById('ql-clear-prompt-search')?.addEventListener('click', () => {
      applySharedSearchQuery('');
      render();
      setTimeout(() => shadow.getElementById('ql-prompt-search')?.focus(), 0);
    });
    shadow.getElementById('ql-prompt-new')?.addEventListener('click', openNewPromptDraft);
    shadow.getElementById('ql-prompt-sort-mode')?.addEventListener('change', async (e) => {
      promptSortMode = normalizePromptSortMode(e.target.value);
      updatePromptMemoList();
      const saved = await storageSet({ promptSortMode });
      if (!saved) updatePromptMemoList();
    });
    bindPromptMemoCardEvents();
  }

  function bindPromptMemoCardEvents() {
    shadow.querySelectorAll('[data-prompt-copy]').forEach(btn => {
      btn.addEventListener('click', () => copyPromptMemo(btn.getAttribute('data-prompt-copy')));
    });
    shadow.querySelectorAll('[data-prompt-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const memo = promptMemos.find(m => m.id === btn.getAttribute('data-prompt-edit'));
        if (!memo) return;
        promptDraft = { ...memo };
        render();
        setTimeout(() => shadow.getElementById('ql-prompt-title')?.focus(), 0);
      });
    });
    shadow.querySelectorAll('[data-prompt-delete]').forEach(btn => {
      btn.addEventListener('click', () => deletePromptMemo(btn.getAttribute('data-prompt-delete')));
    });
  }

  function renderPromptMemoModal(memo) {
    const body = memo.body || '';
    return `
      <div class="ql-modal-layer" id="ql-prompt-layer">
        <div class="ql-modal" role="dialog" aria-modal="true" aria-label="プロンプトメモを編集">
          <div class="ql-modal-header" style="background:#d97706;">
            <div class="ql-modal-title">📝 プロンプトメモ</div>
            <button class="ql-header-btn" id="ql-close-prompt" title="閉じる">×</button>
          </div>
          <div class="ql-modal-body">
            <label class="ql-label">タイトル</label>
            <input class="ql-input" id="ql-prompt-title" type="text" value="${escapeHtml(memo.title || '')}" placeholder="例：画像生成プロンプトの整理">
            <label class="ql-label">分類</label>
            <input class="ql-input" id="ql-prompt-category" type="text" value="${escapeHtml(categoryInputValue(getPromptMemoCategory(memo)))}" list="ql-prompt-category-list" placeholder="未分類">
            <datalist id="ql-prompt-category-list">${getPromptCategories().map(c => `<option value="${escapeHtml(c)}"></option>`).join('')}</datalist>
            <label class="ql-label">本文</label>
            <textarea class="ql-textarea" id="ql-prompt-body" placeholder="AIに入力するプロンプト本文">${escapeHtml(body)}</textarea>
            <div class="ql-char-count" id="ql-prompt-char-count">${body.length.toLocaleString()}文字</div>
            <div class="ql-edit-actions">
              <button class="ql-btn-secondary" id="ql-cancel-prompt">キャンセル</button>
              <button class="ql-btn-primary" id="ql-save-prompt" style="background:#d97706;">保存</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindPromptMemoModalEvents() {
    const close = () => {
      promptDraft = null;
      render();
    };
    const updateCount = () => {
      const body = shadow.getElementById('ql-prompt-body')?.value || '';
      const el = shadow.getElementById('ql-prompt-char-count');
      if (el) el.textContent = `${body.length.toLocaleString()}文字`;
    };
    shadow.getElementById('ql-cancel-prompt')?.addEventListener('click', close);
    shadow.getElementById('ql-close-prompt')?.addEventListener('click', close);
    shadow.getElementById('ql-prompt-layer')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'ql-prompt-layer') close();
    });
    shadow.getElementById('ql-prompt-body')?.addEventListener('input', updateCount);
    ['ql-prompt-title', 'ql-prompt-category', 'ql-prompt-body'].forEach(id => {
      shadow.getElementById(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          savePromptMemo();
        }
      });
    });
    shadow.getElementById('ql-save-prompt')?.addEventListener('click', savePromptMemo);
  }

  async function savePromptMemo() {
    if (promptSaveInFlight || !promptDraft) return;
    captureOverlayDrafts();
    const existing = promptDraft.id ? promptMemos.find(memo => memo.id === promptDraft.id) : null;
    const built = QuickLinksAutoRules.createPromptMemo({
      title: promptDraft.title, categoryName: promptDraft.categoryName, body: promptDraft.body
    }, existing);
    if (!built.ok) {
      showFloatingNotice(built.error, 'warning', 2800);
      shadow.getElementById('ql-prompt-title')?.focus();
      return;
    }

    promptSaveInFlight = true;
    const saveButton = shadow.getElementById('ql-save-prompt');
    if (saveButton) saveButton.disabled = true;
    try {
      const next = existing
        ? promptMemos.map(memo => memo.id === existing.id ? built.memo : memo)
        : [built.memo, ...promptMemos];
      const nextPromptCategories = addPromptCategory(built.memo.categoryName);
      const saved = await storageSet({ promptMemos: next, promptCategories: nextPromptCategories });
      if (!saved) return;
      promptMemos = next;
      promptCategories = nextPromptCategories;
      promptDraft = null;
      render();
    } finally {
      promptSaveInFlight = false;
      const currentButton = shadow?.getElementById('ql-save-prompt');
      if (currentButton) currentButton.disabled = false;
    }
  }

  function showPromptCopyFeedback(id) {
    promptCopyFeedbackId = id;
    if (promptCopyFeedbackTimer) clearTimeout(promptCopyFeedbackTimer);
    updatePromptMemoList();
    promptCopyFeedbackTimer = setTimeout(() => {
      if (promptCopyFeedbackId === id) {
        promptCopyFeedbackId = null;
        updatePromptMemoList();
      }
    }, 1300);
  }

  async function copyPromptMemo(id) {
    const memo = promptMemos.find(m => m.id === id);
    if (!memo) return;

    // 押した瞬間にコピー回数と見た目を先に更新する。
    const now = new Date().toISOString();
    const next = promptMemos.map(m => m.id === id ? {
      ...m,
      copyCount: Number(m.copyCount || 0) + 1,
      lastCopiedAt: now,
      updatedAt: m.updatedAt || now
    } : m);
    promptMemos = next;
    showPromptCopyFeedback(id);

    try {
      await navigator.clipboard.writeText(memo.body || '');
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = memo.body || '';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    try {
      const response = await sendRuntimeMessage({ type: 'quickLinksRecordPromptCopy', id });
      if (response?.ok && Array.isArray(response.promptMemos)) {
        promptMemos = response.promptMemos;
        storageSyncState.promptMemos = cloneStateValue(response.promptMemos);
      }
    } catch (error) {
      console.warn('[Quick Links] コピー回数を保存できませんでした。', error);
    }
  }

  async function deletePromptMemo(id) {
    const memo = promptMemos.find(m => m.id === id);
    if (!memo) return;
    if (!confirm(`プロンプトメモ「${memo.title || '無題'}」を削除しますか？`)) return;
    const next = promptMemos.filter(m => m.id !== id);
    promptMemos = next;
    const saved = await storageSet({ promptMemos: next });
    if (!saved) return;
    updatePromptMemoList();
  }

  async function resolveLinkUrlForCopy(url) {
    try {
      const response = await sendRuntimeMessage({
        type: 'quickLinksResolveUrl',
        url
      });
      if (!response?.ok || !response.url) throw new Error(response?.error || 'リンクを解決できませんでした。');
      return response.url;
    } catch (error) {
      if (!isExtensionContextError(error)) throw error;
      const resolved = resolveQuickLinkLocally(url);
      if (!resolved) throw new Error('リンクを解決できませんでした。');
      return resolved;
    }
  }

  async function writeTextToClipboardFloating(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('クリップボードへコピーできませんでした。');
    }
  }

  function renderItem(item) {
    const colors = getProjectColor(item.projectName);
    const readableUrl = getReadableLinkUrl(item.url);
    const noteHtml = item.note ? `<div class="ql-item-note">${escapeHtml(item.note)}</div>` : '';
    const archivedBadge = item.archived ? '<span class="ql-badge-archived">アーカイブ</span>' : '';
    return `
      <div class="ql-item">
        <div class="ql-open" data-open-url="${escapeHtml(item.url)}" data-open-id="${escapeHtml(item.id)}" tabindex="0" role="link" aria-label="${escapeHtml(item.title || item.url)}" title="${item.archived ? '開くとアーカイブ解除します / Ctrl+クリックで裏タブ' : 'クリックで新しいタブ / Ctrl+クリックで裏タブ'}">
          <div class="ql-badge-row">
            <span class="ql-badge" style="background:${colors.bg};color:${colors.text};border-color:${colors.border};">${escapeHtml(item.projectName || '未分類')}</span>
            ${archivedBadge}
          </div>
          <div class="ql-item-title">${escapeHtml(item.title || item.url)}</div>
          <div class="ql-item-url">${escapeHtml(readableUrl)}</div>
          ${noteHtml}
        </div>
        <div class="ql-item-actions">
          <button class="ql-copy-link-btn" data-copy-url="${escapeHtml(item.url)}" title="リンクをコピー">コピー</button>
          <button class="ql-edit-btn" data-edit-id="${escapeHtml(item.id)}" title="編集">編集</button>
        </div>
      </div>
    `;
  }

  function getPendingEditOverwriteItem() {
    if (!pendingEditOverwriteId) return null;
    return (items || []).find(entry => entry && entry.id === pendingEditOverwriteId) || null;
  }

  function renderInlineFloatingNotice() {
    if (!floatingNotice) return '';
    const cls = floatingNotice.type === 'success' ? ' success' : '';
    return `<div class="ql-modal-notice${cls}" role="status" aria-live="assertive">${escapeHtml(floatingNotice.message)}</div>`;
  }

  function renderEditModal(item, projectOptions) {
    return `
      <div class="ql-edit-layer" id="ql-edit-layer">
        <div class="ql-edit-modal" role="dialog" aria-modal="true" aria-label="リンクを編集">
          <div class="ql-edit-header">
            <div class="ql-edit-title">リンクを編集</div>
            <button class="ql-header-btn" id="ql-close-edit" title="閉じる">×</button>
          </div>
          <div class="ql-edit-body">
            ${renderInlineFloatingNotice()}
            <div class="ql-label">タイトル</div>
            <input class="ql-input" id="ql-edit-title" type="text" value="${escapeHtml(item.title || '')}">
            <div class="ql-label">URL</div>
            <input class="ql-input" id="ql-edit-url" type="text" value="${escapeHtml(item.url || '')}">
            <div class="ql-label">分類</div>
            <input class="ql-input" id="ql-edit-project" type="text" value="${escapeHtml(categoryInputValue(item.projectName || '未分類'))}" list="ql-project-list" placeholder="未分類">
            <datalist id="ql-project-list">${projectOptions}</datalist>
            <div class="ql-label">備考</div>
            <textarea class="ql-textarea" id="ql-edit-note">${escapeHtml(item.note || '')}</textarea>
            ${(() => {
              const duplicate = getPendingEditOverwriteItem();
              if (!duplicate) return '';
              const title = escapeHtml(duplicate.title || duplicate.url || '名称なし');
              const project = escapeHtml(duplicate.projectName || '未分類');
              return `<div class="ql-edit-overwrite-warning" id="ql-edit-overwrite-warning" role="alert" aria-live="assertive">
                <strong>別の登録済みリンクと同じURLです</strong>
                ${title}（${project}）を、いま編集中のタイトル・分類・備考で上書きします。重複する2件は1件にまとめます。
                <div class="ql-edit-overwrite-actions">
                  <button class="ql-edit-overwrite-cancel" id="ql-cancel-edit-overwrite" type="button">戻る</button>
                  <button class="ql-edit-overwrite-confirm" id="ql-confirm-edit-overwrite" type="button">上書きして更新</button>
                </div>
              </div>`;
            })()}
            <div class="ql-modal-hint">Enterで保存 / Shift+Enterで備考を改行 / Escで閉じる</div>
            <div class="ql-edit-actions split">
              <button class="ql-btn-danger" id="ql-delete-edit" type="button">削除</button>
              <div class="ql-edit-actions-main">
                <button class="ql-btn-secondary" id="ql-cancel-edit" type="button">キャンセル</button>
                <button class="ql-btn-primary" id="ql-save-edit" type="button">保存</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }


  function renderAddModal(projectOptions) {
    const draft = addDraft || {};
    const addType = draft.mode || 'link';
    const promptCategoryOptions = getPromptCategories().map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
    return `
      <div class="ql-modal-layer" id="ql-add-layer">
        <div class="ql-modal" role="dialog" aria-modal="true" aria-label="追加">
          <div class="ql-modal-header">
            <div class="ql-modal-title">＋ 追加</div>
            <button class="ql-header-btn" id="ql-close-add" title="閉じる">×</button>
          </div>
          <div class="ql-modal-body">
            ${renderInlineFloatingNotice()}
            <div class="ql-modal-mode-switch" role="tablist" aria-label="追加対象の切り替え">
              <button class="ql-modal-mode-btn ${addType === 'link' ? 'active' : ''}" id="ql-add-mode-link" type="button">🔗 Link</button>
              <button class="ql-modal-mode-btn ${addType === 'prompt' ? 'active' : ''}" id="ql-add-mode-prompt" type="button">📝 Prompt</button>
            </div>

            <div class="ql-modal-section ${addType === 'link' ? 'active' : ''}" id="ql-add-link-section">
              <div class="ql-label">タイトル</div>
              <input class="ql-input" id="ql-add-title" type="text" value="${escapeHtml(draft.title || '')}">
              <div class="ql-label">URL</div>
              <input class="ql-input" id="ql-add-url" type="text" value="${escapeHtml(draft.url || '')}">
              <div class="ql-duplicate-hint ${getAddDraftDuplicateItem() ? 'visible' : ''} ${getAddDraftDuplicateItem()?.archived ? 'archived' : ''}" id="ql-add-duplicate-hint" role="alert" aria-live="assertive">${escapeHtml(getAddDraftDuplicateHintText())}</div>
              <div class="ql-label">分類</div>
              <input class="ql-input" id="ql-add-project" type="text" value="${escapeHtml(categoryInputValue(draft.projectName || '未分類'))}" list="ql-project-list-add" placeholder="未分類">
              <datalist id="ql-project-list-add">${projectOptions}</datalist>
              <div class="ql-auto-project-hint ${draft.projectManuallyEdited ? 'manual' : ''}" id="ql-auto-project-hint">
                <span id="ql-auto-project-hint-text">${escapeHtml(getAddDraftAutoHintText())}</span>
                <button class="ql-auto-project-reapply" id="ql-auto-project-reapply" type="button">再判定</button>
              </div>
              <div class="ql-label">備考</div>
              <textarea class="ql-textarea" id="ql-add-note">${escapeHtml(draft.note || '')}</textarea>
              <div class="ql-modal-hint">Enterで保存 / Escで閉じる</div>
            </div>

            <div class="ql-modal-section ${addType === 'prompt' ? 'active' : ''}" id="ql-add-prompt-section">
              <div class="ql-label">タイトル</div>
              <input class="ql-input" id="ql-add-prompt-title" type="text" value="${escapeHtml(draft.promptTitle || '')}" placeholder="例：SNS投稿案を整える">
              <div class="ql-label">分類</div>
              <input class="ql-input" id="ql-add-prompt-category" type="text" value="${escapeHtml(categoryInputValue(draft.promptCategoryName || (promptCategoryFilter !== 'ALL' ? promptCategoryFilter : '未分類')))}" list="ql-add-prompt-category-list" placeholder="未分類">
              <datalist id="ql-add-prompt-category-list">${promptCategoryOptions}</datalist>
              <div class="ql-label">本文</div>
              <textarea class="ql-textarea" id="ql-add-prompt-body" placeholder="AIに入力するプロンプト本文">${escapeHtml(draft.promptBody || '')}</textarea>
              <div class="ql-char-count" id="ql-add-prompt-char-count">${String(draft.promptBody || '').length.toLocaleString()}文字</div>
              <div class="ql-modal-hint">Ctrl+Enterで保存 / Escで閉じる</div>
            </div>


            <div class="ql-edit-actions">
              <button class="ql-btn-secondary" id="ql-cancel-add">キャンセル</button>
              <button class="ql-btn-primary" id="ql-save-add">${addType === 'prompt' ? '保存' : '追加'}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindAddModalEvents() {
    if (!addDraft || !shadow) return;

    shadow.getElementById('ql-cancel-add')?.addEventListener('click', closeAddModal);
    shadow.getElementById('ql-close-add')?.addEventListener('click', closeAddModal);
    shadow.getElementById('ql-save-add')?.addEventListener('click', () => {
      void saveAdd();
    });
    shadow.getElementById('ql-add-mode-link')?.addEventListener('click', () => switchAddMode('link'));
    shadow.getElementById('ql-add-mode-prompt')?.addEventListener('click', () => switchAddMode('prompt'));
    shadow.getElementById('ql-add-layer')?.addEventListener('click', (event) => {
      if (event.target && event.target.id === 'ql-add-layer') closeAddModal();
    });

    const updateAddPromptCount = () => {
      const body = shadow.getElementById('ql-add-prompt-body')?.value || '';
      const element = shadow.getElementById('ql-add-prompt-char-count');
      if (element) element.textContent = `${body.length.toLocaleString()}文字`;
    };
    shadow.getElementById('ql-add-prompt-body')?.addEventListener('input', updateAddPromptCount);

    const addUrlInput = shadow.getElementById('ql-add-url');
    const addProjectInput = shadow.getElementById('ql-add-project');
    addUrlInput?.addEventListener('input', (event) => {
      if (!addDraft) return;
      addDraft.url = event.target.value || '';
      applyAutoProjectToAddDraft({ updateDom: true });
      updateAddDraftDuplicateHintDom();
    });
    addProjectInput?.addEventListener('input', (event) => {
      if (!addDraft) return;
      addDraft.projectName = event.target.value || '未分類';
      addDraft.projectManuallyEdited = true;
      updateAddDraftAutoHintDom();
    });
    shadow.getElementById('ql-auto-project-reapply')?.addEventListener('click', () => {
      applyAutoProjectToAddDraft({ force: true, updateDom: true });
    });

    ['ql-add-title', 'ql-add-url', 'ql-add-project', 'ql-add-note', 'ql-add-prompt-title', 'ql-add-prompt-category', 'ql-add-prompt-body'].forEach((id) => {
      shadow.getElementById(id)?.addEventListener('keydown', (event) => {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          closeAddModal();
          return;
        }
        if (event.key !== 'Enter') return;

        const currentAddMode = addDraft?.mode || 'link';
        const shouldSavePrompt = currentAddMode === 'prompt'
          && (id !== 'ql-add-prompt-body' || event.ctrlKey || event.metaKey);
        const shouldSaveLink = currentAddMode === 'link'
          && (id !== 'ql-add-note' || !event.shiftKey);
        if (!shouldSavePrompt && !shouldSaveLink) return;

        event.preventDefault();
        event.stopPropagation();
        void saveAdd();
      });
    });
  }

  function captureAddDraftInputs() {
    if (!addDraft) return;
    const linkTitle = shadow.getElementById('ql-add-title');
    const linkUrl = shadow.getElementById('ql-add-url');
    const linkProject = shadow.getElementById('ql-add-project');
    const linkNote = shadow.getElementById('ql-add-note');
    if (linkTitle) addDraft.title = linkTitle.value;
    if (linkUrl) addDraft.url = linkUrl.value;
    if (linkProject) addDraft.projectName = linkProject.value;
    if (linkNote) addDraft.note = linkNote.value;

    const promptTitle = shadow.getElementById('ql-add-prompt-title');
    const promptCategory = shadow.getElementById('ql-add-prompt-category');
    const promptBody = shadow.getElementById('ql-add-prompt-body');
    if (promptTitle) addDraft.promptTitle = promptTitle.value;
    if (promptCategory) addDraft.promptCategoryName = promptCategory.value;
    if (promptBody) addDraft.promptBody = promptBody.value;

  }

  function switchAddMode(nextMode) {
    if (!addDraft || !['link', 'prompt'].includes(nextMode)) return;
    captureAddDraftInputs();
    addDraft.mode = nextMode;
    render();
    setTimeout(() => {
      const focusId = nextMode === 'prompt' ? 'ql-add-prompt-title' : 'ql-add-title';
      shadow.getElementById(focusId)?.focus();
    }, 0);
  }

  function safePageTitle() {
    return (document.title || safePageUrl() || '').trim();
  }

  function safePageUrl() {
    try { return String(location.href || '').trim(); } catch (_) { return ''; }
  }

  function openNewPromptDraft() {
    promptDraft = { id: null, title: '', body: '', categoryName: promptCategoryFilter !== 'ALL' ? promptCategoryFilter : '未分類' };
    render();
    setTimeout(() => shadow.getElementById('ql-prompt-title')?.focus(), 0);
  }

  function openNewItemFromShortcut() {
    if (addDraft || promptDraft || editingId) return;
    if (mode === 'panel' && activeTab === 'prompts') {
      openNewPromptDraft();
      return;
    }
    openAddModal();
  }

  function openAddModal() {
    if (mode === 'hidden') mode = 'icon';
    const url = safePageUrl();
    const autoMatch = getAutoProjectMatch(url);
    addDraft = {
      mode: 'link',
      title: safePageTitle() || url,
      url,
      projectName: autoMatch?.projectName || '未分類',
      projectManuallyEdited: false,
      autoProjectName: autoMatch?.projectName || '',
      autoRuleKeyword: autoMatch?.keyword || '',
      autoRuleId: autoMatch?.ruleId || '',
      note: '',
      promptTitle: '',
      promptCategoryName: promptCategoryFilter !== 'ALL' ? promptCategoryFilter : '未分類',
      promptBody: ''
    };
    render();
    setTimeout(() => shadow.getElementById('ql-add-title')?.focus(), 0);
  }

  function closeAddModal() {
    addDraft = null;
    render();
  }

  function getAutoProjectMatch(value) {
    return QuickLinksAutoRules.matchInput(value, autoProjectRules);
  }

  function getAutoProjectName(value) {
    return getAutoProjectMatch(value)?.projectName || null;
  }

  function normalizeIncomingUrl(url) {
    return QuickLinksAutoRules.normalizeIncomingUrl(url);
  }

  function canonicalizeComparableUrl(value) {
    return QuickLinksAutoRules.canonicalizeComparableUrl(value);
  }

  function findDuplicateUrlItem(value, excludeId = '') {
    const normalized = canonicalizeComparableUrl(value);
    if (!normalized) return null;
    const matches = (items || []).filter(item => item
      && item.id !== excludeId
      && canonicalizeComparableUrl(item.url) === normalized);
    // 既存データに同一URLのactive/archivedが混在していても、activeを優先して
    // 「復元」扱いで二重登録しない。
    return matches.find(item => !item.archived) || matches[0] || null;
  }

  function getAddDraftDuplicateItem() {
    return addDraft ? findDuplicateUrlItem(addDraft.url || '') : null;
  }

  function getAddDraftDuplicateHintText() {
    const duplicate = getAddDraftDuplicateItem();
    if (!duplicate) return '';
    const title = String(duplicate.title || duplicate.url || '名称なし');
    const project = String(duplicate.projectName || '未分類');
    const inputChannelId = QuickLinksAutoRules.extractLineWorksChannelId(addDraft?.url || '');
    const duplicateChannelId = QuickLinksAutoRules.extractLineWorksChannelId(duplicate.url || '');
    const sameLineWorksChannel = !!inputChannelId && inputChannelId === duplicateChannelId;
    if (sameLineWorksChannel) {
      return duplicate.archived
        ? `このLINE WORKS IDはアーカイブ済みです：${title}（${project}）`
        : `このLINE WORKS IDは登録済みです：${title}（${project}）`;
    }
    return duplicate.archived
      ? `アーカイブ済みのURLです：${title}（${project}）`
      : `登録済みのURLです：${title}（${project}）`;
  }

  function updateAddDraftDuplicateHintDom(options = {}) {
    const hint = shadow?.getElementById('ql-add-duplicate-hint');
    if (!hint) return null;
    const duplicate = getAddDraftDuplicateItem();
    hint.textContent = getAddDraftDuplicateHintText();
    hint.classList.toggle('visible', !!duplicate);
    hint.classList.toggle('archived', !!duplicate?.archived);
    if (options.flash && duplicate) {
      hint.classList.remove('flash');
      void hint.offsetWidth;
      hint.classList.add('flash');
    }
    return duplicate;
  }

  function getAddDraftAutoHintText() {
    if (!addDraft) return '';
    if (addDraft.projectManuallyEdited) {
      return addDraft.autoRuleKeyword
        ? `手動設定を優先中（自動候補：${addDraft.autoProjectName}）`
        : '手動設定を優先中';
    }
    if (addDraft.autoRuleKeyword) {
      return `自動判定：${addDraft.autoRuleKeyword} → ${addDraft.autoProjectName}`;
    }
    return '一致する自動分類ルールなし';
  }

  function updateAddDraftAutoHintDom() {
    const hintText = shadow?.getElementById('ql-auto-project-hint-text');
    if (hintText) hintText.textContent = getAddDraftAutoHintText();
    const hint = shadow?.getElementById('ql-auto-project-hint');
    if (hint) hint.classList.toggle('manual', !!addDraft?.projectManuallyEdited);
  }

  function applyAutoProjectToAddDraft(options = {}) {
    if (!addDraft) return null;
    const { force = false, updateDom = false } = options;
    if (force) addDraft.projectManuallyEdited = false;

    const urlInput = shadow?.getElementById('ql-add-url');
    const rawValue = urlInput ? urlInput.value : addDraft.url;
    const match = getAutoProjectMatch(rawValue);
    addDraft.url = rawValue;
    addDraft.autoProjectName = match?.projectName || '';
    addDraft.autoRuleKeyword = match?.keyword || '';
    addDraft.autoRuleId = match?.ruleId || '';

    if (!addDraft.projectManuallyEdited) {
      addDraft.projectName = match?.projectName || '未分類';
      if (updateDom) {
        const projectInput = shadow?.getElementById('ql-add-project');
        if (projectInput) projectInput.value = categoryInputValue(addDraft.projectName);
      }
    }
    if (updateDom) updateAddDraftAutoHintDom();
    return match;
  }

  async function saveAdd() {
    if (addSaveInFlight || !addDraft) return;
    addSaveInFlight = true;
    const saveButton = shadow?.getElementById('ql-save-add');
    const originalButtonText = saveButton?.textContent || '';
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = (addDraft.mode || 'link') === 'prompt' ? '保存中…' : '追加中…';
    }

    try {
      captureAddDraftInputs();
    if ((addDraft?.mode || 'link') === 'prompt') {
      await savePromptFromAddModal();
      return;
    }

    const titleRaw = shadow.getElementById('ql-add-title')?.value?.trim() || '';
    const urlRaw = shadow.getElementById('ql-add-url')?.value?.trim() || '';
    const note = shadow.getElementById('ql-add-note')?.value || '';
    let projectName = shadow.getElementById('ql-add-project')?.value?.trim() || '未分類';
    if (!addDraft?.projectManuallyEdited) projectName = getAutoProjectName(urlRaw) || projectName || '未分類';
    const built = QuickLinksAutoRules.createQuickLinkItem({ title: titleRaw, url: urlRaw, projectName, note });
    if (!built.ok) {
      showFloatingNotice(built.error, 'warning', 2800);
      window.setTimeout(() => shadow?.getElementById('ql-add-url')?.focus(), 0);
      return;
    }
    const url = built.item.url;
    projectName = built.item.projectName;

    const duplicate = findDuplicateUrlItem(url);
    if (duplicate && !duplicate.archived) {
      addDraft.url = url;
      updateAddDraftDuplicateHintDom({ flash: true });
      showFloatingNotice(`このURLは既に登録されています：${duplicate.title || duplicate.url || '名称なし'}（${duplicate.projectName || '未分類'}）`, 'warning', 4200);
      window.setTimeout(() => shadow.getElementById('ql-add-url')?.focus(), 0);
      return;
    }

    let nextItems = [...items];
    if (duplicate && duplicate.archived) {
      const restored = QuickLinksAutoRules.createQuickLinkItem({
        title: titleRaw || duplicate.title, url, projectName, note, archived: false
      }, duplicate);
      if (!restored.ok) { showFloatingNotice(restored.error, 'warning', 2800); return; }
      nextItems = nextItems.map(item => item.id === duplicate.id ? restored.item : item);
    } else {
      nextItems.unshift(built.item);
    }

    const nextProjects = projects.includes(projectName) ? projects : [...projects, projectName];
    const saved = await storageSet({ items: nextItems, projects: nextProjects });
    if (!saved) return;
    items = nextItems;
    projects = nextProjects;
    // POPでリンク追加を完了して一覧へ戻るときは、追加したリンクをすぐ確認できるよう
    // 共有検索語と検索内分類フィルターをリセットする。applySharedSearchQuery('') が
    // 検索語の永続化と分類フィルターのALL復帰までまとめて行う。
    applySharedSearchQuery('');
    addDraft = null;
    mode = 'panel';
    activeTab = 'links';
    render();
    setTimeout(() => shadow.getElementById('ql-search-input')?.focus(), 0);
    if (duplicate?.archived) {
      showFloatingNotice(`アーカイブ済みのURLを復元しました：${duplicate.title || duplicate.url || '名称なし'}`, 'success', 3200);
    }
    } finally {
      addSaveInFlight = false;
      const currentButton = shadow?.getElementById('ql-save-add');
      if (currentButton) {
        currentButton.disabled = false;
        currentButton.textContent = originalButtonText || ((addDraft?.mode || 'link') === 'prompt' ? '保存' : '追加');
      }
    }
  }

  async function savePromptFromAddModal() {
    captureAddDraftInputs();
    const result = QuickLinksAutoRules.createPromptMemo({
      title: addDraft?.promptTitle,
      categoryName: addDraft?.promptCategoryName || '未分類',
      body: addDraft?.promptBody || ''
    });
    if (!result.ok) {
      showFloatingNotice(result.error, 'warning', 2800);
      shadow.getElementById('ql-add-prompt-title')?.focus();
      return;
    }
    const next = [result.memo, ...(Array.isArray(promptMemos) ? promptMemos : [])];
    const nextPromptCategories = addPromptCategory(result.memo.categoryName);
    const saved = await storageSet({ promptMemos: next, promptCategories: nextPromptCategories });
    if (!saved) return;
    promptMemos = next;
    promptCategories = nextPromptCategories;
    addDraft = null;
    mode = 'panel';
    activeTab = 'prompts';
    render();
    setTimeout(() => shadow.getElementById('ql-prompt-search')?.focus(), 0);
  }

  function compareFloatingItems(a, b) {
    if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
    if (currentSortMode === 'PROJECT') {
      const projectDiff = String(a.projectName || '未分類').localeCompare(String(b.projectName || '未分類'), 'ja');
      if (projectDiff !== 0) return projectDiff;
    } else if (currentSortMode === 'CLICKS') {
      const clickDiff = Number(b.clickCount || 0) - Number(a.clickCount || 0);
      if (clickDiff !== 0) return clickDiff;
    }
    return new Date(b.addedAt || 0) - new Date(a.addedAt || 0);
  }

  function getSearchMatchedItems() {
    let list = (items || []).filter(item => item);
    const q = normalizeString(searchQuery.trim());
    if (!q) return list;
    return list
      .map(item => ({ item, score: getMatchScore(item, q) }))
      .filter(entry => entry.score > 0)
      .map(entry => entry.item);
  }

  function getSearchProjectFilterEntriesFloating(baseItems = getSearchMatchedItems()) {
    if (!String(searchQuery || '').trim()) return [];
    const counts = new Map();
    (baseItems || []).forEach(item => {
      const name = String(item?.projectName || '未分類').trim() || '未分類';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return [
      { value: 'ALL', label: 'すべて', count: (baseItems || []).length },
      ...[...counts.entries()]
        .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'ja'))
        .map(([name, count]) => ({ value: name, label: name, count }))
    ];
  }

  function getSearchProjectFilterOptionsFloating(baseItems = getSearchMatchedItems()) {
    return getSearchProjectFilterEntriesFloating(baseItems).map(entry => entry.value);
  }

  function normalizeSearchProjectFilterFloating(options) {
    const values = Array.isArray(options) ? options : [];
    if (!values.includes(searchProjectFilter)) searchProjectFilter = 'ALL';
    return searchProjectFilter;
  }

  function renderFloatingSearchProjectFilterMenuHtml(baseItems = getSearchMatchedItems()) {
    const entries = getSearchProjectFilterEntriesFloating(baseItems);
    return entries.map(entry => {
      const active = entry.value === searchProjectFilter;
      return `<button type="button" class="ql-search-project-chip${active ? ' active' : ''}" data-search-project-filter-chip="${escapeHtml(entry.value)}" aria-pressed="${active ? 'true' : 'false'}" title="${escapeHtml(entry.label)}：${entry.count}件">
        <span class="ql-search-project-chip-label">${escapeHtml(entry.label)}</span>
        <span class="ql-search-project-chip-count" aria-hidden="true">${entry.count}</span>
      </button>`;
    }).join('');
  }

  function getFilteredItems() {
    let list = getSearchMatchedItems();
    const options = getSearchProjectFilterOptionsFloating(list);
    normalizeSearchProjectFilterFloating(options);
    if (String(searchQuery || '').trim() && searchProjectFilter !== 'ALL') {
      list = list.filter(item => (String(item.projectName || '未分類').trim() || '未分類') === searchProjectFilter);
    }
    return list.sort(compareFloatingItems).slice(0, RESULT_LIMIT);
  }

  function updateFloatingSearchProjectFilterControl() {
    if (!shadow) return;
    const button = shadow.getElementById('ql-search-project-filter');
    const label = shadow.getElementById('ql-search-project-filter-label');
    const count = shadow.getElementById('ql-search-project-filter-count');
    const menu = shadow.getElementById('ql-search-project-filter-menu');
    if (!button || !label || !count || !menu) return;
    const visible = !!String(searchQuery || '').trim();
    button.hidden = !visible;
    if (!visible) {
      searchProjectFilter = 'ALL';
      searchProjectFilterExpanded = false;
      label.textContent = 'すべて';
      count.textContent = '0';
      menu.hidden = true;
      menu.innerHTML = '';
      return;
    }
    const matchedItems = getSearchMatchedItems();
    const options = getSearchProjectFilterOptionsFloating(matchedItems);
    // 検索語を追加・修正しても、選択中の分類が候補に残る限り維持する。
    // 0件になって候補から消えたときだけ「すべて」へ戻す。
    normalizeSearchProjectFilterFloating(options);
    const currentLabel = searchProjectFilter === 'ALL' ? 'すべて' : searchProjectFilter;
    const currentCount = searchProjectFilter === 'ALL'
      ? matchedItems.length
      : matchedItems.filter(item => (String(item?.projectName || '未分類').trim() || '未分類') === searchProjectFilter).length;
    label.textContent = currentLabel;
    count.textContent = String(currentCount);
    button.title = `検索結果の分類：${currentLabel}（${currentCount}件）｜Alt+Fで候補を一覧`;
    button.setAttribute('aria-label', `検索結果の分類 ${currentLabel}、${currentCount}件。Alt+Fで分類候補を一覧表示`);
    button.setAttribute('aria-expanded', searchProjectFilterExpanded ? 'true' : 'false');
    menu.hidden = !searchProjectFilterExpanded;
    menu.innerHTML = searchProjectFilterExpanded ? renderFloatingSearchProjectFilterMenuHtml(matchedItems) : '';
  }

  function focusCurrentFloatingSearchProjectChip() {
    const chips = [...(shadow?.querySelectorAll('[data-search-project-filter-chip]') || [])];
    if (!chips.length) return false;
    const target = chips.find(chip => chip.getAttribute('data-search-project-filter-chip') === searchProjectFilter) || chips[0];
    try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
    return true;
  }

  function openFloatingSearchProjectFilterMenu() {
    if (mode !== 'panel' || activeTab !== 'links' || !String(searchQuery || '').trim()) return false;
    searchProjectFilterExpanded = true;
    updateFloatingSearchProjectFilterControl();
    setTimeout(() => focusCurrentFloatingSearchProjectChip(), 0);
    return true;
  }

  function closeFloatingSearchProjectFilterMenu({ focusCompact = false } = {}) {
    searchProjectFilterExpanded = false;
    updateFloatingSearchProjectFilterControl();
    if (focusCompact) {
      setTimeout(() => {
        const button = shadow?.getElementById('ql-search-project-filter');
        if (!button) return;
        try { button.focus({ preventScroll: true }); } catch (_) { button.focus(); }
      }, 0);
    }
  }

  function selectFloatingSearchProjectFilter(value, { closeMenu = false, focusLink = false } = {}) {
    const options = getSearchProjectFilterOptionsFloating();
    if (!options.includes(value)) return false;
    searchProjectFilter = value;
    if (closeMenu) searchProjectFilterExpanded = false;
    updatePanelResults();
    if (focusLink) setTimeout(() => focusTopFloatingLink(), 0);
    return true;
  }

  function cycleFloatingSearchProjectFilter(direction = 1) {
    if (!String(searchQuery || '').trim()) return false;
    const options = getSearchProjectFilterOptionsFloating();
    if (!options.length) return false;
    normalizeSearchProjectFilterFloating(options);
    const currentIndex = Math.max(0, options.indexOf(searchProjectFilter));
    const nextIndex = (currentIndex + (direction < 0 ? -1 : 1) + options.length) % options.length;
    searchProjectFilter = options[nextIndex];
    searchProjectFilterExpanded = true;
    updatePanelResults();
    setTimeout(() => focusCurrentFloatingSearchProjectChip(), 0);
    return true;
  }

  function focusFloatingSearchProjectFilter() {
    return openFloatingSearchProjectFilterMenu();
  }

  function getMatchScore(item, q) {
    const title = normalizeString(item.title || '');
    const url = normalizeString(item.url || '');
    const project = normalizeString(item.projectName || '');
    const note = normalizeString(item.note || '');

    let score = 0;
    if (title.startsWith(q)) score += 14;
    else if (title.includes(q)) score += 10;
    if (project.includes(q)) score += 7;
    if (note.includes(q)) score += 5;
    if (url.includes(q)) score += 3;
    return score;
  }

  function closeEdit() {
    editingId = null;
    editingDraft = null;
    pendingEditOverwriteId = null;
    render();
    setTimeout(() => shadow.getElementById('ql-search-input')?.focus(), 0);
  }

  async function saveEdit(forceOverwrite = false) {
    if (editSaveInFlight || !editingId) return;
    captureOverlayDrafts();
    const currentItem = items.find(item => item.id === editingId);
    if (!currentItem) {
      showFloatingNotice('このリンクは別の画面で削除されています', 'warning', 3200);
      return;
    }
    const built = QuickLinksAutoRules.createQuickLinkItem(editingDraft || {}, currentItem);
    if (!built.ok) {
      showFloatingNotice(built.error, 'warning', 3000);
      shadow.getElementById('ql-edit-url')?.focus();
      return;
    }

    // 自分自身のURLは findDuplicateUrlItem(..., editingId) で除外する。
    // 別レコードと衝突した場合だけ、明示的な上書き確認を出す。
    const duplicate = findDuplicateUrlItem(built.item.url, editingId);
    if (duplicate && (!forceOverwrite || pendingEditOverwriteId !== duplicate.id)) {
      pendingEditOverwriteId = duplicate.id;
      editingDraft = { ...built.item, id: editingId };
      render();
      setTimeout(() => shadow.getElementById('ql-confirm-edit-overwrite')?.focus(), 0);
      return;
    }

    let nextItems;
    let savedItem = built.item;
    let successMessage = 'リンクを更新しました';

    if (duplicate && forceOverwrite && pendingEditOverwriteId === duplicate.id) {
      // 上書き先のIDや利用履歴は残し、ユーザーが編集中の表示内容だけを上書きする。
      // 編集元は削除して、同じURLが2件残らないよう1件へ統合する。
      const overwritten = QuickLinksAutoRules.createQuickLinkItem({
        title: built.item.title,
        url: built.item.url,
        projectName: built.item.projectName,
        note: built.item.note,
        archived: false
      }, duplicate);
      if (!overwritten.ok) {
        showFloatingNotice(overwritten.error, 'warning', 3000);
        return;
      }
      savedItem = overwritten.item;
      nextItems = items
        .filter(item => item.id !== editingId)
        .map(item => item.id === duplicate.id ? savedItem : item);
      successMessage = `登録済みリンク「${duplicate.title || duplicate.url || '名称なし'}」を上書きして更新しました`;
    } else {
      nextItems = items.map(item => item.id === editingId ? savedItem : item);
    }

    const nextProjects = projects.includes(savedItem.projectName) ? projects : [...projects, savedItem.projectName];
    editSaveInFlight = true;
    try {
      const saved = await storageSet({ items: nextItems, projects: nextProjects });
      if (!saved) return;
      items = nextItems;
      projects = nextProjects;
      closeEdit();
      showFloatingNotice(successMessage, 'success', 3000);
    } finally {
      editSaveInFlight = false;
      pendingEditOverwriteId = null;
    }
  }

  async function deleteEditingItem() {
    if (!editingId) return;
    const target = items.find(item => item && item.id === editingId);
    if (!target) return closeEdit();

    const label = target.title || target.url || 'このリンク';
    if (!confirm(`リンク「${label}」を削除しますか？`)) return;

    const nextItems = items.filter(item => item && item.id !== editingId);
    const saved = await storageSet({ items: nextItems });
    if (!saved) return;
    items = nextItems;
    editingId = null;
    editingDraft = null;
    render();
  }

  function getProjectColor(name) {
    if (!name || name === '未分類') {
      return { bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb' };
    }
    if (projectColors[name]) return projectColors[name];
    if (name === 'クラブ発信') {
      return { bg: '#fef2f2', text: '#991b1b', border: '#E03E3E' };
    }
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return {
      bg: `hsl(${h}, 85%, 94%)`,
      text: `hsl(${h}, 70%, 30%)`,
      border: `hsl(${h}, 60%, 85%)`
    };
  }

  function normalizeString(str) {
    if (!str) return '';
    let s = String(str).toLowerCase();
    s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
    const kanaMap = {
      'ｶﾞ': 'ガ', 'ｷﾞ': 'ギ', 'ｸﾞ': 'グ', 'ｹﾞ': 'ゲ', 'ｺﾞ': 'ゴ',
      'ｻﾞ': 'ザ', 'ｼﾞ': 'ジ', 'ｽﾞ': 'ズ', 'ｾﾞ': 'ゼ', 'ｿﾞ': 'ゾ',
      'ﾀﾞ': 'ダ', 'ﾁﾞ': 'ヂ', 'ﾂﾞ': 'ヅ', 'ﾃﾞ': 'デ', 'ﾄﾞ': 'ド',
      'ﾊﾞ': 'バ', 'ﾋﾞ': 'ビ', 'ﾌﾞ': 'ブ', 'ﾍﾞ': 'ベ', 'ﾎﾞ': 'ボ',
      'ﾊﾟ': 'パ', 'ﾋﾟ': 'ピ', 'ﾌﾟ': 'プ', 'ﾍﾟ': 'ペ', 'ﾎﾟ': 'ポ',
      'ｳﾞ': 'ヴ', 'ﾜﾞ': 'ヷ', 'ｦﾞ': 'ヺ',
      'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
      'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
      'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
      'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
      'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
      'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
      'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
      'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
      'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
      'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
      'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
      'ｯ': 'ッ', 'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ',
      '｡': '。', '､': '、', 'ｰ': 'ー', '｢': '「', '｣': '」', '･': '・'
    };
    const reg = new RegExp('(' + Object.keys(kanaMap).join('|') + ')', 'g');
    s = s.replace(reg, match => kanaMap[match]);
    s = s.replace(/ﾞ/g, '゛').replace(/ﾟ/g, '゜');
    s = s.replace(/[ァ-ヶ]/g, match => String.fromCharCode(match.charCodeAt(0) - 0x60));
    return s;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  }

  async function openItem(url, itemId, options = {}) {
    if (!url) return false;

    // 先にリンクを開く。保存処理が失敗・遅延しても、ユーザー操作を止めない。
    const opened = await openUrlInTab(url, options);
    if (!opened) return false;

    let shouldRefreshList = false;
    if (itemId) {
      const index = items.findIndex(item => item && item.id === itemId);
      if (index >= 0) {
        const wasArchived = !!items[index].archived;
        try {
          const response = await sendRuntimeMessage({ type: 'quickLinksRecordItemClick', id: itemId });
          if (response?.ok && Array.isArray(response.items)) {
            items = response.items;
            storageSyncState.items = cloneStateValue(response.items);
          } else {
            throw new Error(response?.error || 'クリック履歴を保存できませんでした。');
          }
        } catch (error) {
          // The link is already open; do not turn a history-write failure into an open failure.
          console.warn('[Quick Links] クリック履歴を保存できませんでした。', error);
        }
        shouldRefreshList = wasArchived;
      }
    }

    if (shouldRefreshList && mode === 'panel' && activeTab === 'links') updatePanelResults();
    return true;
  }

  async function openUrlInTab(url, options = {}) {
    if (!url) return false;
    if (extensionContextUnavailable || !getChromeRuntime()) {
      markExtensionContextUnavailable();
      return openUrlDirectly(url);
    }
    try {
      const response = await sendRuntimeMessage({
        type: 'quickLinksOpenTab',
        url,
        active: options.active !== false,
        indexOffset: typeof options.indexOffset === 'number' ? options.indexOffset : 1
      });
      if (!response?.ok) throw new Error(response?.error || 'タブを開けませんでした。');
      return true;
    } catch (error) {
      // 拡張機能更新直後の古いコンテンツスクリプトでも、通常リンクと動的Backlogリンクは直接開く。
      const openedDirectly = openUrlDirectly(url);
      if (openedDirectly) {
        if (isExtensionContextError(error)) markExtensionContextUnavailable(error);
        else console.info('[Quick Links] バックグラウンド経由で開けなかったため、ページから直接開きました。', error);
        return true;
      }
      if (isExtensionContextError(error)) {
        markExtensionContextUnavailable(error);
      } else {
        showFloatingNotice('リンクを開けませんでした', 'error', 3500);
        console.warn('[Quick Links] タブ作成に失敗しました。', error);
      }
      return false;
    }
  }

  async function openSidePanel() {
    try {
      const response = await sendRuntimeMessage({ type: 'quickLinksOpenSidePanel' });
      if (!response?.ok) throw new Error(response?.error || 'サイドパネルを開けませんでした。');
    } catch (error) {
      if (isExtensionContextError(error)) markExtensionContextUnavailable(error);
      else showFloatingNotice('サイドパネルを開けませんでした', 'error', 3500);
    }
  }

  function formatDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function applyRedsQuickDate(rangeType) {
    const now = new Date();
    const start = new Date(now);
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    if (rangeType === 'today') {
      redsDateStart = formatDateInputValue(now);
      redsDateEnd = formatDateInputValue(now);
    } else if (rangeType === 'yesterday') {
      start.setDate(now.getDate() - 1);
      redsDateStart = formatDateInputValue(start);
      redsDateEnd = formatDateInputValue(start);
    } else if (rangeType === 'week') {
      start.setDate(now.getDate() - 7);
      redsDateStart = formatDateInputValue(start);
      redsDateEnd = formatDateInputValue(now);
    } else if (rangeType === 'month') {
      start.setDate(now.getDate() - 30);
      redsDateStart = formatDateInputValue(start);
      redsDateEnd = formatDateInputValue(now);
    } else if (rangeType === 'year') {
      redsDateStart = formatDateInputValue(oneYearAgo);
      redsDateEnd = formatDateInputValue(now);
    } else if (rangeType === 'older') {
      redsDateStart = '';
      redsDateEnd = formatDateInputValue(oneYearAgo);
    }
    render();
  }

  function addDaysToDateInput(value, days = 1) {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    date.setDate(date.getDate() + days);
    return formatDateInputValue(date);
  }

  function buildRedsGoogleUrl() {
    const query = String(redsQuery || '').trim();
    if (!query) return '';
    let fullQuery = `${query} site:urawa-reds.co.jp`;
    if (redsDateStart) fullQuery += ` after:${redsDateStart}`;
    if (redsDateEnd) fullQuery += ` before:${addDaysToDateInput(redsDateEnd, 1)}`;
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  }

  function buildRedsXUrl() {
    const query = String(redsQuery || '').trim();
    if (!query) return '';
    let xQuery = `${query} from:REDSOFFICIAL`;
    if (redsDateStart) xQuery += ` since:${redsDateStart}`;
    if (redsDateEnd) xQuery += ` until:${addDaysToDateInput(redsDateEnd, 1)}`;
    return `https://x.com/search?q=${encodeURIComponent(xQuery)}&f=live`;
  }

  function runRedsGoogleSearch() {
    const url = buildRedsGoogleUrl();
    if (!url) {
      shadow.getElementById('ql-reds-query')?.focus();
      return;
    }
    openUrlInTab(url);
  }

  function runRedsXSearch() {
    const url = buildRedsXUrl();
    if (!url) {
      shadow.getElementById('ql-reds-query')?.focus();
      return;
    }
    openUrlInTab(url, { active: true });
  }
  // Chromeの拡張機能ショートカットから届く命令を受け取る。
  // これにより、ページ内でPOPを操作していない状態や、POPが完全非表示でも再表示できる。
  const runtimeForMessages = getChromeRuntime();
  if (runtimeForMessages?.onMessage) {
    runtimeForMessages.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== 'quickLinksFloatingShortcut') return;
      if (typeof message.windowId === 'number' && typeof currentWindowId === 'number' && message.windowId !== currentWindowId) return;
      const handled = executeFloatingShortcutCommand(String(message.action || ''), { explicitUserAction: true });
      sendResponse({ ok: handled, mode, activeTab });
    });
  }

  // ページ右下ポップの初期化。
  // 定数・関数の定義完了後に開始する。Prompt描画の定数が未初期化の状態で
  // render() が走って右下ポップ全体が止まることを防ぐ。
  init().catch(error => {
    console.warn('[Quick Links] 右下ポップの初期化に失敗しました。', error);
  });
})();
