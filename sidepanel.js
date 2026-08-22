// sidepanel.js
// --- グローバル変数 ---
let items = [];
let projects = ['未分類']; 
let projectColors = {}; 
let autoProjectRules = [];
let manualProjectTouched = false;
let manualAutoMatch = null;
let autoRuleSaveTimer = null;
let draggedAutoRuleId = null;
let currentFilter = 'ALL';
let showArchived = false;
let floatingSearchEnabled = true;
let draggedItemId = null;
let editingItemId = null;
let editSaveInFlight = false;
let editingProjectName = null;
let selectedColor = null;

// ソートモード: 'DATE' (日付), 'PROJECT' (分類), 'CLICKS' (回数)
let currentSortMode = 'DATE'; 
let searchQuery = '';
// 検索中だけ使う二次分類フィルター。通常の分類タブ(currentFilter)とは独立。
let searchProjectFilter = 'ALL';
// Alt+F中だけ、検索結果に含まれる分類を1〜2段で一覧表示する。
let searchProjectFilterExpanded = false;
let sharedSearchQuery = '';
let sharedSearchPersistTimer = null;
let sharedSearchComposing = false;
let redsQuery = '';
let redsDateStart = '';
let redsDateEnd = '';
let sidePanelMode = 'links';
let sidePanelHeartbeatTimer = null;
let sidePanelWindowId = null;
let projectPickerQuery = '';
let filterExpanded = false;

let promptMemos = [];
let promptCategories = ['未分類'];
let promptSearchQuery = '';
let promptCategoryFilter = 'ALL';
let promptSortMode = 'POPULAR';
let editingPromptMemoId = null;
let promptSaveInFlight = false;
let promptCopyFeedbackId = null;
let promptCopyFeedbackTimer = null;
let promptCategoryManageSelected = '';

const SHARED_SEARCH_STATE_KEY = 'sharedSearchState';
const SHARED_SEARCH_WRITER_ID = `sidepanel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const CLEAR_SEARCH_SHORTCUT_DEDUP_MS = 500;
let sharedSearchRevision = 0;
let sharedSearchUpdatedAt = 0;
let sharedSearchLocalEditAt = 0;
let storageSyncState = {};
let storageCommitInFlight = false;
let lastClearSearchShortcutAt = 0;

function cloneStateValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stateValuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getRuntimeApi() {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || typeof chrome.runtime.sendMessage !== 'function') return null;
    return chrome.runtime;
  } catch (_) {
    return null;
  }
}

async function sendRuntimeMessage(message) {
  const runtime = getRuntimeApi();
  if (!runtime) throw new Error('拡張機能の接続が失われました。サイドパネルを開き直してください。');
  return runtime.sendMessage(message);
}

function getLocalStateValue(key) {
  const values = {
    items,
    projects,
    projectColors,
    currentSortMode,
    showArchived,
    floatingSearchEnabled,
    autoProjectRules,
    promptMemos,
    promptCategories,
    promptSortMode
  };
  return values[key];
}

function applyCommittedState(updates = {}) {
  Object.entries(updates).forEach(([key, value]) => {
    storageSyncState[key] = cloneStateValue(value);
    if (key === 'items') items = Array.isArray(value) ? value : [];
    if (key === 'projects') projects = Array.isArray(value) ? value : ['未分類'];
    if (key === 'projectColors') projectColors = value && typeof value === 'object' ? value : {};
    if (key === 'currentSortMode') currentSortMode = value || 'DATE';
    if (key === 'showArchived') showArchived = !!value;
    if (key === 'floatingSearchEnabled') floatingSearchEnabled = value !== false;
    if (key === 'autoProjectRules') autoProjectRules = QuickLinksAutoRules.normalizeRules(value);
    if (key === 'promptMemos') promptMemos = Array.isArray(value) ? value : [];
    if (key === 'promptCategories') promptCategories = normalizePromptCategoriesSidepanel(value);
    if (key === 'promptSortMode') promptSortMode = normalizePromptSortModeSidepanel(value);
  });
}

async function commitLocalState(keys, options = {}) {
  const uniqueKeys = [...new Set((keys || []).filter(Boolean))];
  const current = {};
  const base = {};
  uniqueKeys.forEach(key => {
    const next = getLocalStateValue(key);
    if (!options.force && stateValuesEqual(storageSyncState[key], next)) return;
    current[key] = cloneStateValue(next);
    base[key] = cloneStateValue(storageSyncState[key]);
  });
  if (!Object.keys(current).length) return true;

  storageCommitInFlight = true;
  try {
    const response = await sendRuntimeMessage({
      type: 'quickLinksCommitState',
      payload: { base, current, replaceKeys: options.replaceKeys || [] }
    });
    if (!response?.ok) throw new Error(response?.error || '保存に失敗しました。');
    applyCommittedState(response.updates || current);
    return true;
  } catch (error) {
    console.error('Failed to commit Quick Links state', error);
    const rollback = {};
    Object.keys(current).forEach(key => { rollback[key] = cloneStateValue(base[key]); });
    applyCommittedState(rollback);
    alert(`保存に失敗したため、画面を保存前の状態へ戻しました。\n${error.message || error}`);
    return false;
  } finally {
    storageCommitInFlight = false;
  }
}


// --- 定数 ---
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HEAT_CLICKS = 15;
const SIDE_PANEL_HEARTBEAT_INTERVAL_MS = 1000;
const SIDE_PANEL_HEARTBEAT_STORAGE_KEY = 'sidePanelHeartbeatsByWindow';
const TOP_PROJECT_FILTER_LIMIT = 6;

// カラープリセット
const PRESET_COLORS = [
  { id: 'red', bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  { id: 'orange', bg: '#ffedd5', text: '#9a3412', border: '#fed7aa' },
  { id: 'amber', bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  { id: 'green', bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
  { id: 'teal', bg: '#ccfbf1', text: '#115e59', border: '#99f6e4' },
  { id: 'blue', bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  { id: 'indigo', bg: '#e0e7ff', text: '#3730a3', border: '#c7d2fe' },
  { id: 'purple', bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff' },
  { id: 'pink', bg: '#fce7f3', text: '#9d174d', border: '#fbcfe8' },
  { id: 'gray', bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' },
];

// --- ユーティリティ: URLからの自動プロジェクト判定 ---
function normalizeIncomingUrl(url) {
  return QuickLinksAutoRules.normalizeIncomingUrl(url);
}

function canonicalizeComparableUrl(value) {
  return QuickLinksAutoRules.canonicalizeComparableUrl(value);
}

function getAutoProjectMatch(value) {
  return QuickLinksAutoRules.matchInput(value, autoProjectRules);
}

function getAutoProjectName(value) {
  return getAutoProjectMatch(value)?.projectName || null;
}

function findDuplicateUrlItem(value, excludeId = '') {
  const normalized = canonicalizeComparableUrl(value);
  if (!normalized) return null;
  const matches = (items || []).filter(item => item
    && item.id !== excludeId
    && canonicalizeComparableUrl(item.url) === normalized);
  return matches.find(item => !item.archived) || matches[0] || null;
}

function updateManualDuplicateUrlHint() {
  const hint = document.getElementById('manual-duplicate-url-hint');
  if (!hint) return null;
  const duplicate = findDuplicateUrlItem(document.getElementById('input-url')?.value || '');
  hint.classList.toggle('visible', !!duplicate);
  hint.classList.toggle('archived', !!duplicate?.archived);
  if (!duplicate) {
    hint.textContent = '';
    return null;
  }
  const title = String(duplicate.title || duplicate.url || '名称なし');
  const project = String(duplicate.projectName || '未分類');
  hint.textContent = duplicate.archived
    ? `アーカイブ済みのURLです：${title}（${project}）`
    : `登録済みのURLです：${title}（${project}）`;
  return duplicate;
}

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

function getJstCalendarPartsSidepanel(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function shiftJstCalendarDateSidepanel(days, now = new Date()) {
  const { year, month, day } = getJstCalendarPartsSidepanel(now);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + Number(days || 0));
  return shifted.toISOString().slice(0, 10);
}

function resolveQuickLinkLocallySidepanel(value, now = new Date()) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!isDynamicQuickLinkUrl(raw)) return raw;
  const dayCount = getBacklogDynamicRangeDays(raw);
  if (!dayCount) return '';
  const endParts = getJstCalendarPartsSidepanel(now);
  const endDate = `${endParts.year}-${String(endParts.month).padStart(2, '0')}-${String(endParts.day).padStart(2, '0')}`;
  const startDate = shiftJstCalendarDateSidepanel(-(dayCount - 1), now);
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

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderFilters();
  updateSortButton();
  
  const cb = document.getElementById('check-show-archived');
  if (cb) cb.checked = showArchived;
  const floatingCb = document.getElementById('check-floating-search-enabled');
  if (floatingCb) floatingCb.checked = floatingSearchEnabled;

  await startSidePanelHeartbeat();
  window.addEventListener('beforeunload', () => stopSidePanelHeartbeat(true));
  window.addEventListener('unload', () => stopSidePanelHeartbeat(true));
  window.addEventListener('pagehide', () => stopSidePanelHeartbeat(true));

  renderList();
  setupEventListeners();
  checkCleanupCandidates();
  setupPromptMemoFeature();
  setupRedsSearchFeature();
  syncSharedSearchInputs();
  updateAutoRuleSummary();
  updateManualAutoProjectHint();

  bindUnifiedStorageListener();
});

// --- データ読み込み ---
async function loadData() {
  let result = await chrome.storage.local.get(['items', 'projects', 'projectColors', 'currentSortMode', 'showArchived', 'floatingSearchEnabled', 'sharedSearchQuery', SHARED_SEARCH_STATE_KEY, 'autoProjectRules', 'promptMemos', 'promptCategories', 'promptSortMode']);
  if (!Array.isArray(result.autoProjectRules)) {
    try {
      const response = await sendRuntimeMessage({ type: 'quickLinksEnsureAutoProjectRules' });
      if (response?.ok && Array.isArray(response.rules)) result.autoProjectRules = response.rules;
    } catch (_) {}
  }
  if (!Array.isArray(result.autoProjectRules)) {
    result.autoProjectRules = await QuickLinksAutoRules.loadDefaultRules();
    await chrome.storage.local.set({ autoProjectRules: result.autoProjectRules });
  }
  if (result.items) items = result.items.map((item, index) => QuickLinksAutoRules.normalizeQuickLinkItem(item, index)).filter(Boolean);
  if (result.projects && result.projects.length > 0) projects = result.projects;
  if (result.projectColors) projectColors = result.projectColors;
  autoProjectRules = QuickLinksAutoRules.normalizeRules(result.autoProjectRules);
  if (result.currentSortMode) currentSortMode = result.currentSortMode;
  if (result.showArchived !== undefined) showArchived = result.showArchived;
  if (result.floatingSearchEnabled !== undefined) floatingSearchEnabled = result.floatingSearchEnabled;
  promptMemos = Array.isArray(result.promptMemos) ? result.promptMemos.map(memo => QuickLinksAutoRules.createPromptMemo(memo, memo)).filter(result => result.ok).map(result => result.memo) : [];
  promptCategories = normalizePromptCategoriesSidepanel(result.promptCategories);
  promptSortMode = normalizePromptSortModeSidepanel(result.promptSortMode);
  const searchState = result[SHARED_SEARCH_STATE_KEY];
  if (searchState && typeof searchState === 'object') {
    sharedSearchRevision = Number(searchState.revision || 0);
    sharedSearchUpdatedAt = Number(searchState.updatedAt || 0);
    setSharedSearchQuery(searchState.query || '', { persist: false, render: false });
  } else {
    setSharedSearchQuery(result.sharedSearchQuery || '', { persist: false, render: false });
  }

  ['items', 'projects', 'projectColors', 'currentSortMode', 'showArchived', 'floatingSearchEnabled', 'autoProjectRules', 'promptMemos', 'promptCategories', 'promptSortMode']
    .forEach(key => { storageSyncState[key] = cloneStateValue(getLocalStateValue(key)); });

  if (normalizeExpiredFavorites()) await commitLocalState(['items']);
}

function normalizeExpiredFavorites() {
  const now = Date.now();
  let changed = false;
  items = items.map(item => {
    const next = { ...item };
    if (!next.favoriteType) {
      next.favoriteType = next.isFavorite ? 'normal' : 'none';
      changed = true;
    }
    if (next.favoriteType === 'temp' && next.favoriteExpiry && now > new Date(next.favoriteExpiry).getTime()) {
      next.favoriteType = 'none';
      next.isFavorite = false;
      next.favoriteExpiry = null;
      changed = true;
    }
    return next;
  });
  return changed;
}

// --- データ保存 ---
async function saveData(keys = ['items']) {
  return commitLocalState(keys);
}

async function savePromptData(keys = ['promptMemos']) {
  return commitLocalState(keys);
}

function shouldApplyIncomingSearchState(state) {
  if (!state || typeof state !== 'object') return false;
  const updatedAt = Number(state.updatedAt || 0);
  if (updatedAt <= sharedSearchUpdatedAt) return false;
  const active = document.activeElement;
  const isSearchInputActive = ['input-search', 'prompt-search', 'reds-search'].includes(active?.id);
  if (isSearchInputActive && updatedAt < sharedSearchLocalEditAt) return false;
  return true;
}

function bindUnifiedStorageListener() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let renderLinks = false;
    let renderFiltersNeeded = false;
    let renderPromptsNeeded = false;

    const syncChangedKey = (key) => {
      if (!changes[key]) return false;
      storageSyncState[key] = cloneStateValue(changes[key].newValue);
      return true;
    };

    if (syncChangedKey('items')) {
      items = Array.isArray(changes.items.newValue) ? changes.items.newValue : [];
      checkCleanupCandidates();
      renderLinks = true;
      renderFiltersNeeded = true;
    }
    if (syncChangedKey('projects')) {
      projects = Array.isArray(changes.projects.newValue) ? changes.projects.newValue : ['未分類'];
      renderFiltersNeeded = true;
    }
    if (syncChangedKey('projectColors')) {
      projectColors = changes.projectColors.newValue || {};
      renderLinks = true;
      renderFiltersNeeded = true;
    }
    if (syncChangedKey('autoProjectRules')) {
      autoProjectRules = QuickLinksAutoRules.normalizeRules(changes.autoProjectRules.newValue);
      updateAutoRuleSummary();
      const modal = document.getElementById('auto-rule-modal');
      const editingRule = document.activeElement?.closest?.('.auto-rule-item');
      if (modal?.classList.contains('open') && !editingRule) renderAutoRuleManager();
      if (!manualProjectTouched) applyManualAutoProject();
    }
    if (syncChangedKey('showArchived')) {
      showArchived = !!changes.showArchived.newValue;
      const cb = document.getElementById('check-show-archived');
      if (cb) cb.checked = showArchived;
      renderLinks = true;
      renderFiltersNeeded = true;
    }
    if (syncChangedKey('floatingSearchEnabled')) {
      floatingSearchEnabled = changes.floatingSearchEnabled.newValue !== false;
      const floatingCb = document.getElementById('check-floating-search-enabled');
      if (floatingCb) floatingCb.checked = floatingSearchEnabled;
    }
    if (syncChangedKey('currentSortMode')) {
      currentSortMode = changes.currentSortMode.newValue || 'DATE';
      updateSortButton();
      renderLinks = true;
    }
    if (syncChangedKey('promptMemos')) {
      promptMemos = Array.isArray(changes.promptMemos.newValue) ? changes.promptMemos.newValue : [];
      renderPromptsNeeded = true;
    }
    if (syncChangedKey('promptCategories')) {
      promptCategories = normalizePromptCategoriesSidepanel(changes.promptCategories.newValue);
      renderPromptsNeeded = true;
    }
    if (syncChangedKey('promptSortMode')) {
      promptSortMode = normalizePromptSortModeSidepanel(changes.promptSortMode.newValue);
      const sortSelect = document.getElementById('prompt-sort-mode');
      if (sortSelect) sortSelect.value = promptSortMode;
      renderPromptsNeeded = true;
    }

    const incomingSearchState = changes[SHARED_SEARCH_STATE_KEY]?.newValue;
    if (shouldApplyIncomingSearchState(incomingSearchState)) {
      sharedSearchRevision = Number(incomingSearchState.revision || 0);
      sharedSearchUpdatedAt = Number(incomingSearchState.updatedAt || 0);
      setSharedSearchQuery(incomingSearchState.query || '', { persist: false, render: false });
      renderLinks = true;
      renderFiltersNeeded = true;
      renderPromptsNeeded = true;
    } else if (!changes[SHARED_SEARCH_STATE_KEY] && changes.sharedSearchQuery) {
      const active = document.activeElement;
      const isSearchInputActive = ['input-search', 'prompt-search', 'reds-search'].includes(active?.id);
      const next = String(changes.sharedSearchQuery.newValue || '');
      if (!isSearchInputActive && next !== sharedSearchQuery) {
        setSharedSearchQuery(next, { persist: false, render: false });
        renderLinks = true;
        renderFiltersNeeded = true;
        renderPromptsNeeded = true;
      }
    }

    if (renderFiltersNeeded) renderFilters();
    if (renderLinks) renderList();
    if (renderPromptsNeeded) renderPromptMemos();
    if (renderLinks || renderFiltersNeeded) updateManualDuplicateUrlHint();
  });
}

// --- URL自動分類ルール管理 ---
function updateAutoRuleSummary() {
  const summary = document.getElementById('auto-rule-summary');
  if (!summary) return;
  const valid = autoProjectRules.filter(rule => QuickLinksAutoRules.isRuleValid(rule));
  const enabled = valid.filter(rule => rule.enabled).length;
  summary.textContent = `${enabled}件有効 / 上から順に判定`;
}

function updateManualAutoProjectHint() {
  const hint = document.getElementById('manual-auto-project-hint');
  const text = document.getElementById('manual-auto-project-hint-text');
  const url = document.getElementById('input-url')?.value.trim() || '';
  if (!hint || !text) return;

  hint.classList.toggle('manual', manualProjectTouched);
  if (!url) {
    text.textContent = 'URLを入力すると自動判定します';
  } else if (manualProjectTouched) {
    text.textContent = manualAutoMatch
      ? `手動設定を優先中（自動候補：${manualAutoMatch.projectName}）`
      : '手動設定を優先中';
  } else if (manualAutoMatch) {
    text.textContent = `自動判定：${manualAutoMatch.keyword} → ${manualAutoMatch.projectName}`;
  } else {
    text.textContent = '一致する自動分類ルールはありません';
  }
}

function applyManualAutoProject(options = {}) {
  const { force = false } = options;
  if (force) manualProjectTouched = false;
  const urlInput = document.getElementById('input-url');
  const projectInput = document.getElementById('input-project');
  if (!urlInput || !projectInput) return null;

  manualAutoMatch = getAutoProjectMatch(urlInput.value);
  if (!manualProjectTouched) {
    projectInput.value = manualAutoMatch?.projectName || '';
  }
  updateManualAutoProjectHint();
  return manualAutoMatch;
}

function resetManualAutoProjectState() {
  manualProjectTouched = false;
  manualAutoMatch = null;
  updateManualAutoProjectHint();
}

function persistAutoProjectRules(options = {}) {
  const { immediate = false } = options;
  autoProjectRules = QuickLinksAutoRules.normalizeRules(autoProjectRules);
  updateAutoRuleSummary();
  if (autoRuleSaveTimer) window.clearTimeout(autoRuleSaveTimer);

  const save = async () => {
    autoRuleSaveTimer = null;
    await commitLocalState(['autoProjectRules']);
  };
  if (immediate) return save();
  autoRuleSaveTimer = window.setTimeout(save, 180);
  return Promise.resolve();
}

async function flushAutoProjectRuleSave() {
  if (autoRuleSaveTimer) {
    window.clearTimeout(autoRuleSaveTimer);
    autoRuleSaveTimer = null;
  }
  autoProjectRules = QuickLinksAutoRules.normalizeRules(autoProjectRules);
  await commitLocalState(['autoProjectRules']);
}

function ensureRuleProjectExists(projectName) {
  const name = String(projectName || '').trim();
  if (!name || projects.includes(name)) return false;
  projects.push(name);
  commitLocalState(['projects']).catch(error => console.warn('Failed to save project from auto rule', error));
  renderFilters();
  return true;
}

function openAutoRuleManager() {
  renderAutoRuleManager();
  document.getElementById('auto-rule-modal')?.classList.add('open');
  window.setTimeout(() => document.getElementById('auto-rule-add-keyword')?.focus(), 0);
}

function captureAutoRuleManagerInputs() {
  document.querySelectorAll('.auto-rule-item').forEach(row => {
    const ruleId = row.getAttribute('data-auto-rule-id') || '';
    const rule = findAutoRule(ruleId);
    if (!rule) return;
    row.querySelectorAll('[data-rule-field]').forEach(input => {
      const field = input.getAttribute('data-rule-field');
      if (!field) return;
      const value = input.type === 'checkbox' ? input.checked : input.value;
      if (field === 'enabled' || field === 'caseSensitive') rule[field] = !!value;
      else if (field === 'matchType') rule[field] = ['contains', 'startsWith', 'exact'].includes(value) ? value : 'contains';
      else rule[field] = String(value || '');
    });
  });
}

async function closeAutoRuleManager() {
  captureAutoRuleManagerInputs();
  autoProjectRules.forEach(rule => ensureRuleProjectExists(rule.projectName));
  await flushAutoProjectRuleSave();
  document.getElementById('auto-rule-modal')?.classList.remove('open');
}

function renderAutoRuleProjectList() {
  const datalist = document.getElementById('auto-rule-project-list');
  if (!datalist) return;
  const ruleProjects = autoProjectRules.map(rule => rule.projectName);
  const names = [...new Set(['未分類', ...projects, ...ruleProjects]
    .map(name => String(name || '').trim())
    .filter(Boolean))];
  datalist.innerHTML = names.map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
}

function getMatchTypeLabel(type) {
  if (type === 'startsWith') return '前方一致';
  if (type === 'exact') return '完全一致';
  return '含む';
}

function renderAutoRuleManager() {
  renderAutoRuleProjectList();
  const list = document.getElementById('auto-rule-list');
  const count = document.getElementById('auto-rule-count');
  if (!list) return;
  if (count) count.textContent = `（${autoProjectRules.length}件）`;

  if (!autoProjectRules.length) {
    list.innerHTML = '<div class="auto-rule-empty">ルールはまだありません。上のフォームから追加できます。</div>';
    return;
  }

  list.innerHTML = autoProjectRules.map((rule, index) => {
    const valid = QuickLinksAutoRules.isRuleValid(rule);
    return `
      <div class="auto-rule-item ${valid ? '' : 'invalid'}" data-auto-rule-id="${escapeHtml(rule.id)}">
        <div class="auto-rule-drag" draggable="true" title="ドラッグして優先順位を変更">≡</div>
        <div class="auto-rule-item-main">
          <div class="auto-rule-item-top">
            <span class="auto-rule-order">${index + 1}</span>
            <label class="auto-rule-enabled"><input type="checkbox" data-rule-field="enabled" ${rule.enabled ? 'checked' : ''}>有効</label>
            <input class="auto-rule-keyword" type="text" data-rule-field="keyword" value="${escapeHtml(rule.keyword)}" placeholder="判定文字列">
          </div>
          <div class="auto-rule-item-options">
            <input type="text" data-rule-field="projectName" value="${escapeHtml(rule.projectName)}" list="auto-rule-project-list" placeholder="振り分け先">
            <select data-rule-field="matchType">
              <option value="contains" ${rule.matchType === 'contains' ? 'selected' : ''}>含む</option>
              <option value="startsWith" ${rule.matchType === 'startsWith' ? 'selected' : ''}>前方一致</option>
              <option value="exact" ${rule.matchType === 'exact' ? 'selected' : ''}>完全一致</option>
            </select>
          </div>
          <div class="auto-rule-item-bottom">
            <label class="auto-rule-check"><input type="checkbox" data-rule-field="caseSensitive" ${rule.caseSensitive ? 'checked' : ''}>大文字・小文字を区別</label>
            <div class="auto-rule-mini-actions">
              <button class="auto-rule-mini-btn" type="button" data-auto-rule-duplicate>複製</button>
              <button class="auto-rule-mini-btn danger" type="button" data-auto-rule-delete>削除</button>
            </div>
          </div>
          ${valid ? '' : '<div class="auto-rule-invalid-note">判定文字列と振り分け先を入力してください</div>'}
        </div>
      </div>`;
  }).join('');

  bindAutoRuleRows();
}

function findAutoRule(ruleId) {
  return autoProjectRules.find(rule => rule.id === ruleId) || null;
}

function updateAutoRule(ruleId, field, value) {
  const rule = findAutoRule(ruleId);
  if (!rule) return;
  if (field === 'enabled' || field === 'caseSensitive') rule[field] = !!value;
  else if (field === 'matchType') rule.matchType = ['contains', 'startsWith', 'exact'].includes(value) ? value : 'contains';
  else rule[field] = String(value || '');
  rule.updatedAt = new Date().toISOString();
  if (field === 'projectName') ensureRuleProjectExists(rule.projectName);
  persistAutoProjectRules();
}

function bindAutoRuleRows() {
  document.querySelectorAll('.auto-rule-item').forEach(row => {
    const ruleId = row.getAttribute('data-auto-rule-id') || '';
    row.querySelectorAll('[data-rule-field]').forEach(input => {
      const field = input.getAttribute('data-rule-field');
      const eventName = input.type === 'checkbox' || input.tagName === 'SELECT' || field === 'projectName' ? 'change' : 'input';
      input.addEventListener(eventName, () => {
        const value = input.type === 'checkbox' ? input.checked : input.value;
        updateAutoRule(ruleId, field, value);
        const rule = findAutoRule(ruleId);
        row.classList.toggle('invalid', !QuickLinksAutoRules.isRuleValid(rule));
        const note = row.querySelector('.auto-rule-invalid-note');
        if (QuickLinksAutoRules.isRuleValid(rule)) note?.remove();
        else if (!note) row.querySelector('.auto-rule-item-main')?.insertAdjacentHTML('beforeend', '<div class="auto-rule-invalid-note">判定文字列と振り分け先を入力してください</div>');
      });
    });

    row.querySelector('[data-auto-rule-delete]')?.addEventListener('click', async () => {
      const rule = findAutoRule(ruleId);
      if (!rule) return;
      if (!confirm(`「${rule.keyword || '未入力のルール'}」を削除しますか？`)) return;
      autoProjectRules = autoProjectRules.filter(item => item.id !== ruleId);
      await persistAutoProjectRules({ immediate: true });
      renderAutoRuleManager();
      runAutoRuleTest();
    });

    row.querySelector('[data-auto-rule-duplicate]')?.addEventListener('click', async () => {
      const index = autoProjectRules.findIndex(item => item.id === ruleId);
      if (index < 0) return;
      const source = autoProjectRules[index];
      const copy = {
        ...source,
        id: QuickLinksAutoRules.createId('rule-copy'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      autoProjectRules.splice(index + 1, 0, copy);
      await persistAutoProjectRules({ immediate: true });
      renderAutoRuleManager();
      window.setTimeout(() => {
        const input = document.querySelector(`[data-auto-rule-id="${CSS.escape(copy.id)}"] [data-rule-field="keyword"]`);
        input?.focus();
        input?.select();
      }, 0);
    });

    const handle = row.querySelector('.auto-rule-drag');
    handle?.addEventListener('dragstart', (event) => {
      draggedAutoRuleId = ruleId;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', ruleId);
      row.style.opacity = '0.55';
    });
    handle?.addEventListener('dragend', () => {
      draggedAutoRuleId = null;
      row.style.opacity = '';
      document.querySelectorAll('.auto-rule-item').forEach(item => item.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', event => {
      if (!draggedAutoRuleId || draggedAutoRuleId === ruleId) return;
      event.preventDefault();
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', async event => {
      event.preventDefault();
      row.classList.remove('drag-over');
      const sourceId = draggedAutoRuleId || event.dataTransfer.getData('text/plain');
      if (!sourceId || sourceId === ruleId) return;
      const sourceIndex = autoProjectRules.findIndex(item => item.id === sourceId);
      const targetIndex = autoProjectRules.findIndex(item => item.id === ruleId);
      if (sourceIndex < 0 || targetIndex < 0) return;
      const [moved] = autoProjectRules.splice(sourceIndex, 1);
      const nextTargetIndex = autoProjectRules.findIndex(item => item.id === ruleId);
      autoProjectRules.splice(nextTargetIndex, 0, moved);
      await persistAutoProjectRules({ immediate: true });
      renderAutoRuleManager();
      runAutoRuleTest();
    });
  });
}

async function addAutoProjectRule() {
  const keywordInput = document.getElementById('auto-rule-add-keyword');
  const projectInput = document.getElementById('auto-rule-add-project');
  const matchTypeInput = document.getElementById('auto-rule-add-match-type');
  const caseInput = document.getElementById('auto-rule-add-case');
  const keyword = keywordInput?.value.trim() || '';
  const projectName = projectInput?.value.trim() || '';
  if (!keyword) {
    keywordInput?.focus();
    return;
  }
  if (!projectName) {
    projectInput?.focus();
    return;
  }

  const now = new Date().toISOString();
  autoProjectRules.push(QuickLinksAutoRules.normalizeRule({
    id: QuickLinksAutoRules.createId('rule'),
    keyword,
    projectName,
    matchType: matchTypeInput?.value || 'contains',
    caseSensitive: !!caseInput?.checked,
    enabled: true,
    createdAt: now,
    updatedAt: now
  }));
  ensureRuleProjectExists(projectName);
  await persistAutoProjectRules({ immediate: true });
  if (keywordInput) keywordInput.value = '';
  if (projectInput) projectInput.value = '';
  if (matchTypeInput) matchTypeInput.value = 'contains';
  if (caseInput) caseInput.checked = false;
  renderAutoRuleManager();
  keywordInput?.focus();
}

function runAutoRuleTest() {
  captureAutoRuleManagerInputs();
  const input = document.getElementById('auto-rule-test-input');
  const result = document.getElementById('auto-rule-test-result');
  if (!input || !result) return;
  const value = input.value.trim();
  if (!value) {
    result.textContent = 'URLを入力すると、一致したルールと優先順位を確認できます。';
    return;
  }
  const normalized = normalizeIncomingUrl(value);
  const matches = QuickLinksAutoRules.getMatches(normalized || value, autoProjectRules);
  if (!matches.length) {
    result.textContent = '判定結果：未分類\n一致する有効なルールはありません。';
    return;
  }
  const [first, ...others] = matches;
  const lines = [
    `判定結果：${first.projectName}`,
    `採用：${first.priority}番「${first.keyword}」／${getMatchTypeLabel(first.matchType)}`
  ];
  if (others.length) {
    lines.push('ほかに一致：' + others.map(rule => `${rule.priority}番「${rule.keyword}」→${rule.projectName}`).join('、'));
  }
  result.textContent = lines.join('\n');
}

function disableRulesForDeletedProject(projectName) {
  let changed = false;
  autoProjectRules.forEach(rule => {
    if (rule.projectName === projectName) {
      rule.enabled = false;
      rule.updatedAt = new Date().toISOString();
      changed = true;
    }
  });
  return changed;
}

function moveRulesToProject(sourceName, targetName) {
  let changed = false;
  autoProjectRules.forEach(rule => {
    if (rule.projectName === sourceName) {
      rule.projectName = targetName;
      rule.updatedAt = new Date().toISOString();
      changed = true;
    }
  });
  return changed;
}

function setSharedSearchQuery(value, options = {}) {
  const { persist = true, render = true } = options;
  sharedSearchQuery = String(value || '');
  searchQuery = sharedSearchQuery;
  if (!searchQuery.trim()) {
    searchProjectFilter = 'ALL';
    searchProjectFilterExpanded = false;
  }
  promptSearchQuery = sharedSearchQuery;
  redsQuery = sharedSearchQuery;
  if (persist) sharedSearchLocalEditAt = Date.now();
  syncSharedSearchInputs();
  if (render) {
    renderFilters();
    renderList();
    renderPromptMemos();
  }
  if (persist) persistSharedSearchQuery(sharedSearchQuery);
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
  sharedSearchPersistTimer = window.setTimeout(async () => {
    try {
      const response = await sendRuntimeMessage({
        type: 'quickLinksCommitState',
        payload: {
          base: {},
          current: { sharedSearchQuery: state.query, [SHARED_SEARCH_STATE_KEY]: state },
          replaceKeys: []
        }
      });
      if (!response?.ok) throw new Error(response?.error || '検索状態を保存できませんでした。');
    } catch (error) {
      console.warn('Failed to persist shared search state', error);
    }
  }, 120);
}

function clearAndFocusSidepanelSearch() {
  const now = Date.now();
  const isDuplicateShortcut = now - lastClearSearchShortcutAt < CLEAR_SEARCH_SHORTCUT_DEDUP_MS;
  if (!isDuplicateShortcut) {
    lastClearSearchShortcutAt = now;
    if (sharedSearchQuery) setSharedSearchQuery('');
  }

  const focusId = sidePanelMode === 'prompts'
    ? 'prompt-search'
    : (sidePanelMode === 'reds' ? 'reds-search' : 'input-search');

  // Chrome command経由とサイドパネル自身のkeydownが重なっても、フォーカス処理だけは毎回行う。
  // まず同期的に当て、再描画・storage同期で外れた場合に次フレームと次タスクでも取り直す。
  const focusSearch = () => {
    const input = document.getElementById(focusId);
    if (!input || input.offsetParent === null) return false;
    try {
      input.focus({ preventScroll: true });
    } catch (_) {
      input.focus();
    }
    return document.activeElement === input;
  };
  focusSearch();
  window.requestAnimationFrame(focusSearch);
  window.setTimeout(focusSearch, 0);
  window.setTimeout(focusSearch, 60);
  return true;
}

function syncSharedSearchInputs() {
  const inputs = [
    document.getElementById('input-search'),
    document.getElementById('prompt-search'),
    document.getElementById('reds-search')
  ];
  inputs.forEach(input => {
    if (!input) return;
    // IME変換中に value を外から書き換えると、未確定文字が確定されるため触らない。
    if (sharedSearchComposing && input === document.activeElement) return;
    if (input.value !== sharedSearchQuery) input.value = sharedSearchQuery;
  });
  const clearBtn = document.getElementById('btn-search-clear');
  if (clearBtn) clearBtn.style.display = sharedSearchQuery ? 'flex' : 'none';
}

function isSharedSearchInputEventComposing(e) {
  return sharedSearchComposing || e.isComposing;
}

function bindSharedSearchComposition(input, afterCommit) {
  if (!input) return;
  input.addEventListener('compositionstart', () => {
    sharedSearchComposing = true;
  });
  input.addEventListener('compositionend', (e) => {
    sharedSearchComposing = false;
    setSharedSearchQuery(e.target.value || '', { render: false });
    if (typeof afterCommit === 'function') afterCommit(e.target.value || '');
  });
}

function getProjectColor(name) {
  if (!name || name === '未分類' || name === '') {
    return { bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb' };
  }
  if (projectColors[name]) {
    return projectColors[name];
  }
  
  // 既存ユーザー向け：クラブ発信のデフォルトカラー強制適用
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

function hexToRgba(hex, alpha) {
    let r = 0, g = 0, b = 0;
    if (!hex) return `rgba(255,255,255,${alpha})`;
    if (hex.startsWith('hsl')) return hex; 

    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex[1] + hex[2], 16);
        g = parseInt(hex[3] + hex[4], 16);
        b = parseInt(hex[5] + hex[6], 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- フィルタボタン生成（件数表示対応） ---
function createFilterBtn(label, value) {
  const btn = document.createElement('button');
  const isActive = currentFilter === value;
  
  // 検索キーワードで事前に絞り込む
  let baseItems = items;
  if (searchQuery) {
    const q = normalizeString(searchQuery);
    baseItems = baseItems.filter(item => 
      normalizeString(item.title).includes(q) ||
      normalizeString(item.url).includes(q) ||
      normalizeString(item.projectName).includes(q) ||
      normalizeString(item.note).includes(q)
    );
  }

  // 件数の計算
  let activeCount = 0;
  let archivedCount = 0;
  if (value === 'ALL') {
    activeCount = baseItems.filter(item => !item.archived).length;
    archivedCount = baseItems.filter(item => item.archived).length;
  } else if (value === 'FAVORITES') {
    activeCount = baseItems.filter(item => item.favoriteType !== 'none' && !item.archived).length;
    archivedCount = baseItems.filter(item => item.favoriteType !== 'none' && item.archived).length;
  } else {
    activeCount = baseItems.filter(item => item.projectName === value && !item.archived).length;
    archivedCount = baseItems.filter(item => item.projectName === value && item.archived).length;
  }
  
  btn.className = `filter-btn ${isActive ? 'active' : ''}`;
  
  // アーカイブも表示されている場合は「(通常件数+アーカイブ件数)」と表示する
  const countText = showArchived && archivedCount > 0 ? `${activeCount}+${archivedCount}` : `${activeCount}`;
  btn.innerHTML = `<span class="filter-label">${escapeHtml(label)}</span><span class="filter-count">(${escapeHtml(countText)})</span>`;
  
  if (value === 'FAVORITES') {
    btn.classList.add('favorite');
  } else if (value !== 'ALL') {
    const colors = getProjectColor(value);
    btn.style.backgroundColor = colors.bg;
    btn.style.color = colors.text;
    btn.style.borderColor = colors.border;
    
    if (isActive) {
      btn.style.borderWidth = '2px';
      btn.style.borderColor = colors.text;
      btn.style.fontWeight = 'bold';
      btn.style.boxShadow = `0 1px 2px ${colors.border}`;
    }

    btn.ondblclick = (e) => {
      e.stopPropagation();
      openProjectEditModal(value);
    };
    btn.title = "ダブルクリックで編集";
  }
  
  btn.onclick = () => {
    currentFilter = value;
    filterExpanded = false;
    renderFilters();
    renderList();
  };
  return btn;
}

// --- プロジェクト編集モーダル関連 ---
function openProjectEditModal(projectName) {
  editingProjectName = projectName;
  document.getElementById('edit-project-name').value = projectName;
  const currentColor = getProjectColor(projectName);
  selectedColor = currentColor;

  const paletteContainer = document.getElementById('project-color-palette');
  paletteContainer.innerHTML = '';
  
  PRESET_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color.bg;
    swatch.style.borderColor = color.border;
    if (color.bg === currentColor.bg) {
      swatch.classList.add('selected');
    }
    swatch.onclick = () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      selectedColor = color;
    };
    paletteContainer.appendChild(swatch);
  });
  document.getElementById('project-edit-modal').classList.add('open');
}

function closeProjectEditModal() {
  document.getElementById('project-edit-modal').classList.remove('open');
  editingProjectName = null;
  selectedColor = null;
}

async function saveProjectEdit() {
  if (!editingProjectName) return;

  const newName = document.getElementById('edit-project-name').value.trim();
  if (!newName) {
    alert('プロジェクト名は空にできません');
    return;
  }

  if (newName !== editingProjectName) {
    items.forEach(item => {
      if (item.projectName === editingProjectName) {
        item.projectName = newName;
      }
    });
    projects = projects.filter(p => p !== editingProjectName);
    if (!projects.includes(newName)) {
      projects.push(newName);
    }
    delete projectColors[editingProjectName];
    if (currentFilter === editingProjectName) {
      currentFilter = newName;
    }
    moveRulesToProject(editingProjectName, newName);
  }

  if (selectedColor) {
    projectColors[newName] = {
      bg: selectedColor.bg,
      text: selectedColor.text,
      border: selectedColor.border
    };
  }

  const saved = await saveData(['items', 'projects', 'projectColors', 'autoProjectRules']);
  if (!saved) return;
  renderFilters(); 
  renderList();
  closeProjectEditModal();
}

// --- 分類（プロジェクト）の削除 ---
async function deleteProject(projectName) {
  if (projectName === '未分類') {
    alert('「未分類」は削除できません。');
    return;
  }
  if (!confirm(`分類「${projectName}」を削除しますか？\n※中のリンクは「未分類」に移動し、リンク自体は消えません。`)) {
    return;
  }

  // リンクを「未分類」に移動
  items.forEach(item => {
    if (item.projectName === projectName) {
      item.projectName = '未分類';
    }
  });

  // プロジェクト一覧から削除
  projects = projects.filter(p => p !== projectName);
  delete projectColors[projectName];

  if (currentFilter === projectName) {
    currentFilter = 'ALL';
  }

  // 「未分類」が存在しなければ追加
  if (!projects.includes('未分類')) projects.push('未分類');
  disableRulesForDeletedProject(projectName);

  const saved = await saveData(['items', 'projects', 'projectColors', 'autoProjectRules']);
  if (!saved) return;
  renderFilters();
  renderList();
  closeProjectEditModal();
  if (document.getElementById('project-manage-modal').classList.contains('open')) {
    openManageModal(); // 管理画面を開いたままなら再描画
  }
}

// --- 分類（プロジェクト）管理・整理機能 ---
let draggedManageItemIndex = null;

function openManageModal() {
  const container = document.getElementById('manage-project-list');
  const select = document.getElementById('merge-target-select');
  container.innerHTML = '';
  select.innerHTML = '';

  projects.forEach((p, index) => {
    // リストアイテム生成
    const el = document.createElement('div');
    el.className = 'manage-project-item';
    el.style.cssText = 'display:flex; align-items:center; gap:8px; padding:6px; background:white; border:1px solid #e5e7eb; border-radius:4px; cursor:grab;';
    el.draggable = true;
    el.dataset.index = index;

    const colors = getProjectColor(p);
    
    // チェックボックス
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = p;
    cb.className = 'merge-checkbox';
    
    const handle = document.createElement('span');
    handle.textContent = '≡';
    handle.style.cssText = 'color:#9ca3af; cursor:grab; font-weight:bold; padding:0 4px;';

    const nameBadge = document.createElement('span');
    nameBadge.textContent = p;
    nameBadge.style.cssText = `background-color:${colors.bg}; color:${colors.text}; border:1px solid ${colors.border}; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold;`;

    el.appendChild(handle);
    el.appendChild(cb);
    el.appendChild(nameBadge);

    // ドラッグ＆ドロップイベント
    el.addEventListener('dragstart', (e) => {
      draggedManageItemIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      el.style.opacity = '0.5';
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.style.borderTop = '2px solid #2563eb';
    });
    el.addEventListener('dragleave', () => {
      el.style.borderTop = '1px solid #e5e7eb';
    });
    el.addEventListener('dragend', () => {
      el.style.opacity = '1';
      document.querySelectorAll('.manage-project-item').forEach(item => {
        item.style.borderTop = '1px solid #e5e7eb';
      });
    });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.style.borderTop = '1px solid #e5e7eb';
      const targetIndex = index;
      if (draggedManageItemIndex !== null && draggedManageItemIndex !== targetIndex) {
        // 配列の並び替え
        const [movedItem] = projects.splice(draggedManageItemIndex, 1);
        projects.splice(targetIndex, 0, movedItem);
        const saved = await saveData(['projects']);
        if (!saved) return;
        renderFilters();
        openManageModal(); // 再描画
      }
    });

    container.appendChild(el);

    // 統合先セレクトボックスの選択肢
    const option = document.createElement('option');
    option.value = p;
    option.textContent = p;
    select.appendChild(option);
  });

  document.getElementById('project-manage-modal').classList.add('open');
}

async function handleMerge() {
  const checkboxes = document.querySelectorAll('.merge-checkbox:checked');
  const sourceProjects = Array.from(checkboxes).map(cb => cb.value);
  const targetProject = document.getElementById('merge-target-select').value;

  if (sourceProjects.length === 0) {
    alert('統合元の分類（チェックボックス）を選択してください。');
    return;
  }
  if (sourceProjects.includes(targetProject)) {
    alert('統合元と統合先が同じです。チェックを外してください。');
    return;
  }

  if (confirm(`${sourceProjects.length}件の分類を「${targetProject}」に統合しますか？\n（元の分類名は削除されます）`)) {
    // リンクの書き換え
    items.forEach(item => {
      if (sourceProjects.includes(item.projectName)) {
        item.projectName = targetProject;
      }
    });

    // プロジェクトリストから削除
    projects = projects.filter(p => !sourceProjects.includes(p));
    sourceProjects.forEach(p => {
      delete projectColors[p];
      moveRulesToProject(p, targetProject);
    });

    if (sourceProjects.includes(currentFilter)) {
      currentFilter = targetProject;
    }

    const saved = await saveData(['items', 'projects', 'projectColors', 'autoProjectRules']);
    if (!saved) return;
    renderFilters();
    renderList();
    openManageModal(); // 再描画
  }
}

// --- クリーンアップ提案 ---
function checkCleanupCandidates() {
  const now = Date.now();
  const candidates = items.filter(item => {
    if (item.archived) return false;
    const lastActiveTime = item.lastClickedAt ? new Date(item.lastClickedAt).getTime() : new Date(item.addedAt).getTime();
    return (now - lastActiveTime) > TWO_WEEKS_MS;
  });

  const bar = document.getElementById('cleanup-bar');
  const msg = document.getElementById('cleanup-message');
  const btn = document.getElementById('btn-cleanup-action');
  
  if (candidates.length > 0) {
    bar.classList.add('visible');
    msg.textContent = `${candidates.length}件のリンクをアーカイブします`;
    btn.textContent = '確認してアーカイブ';
    btn.onclick = () => showCleanupDialog(candidates);
  } else {
    bar.classList.remove('visible');
  }
}

async function showCleanupDialog(candidates) {
  const message = "以下のリンクは直近2週間アクセスがありません。\n表から隠してアーカイブに移動しますか？\n\n" + 
                  candidates.map(i => `・${i.title}`).join('\n');
  
  if (confirm(message)) {
    const candidateIds = new Set(candidates.map(c => c.id));
    items = items.map(item => {
      if (candidateIds.has(item.id)) {
        return { ...item, archived: true };
      }
      return item;
    });
    const saved = await saveData(['items']);
    if (!saved) return;
    document.getElementById('cleanup-bar').classList.remove('visible');
    renderFilters();
    renderList(); 
  }
}

// --- リンクのクリック記録 ---
async function recordClick(id) {
  if (!id) return false;
  try {
    const response = await sendRuntimeMessage({ type: 'quickLinksRecordItemClick', id });
    if (!response?.ok || !response.item) throw new Error(response?.error || 'クリック履歴を保存できませんでした。');
    const index = items.findIndex(item => item?.id === id);
    if (index >= 0) items[index] = response.item;
    storageSyncState.items = cloneStateValue(response.items || items);
    if (Array.isArray(response.items)) items = response.items;
    renderFilters();
    renderList();
    return true;
  } catch (error) {
    console.warn('Failed to record link click', error);
    return false;
  }
}

// お気に入りのトグル（なし -> 通常 -> 3日間限定 -> なし）
async function toggleFavorite(id) {
  const index = items.findIndex(i => i.id === id);
  if (index > -1) {
    const item = items[index];
    
    // データ互換性対応
    if (!item.favoriteType) {
      item.favoriteType = item.isFavorite ? 'normal' : 'none';
    }

    if (item.favoriteType === 'none') {
      item.favoriteType = 'normal';
      item.isFavorite = true;
      item.favoriteExpiry = null;
    } else if (item.favoriteType === 'normal') {
      item.favoriteType = 'temp';
      item.isFavorite = true;
      const d = new Date();
      d.setDate(d.getDate() + 3);
      item.favoriteExpiry = d.toISOString();
    } else if (item.favoriteType === 'temp') {
      item.favoriteType = 'none';
      item.isFavorite = false;
      item.favoriteExpiry = null;
    }

    const saved = await saveData(['items']);
    if (!saved) return;
    renderFilters();
    renderList();
  }
}

// --- 検索結果内の分類フィルター（検索中のみ） ---
function getSearchProjectFilterEntriesSidepanel(baseItems) {
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

function getSearchProjectFilterOptionsSidepanel(baseItems) {
  return getSearchProjectFilterEntriesSidepanel(baseItems).map(entry => entry.value);
}

function normalizeSearchProjectFilterSidepanel(options) {
  const values = Array.isArray(options) ? options : [];
  if (!values.includes(searchProjectFilter)) searchProjectFilter = 'ALL';
  return searchProjectFilter;
}

function renderSearchProjectFilterMenuSidepanel(baseItems = []) {
  const menu = document.getElementById('search-project-filter-menu');
  if (!menu) return;
  if (!searchProjectFilterExpanded || !String(searchQuery || '').trim()) {
    menu.hidden = true;
    menu.innerHTML = '';
    return;
  }
  const entries = getSearchProjectFilterEntriesSidepanel(baseItems);
  menu.hidden = false;
  menu.innerHTML = entries.map(entry => {
    const active = entry.value === searchProjectFilter;
    return `<button type="button" class="search-project-chip${active ? ' active' : ''}" data-search-project-filter-chip="${escapeHtml(entry.value)}" aria-pressed="${active ? 'true' : 'false'}" title="${escapeHtml(entry.label)}：${entry.count}件">
      <span class="search-project-chip-label">${escapeHtml(entry.label)}</span>
      <span class="search-project-chip-count" aria-hidden="true">${entry.count}</span>
    </button>`;
  }).join('');
}

function updateSearchProjectFilterControlSidepanel(options = [], baseItems = []) {
  const button = document.getElementById('btn-search-project-filter');
  const label = document.getElementById('search-project-filter-label');
  const count = document.getElementById('search-project-filter-count');
  const menu = document.getElementById('search-project-filter-menu');
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
  normalizeSearchProjectFilterSidepanel(options);
  const currentLabel = searchProjectFilter === 'ALL' ? 'すべて' : searchProjectFilter;
  const currentCount = searchProjectFilter === 'ALL'
    ? (baseItems || []).length
    : (baseItems || []).filter(item => (String(item?.projectName || '未分類').trim() || '未分類') === searchProjectFilter).length;
  label.textContent = currentLabel;
  count.textContent = String(currentCount);
  button.title = `検索結果の分類：${currentLabel}（${currentCount}件）｜Alt+Fで候補を一覧`;
  button.setAttribute('aria-label', `検索結果の分類 ${currentLabel}、${currentCount}件。Alt+Fで分類候補を一覧表示`);
  button.setAttribute('aria-expanded', searchProjectFilterExpanded ? 'true' : 'false');
  renderSearchProjectFilterMenuSidepanel(baseItems);
}

function getSearchProjectFilterBaseItemsSidepanel() {
  let baseItems = [...items];
  if (!showArchived) baseItems = baseItems.filter(item => !item.archived);
  if (currentFilter === 'FAVORITES') baseItems = baseItems.filter(item => item.favoriteType !== 'none');
  else if (currentFilter !== 'ALL') baseItems = baseItems.filter(item => item.projectName === currentFilter);
  const q = normalizeString(searchQuery);
  if (q) {
    baseItems = baseItems.filter(item =>
      normalizeString(item.title).includes(q) ||
      normalizeString(item.url).includes(q) ||
      normalizeString(item.projectName).includes(q) ||
      normalizeString(item.note).includes(q)
    );
  }
  return baseItems;
}

function focusCurrentSearchProjectChipSidepanel() {
  const chips = [...document.querySelectorAll('[data-search-project-filter-chip]')];
  if (!chips.length) return false;
  const target = chips.find(chip => chip.getAttribute('data-search-project-filter-chip') === searchProjectFilter) || chips[0];
  try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
  return true;
}

function openSearchProjectFilterMenuSidepanel() {
  if (sidePanelMode !== 'links' || !String(searchQuery || '').trim()) return false;
  searchProjectFilterExpanded = true;
  renderList();
  window.setTimeout(() => focusCurrentSearchProjectChipSidepanel(), 0);
  return true;
}

function closeSearchProjectFilterMenuSidepanel({ focusCompact = false } = {}) {
  searchProjectFilterExpanded = false;
  renderList();
  if (focusCompact) {
    window.setTimeout(() => {
      const button = document.getElementById('btn-search-project-filter');
      if (!button) return;
      try { button.focus({ preventScroll: true }); } catch (_) { button.focus(); }
    }, 0);
  }
}

function selectSearchProjectFilterSidepanel(value, { closeMenu = false, focusLink = false } = {}) {
  const baseItems = getSearchProjectFilterBaseItemsSidepanel();
  const options = getSearchProjectFilterOptionsSidepanel(baseItems);
  if (!options.includes(value)) return false;
  searchProjectFilter = value;
  if (closeMenu) searchProjectFilterExpanded = false;
  renderList();
  if (focusLink) window.setTimeout(() => focusTopVisibleLink(), 0);
  return true;
}

function cycleSearchProjectFilterSidepanel(direction = 1) {
  if (!String(searchQuery || '').trim()) return false;
  const baseItems = getSearchProjectFilterBaseItemsSidepanel();
  const options = getSearchProjectFilterOptionsSidepanel(baseItems);
  if (!options.length) return false;
  normalizeSearchProjectFilterSidepanel(options);
  const currentIndex = Math.max(0, options.indexOf(searchProjectFilter));
  const nextIndex = (currentIndex + (direction < 0 ? -1 : 1) + options.length) % options.length;
  searchProjectFilter = options[nextIndex];
  searchProjectFilterExpanded = true;
  renderList();
  window.setTimeout(() => focusCurrentSearchProjectChipSidepanel(), 0);
  return true;
}

function focusSearchProjectFilterSidepanel() {
  return openSearchProjectFilterMenuSidepanel();
}

// --- リスト描画 ---
function renderList() {
  const container = document.getElementById('link-list');
  container.innerHTML = '';

  let displayItems = [...items];
  
  // 1. アーカイブ設定で絞り込み
  if (!showArchived) {
    displayItems = displayItems.filter(item => !item.archived);
  }

  // 2. 選択中のタブ（分類やお気に入り）で絞り込み
  if (currentFilter === 'FAVORITES') {
    displayItems = displayItems.filter(item => item.favoriteType !== 'none');
  } else if (currentFilter !== 'ALL') {
    displayItems = displayItems.filter(item => item.projectName === currentFilter);
  }

  // 3. 検索キーワードで絞り込み
  if (searchQuery) {
    const q = normalizeString(searchQuery);
    displayItems = displayItems.filter(item => 
      normalizeString(item.title).includes(q) ||
      normalizeString(item.url).includes(q) ||
      normalizeString(item.projectName).includes(q) ||
      normalizeString(item.note).includes(q)
    );
  }

  // 4. 検索中だけ、現在の検索結果に含まれる分類でさらに絞り込む。
  const searchProjectOptions = getSearchProjectFilterOptionsSidepanel(displayItems);
  normalizeSearchProjectFilterSidepanel(searchProjectOptions);
  // 検索語が変わっても、選択中の分類が新しい検索結果に残る限り維持する。
  // 候補から消えたときだけ normalizeSearchProjectFilterSidepanel() が「すべて」へ戻す。
  updateSearchProjectFilterControlSidepanel(searchProjectOptions, displayItems);
  if (searchQuery.trim() && searchProjectFilter !== 'ALL') {
    displayItems = displayItems.filter(item => (String(item.projectName || '未分類').trim() || '未分類') === searchProjectFilter);
  }

  // ソート処理
  displayItems.sort((a, b) => {
    // ユーザーが選択した現在のソートモード（新着順・分類順・回数順）のみに従う
    if (currentSortMode === 'PROJECT') {
      if (a.projectName < b.projectName) return -1;
      if (a.projectName > b.projectName) return 1;
      return new Date(b.addedAt) - new Date(a.addedAt);
    } else if (currentSortMode === 'CLICKS') {
      const countA = a.clickCount || 0;
      const countB = b.clickCount || 0;
      if (countA !== countB) return countB - countA;
      return new Date(b.addedAt) - new Date(a.addedAt);
    } else {
      return new Date(b.addedAt) - new Date(a.addedAt);
    }
  });

  if (displayItems.length === 0) {
    let msg = 'リンクがありません';
    if (searchQuery) msg = '一致するリンクが見つかりません';
    else if (currentFilter === 'FAVORITES') msg = 'お気に入りのリンクはありません';
    
    container.innerHTML = `<div style="text-align:center; color:#9ca3af; margin-top:20px;">${msg}</div>`;
    return;
  }

  displayItems.forEach(item => {
    const el = document.createElement('div');
    el.className = 'link-item';
    
    const isItemArchived = item.archived;
    const isSearching = !!searchQuery;

    // お気に入りクラスの付与
    if (!isItemArchived) {
      if (item.favoriteType === 'normal') {
        el.classList.add('favorite-item');
      } else if (item.favoriteType === 'temp') {
        el.classList.add('favorite-temp-item');
      }
    }
    
    if (isItemArchived) {
      el.classList.add('archived');
    }

    el.draggable = false;
    el.dataset.id = item.id;

    const count = item.clickCount || 0;
    const colors = getProjectColor(item.projectName);

    // お気に入りでない場合のみ、クリック数によるスタイル変動（ヒートマップ/左ボーダー）を適用
    if (item.favoriteType === 'none' && !isItemArchived) {
      if (count > 0) {
          el.style.borderLeftColor = colors.border;
          el.style.borderLeftWidth = count >= 10 ? '6px' : '4px';
      } else {
          el.style.borderLeftColor = 'transparent';
      }

      if (count > 0) {
          const heatRatio = Math.min(count / MAX_HEAT_CLICKS, 1.0);
          const opacity = 0.02 + (heatRatio * 0.18);
          el.style.backgroundColor = hexToRgba(colors.border, opacity);
      }
    }

    const dateStr = new Date(item.addedAt).toLocaleDateString();
    const isDynamicLink = isDynamicQuickLinkUrl(item.url);
    const readableUrl = getReadableLinkUrl(item.url);
    const noteElement = item.note ? `<span class="item-note-inline" title="${escapeHtml(item.note)}">${escapeHtml(item.note)}</span>` : '';
    const clickCountBadge = currentSortMode === 'CLICKS' ? `<span class="item-click-count">${count}回</span>` : '';
    const archivedBadge = isItemArchived ? '<span class="item-archived-badge">Archive</span>' : '';

    let actionButtons = '';
    
    // お気に入りアイコンとクラスの切り替え
    let favClass = 'item-favorite-btn favorite';
    let favIcon = '☆';
    if (item.favoriteType === 'normal') {
      favClass += ' active';
      favIcon = '★';
    } else if (item.favoriteType === 'temp') {
      favClass += ' active'; 
      favIcon = '⏳'; 
    }

    if (isItemArchived) {
      actionButtons = `
        <button class="action-btn copy" title="リンクをコピー">⧉</button>
        <button class="action-btn restore" title="リストに戻す">↩️</button>
        <button class="action-btn delete" title="完全に削除">🗑️</button>
      `;
    } else {
      actionButtons = `
        <button class="action-btn copy" title="リンクをコピー">⧉</button>
        <button class="action-btn edit" title="編集・メモ">✎</button>
        <button class="action-btn archive" title="アーカイブへ移動">📦</button>
        <button class="action-btn delete" title="完了（削除）">🗑️</button>
      `;
    }

    el.innerHTML = `
      <div class="item-content">
        <a href="${isDynamicLink ? '#' : escapeHtml(item.url)}" target="${isDynamicLink ? '_self' : '_blank'}" class="item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</a>
        <div class="item-meta">
          <span class="badge" style="background-color: ${colors.bg}; color: ${colors.text}; border-color: ${colors.border};">
            ${escapeHtml(item.projectName)}
          </span>
          <span class="date">${dateStr}</span>
          ${clickCountBadge}
          ${archivedBadge}
          ${noteElement}
          ${isItemArchived ? '' : `<button class="${favClass}" title="お気に入り" aria-label="お気に入り">${favIcon}</button>`}
        </div>
        <div class="item-url" title="${escapeHtml(readableUrl)}">${escapeHtml(readableUrl)}</div>
      </div>
      <div class="item-actions">
        ${actionButtons}
      </div>
    `;

    const copyButton = el.querySelector('.copy');
    copyButton?.addEventListener('click', () => copyLinkFromSidepanel(item.url, copyButton));

    if (isItemArchived) {
      el.querySelector('.restore').addEventListener('click', () => handleRestore(item.id));
      el.querySelector('.delete').addEventListener('click', () => handleDelete(item.id, true));
    } else {
      el.querySelector('.favorite').addEventListener('click', () => toggleFavorite(item.id));
      el.querySelector('.archive').addEventListener('click', () => handleArchive(item.id));
      el.querySelector('.edit').addEventListener('click', () => openEditModal(item));
      el.querySelector('.delete').addEventListener('click', () => handleDelete(item.id));
    }
    const itemTitleLink = el.querySelector('.item-title');
    itemTitleLink.addEventListener('click', (event) => {
      if (isDynamicLink) {
        event.preventDefault();
        openUrlFromSidepanel(item.url, { active: !(event.ctrlKey || event.metaKey) });
      }
      recordClick(item.id);
    });
    itemTitleLink.addEventListener('auxclick', (event) => {
      if (event.button !== 1) return;
      if (isDynamicLink) {
        event.preventDefault();
        openUrlFromSidepanel(item.url, { active: false });
      }
      recordClick(item.id);
    });
    itemTitleLink.addEventListener('keydown', (event) => {
      if (event.key !== ' ') return;
      event.preventDefault();
      openUrlFromSidepanel(item.url, { active: !(event.ctrlKey || event.metaKey) });
      recordClick(item.id);
    });

    container.appendChild(el);
  });
}

function getProjectStats(projectName) {
  const related = (items || []).filter(item => (item.projectName || '未分類') === projectName);
  const activeCount = related.filter(item => !item.archived).length;
  const archivedCount = related.filter(item => item.archived).length;
  const totalClicks = related.reduce((sum, item) => sum + Number(item.clickCount || 0), 0);
  const lastActive = related.reduce((max, item) => {
    const raw = item.lastClickedAt || item.addedAt || '';
    const time = raw ? new Date(raw).getTime() : 0;
    return Math.max(max, Number.isFinite(time) ? time : 0);
  }, 0);
  return { projectName, activeCount, archivedCount, totalCount: related.length, totalClicks, lastActive };
}

function getSortedProjectsByUsage() {
  return [...new Set((projects || ['未分類']).map(p => String(p || '未分類').trim() || '未分類'))]
    .map(projectName => getProjectStats(projectName))
    .sort((a, b) => {
      if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
      if (b.totalClicks !== a.totalClicks) return b.totalClicks - a.totalClicks;
      if (b.archivedCount !== a.archivedCount) return b.archivedCount - a.archivedCount;
      return b.lastActive - a.lastActive;
    });
}

function getAllProjectFilters() {
  return getSortedProjectsByUsage().map(s => s.projectName);
}

function getCollapsedProjectFilters() {
  if (!['ALL', 'FAVORITES'].includes(currentFilter) && currentFilter) {
    const sorted = getAllProjectFilters();
    return sorted.includes(currentFilter) ? [currentFilter] : [currentFilter];
  }
  return [];
}

function renderFilters() {
  const container = document.getElementById('filter-container');
  if (!container) return;
  container.innerHTML = '';
  container.classList.toggle('expanded', filterExpanded);
  container.classList.toggle('collapsed', !filterExpanded);

  const allBtn = createFilterBtn('すべて', 'ALL');
  container.appendChild(allBtn);

  const favBtn = createFilterBtn('★ お気に入り', 'FAVORITES');
  container.appendChild(favBtn);

  const visibleProjects = filterExpanded ? getAllProjectFilters() : getCollapsedProjectFilters();
  visibleProjects.forEach(p => {
    container.appendChild(createFilterBtn(p, p));
  });

  const toggleBtn = document.getElementById('btn-filter-toggle');
  if (toggleBtn) {
    const projectCount = getAllProjectFilters().length;
    toggleBtn.textContent = filterExpanded ? '分類を閉じる' : '分類を表示';
    toggleBtn.title = filterExpanded ? '分類ボタンを閉じる' : 'すべての分類ボタンを表示';
    toggleBtn.style.display = projectCount > 0 ? '' : 'none';
    toggleBtn.setAttribute('aria-expanded', filterExpanded ? 'true' : 'false');
  }
  
  const updateDatalist = (id) => {
    const list = document.getElementById(id);
    if (!list) return;
    list.innerHTML = '';
    projects.forEach(p => {
      const option = document.createElement('option');
      option.value = p;
      list.appendChild(option);
    });
  };
  updateDatalist('project-list');
  updateDatalist('project-list-edit');
  updateDatalist('project-picker-category-list');
}


function openProjectPickerModal() {
  projectPickerQuery = '';
  const modal = document.getElementById('project-picker-modal');
  if (!modal) return;
  modal.classList.add('open');
  const input = document.getElementById('project-picker-search');
  if (input) input.value = '';
  const sourceInput = document.getElementById('project-picker-source');
  const targetInput = document.getElementById('project-picker-target');
  if (sourceInput) sourceInput.value = '';
  if (targetInput) targetInput.value = '';
  renderProjectPickerList();
  setTimeout(() => input?.focus(), 0);
}

function closeProjectPickerModal() {
  const modal = document.getElementById('project-picker-modal');
  if (modal) modal.classList.remove('open');
}

function renderProjectPickerList() {
  const list = document.getElementById('project-picker-list');
  if (!list) return;
  const q = normalizeString(projectPickerQuery || '');
  let stats = getSortedProjectsByUsage();
  if (q) {
    stats = stats.filter(stat => normalizeString(stat.projectName).includes(q));
  }

  if (!stats.length) {
    list.innerHTML = '<div class="project-picker-empty">一致する分類がありません</div>';
    return;
  }

  list.innerHTML = stats.map(stat => {
    const colors = getProjectColor(stat.projectName);
    const isActive = currentFilter === stat.projectName;
    const archivedText = stat.archivedCount > 0 ? ` / アーカイブ${stat.archivedCount}` : '';
    const safeName = escapeHtml(stat.projectName);
    const disabledAttr = stat.projectName === '未分類' ? 'disabled' : '';
    return `
      <div class="project-picker-item ${isActive ? 'active' : ''}">
        <button class="project-picker-main" data-project-picker-select="${safeName}" title="この分類で絞り込む">
          <span class="project-picker-badge" style="background:${colors.bg};color:${colors.text};border-color:${colors.border};">${safeName}</span>
          <span class="project-picker-count">通常${stat.activeCount}${archivedText}</span>
        </button>
        <span class="project-picker-sub">${Number(stat.totalClicks || 0)} clicks</span>
        <span class="project-picker-actions">
          <button class="project-picker-action-btn" data-project-picker-merge-src="${safeName}" ${disabledAttr}>統合</button>
          <button class="project-picker-action-btn danger" data-project-picker-delete="${safeName}" ${disabledAttr}>削除</button>
        </span>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-project-picker-select]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.getAttribute('data-project-picker-select') || 'ALL';
      filterExpanded = false;
      renderFilters();
      renderList();
      closeProjectPickerModal();
    });
  });
  list.querySelectorAll('[data-project-picker-merge-src]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const source = btn.getAttribute('data-project-picker-merge-src') || '';
      const srcInput = document.getElementById('project-picker-source');
      const targetInput = document.getElementById('project-picker-target');
      if (srcInput) srcInput.value = source;
      if (targetInput) targetInput.focus();
    });
  });
  list.querySelectorAll('[data-project-picker-delete]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteProjectFromPicker(btn.getAttribute('data-project-picker-delete') || '');
    });
  });
}


async function deleteProjectFromPicker(projectName) {
  const name = String(projectName || '').trim();
  if (!name) return;
  if (name === '未分類') {
    alert('「未分類」は削除できません。');
    return;
  }
  const related = (items || []).filter(item => (item.projectName || '未分類') === name);
  if (!confirm(`分類「${name}」を削除しますか？
中のリンク ${related.length}件は「未分類」に移動します。`)) return;

  items.forEach(item => {
    if ((item.projectName || '未分類') === name) item.projectName = '未分類';
  });
  projects = projects.filter(p => p !== name);
  delete projectColors[name];
  if (!projects.includes('未分類')) projects.push('未分類');
  if (currentFilter === name) currentFilter = 'ALL';
  disableRulesForDeletedProject(name);

  const saved = await saveData(['items', 'projects', 'projectColors', 'autoProjectRules']);
  if (!saved) return;
  renderFilters();
  renderList();
  renderProjectPickerList();
}

async function mergeProjectsFromPicker() {
  const source = document.getElementById('project-picker-source')?.value.trim() || '';
  const target = document.getElementById('project-picker-target')?.value.trim() || '';
  if (!source) {
    alert('統合元の分類を入力してください。');
    return;
  }
  if (!target) {
    alert('統合先の分類を入力してください。');
    return;
  }
  if (source === '未分類') {
    alert('「未分類」は統合元にできません。');
    return;
  }
  if (source === target) {
    alert('統合元と統合先が同じです。');
    return;
  }
  if (!projects.includes(source)) {
    alert(`分類「${source}」が見つかりません。`);
    return;
  }
  const sourceCount = (items || []).filter(item => (item.projectName || '未分類') === source).length;
  if (!confirm(`分類「${source}」を「${target}」へ統合しますか？
対象リンク：${sourceCount}件
※統合元の分類名は削除されます。`)) return;

  items.forEach(item => {
    if ((item.projectName || '未分類') === source) item.projectName = target;
  });
  projects = projects.filter(p => p !== source);
  if (!projects.includes(target)) projects.push(target);
  if (projectColors[source] && !projectColors[target]) projectColors[target] = projectColors[source];
  delete projectColors[source];
  if (currentFilter === source) currentFilter = target;
  moveRulesToProject(source, target);

  const saved = await saveData(['items', 'projects', 'projectColors', 'autoProjectRules']);
  if (!saved) return;
  const srcInput = document.getElementById('project-picker-source');
  const targetInput = document.getElementById('project-picker-target');
  if (srcInput) srcInput.value = '';
  if (targetInput) targetInput.value = '';
  renderFilters();
  renderList();
  renderProjectPickerList();
}

async function deleteProjectFromPickerInput() {
  const source = document.getElementById('project-picker-source')?.value.trim() || '';
  await deleteProjectFromPicker(source);
  const srcInput = document.getElementById('project-picker-source');
  if (srcInput) srcInput.value = '';
}

// アイテム追加
async function addItem(title, url, projectName, note = '', favType = 'none') {
  const project = String(projectName || '未分類').trim() || '未分類';
  let expiry = null;
  if (favType === 'temp') {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    expiry = d.toISOString();
  }
  const built = QuickLinksAutoRules.createQuickLinkItem({
    title, url, projectName: project, note, favoriteType: favType, favoriteExpiry: expiry
  });
  if (!built.ok) {
    alert(built.error);
    document.getElementById('input-url')?.focus();
    return false;
  }
  items = [built.item, ...items];
  if (!projects.includes(project)) projects = [...projects, project];

  const saved = await commitLocalState(['items', 'projects']);
  if (!saved) return false;
  renderFilters();
  renderList();

  document.getElementById('input-title').value = '';
  document.getElementById('input-url').value = '';
  document.getElementById('input-project').value = '';
  document.getElementById('input-note').value = '';
  document.querySelector('input[name="fav-type"][value="none"]').checked = true;
  resetManualAutoProjectState();
  updateManualDuplicateUrlHint();
  document.getElementById('manual-form').classList.remove('open');
  return true;
}

async function handleAddCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    document.getElementById('manual-form').classList.add('open');
    document.getElementById('input-title').value = tab.title;
    document.getElementById('input-url').value = tab.url;
    
    // URLから自動アシスト。手動選択前だけ上書きする。
    manualProjectTouched = false;
    applyManualAutoProject({ force: true });
    
    document.getElementById('input-note').value = ''; 
    document.querySelector('input[name="fav-type"][value="none"]').checked = true;
    updateManualDuplicateUrlHint();
    document.getElementById('input-project').focus();
  }
}

async function handleArchive(id) {
  const index = items.findIndex(i => i.id === id);
  if (index > -1) {
    items[index].archived = true;
    const saved = await saveData(['items']);
    if (!saved) return;
    renderFilters();
    renderList();
  }
}

async function handleRestore(id) {
  const index = items.findIndex(i => i.id === id);
  if (index > -1) {
    items[index].archived = false;
    items[index].lastClickedAt = new Date().toISOString(); 
    const saved = await saveData(['items']);
    if (!saved) return;
    renderFilters();
    renderList();
  }
}

async function handleDelete(id, force = false) {
  const msg = force ? 'このリンクを完全に削除しますか？\n（復元できません）' : 'このリンクを削除（完了）しますか？';
  if (confirm(msg)) {
    items = items.filter(i => i.id !== id);
    const saved = await saveData(['items']);
    if (!saved) return;
    renderFilters();
    renderList();
  }
}

function openEditModal(item) {
  editSaveInFlight = false;
  editingItemId = item.id;
  document.getElementById('edit-title').value = item.title;
  document.getElementById('edit-url').value = item.url;
  document.getElementById('edit-project').value = categoryInputValueSidepanel(item.projectName);
  document.getElementById('edit-note').value = item.note || ''; 
  document.getElementById('edit-modal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
  editingItemId = null;
}

async function saveEdit() {
  if (!editingItemId || editSaveInFlight) return;
  const currentItem = items.find(item => item.id === editingItemId);
  if (!currentItem) return;

  const input = {
    title: document.getElementById('edit-title').value,
    url: document.getElementById('edit-url').value,
    projectName: document.getElementById('edit-project').value || '未分類',
    note: document.getElementById('edit-note').value
  };
  const built = QuickLinksAutoRules.createQuickLinkItem(input, currentItem);
  if (!built.ok) {
    alert(built.error);
    document.getElementById('edit-url')?.focus();
    return;
  }
  const duplicate = findDuplicateUrlItem(built.item.url, editingItemId);
  if (duplicate) {
    alert(`このURLは既に登録されています。\n${duplicate.title || duplicate.url || '名称なし'}（${duplicate.projectName || '未分類'}）`);
    document.getElementById('edit-url')?.focus();
    return;
  }

  editSaveInFlight = true;
  try {
    items = items.map(item => item.id === editingItemId ? built.item : item);
    if (!projects.includes(built.item.projectName)) projects = [...projects, built.item.projectName];
    const saved = await commitLocalState(['items', 'projects']);
    if (!saved) return;
    renderFilters();
    renderList();
    closeEditModal();
  } finally {
    editSaveInFlight = false;
  }
}

// JSONデータのエクスポート
function exportData() {
  const backup = {
    schemaVersion: 'quick-links-backup-v3',
    exportedAt: new Date().toISOString(),
    quickLinks: {
      items: Array.isArray(items) ? items : [],
      projects: Array.isArray(projects) ? projects : ['未分類'],
      projectColors: projectColors || {},
      currentSortMode,
      showArchived,
      floatingSearchEnabled,
      autoProjectRules: QuickLinksAutoRules.normalizeRules(autoProjectRules)
    },
    promptMemos: {
      items: Array.isArray(promptMemos) ? promptMemos : [],
      categories: normalizePromptCategoriesSidepanel(promptCategories),
      sortMode: promptSortMode
    }
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.href = objectUrl;
  const date = new Date().toISOString().slice(0, 10);
  downloadAnchorNode.download = `quick_links_prompt_memos_backup_${date}.json`;
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function normalizeImportedQuickLinkItems(rawData) {
  if (Array.isArray(rawData)) return rawData;
  if (Array.isArray(rawData?.quickLinks?.items)) return rawData.quickLinks.items;
  if (Array.isArray(rawData?.items)) return rawData.items;
  return [];
}

function normalizeImportedAutoProjectRules(rawData) {
  if (Array.isArray(rawData?.quickLinks?.autoProjectRules)) return rawData.quickLinks.autoProjectRules;
  if (Array.isArray(rawData?.autoProjectRules)) return rawData.autoProjectRules;
  return null;
}

function normalizeImportedPromptMemoItems(rawData) {
  if (Array.isArray(rawData?.promptMemos?.items)) return rawData.promptMemos.items;
  if (Array.isArray(rawData?.promptMemos)) return rawData.promptMemos;
  return [];
}

function normalizeImportedPromptCategories(rawData) {
  if (Array.isArray(rawData?.promptMemos?.categories)) return rawData.promptMemos.categories;
  if (Array.isArray(rawData?.promptCategories)) return rawData.promptCategories;
  return [];
}

function normalizeDedupeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeDedupeBody(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function getQuickLinkDuplicateKey(item) {
  return [
    canonicalizeComparableUrl(item?.url || ''),
    normalizeDedupeText(item?.title || ''),
    normalizeDedupeText(item?.projectName || '未分類') || '未分類',
    normalizeDedupeText(item?.note || ''),
    item?.archived ? 'archived' : 'active'
  ].join('\u001F');
}

function getPromptMemoDuplicateKey(memo) {
  return [
    normalizeDedupeText(memo?.title || '無題のプロンプト') || '無題のプロンプト',
    normalizeDedupeBody(memo?.body || ''),
    normalizeDedupeText(memo?.categoryName || memo?.projectName || '未分類') || '未分類'
  ].join('\u001F');
}

function getTimeValue(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function pickEarlierDate(a, b) {
  const at = getTimeValue(a);
  const bt = getTimeValue(b);
  if (!at) return b || a || null;
  if (!bt) return a || b || null;
  return at <= bt ? a : b;
}

function pickLaterDate(a, b) {
  const at = getTimeValue(a);
  const bt = getTimeValue(b);
  if (!at) return b || a || null;
  if (!bt) return a || b || null;
  return at >= bt ? a : b;
}

function normalizeFavoriteType(value) {
  return QuickLinksAutoRules.normalizeFavoriteType(value);
}

function pickFavoriteType(a, b) {
  const priority = { none: 0, normal: 1, temp: 2 };
  const av = normalizeFavoriteType(a);
  const bv = normalizeFavoriteType(b);
  return priority[bv] > priority[av] ? bv : av;
}

function mergeClickHistory(a, b) {
  const merged = [];
  [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].forEach(value => {
    if (value && !merged.includes(value)) merged.push(value);
  });
  return merged.sort((x, y) => getTimeValue(x) - getTimeValue(y));
}

function mergeQuickLinkRecord(base, incoming) {
  if (!base) return incoming;
  const merged = { ...base };

  merged.addedAt = pickEarlierDate(base.addedAt, incoming.addedAt) || base.addedAt || incoming.addedAt || null;
  merged.lastClickedAt = pickLaterDate(base.lastClickedAt, incoming.lastClickedAt) || base.lastClickedAt || incoming.lastClickedAt || null;
  merged.clickCount = Math.max(Number(base.clickCount || 0), Number(incoming.clickCount || 0));
  merged.clickHistory = mergeClickHistory(base.clickHistory, incoming.clickHistory);

  const favoriteType = pickFavoriteType(base.favoriteType || (base.isFavorite ? 'normal' : 'none'), incoming.favoriteType || (incoming.isFavorite ? 'normal' : 'none'));
  merged.favoriteType = favoriteType;
  merged.isFavorite = favoriteType !== 'none' || !!base.isFavorite || !!incoming.isFavorite;
  merged.favoriteExpiry = pickLaterDate(base.favoriteExpiry, incoming.favoriteExpiry) || base.favoriteExpiry || incoming.favoriteExpiry || null;

  // 表示に関わる項目は「完全重複キー」が同じ前提なので、既存側を優先する
  return merged;
}

function mergePromptMemoRecord(base, incoming) {
  if (!base) return incoming;
  return {
    ...base,
    createdAt: pickEarlierDate(base.createdAt, incoming.createdAt) || base.createdAt || incoming.createdAt || null,
    updatedAt: pickLaterDate(base.updatedAt, incoming.updatedAt) || base.updatedAt || incoming.updatedAt || null,
    lastCopiedAt: pickLaterDate(base.lastCopiedAt, incoming.lastCopiedAt) || base.lastCopiedAt || incoming.lastCopiedAt || null,
    copyCount: Math.max(Number(base.copyCount || 0), Number(incoming.copyCount || 0))
  };
}

function compactDuplicateQuickLinks(list) {
  const map = new Map();
  const compacted = [];
  let removed = 0;

  (Array.isArray(list) ? list : []).forEach((item, index) => {
    const normalizedItem = QuickLinksAutoRules.normalizeQuickLinkItem(item, index);
    if (!normalizedItem) return;
    item = normalizedItem;
    const key = getQuickLinkDuplicateKey(item);
    if (map.has(key)) {
      const index = map.get(key);
      compacted[index] = mergeQuickLinkRecord(compacted[index], item);
      removed++;
    } else {
      map.set(key, compacted.length);
      compacted.push(item);
    }
  });

  return { list: compacted, removed };
}

function compactDuplicatePromptMemos(list) {
  const map = new Map();
  const compacted = [];
  let removed = 0;

  (Array.isArray(list) ? list : []).forEach(memo => {
    if (!memo || (!String(memo.title || '').trim() && !String(memo.body || '').trim())) return;
    const key = getPromptMemoDuplicateKey(memo);
    if (map.has(key)) {
      const index = map.get(key);
      compacted[index] = mergePromptMemoRecord(compacted[index], memo);
      removed++;
    } else {
      map.set(key, compacted.length);
      compacted.push(memo);
    }
  });

  return { list: compacted, removed };
}

function normalizeProjectsFromItems(existingProjects, itemList) {
  const merged = ['未分類', ...(Array.isArray(existingProjects) ? existingProjects : []), ...((itemList || []).map(item => item.projectName || '未分類'))];
  return [...new Set(merged.map(name => String(name || '未分類').trim() || '未分類'))];
}

async function cleanupDuplicateData() {
  const linkResult = compactDuplicateQuickLinks(items);
  const promptResult = compactDuplicatePromptMemos(promptMemos);

  if (linkResult.removed === 0 && promptResult.removed === 0) {
    alert('完全重複は見つかりませんでした。');
    return;
  }

  const ok = confirm(`完全重複を整理します。\n\nQuick Links：${linkResult.removed}件削除\nプロンプトメモ：${promptResult.removed}件削除\n\n※クリック回数・コピー回数・最終利用日は、残す1件へ可能な範囲で引き継ぎます。`);
  if (!ok) return;

  items = linkResult.list;
  promptMemos = promptResult.list;
  projects = normalizeProjectsFromItems(projects, items);
  promptCategories = normalizePromptCategoriesSidepanel([...promptCategories, ...promptMemos.map(m => getPromptMemoCategorySidepanel(m))]);

  const saved = await commitLocalState(['items', 'projects', 'promptMemos', 'promptCategories']);
  if (!saved) return;
  renderFilters();
  renderList();
  renderPromptMemos();
  alert(`整理しました。\nQuick Links：${linkResult.removed}件削除\nプロンプトメモ：${promptResult.removed}件削除`);
}


// JSONデータのインポート処理
async function handleImportData() {
  const jsonText = document.getElementById('import-json-text').value.trim();
  if (!jsonText) return;

  try {
    const rawData = JSON.parse(jsonText);
    const importedLinks = normalizeImportedQuickLinkItems(rawData);
    const importedPrompts = normalizeImportedPromptMemoItems(rawData);
    const importedPromptCategories = normalizeImportedPromptCategories(rawData);
    const importedAutoRules = normalizeImportedAutoProjectRules(rawData);
    const importMode = document.getElementById('import-data-mode')?.value || 'merge';

    if (importMode === 'restore') {
      if (!rawData?.quickLinks || !rawData?.promptMemos) {
        alert('完全復元には、Quick Linksとプロンプトメモを含むバックアップJSONが必要です。');
        return;
      }
      if (!confirm('現在のQuick Links、分類、色、表示設定、プロンプトメモをバックアップ内容で置き換えます。続けますか？')) return;

      const now = new Date().toISOString();
      items = importedLinks
        .map((d, index) => QuickLinksAutoRules.normalizeQuickLinkItem({
          ...d, id: String(d?.id || `restore-link-${Date.now()}-${index}`), updatedAt: d?.updatedAt || d?.addedAt || now
        }, index, { preserveInvalid: false }))
        .filter(Boolean);
      projects = normalizeProjectsFromItems(rawData.quickLinks.projects, items);
      projectColors = rawData.quickLinks.projectColors && typeof rawData.quickLinks.projectColors === 'object'
        ? rawData.quickLinks.projectColors
        : {};
      currentSortMode = rawData.quickLinks.currentSortMode || 'DATE';
      showArchived = !!rawData.quickLinks.showArchived;
      floatingSearchEnabled = rawData.quickLinks.floatingSearchEnabled !== false;
      if (importedAutoRules !== null) autoProjectRules = QuickLinksAutoRules.normalizeRules(importedAutoRules);
      promptMemos = importedPrompts
        .map((d, index) => QuickLinksAutoRules.createPromptMemo({ ...d, id: String(d?.id || `restore-prompt-${Date.now()}-${index}`) }, d))
        .filter(result => result.ok)
        .map(result => result.memo);
      promptCategories = normalizePromptCategoriesSidepanel([...importedPromptCategories, ...promptMemos.map(m => m.categoryName)]);
      promptSortMode = normalizePromptSortModeSidepanel(rawData.promptMemos.sortMode);

      const restoreKeys = ['items', 'projects', 'projectColors', 'currentSortMode', 'showArchived', 'floatingSearchEnabled', 'autoProjectRules', 'promptMemos', 'promptCategories', 'promptSortMode'];
      const ok = await commitLocalState(restoreKeys, { force: true, replaceKeys: restoreKeys });
      if (!ok) return;
      renderFilters();
      renderList();
      renderPromptMemos();
      updateAutoRuleSummary();
      updateSortButton();
      const archivedCheckbox = document.getElementById('check-show-archived');
      if (archivedCheckbox) archivedCheckbox.checked = showArchived;
      const floatingCheckbox = document.getElementById('check-floating-search-enabled');
      if (floatingCheckbox) floatingCheckbox.checked = floatingSearchEnabled;
      alert(`完全復元しました。
Quick Links：${items.length}件
プロンプトメモ：${promptMemos.length}件`);
      document.getElementById('import-modal').classList.remove('open');
      document.getElementById('import-json-text').value = '';
      return;
    }

    if (!Array.isArray(rawData) && importedLinks.length === 0 && importedPrompts.length === 0 && importedPromptCategories.length === 0 && (importedAutoRules === null || importedAutoRules.length === 0)) {
      alert('エラー：取り込めるQuick Links、プロンプトメモ、URL自動分類ルールが見つかりません。');
      return;
    }

    let addCount = 0;
    let skipCount = 0;
    let promptAddCount = 0;
    let promptSkipCount = 0;
    let autoRuleAddedCount = 0;
    const now = new Date().toISOString();

    const linkKeyIndex = new Map();
    items.forEach((item, index) => {
      if (!item || !item.url) return;
      linkKeyIndex.set(getQuickLinkDuplicateKey(item), index);
    });

    importedLinks.forEach((d, importIndex) => {
      const newItem = QuickLinksAutoRules.normalizeQuickLinkItem({
        ...d, id: d?.id || `import-${Date.now()}-${importIndex}`
      }, importIndex, { preserveInvalid: false });
      if (!newItem) return;
      const project = newItem.projectName;

      const key = getQuickLinkDuplicateKey(newItem);
      if (linkKeyIndex.has(key)) {
        const index = linkKeyIndex.get(key);
        items[index] = mergeQuickLinkRecord(items[index], newItem);
        skipCount++;
      } else {
        items.push(newItem);
        linkKeyIndex.set(key, items.length - 1);
        addCount++;
      }

      if (!projects.includes(project)) projects.push(project);
    });

    const promptKeyIndex = new Map();
    promptMemos.forEach((memo, index) => {
      if (!memo || (!String(memo.title || '').trim() && !String(memo.body || '').trim())) return;
      promptKeyIndex.set(getPromptMemoDuplicateKey(memo), index);
    });

    importedPrompts.forEach(d => {
      const title = String(d.title || '').trim();
      const body = String(d.body || '');
      if (!title && !body.trim()) return;
      const categoryName = String(d.categoryName || d.projectName || '未分類').trim() || '未分類';
      const memoResult = QuickLinksAutoRules.createPromptMemo({
        ...d, id: d.id || `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, categoryName, body
      }, d);
      if (!memoResult.ok) return;
      const newMemo = memoResult.memo;

      const key = getPromptMemoDuplicateKey(newMemo);
      if (promptKeyIndex.has(key)) {
        const index = promptKeyIndex.get(key);
        promptMemos[index] = mergePromptMemoRecord(promptMemos[index], newMemo);
        promptSkipCount++;
      } else {
        promptMemos.push(newMemo);
        promptKeyIndex.set(key, promptMemos.length - 1);
        promptAddCount++;
      }

      promptCategories = addPromptCategorySidepanel(categoryName);
    });

    if (importedPromptCategories.length > 0) {
      promptCategories = normalizePromptCategoriesSidepanel([...promptCategories, ...importedPromptCategories]);
    }

    const autoRuleMode = document.getElementById('import-auto-rule-mode')?.value || 'merge';
    if (Array.isArray(importedAutoRules) && importedAutoRules.length > 0 && autoRuleMode !== 'skip') {
      const normalizedImportedRules = QuickLinksAutoRules.normalizeRules(importedAutoRules);
      if (autoRuleMode === 'replace') {
        autoProjectRules = normalizedImportedRules;
        autoRuleAddedCount = normalizedImportedRules.length;
      } else {
        const beforeCount = autoProjectRules.length;
        autoProjectRules = QuickLinksAutoRules.mergeRules(autoProjectRules, normalizedImportedRules);
        autoRuleAddedCount = autoProjectRules.length - beforeCount;
      }
      autoProjectRules.forEach(rule => ensureRuleProjectExists(rule.projectName));
    }

    const importKeys = ['items', 'projects', 'projectColors', 'currentSortMode', 'showArchived', 'floatingSearchEnabled', 'autoProjectRules', 'promptMemos', 'promptCategories', 'promptSortMode'];
    const saved = await commitLocalState(importKeys);
    if (!saved) return;
    renderFilters();
    renderList();
    renderPromptMemos();
    updateAutoRuleSummary();
    alert(`インポートしました。\nQuick Links：追加 ${addCount}件 / 重複スキップ ${skipCount}件\nプロンプトメモ：追加 ${promptAddCount}件 / 重複スキップ ${promptSkipCount}件\nURL自動分類ルール：${autoRuleAddedCount}件反映`);
    document.getElementById('import-modal').classList.remove('open');
    document.getElementById('import-json-text').value = '';
  } catch (e) {
    alert('JSONパースエラー：正しいJSON形式か確認してください。\n' + e.message);
  }
}

// リンク一覧は選択中の並び順（追加日／分類／回数）で表示するため、カードの手動ドラッグは行いません。

function normalizeLinkSortModeSidepanel(value) {
  return ['DATE', 'PROJECT', 'CLICKS'].includes(value) ? value : 'DATE';
}

function getNextLinkSortModeSidepanel(value = currentSortMode) {
  const mode = normalizeLinkSortModeSidepanel(value);
  if (mode === 'DATE') return 'PROJECT';
  if (mode === 'PROJECT') return 'CLICKS';
  return 'DATE';
}

async function cycleLinkSortModeSidepanel() {
  currentSortMode = getNextLinkSortModeSidepanel(currentSortMode);
  updateSortButton();
  const saved = await saveData(['currentSortMode']);
  if (!saved) return currentSortMode;
  renderList();
  return currentSortMode;
}

function updateSortButton() {
  const icon = document.getElementById('sort-icon');
  const label = document.getElementById('sort-label');
  switch(currentSortMode) {
    case 'PROJECT':
      icon.textContent = '📂';
      label.textContent = '分類順';
      break;
    case 'CLICKS':
      icon.textContent = '🔥';
      label.textContent = '回数順';
      break;
    case 'DATE':
    default:
      icon.textContent = '🕒';
      label.textContent = '新着順';
      break;
  }
}

function focusTopVisibleLink() {
  if (sidePanelMode !== 'links') setSidepanelMode('links');
  window.setTimeout(() => {
    const firstLink = document.querySelector('#link-list .link-item .item-title');
    if (!firstLink) return;
    try {
      firstLink.focus({ preventScroll: true });
    } catch (_) {
      firstLink.focus();
    }
    firstLink.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, 0);
}

function focusSidepanelLinkControl(element) {
  if (!element) return false;
  try {
    element.focus({ preventScroll: true });
  } catch (_) {
    element.focus();
  }
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}

function moveFocusedVisibleLink(direction) {
  const activeLink = document.activeElement;
  if (!activeLink?.matches?.('#link-list .link-item .item-title')) return false;

  const visibleLinks = [...document.querySelectorAll('#link-list .link-item .item-title')]
    .filter(link => link.getClientRects().length > 0);
  const currentIndex = visibleLinks.indexOf(activeLink);
  if (currentIndex < 0 || visibleLinks.length === 0) return false;

  // 一覧の端では止める。末尾から先頭へは循環させない。
  const nextIndex = Math.max(0, Math.min(visibleLinks.length - 1, currentIndex + direction));
  const nextLink = visibleLinks[nextIndex];
  if (nextLink && nextLink !== activeLink) focusSidepanelLinkControl(nextLink);
  return true;
}

function navigateFocusedSidepanelLink(eventKey) {
  const active = document.activeElement;
  const card = active?.closest?.('#link-list .link-item');
  if (!card) return false;

  const link = card.querySelector('.item-title');
  const copyButton = card.querySelector('.action-btn.copy');
  const editButton = card.querySelector('.action-btn.edit');

  if (active === link) {
    if (eventKey === 'ArrowUp' || eventKey === 'ArrowDown') {
      return moveFocusedVisibleLink(eventKey === 'ArrowDown' ? 1 : -1);
    }
    if (eventKey === 'ArrowRight') return focusSidepanelLinkControl(copyButton);
    return false;
  }

  if (active === copyButton) {
    if (eventKey === 'ArrowLeft') return focusSidepanelLinkControl(link);
    if (eventKey === 'ArrowDown') return editButton ? focusSidepanelLinkControl(editButton) : true;
    if (eventKey === 'ArrowUp') return true;
    return false;
  }

  if (active === editButton) {
    if (eventKey === 'ArrowLeft') return focusSidepanelLinkControl(link);
    if (eventKey === 'ArrowUp') return copyButton ? focusSidepanelLinkControl(copyButton) : true;
    if (eventKey === 'ArrowDown') return true;
    return false;
  }

  return false;
}

function setupEventListeners() {
  document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;

    const noModifier = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    const active = document.activeElement;
    const activeProjectChip = active?.matches?.('[data-search-project-filter-chip]') ? active : null;
    if (noModifier && activeProjectChip && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      searchProjectFilterExpanded = false;
      renderList();
      window.setTimeout(() => focusTopVisibleLink(), 0);
      return;
    }
    if (noModifier && activeProjectChip && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSearchProjectFilterMenuSidepanel({ focusCompact: true });
      return;
    }
    if (noModifier && active?.id === 'btn-search-project-filter' && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      openSearchProjectFilterMenuSidepanel();
      return;
    }

    if (noModifier && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if ((activeProjectChip || active?.id === 'btn-search-project-filter') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        e.stopPropagation();
        cycleSearchProjectFilterSidepanel(e.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      if (navigateFocusedSidepanelLink(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    const isPlainAlt = e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    if (!isPlainAlt) return;

    const altLetterKey = String(e.key || '').toLowerCase();
    if ((e.code === 'KeyF' || altLetterKey === 'f') && !e.repeat && sidePanelMode === 'links' && String(searchQuery || '').trim()) {
      e.preventDefault();
      e.stopPropagation();
      focusSearchProjectFilterSidepanel();
      return;
    }
    if ((e.code === 'KeyO' || altLetterKey === 'o') && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      cycleLinkSortModeSidepanel();
      return;
    }

    if (e.code === 'KeyQ') {
      e.preventDefault();
      e.stopPropagation();
      focusTopVisibleLink();
      return;
    }

    if (e.code === 'KeyN') {
      e.preventDefault();
      e.stopPropagation();
      if (sidePanelMode === 'prompts') {
        document.getElementById('prompt-add-open')?.click();
      } else {
        document.getElementById('btn-add-current')?.click();
      }
      return;
    }

    const altLetter = altLetterKey;
    const isSiteSearchShortcut = e.code === 'KeyS' || altLetter === 's';
    const isXSearchShortcut = e.code === 'KeyX' || altLetter === 'x';
    if ((isSiteSearchShortcut || isXSearchShortcut) && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      if (sidePanelMode !== 'reds') setSidepanelMode('reds');
      window.setTimeout(() => {
        if (isXSearchShortcut) runRedsXSearchSidepanel();
        else runRedsGoogleSearchSidepanel();
      }, 0);
      return;
    }

    if (!(e.code === 'Digit4' || e.code === 'Numpad4' || String(e.key || '') === '4') || e.repeat) return;
    e.preventDefault();
    e.stopPropagation();
    clearAndFocusSidepanelSearch();
  }, true);

  const btnFilterToggle = document.getElementById('btn-filter-toggle');
  if (btnFilterToggle) {
    btnFilterToggle.addEventListener('click', () => {
      filterExpanded = !filterExpanded;
      renderFilters();
    });
  }

  const projectPickerSearch = document.getElementById('project-picker-search');
  if (projectPickerSearch) {
    projectPickerSearch.addEventListener('input', (e) => {
      projectPickerQuery = e.target.value || '';
      renderProjectPickerList();
    });
    projectPickerSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeProjectPickerModal();
    });
  }
  document.getElementById('btn-close-project-picker')?.addEventListener('click', closeProjectPickerModal);
  document.getElementById('btn-cancel-project-picker')?.addEventListener('click', closeProjectPickerModal);
  document.getElementById('btn-project-picker-merge')?.addEventListener('click', mergeProjectsFromPicker);
  document.getElementById('btn-project-picker-delete')?.addEventListener('click', deleteProjectFromPickerInput);
  document.getElementById('project-picker-modal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'project-picker-modal') closeProjectPickerModal();
  });

  document.getElementById('btn-add-current').addEventListener('click', handleAddCurrentPage);
  document.getElementById('btn-toggle-manual').addEventListener('click', () => {
    const form = document.getElementById('manual-form');
    form.classList.toggle('open');
    if (form.classList.contains('open')) {
      applyManualAutoProject();
      updateManualDuplicateUrlHint();
    }
  });

  // URL入力時は、手動で分類を選ぶまで自動判定を追従させる。
  document.getElementById('input-url').addEventListener('input', () => {
    applyManualAutoProject();
    updateManualDuplicateUrlHint();
  });
  document.getElementById('input-project').addEventListener('input', () => {
    manualProjectTouched = true;
    manualAutoMatch = getAutoProjectMatch(document.getElementById('input-url').value);
    updateManualAutoProjectHint();
  });
  document.getElementById('btn-manual-auto-recheck')?.addEventListener('click', () => {
    applyManualAutoProject({ force: true });
  });

  document.getElementById('btn-submit-manual').addEventListener('click', async () => {
    const title = document.getElementById('input-title').value;
    let url = document.getElementById('input-url').value.trim();
    const rawUrlInput = url;
    let project = document.getElementById('input-project').value.trim();
    const note = document.getElementById('input-note').value; 

    const favTypeRadios = document.getElementsByName('fav-type');
    let favType = 'none';
    for (const radio of favTypeRadios) {
      if (radio.checked) {
        favType = radio.value;
        break;
      }
    }

    const validatedInput = QuickLinksAutoRules.normalizeAndValidateLinkInput({ url: rawUrlInput, title, projectName: project, note });
    if (!validatedInput.ok) { alert(validatedInput.error); document.getElementById('input-url')?.focus(); return; }
    url = validatedInput.url;
    if (!manualProjectTouched) {
      project = getAutoProjectName(rawUrlInput) || project || '未分類';
    }
    project = project || '未分類';
    
    // --- 重複チェック ---
    const duplicate = findDuplicateUrlItem(url);
    if (duplicate) {
      updateManualDuplicateUrlHint();
      const duplicateTitle = duplicate.title || duplicate.url || '名称なし';
      const duplicateProject = duplicate.projectName || '未分類';
      const message = duplicate.archived
        ? `このURLはアーカイブ済みです。\n${duplicateTitle}（${duplicateProject}）\n\n重複して新しく追加しますか？`
        : `このURLは既に登録されています。\n${duplicateTitle}（${duplicateProject}）\n\n重複して追加しますか？`;
      if (!confirm(message)) return;
    }

    await addItem(title, url, project, note, favType);
  });

  document.getElementById('btn-close-modal').addEventListener('click', closeEditModal);
  document.getElementById('btn-cancel-edit').addEventListener('click', closeEditModal);
  document.getElementById('btn-save-edit').addEventListener('click', saveEdit);

  ['edit-title', 'edit-url', 'edit-project', 'edit-note'].forEach((id) => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeEditModal();
        return;
      }
      if (e.key !== 'Enter') return;
      if (id === 'edit-note' && e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      saveEdit();
    });
  });

  document.getElementById('btn-close-project-modal').addEventListener('click', closeProjectEditModal);
  document.getElementById('btn-cancel-project-edit').addEventListener('click', closeProjectEditModal);
  document.getElementById('btn-save-project-edit').addEventListener('click', saveProjectEdit);
  
  document.getElementById('btn-delete-project').addEventListener('click', () => {
    if (editingProjectName) deleteProject(editingProjectName);
  });

  const btnOpenManage = document.getElementById('btn-open-manage');
  if(btnOpenManage) btnOpenManage.addEventListener('click', openManageModal);

  document.getElementById('btn-open-auto-rules')?.addEventListener('click', openAutoRuleManager);
  document.getElementById('btn-close-auto-rules')?.addEventListener('click', closeAutoRuleManager);
  document.getElementById('btn-cancel-auto-rules')?.addEventListener('click', closeAutoRuleManager);
  document.getElementById('btn-add-auto-rule')?.addEventListener('click', addAutoProjectRule);
  document.getElementById('btn-test-auto-rule')?.addEventListener('click', runAutoRuleTest);
  document.getElementById('auto-rule-test-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runAutoRuleTest();
  });
  ['auto-rule-add-keyword', 'auto-rule-add-project'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addAutoProjectRule();
    });
  });
  document.getElementById('auto-rule-modal')?.addEventListener('click', (e) => {
    if (e.target?.id === 'auto-rule-modal') closeAutoRuleManager();
  });
  
  document.getElementById('btn-close-manage').addEventListener('click', () => {
    document.getElementById('project-manage-modal').classList.remove('open');
  });
  document.getElementById('btn-merge-projects').addEventListener('click', handleMerge);

  document.getElementById('btn-sort-toggle').addEventListener('click', () => {
    cycleLinkSortModeSidepanel();
  });
  const searchProjectFilterButton = document.getElementById('btn-search-project-filter');
  searchProjectFilterButton?.addEventListener('click', () => {
    if (searchProjectFilterExpanded) closeSearchProjectFilterMenuSidepanel({ focusCompact: true });
    else openSearchProjectFilterMenuSidepanel();
  });
  document.getElementById('search-project-filter-menu')?.addEventListener('click', (e) => {
    const chip = e.target?.closest?.('[data-search-project-filter-chip]');
    if (!chip) return;
    const value = chip.getAttribute('data-search-project-filter-chip') || 'ALL';
    selectSearchProjectFilterSidepanel(value, { closeMenu: true });
  });

  document.getElementById('btn-export-json').addEventListener('click', exportData);
  const dedupeBtn = document.getElementById('btn-dedupe-data');
  if (dedupeBtn) dedupeBtn.addEventListener('click', cleanupDuplicateData);
  document.getElementById('btn-import-open').addEventListener('click', () => {
    document.getElementById('import-modal').classList.add('open');
  });
  document.getElementById('btn-close-import').addEventListener('click', () => {
    document.getElementById('import-modal').classList.remove('open');
  });
  document.getElementById('btn-cancel-import').addEventListener('click', () => {
    document.getElementById('import-modal').classList.remove('open');
  });
  document.getElementById('btn-run-import').addEventListener('click', handleImportData);

  let searchTimeout = null;
  const mainSearchInput = document.getElementById('input-search');
  const runMainSearchRender = () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      renderFilters();
      renderList();
      renderPromptMemos();
    }, 200);
  };
  bindSharedSearchComposition(mainSearchInput, runMainSearchRender);
  mainSearchInput.addEventListener('input', (e) => {
    if (isSharedSearchInputEventComposing(e)) return;
    clearTimeout(searchTimeout);
    setSharedSearchQuery(e.target.value || '', { render: false });
    
    // 200ms後に検索クエリの更新と画面の再描画を行う
    searchTimeout = setTimeout(() => {
      renderFilters();
      renderList();
      renderPromptMemos();
    }, 200);
  });

  document.getElementById('btn-search-clear').addEventListener('click', () => {
    clearTimeout(searchTimeout); // 実行待ちの検索処理をキャンセル
    setSharedSearchQuery('', { render: false });
    const input = document.getElementById('input-search');
    input.focus();
    renderFilters(); // タブの件数を初期状態に戻す
    renderList();
    renderPromptMemos();
  });

  // サイドパネルだけに置く「？」ヘルプ。最初は説明文を開き、そこから操作説明へ進む。
  document.getElementById('btn-help-open')?.addEventListener('click', () => openHelpModal('about'));
  document.getElementById('btn-help-close')?.addEventListener('click', closeHelpModal);
  document.getElementById('btn-help-guide-open')?.addEventListener('click', () => setHelpView('guide'));
  document.getElementById('btn-help-about-back')?.addEventListener('click', () => setHelpView('about'));
  document.getElementById('help-modal')?.addEventListener('click', (e) => {
    if (e.target?.id === 'help-modal') closeHelpModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('help-modal')?.classList.contains('open')) {
      e.preventDefault();
      closeHelpModal();
    }
  });

  const checkArchived = document.getElementById('check-show-archived');
  if (checkArchived) {
    checkArchived.addEventListener('change', async (e) => {
      showArchived = e.target.checked;
      const saved = await saveData(['showArchived']);
      if (!saved) return;
      renderFilters();
      renderList();
    });
  }

  const quickSettingsToggle = document.getElementById('btn-toggle-quick-settings');
  const quickSettingsPanel = document.getElementById('quick-settings-panel');
  if (quickSettingsToggle && quickSettingsPanel) {
    quickSettingsToggle.addEventListener('click', () => {
      const nextOpen = quickSettingsPanel.hidden;
      quickSettingsPanel.hidden = !nextOpen;
      quickSettingsToggle.setAttribute('aria-expanded', String(nextOpen));
      quickSettingsToggle.setAttribute('title', nextOpen ? '設定を閉じる' : '設定を開く');
      quickSettingsToggle.setAttribute('aria-label', nextOpen ? '設定を閉じる' : '設定を開く');
    });
  }

  const floatingSearchToggle = document.getElementById('check-floating-search-enabled');
  if (floatingSearchToggle) {
    floatingSearchToggle.addEventListener('change', async (e) => {
      floatingSearchEnabled = e.target.checked;
      await saveData(['floatingSearchEnabled']);
    });
  }
}


// --- サイドパネル専用ヘルプ ---
function setHelpView(view = 'about') {
  const aboutView = document.getElementById('help-about-view');
  const guideView = document.getElementById('help-guide-view');
  const title = document.getElementById('help-modal-title');
  const kicker = document.getElementById('help-modal-kicker');
  const isGuide = view === 'guide';
  const content = document.querySelector('#help-modal .help-modal-content');
  if (content) content.dataset.helpView = isGuide ? 'guide' : 'about';
  if (aboutView) aboutView.hidden = isGuide;
  if (guideView) guideView.hidden = !isGuide;
  if (title) title.textContent = isGuide ? '操作説明' : 'このアプリについて';
  if (kicker) kicker.textContent = isGuide ? '使い方' : 'この道具のこと';
  const activeView = isGuide ? guideView : aboutView;
  if (activeView) activeView.scrollTop = 0;
}

function openHelpModal(view = 'about') {
  const modal = document.getElementById('help-modal');
  if (!modal) return;
  setHelpView(view);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => document.getElementById('btn-help-close')?.focus(), 0);
}

function closeHelpModal() {
  const modal = document.getElementById('help-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.getElementById('btn-help-open')?.focus();
}


async function resolveSidePanelWindowId() {
  if (typeof sidePanelWindowId === 'number') return sidePanelWindowId;
  try {
    const currentWindow = await chrome.windows.getCurrent();
    if (currentWindow && typeof currentWindow.id === 'number') {
      sidePanelWindowId = currentWindow.id;
      return sidePanelWindowId;
    }
  } catch (_) {}
  try {
    const response = await sendRuntimeMessage({ type: 'quickLinksGetCurrentWindowId' });
    if (response?.ok && typeof response.windowId === 'number') {
      sidePanelWindowId = response.windowId;
      return sidePanelWindowId;
    }
  } catch (_) {}
  return null;
}

async function startSidePanelHeartbeat() {
  stopSidePanelHeartbeat(false);
  await resolveSidePanelWindowId();
  pushSidePanelHeartbeat();
  sidePanelHeartbeatTimer = window.setInterval(pushSidePanelHeartbeat, SIDE_PANEL_HEARTBEAT_INTERVAL_MS);
}

function stopSidePanelHeartbeat(clearWindowState = true) {
  if (sidePanelHeartbeatTimer) {
    window.clearInterval(sidePanelHeartbeatTimer);
    sidePanelHeartbeatTimer = null;
  }
  if (clearWindowState && typeof sidePanelWindowId === 'number') {
    try {
      void sendRuntimeMessage({
        type: 'quickLinksSidePanelHeartbeat',
        windowId: sidePanelWindowId,
        visible: false
      }).catch(() => {});
    } catch (_) {}
  }
}

function pushSidePanelHeartbeat() {
  if (typeof sidePanelWindowId !== 'number') return;
  try {
    void sendRuntimeMessage({
      type: 'quickLinksSidePanelHeartbeat',
      windowId: sidePanelWindowId,
      visible: true
    }).catch(error => {
      console.warn('Failed to update side panel heartbeat', error);
    });
  } catch (error) {
    console.warn('Failed to update side panel heartbeat', error);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

// --- 検索用の文字正規化関数 ---
function normalizeString(str) {
  if (!str) return '';
  let s = str.toLowerCase();
  s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(m) {
    return String.fromCharCode(m.charCodeAt(0) - 0xFEE0);
  });
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
  s = s.replace(reg, function(match) {
    return kanaMap[match];
  });
  s = s.replace(/ﾞ/g, '゛').replace(/ﾟ/g, '゜');
  s = s.replace(/[\u30A1-\u30F6]/g, function(match) {
    return String.fromCharCode(match.charCodeAt(0) - 0x0060);
  });
  return s;
}

// --- Reds検索機能 ---
function setupRedsSearchFeature() {
  const redsSearch = document.getElementById('reds-search');
  const redsDateStartInput = document.getElementById('reds-date-start');
  const redsDateEndInput = document.getElementById('reds-date-end');
  if (!redsSearch || !redsDateStartInput || !redsDateEndInput) return;

  redsSearch.value = sharedSearchQuery;
  redsDateStartInput.value = redsDateStart;
  redsDateEndInput.value = redsDateEnd;

  const runRedsSearchRender = () => {
    renderFilters();
    renderList();
    renderPromptMemos();
  };
  bindSharedSearchComposition(redsSearch, runRedsSearchRender);
  redsSearch.addEventListener('input', (e) => {
    if (isSharedSearchInputEventComposing(e)) return;
    setSharedSearchQuery(e.target.value || '', { render: false });
    runRedsSearchRender();
  });
  redsSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runRedsGoogleSearchSidepanel();
    }
  });
  redsDateStartInput.addEventListener('input', (e) => {
    redsDateStart = e.target.value || '';
  });
  redsDateEndInput.addEventListener('input', (e) => {
    redsDateEnd = e.target.value || '';
  });
  document.querySelectorAll('[data-reds-range]').forEach(btn => {
    btn.addEventListener('click', () => applyRedsQuickDateSidepanel(btn.getAttribute('data-reds-range')));
  });
  document.getElementById('reds-date-clear')?.addEventListener('click', () => {
    redsDateStart = '';
    redsDateEnd = '';
    redsDateStartInput.value = '';
    redsDateEndInput.value = '';
  });
  document.getElementById('reds-google')?.addEventListener('click', runRedsGoogleSearchSidepanel);
  document.getElementById('reds-x')?.addEventListener('click', runRedsXSearchSidepanel);
}

function formatDateInputValueSidepanel(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function applyRedsQuickDateSidepanel(rangeType) {
  const now = new Date();
  const start = new Date(now);
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  if (rangeType === 'today') {
    redsDateStart = formatDateInputValueSidepanel(now);
    redsDateEnd = formatDateInputValueSidepanel(now);
  } else if (rangeType === 'yesterday') {
    start.setDate(now.getDate() - 1);
    redsDateStart = formatDateInputValueSidepanel(start);
    redsDateEnd = formatDateInputValueSidepanel(start);
  } else if (rangeType === 'week') {
    start.setDate(now.getDate() - 7);
    redsDateStart = formatDateInputValueSidepanel(start);
    redsDateEnd = formatDateInputValueSidepanel(now);
  } else if (rangeType === 'month') {
    start.setDate(now.getDate() - 30);
    redsDateStart = formatDateInputValueSidepanel(start);
    redsDateEnd = formatDateInputValueSidepanel(now);
  } else if (rangeType === 'year') {
    redsDateStart = formatDateInputValueSidepanel(oneYearAgo);
    redsDateEnd = formatDateInputValueSidepanel(now);
  } else if (rangeType === 'older') {
    redsDateStart = '';
    redsDateEnd = formatDateInputValueSidepanel(oneYearAgo);
  }

  const startInput = document.getElementById('reds-date-start');
  const endInput = document.getElementById('reds-date-end');
  if (startInput) startInput.value = redsDateStart;
  if (endInput) endInput.value = redsDateEnd;
}

function addDaysToDateInputSidepanel(value, days = 1) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + days);
  return formatDateInputValueSidepanel(date);
}

function buildRedsGoogleUrlSidepanel() {
  const query = String(redsQuery || '').trim();
  if (!query) return '';
  let fullQuery = `${query} site:urawa-reds.co.jp`;
  if (redsDateStart) fullQuery += ` after:${redsDateStart}`;
  if (redsDateEnd) fullQuery += ` before:${addDaysToDateInputSidepanel(redsDateEnd, 1)}`;
  return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
}

function buildRedsXUrlSidepanel() {
  const Core = globalThis.QuickLinksRedsXSearchCore;

  if (Core?.buildXSearchUrl) {
    const accountInput = document.getElementById('reds-x-account');

    return Core.buildXSearchUrl({
      keyword: redsQuery,
      account: accountInput ? accountInput.value : Core.DEFAULT_X_ACCOUNT,
      start: redsDateStart,
      end: redsDateEnd
    });
  }

  // Keep the mature v1.15.6 behavior available only if the core has not loaded yet.
  const query = String(redsQuery || '').trim();
  if (!query) return '';
  let xQuery = `${query} from:REDSOFFICIAL`;
  if (redsDateStart) xQuery += ` since:${redsDateStart}`;
  if (redsDateEnd) xQuery += ` until:${addDaysToDateInputSidepanel(redsDateEnd, 1)}`;
  return `https://x.com/search?q=${encodeURIComponent(xQuery)}&f=live`;
}

async function openUrlFromSidepanel(url, options = {}) {
  if (!url) return false;
  try {
    const response = await sendRuntimeMessage({
      type: 'quickLinksOpenTab',
      url,
      active: options.active !== false,
      indexOffset: typeof options.indexOffset === 'number' ? options.indexOffset : 1
    });
    if (!response?.ok) throw new Error(response?.error || 'リンクを開けませんでした。');
    return true;
  } catch (error) {
    // バックグラウンド応答が途切れた場合も、サイドパネル自身のtabs権限で再試行する。
    const resolvedUrl = resolveQuickLinkLocallySidepanel(url);
    try {
      const parsed = new URL(resolvedUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('開けないURL形式です。');
      await chrome.tabs.create({ url: parsed.toString(), active: options.active !== false });
      console.info('[Quick Links] バックグラウンド経由で開けなかったため、サイドパネルから直接開きました。', error);
      return true;
    } catch (fallbackError) {
      console.warn('Failed to open link', error, fallbackError);
      alert('リンクを開けませんでした。URLを確認して、もう一度お試しください。');
      return false;
    }
  }
}

async function resolveLinkUrlFromSidepanel(url) {
  try {
    const response = await sendRuntimeMessage({
      type: 'quickLinksResolveUrl',
      url
    });
    if (!response?.ok || !response.url) throw new Error(response?.error || 'リンクを解決できませんでした。');
    return response.url;
  } catch (error) {
    const resolved = resolveQuickLinkLocallySidepanel(url);
    if (!resolved) throw error;
    return resolved;
  }
}

async function writeTextToClipboardSidepanel(text) {
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

async function copyLinkFromSidepanel(url, button) {
  if (!url || !button) return;
  const originalText = button.textContent;
  const originalTitle = button.title;
  button.disabled = true;
  try {
    const resolvedUrl = await resolveLinkUrlFromSidepanel(url);
    await writeTextToClipboardSidepanel(resolvedUrl);
    button.textContent = '✓';
    button.title = 'コピーしました';
    button.classList.add('copied');
    window.setTimeout(() => {
      if (!button.isConnected) return;
      button.textContent = originalText;
      button.title = originalTitle;
      button.classList.remove('copied');
      button.disabled = false;
    }, 1400);
  } catch (error) {
    console.warn('[Quick Links] リンクのコピーに失敗しました。', error);
    button.disabled = false;
    alert('リンクをコピーできませんでした。');
  }
}

function runRedsGoogleSearchSidepanel() {
  const url = buildRedsGoogleUrlSidepanel();
  if (!url) {
    document.getElementById('reds-search')?.focus();
    return;
  }
  openUrlFromSidepanel(url);
}

function runRedsXSearchSidepanel() {
  const url = buildRedsXUrlSidepanel();
  if (!url) {
    document.getElementById('reds-search')?.focus();
    return;
  }
  openUrlFromSidepanel(url, { active: true });
}


// --- プロンプトメモ機能 ---
function setupPromptMemoFeature() {
  const btnLinks = document.getElementById('mode-links');
  const btnReds = document.getElementById('mode-reds');
  const btnPrompts = document.getElementById('mode-prompts');
  const search = document.getElementById('prompt-search');
  const addBtn = document.getElementById('prompt-add-open');
  const modal = document.getElementById('prompt-modal');
  const titleInput = document.getElementById('prompt-title-edit');
  const categoryInput = document.getElementById('prompt-category-edit');
  const bodyInput = document.getElementById('prompt-body-edit');
  const sortSelect = document.getElementById('prompt-sort-mode');

  if (!btnLinks || !btnReds || !btnPrompts || !search || !addBtn || !modal || !titleInput || !categoryInput || !bodyInput) return;
  search.value = sharedSearchQuery;

  chrome.storage.local.get(['promptMemos', 'promptCategories', 'promptSortMode'], (result) => {
    promptMemos = Array.isArray(result.promptMemos) ? result.promptMemos.map(memo => QuickLinksAutoRules.createPromptMemo(memo, memo)).filter(result => result.ok).map(result => result.memo) : [];
    promptCategories = normalizePromptCategoriesSidepanel(result.promptCategories);
    promptSortMode = normalizePromptSortModeSidepanel(result.promptSortMode);
    storageSyncState.promptMemos = cloneStateValue(promptMemos);
    storageSyncState.promptCategories = cloneStateValue(promptCategories);
    storageSyncState.promptSortMode = promptSortMode;
    if (sortSelect) sortSelect.value = promptSortMode;
    renderPromptMemos();
  });

  btnLinks.addEventListener('click', () => setSidepanelMode('links'));
  btnReds.addEventListener('click', () => setSidepanelMode('reds'));
  btnPrompts.addEventListener('click', () => setSidepanelMode('prompts'));

  const runPromptSearchRender = () => {
    renderPromptMemos();
    renderFilters();
    renderList();
  };
  bindSharedSearchComposition(search, runPromptSearchRender);
  search.addEventListener('input', (e) => {
    if (isSharedSearchInputEventComposing(e)) return;
    setSharedSearchQuery(e.target.value || '', { render: false });
    runPromptSearchRender();
  });

  if (sortSelect) {
    sortSelect.addEventListener('change', async (e) => {
      promptSortMode = normalizePromptSortModeSidepanel(e.target.value);
      renderPromptMemos();
      const saved = await commitLocalState(['promptSortMode']);
      if (!saved) {
        e.target.value = promptSortMode;
        renderPromptMemos();
      }
    });
  }

  addBtn.addEventListener('click', () => openPromptMemoModal());
  document.getElementById('btn-close-prompt-modal')?.addEventListener('click', closePromptMemoModal);
  document.getElementById('btn-cancel-prompt-edit')?.addEventListener('click', closePromptMemoModal);
  document.getElementById('btn-save-prompt-edit')?.addEventListener('click', savePromptMemoFromModal);
  document.getElementById('prompt-category-manage-open')?.addEventListener('click', openPromptCategoryManageModalSidepanel);
  document.getElementById('btn-close-prompt-category-modal')?.addEventListener('click', closePromptCategoryManageModalSidepanel);
  document.getElementById('btn-cancel-prompt-category-modal')?.addEventListener('click', closePromptCategoryManageModalSidepanel);
  document.getElementById('btn-prompt-category-rename')?.addEventListener('click', renamePromptCategorySidepanel);
  document.getElementById('btn-prompt-category-merge')?.addEventListener('click', mergePromptCategorySidepanel);
  document.getElementById('btn-prompt-category-delete')?.addEventListener('click', deletePromptCategorySidepanel);
  document.getElementById('btn-prompt-category-cleanup')?.addEventListener('click', cleanupUnusedPromptCategoriesSidepanel);
  document.getElementById('prompt-category-source')?.addEventListener('input', (e) => {
    promptCategoryManageSelected = normalizePromptCategoryNameSidepanel(e.target.value);
    renderPromptCategoryManageModalSidepanel();
  });
  bodyInput.addEventListener('input', updatePromptCharCount);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePromptMemoModal();
  });
  const categoryModal = document.getElementById('prompt-category-modal');
  categoryModal?.addEventListener('click', (e) => {
    if (e.target === categoryModal) closePromptCategoryManageModalSidepanel();
  });
  [titleInput, categoryInput, bodyInput].forEach(el => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePromptMemoModal();
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        savePromptMemoFromModal();
      }
    });
  });


}

function setSidepanelMode(mode) {
  const body = document.body;
  const btnLinks = document.getElementById('mode-links');
  const btnReds = document.getElementById('mode-reds');
  const btnPrompts = document.getElementById('mode-prompts');
  const nextMode = mode === 'reds' || mode === 'prompts' ? mode : 'links';
  if (nextMode !== 'links') searchProjectFilterExpanded = false;
  sidePanelMode = nextMode;

  body.classList.remove('mode-links', 'mode-reds', 'mode-prompts');
  body.classList.add(`mode-${nextMode}`);
  btnLinks?.classList.toggle('active', nextMode === 'links');
  btnReds?.classList.toggle('active', nextMode === 'reds');
  btnPrompts?.classList.toggle('active', nextMode === 'prompts');
  syncSharedSearchInputs();

  if (nextMode === 'prompts') {
    document.getElementById('prompt-search')?.focus();
  } else if (nextMode === 'reds') {
    document.getElementById('reds-search')?.focus();
  } else {
    document.getElementById('input-search')?.focus();
  }
}


const runtimeForSidepanelMessages = getRuntimeApi();
if (runtimeForSidepanelMessages?.onMessage) {
  runtimeForSidepanelMessages.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'quickLinksSidepanelShortcut') return;
  if (typeof message.windowId === 'number' && typeof sidePanelWindowId === 'number' && message.windowId !== sidePanelWindowId) return;
  const modeByAction = {
    'open-links': 'links',
    'open-reds': 'reds',
    'open-prompts': 'prompts'
  };
  const nextMode = modeByAction[message.action];
  if (nextMode) {
    setSidepanelMode(nextMode);
    sendResponse?.({ ok: true });
    return false;
  }
  if (message.action === 'search-site' || message.action === 'search-x') {
    setSidepanelMode('reds');
    window.setTimeout(() => {
      if (message.action === 'search-x') runRedsXSearchSidepanel();
      else runRedsGoogleSearchSidepanel();
    }, 0);
    sendResponse?.({ ok: true });
    return false;
  }
  if (message.action === 'clear-search') {
    clearAndFocusSidepanelSearch();
    sendResponse?.({ ok: true });
    return false;
  }
  if (message.action === 'focus-search-project-filter') {
    const ok = focusSearchProjectFilterSidepanel();
    sendResponse?.({ ok });
    return false;
  }
  if (message.action === 'cycle-sort') {
    cycleLinkSortModeSidepanel()
      .then(() => sendResponse?.({ ok: true, currentSortMode }))
      .catch(error => sendResponse?.({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  });
}


function getPromptMemoCategorySidepanel(memo) {
  return String(memo?.categoryName || memo?.projectName || '未分類').trim() || '未分類';
}

function categoryInputValueSidepanel(name) {
  const value = String(name || '').trim();
  return value && value !== '未分類' ? value : '';
}

function normalizePromptCategoriesSidepanel(value) {
  const base = Array.isArray(value) ? value : [];
  const merged = ['未分類', ...base, ...((promptMemos || []).map(m => getPromptMemoCategorySidepanel(m)))];
  return Array.from(new Set(merged.map(v => String(v || '').trim()).filter(Boolean)));
}

function getPromptCategoriesSidepanel() {
  return normalizePromptCategoriesSidepanel(promptCategories);
}

function addPromptCategorySidepanel(name) {
  const categoryName = String(name || '').trim() || '未分類';
  return normalizePromptCategoriesSidepanel([...promptCategories, categoryName]);
}

function normalizePromptCategoryNameSidepanel(name) {
  return String(name || '').trim() || '未分類';
}

function getPromptCategoryCountsSidepanel() {
  const counts = {};
  getPromptCategoriesSidepanel().forEach(category => { counts[category] = 0; });
  (promptMemos || []).forEach(memo => {
    const category = getPromptMemoCategorySidepanel(memo);
    counts[category] = (counts[category] || 0) + 1;
  });
  return counts;
}

function renderPromptCategoryManageModalSidepanel() {
  const modal = document.getElementById('prompt-category-modal');
  const listEl = document.getElementById('prompt-category-manage-list');
  const sourceInput = document.getElementById('prompt-category-source');
  const datalist = document.getElementById('prompt-category-manage-datalist');
  if (!modal || !listEl || !sourceInput || !datalist) return;

  const categories = getPromptCategoriesSidepanel();
  const counts = getPromptCategoryCountsSidepanel();
  const selected = normalizePromptCategoryNameSidepanel(sourceInput.value || promptCategoryManageSelected || (promptCategoryFilter !== 'ALL' ? promptCategoryFilter : '未分類'));
  promptCategoryManageSelected = selected;
  if (sourceInput.value !== '' && sourceInput.value !== selected) sourceInput.value = selected === '未分類' ? '' : selected;

  datalist.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
  listEl.innerHTML = categories.map(category => `
    <button class="prompt-category-manage-item ${selected === category ? 'active' : ''}" type="button" data-prompt-manage-category="${escapeHtml(category)}">
      <span class="prompt-category-manage-name">${escapeHtml(category)}</span>
      <span class="prompt-category-manage-count">${Number(counts[category] || 0).toLocaleString()}件</span>
    </button>
  `).join('');

  listEl.querySelectorAll('[data-prompt-manage-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = normalizePromptCategoryNameSidepanel(btn.getAttribute('data-prompt-manage-category'));
      promptCategoryManageSelected = category;
      sourceInput.value = category === '未分類' ? '' : category;
      renderPromptCategoryManageModalSidepanel();
    });
  });
}

function openPromptCategoryManageModalSidepanel() {
  const sourceInput = document.getElementById('prompt-category-source');
  const targetInput = document.getElementById('prompt-category-target');
  promptCategoryManageSelected = promptCategoryFilter !== 'ALL' ? promptCategoryFilter : '未分類';
  if (sourceInput) sourceInput.value = promptCategoryManageSelected === '未分類' ? '' : promptCategoryManageSelected;
  if (targetInput) targetInput.value = '';
  renderPromptCategoryManageModalSidepanel();
  document.getElementById('prompt-category-modal')?.classList.add('open');
  setTimeout(() => document.getElementById('prompt-category-source')?.focus(), 0);
}

function closePromptCategoryManageModalSidepanel() {
  document.getElementById('prompt-category-modal')?.classList.remove('open');
}

function getPromptCategoryManageValuesSidepanel(requireTarget = true) {
  const rawTarget = String(document.getElementById('prompt-category-target')?.value || '').trim();
  const source = normalizePromptCategoryNameSidepanel(document.getElementById('prompt-category-source')?.value || promptCategoryManageSelected);
  const target = normalizePromptCategoryNameSidepanel(rawTarget);
  if (!source || source === 'ALL') {
    alert('整理する分類を選んでください。');
    return null;
  }
  if (source === '未分類') {
    alert('「未分類」は削除・名称変更・統合元にできません。');
    return null;
  }
  if (!getPromptCategoriesSidepanel().includes(source)) {
    alert('指定した分類が見つかりません。');
    return null;
  }
  if (requireTarget && (!rawTarget || target === 'ALL')) {
    alert('変更先・統合先を入力してください。');
    return null;
  }
  if (requireTarget && source === target) {
    alert('同じ分類名です。変更先・統合先に別の名前を入力してください。');
    return null;
  }
  return { source, target };
}

async function applyPromptCategoryMoveSidepanel(source, target) {
  const now = new Date().toISOString();
  const nextMemos = (promptMemos || []).map(memo => getPromptMemoCategorySidepanel(memo) === source ? {
    ...memo,
    categoryName: target,
    updatedAt: memo.updatedAt || now
  } : memo);
  const nextCategories = normalizePromptCategoriesSidepanel([
    ...promptCategories.filter(category => category !== source),
    target
  ]);
  promptMemos = nextMemos;
  promptCategories = nextCategories;
  if (promptCategoryFilter === source) promptCategoryFilter = target;
  promptMemos = nextMemos; promptCategories = nextCategories;
  const saved = await savePromptData(['promptMemos', 'promptCategories']);
  if (!saved) return;
  updatePromptCategoryDatalistSidepanel();
  renderPromptCategoryFiltersSidepanel();
  renderPromptMemos();
  renderPromptCategoryManageModalSidepanel();
}

async function renamePromptCategorySidepanel() {
  const values = getPromptCategoryManageValuesSidepanel(true);
  if (!values) return;
  const { source, target } = values;
  const targetExists = getPromptCategoriesSidepanel().includes(target);
  if (targetExists && !confirm(`「${source}」を既存分類「${target}」へ統合しますか？`)) return;
  await applyPromptCategoryMoveSidepanel(source, target);
  const targetInput = document.getElementById('prompt-category-target');
  if (targetInput) targetInput.value = '';
  promptCategoryManageSelected = target;
}

async function mergePromptCategorySidepanel() {
  const values = getPromptCategoryManageValuesSidepanel(true);
  if (!values) return;
  const { source, target } = values;
  const count = (promptMemos || []).filter(memo => getPromptMemoCategorySidepanel(memo) === source).length;
  if (!confirm(`「${source}」の${count}件を「${target}」へ統合しますか？`)) return;
  await applyPromptCategoryMoveSidepanel(source, target);
  const targetInput = document.getElementById('prompt-category-target');
  if (targetInput) targetInput.value = '';
  promptCategoryManageSelected = target;
}

async function deletePromptCategorySidepanel() {
  const values = getPromptCategoryManageValuesSidepanel(false);
  if (!values) return;
  const source = values.source;
  const count = (promptMemos || []).filter(memo => getPromptMemoCategorySidepanel(memo) === source).length;
  if (!confirm(`分類「${source}」を削除しますか？\n中のプロンプト${count}件は「未分類」へ移動します。`)) return;
  const now = new Date().toISOString();
  const nextMemos = (promptMemos || []).map(memo => getPromptMemoCategorySidepanel(memo) === source ? {
    ...memo,
    categoryName: '未分類',
    updatedAt: memo.updatedAt || now
  } : memo);
  const nextCategories = normalizePromptCategoriesSidepanel(promptCategories.filter(category => category !== source));
  promptMemos = nextMemos;
  promptCategories = nextCategories;
  if (promptCategoryFilter === source) promptCategoryFilter = '未分類';
  promptMemos = nextMemos; promptCategories = nextCategories;
  const saved = await savePromptData(['promptMemos', 'promptCategories']);
  if (!saved) return;
  const sourceInput = document.getElementById('prompt-category-source');
  const targetInput = document.getElementById('prompt-category-target');
  if (sourceInput) sourceInput.value = '';
  if (targetInput) targetInput.value = '';
  promptCategoryManageSelected = '未分類';
  updatePromptCategoryDatalistSidepanel();
  renderPromptMemos();
  renderPromptCategoryManageModalSidepanel();
}

async function cleanupUnusedPromptCategoriesSidepanel() {
  const counts = getPromptCategoryCountsSidepanel();
  const before = getPromptCategoriesSidepanel();
  const nextCategories = normalizePromptCategoriesSidepanel(before.filter(category => category === '未分類' || Number(counts[category] || 0) > 0));
  if (nextCategories.length === before.length) {
    alert('未使用の分類はありません。');
    return;
  }
  promptCategories = nextCategories;
  if (!nextCategories.includes(promptCategoryFilter)) promptCategoryFilter = 'ALL';
  promptCategories = nextCategories;
  const saved = await savePromptData(['promptCategories']);
  if (!saved) return;
  updatePromptCategoryDatalistSidepanel();
  renderPromptMemos();
  renderPromptCategoryManageModalSidepanel();
}

const PROMPT_CATEGORY_PALETTE_SIDEPANEL = [
  { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', cardBg: '#f8fbff', cardBorder: '#bfdbfe' },
  { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca', cardBg: '#fff7f7', cardBorder: '#fecaca' },
  { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', cardBg: '#f8fff9', cardBorder: '#bbf7d0' },
  { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe', cardBg: '#fbfaff', cardBorder: '#ddd6fe' },
  { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc', cardBg: '#f6feff', cardBorder: '#a5f3fc' },
  { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', cardBg: '#fffaf5', cardBorder: '#fed7aa' },
  { bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8', cardBg: '#fff8fb', cardBorder: '#fbcfe8' },
  { bg: '#fefce8', text: '#854d0e', border: '#fde68a', cardBg: '#fffdf2', cardBorder: '#fde68a' }
];

function hashPromptCategoryNameSidepanel(name) {
  const str = String(name || '未分類');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getPromptCategoryColorSidepanel(name) {
  const categoryName = String(name || '未分類').trim() || '未分類';
  if (categoryName === '未分類') {
    return { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb', cardBg: '#ffffff', cardBorder: '#e5e7eb' };
  }
  return PROMPT_CATEGORY_PALETTE_SIDEPANEL[hashPromptCategoryNameSidepanel(categoryName) % PROMPT_CATEGORY_PALETTE_SIDEPANEL.length];
}

function promptCategoryButtonStyleSidepanel(categoryName, active) {
  const colors = getPromptCategoryColorSidepanel(categoryName);
  if (active) {
    return `background:${colors.text};color:white;border-color:${colors.text};box-shadow:0 2px 7px rgba(15,23,42,0.12);`;
  }
  return `background:${colors.bg};color:${colors.text};border-color:${colors.border};`;
}

function promptCategoryBadgeStyleSidepanel(categoryName) {
  const colors = getPromptCategoryColorSidepanel(categoryName);
  return `background:${colors.bg};color:${colors.text};border-color:${colors.border};`;
}

function promptCategoryCardStyleSidepanel(categoryName) {
  const colors = getPromptCategoryColorSidepanel(categoryName);
  return `background:${colors.cardBg};border-color:${colors.cardBorder};`;
}

function renderPromptCategoryFiltersSidepanel() {
  const filterEl = document.getElementById('prompt-category-filter');
  if (!filterEl) return;
  const categories = getPromptCategoriesSidepanel();
  const total = (promptMemos || []).length;
  const buttons = [`<button class="prompt-category-btn ${promptCategoryFilter === 'ALL' ? 'active' : ''}" style="${promptCategoryButtonStyleSidepanel('すべて', promptCategoryFilter === 'ALL')}" data-prompt-category="ALL">すべて (${total})</button>`];
  categories.forEach(category => {
    const count = (promptMemos || []).filter(memo => getPromptMemoCategorySidepanel(memo) === category).length;
    buttons.push(`<button class="prompt-category-btn ${promptCategoryFilter === category ? 'active' : ''}" style="${promptCategoryButtonStyleSidepanel(category, promptCategoryFilter === category)}" data-prompt-category="${escapeHtml(category)}">${escapeHtml(category)} (${count})</button>`);
  });
  filterEl.innerHTML = buttons.join('');
  filterEl.querySelectorAll('[data-prompt-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      promptCategoryFilter = btn.getAttribute('data-prompt-category') || 'ALL';
      renderPromptMemos();
    });
  });
}

function updatePromptCategoryDatalistSidepanel() {
  const datalist = document.getElementById('prompt-category-list');
  if (!datalist) return;
  datalist.innerHTML = getPromptCategoriesSidepanel().map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
}

function normalizePromptSortModeSidepanel(value) {
  return value === 'ADDED' ? 'ADDED' : 'POPULAR';
}

function getPromptMemoAddedTimeSidepanel(memo) {
  const raw = memo?.createdAt || memo?.addedAt || memo?.updatedAt || '';
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getPromptMemoUpdatedTimeSidepanel(memo) {
  const raw = memo?.updatedAt || memo?.createdAt || memo?.addedAt || '';
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getFilteredPromptMemosForSidepanel() {
  const q = normalizeString(promptSearchQuery || '');
  let list = Array.isArray(promptMemos) ? [...promptMemos] : [];
  if (promptCategoryFilter !== 'ALL') {
    list = list.filter(memo => getPromptMemoCategorySidepanel(memo) === promptCategoryFilter);
  }
  if (q) {
    list = list.filter(memo =>
      normalizeString(memo.title || '').includes(q) ||
      normalizeString(memo.body || '').includes(q) ||
      normalizeString(getPromptMemoCategorySidepanel(memo)).includes(q)
    );
  }
  return list.sort((a, b) => {
    if (promptSortMode === 'ADDED') {
      const addedDiff = getPromptMemoAddedTimeSidepanel(b) - getPromptMemoAddedTimeSidepanel(a);
      if (addedDiff !== 0) return addedDiff;
      return String(b.id || '').localeCompare(String(a.id || ''));
    }
    const useDiff = Number(b.copyCount || 0) - Number(a.copyCount || 0);
    if (useDiff !== 0) return useDiff;
    const updatedDiff = getPromptMemoUpdatedTimeSidepanel(b) - getPromptMemoUpdatedTimeSidepanel(a);
    if (updatedDiff !== 0) return updatedDiff;
    return getPromptMemoAddedTimeSidepanel(b) - getPromptMemoAddedTimeSidepanel(a);
  });
}

function renderPromptMemos() {
  const listEl = document.getElementById('prompt-list');
  const countEl = document.getElementById('prompt-count');
  if (!listEl || !countEl) return;
  renderPromptCategoryFiltersSidepanel();
  if (document.getElementById('prompt-category-modal')?.classList.contains('open')) {
    renderPromptCategoryManageModalSidepanel();
  }
  const list = getFilteredPromptMemosForSidepanel();
  countEl.textContent = `${list.length}件 / 全${promptMemos.length}件`;
  if (list.length === 0) {
    listEl.innerHTML = `<div class="prompt-empty">${promptSearchQuery ? '一致するプロンプトがありません' : 'プロンプトメモがありません'}</div>`;
    return;
  }
  listEl.innerHTML = list.map(memo => {
    const body = String(memo.body || '');
    const preview = body.length > 260 ? body.slice(0, 260) + '…' : body;
    const categoryName = getPromptMemoCategorySidepanel(memo);
    const copied = promptCopyFeedbackId === memo.id;
    return `
      <div class="prompt-card${copied ? ' copied' : ''}" style="${promptCategoryCardStyleSidepanel(categoryName)}">
        <div class="prompt-badge" style="${promptCategoryBadgeStyleSidepanel(categoryName)}">${escapeHtml(categoryName)}</div>
        <div class="prompt-card-title">${escapeHtml(memo.title || '無題のプロンプト')}</div>
        <div class="prompt-card-body">${escapeHtml(preview || '本文なし')}</div>
        <div class="prompt-card-meta">
          <span>${body.length.toLocaleString()}文字</span>
          <span>コピー ${Number(memo.copyCount || 0).toLocaleString()}回</span>
        </div>
        <div class="prompt-card-actions">
          <button class="prompt-mini-btn primary${copied ? ' copied' : ''}" data-prompt-copy="${escapeHtml(memo.id)}">${copied ? 'コピー済み' : 'コピー'}</button>
          <button class="prompt-mini-btn" data-prompt-edit="${escapeHtml(memo.id)}">編集</button>
          <button class="prompt-mini-btn danger" data-prompt-delete="${escapeHtml(memo.id)}">削除</button>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('[data-prompt-copy]').forEach(btn => {
    btn.addEventListener('click', () => copyPromptMemoSidepanel(btn.getAttribute('data-prompt-copy')));
  });
  listEl.querySelectorAll('[data-prompt-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const memo = promptMemos.find(m => m.id === btn.getAttribute('data-prompt-edit'));
      if (memo) openPromptMemoModal(memo);
    });
  });
  listEl.querySelectorAll('[data-prompt-delete]').forEach(btn => {
    btn.addEventListener('click', () => deletePromptMemoSidepanel(btn.getAttribute('data-prompt-delete')));
  });
}

function openPromptMemoModal(memo = null) {
  editingPromptMemoId = memo?.id || null;
  document.getElementById('prompt-title-edit').value = memo?.title || '';
  document.getElementById('prompt-category-edit').value = categoryInputValueSidepanel(memo ? getPromptMemoCategorySidepanel(memo) : (promptCategoryFilter !== 'ALL' ? promptCategoryFilter : '未分類'));
  updatePromptCategoryDatalistSidepanel();
  document.getElementById('prompt-body-edit').value = memo?.body || '';
  updatePromptCharCount();
  document.getElementById('prompt-modal').classList.add('open');
  setTimeout(() => document.getElementById('prompt-title-edit')?.focus(), 0);
}

function closePromptMemoModal() {
  editingPromptMemoId = null;
  document.getElementById('prompt-modal').classList.remove('open');
}

function updatePromptCharCount() {
  const body = document.getElementById('prompt-body-edit')?.value || '';
  const count = document.getElementById('prompt-char-count');
  if (count) count.textContent = `${body.length.toLocaleString()}文字`;
}

async function savePromptMemoFromModal() {
  if (promptSaveInFlight) return;
  const title = document.getElementById('prompt-title-edit')?.value.trim() || '';
  const categoryName = document.getElementById('prompt-category-edit')?.value.trim() || '未分類';
  const body = document.getElementById('prompt-body-edit')?.value || '';
  const existing = editingPromptMemoId ? promptMemos.find(memo => memo.id === editingPromptMemoId) : null;
  const built = QuickLinksAutoRules.createPromptMemo({ title, categoryName, body }, existing);
  if (!built.ok) { alert(built.error); return; }

  promptSaveInFlight = true;
  const saveButton = document.getElementById('btn-save-prompt-edit');
  if (saveButton) saveButton.disabled = true;
  try {
    const next = existing
      ? promptMemos.map(memo => memo.id === editingPromptMemoId ? built.memo : memo)
      : [built.memo, ...promptMemos];
    const nextPromptCategories = addPromptCategorySidepanel(categoryName);
    promptMemos = next;
    promptCategories = nextPromptCategories;
    const saved = await commitLocalState(['promptMemos', 'promptCategories']);
    if (!saved) return;
    closePromptMemoModal();
    renderPromptMemos();
  } finally {
    promptSaveInFlight = false;
    if (saveButton) saveButton.disabled = false;
  }
}

function showPromptCopyFeedbackSidepanel(id) {
  promptCopyFeedbackId = id;
  if (promptCopyFeedbackTimer) clearTimeout(promptCopyFeedbackTimer);
  renderPromptMemos();
  promptCopyFeedbackTimer = setTimeout(() => {
    if (promptCopyFeedbackId === id) {
      promptCopyFeedbackId = null;
      renderPromptMemos();
    }
  }, 1300);
}

async function copyPromptMemoSidepanel(id) {
  const memo = promptMemos.find(m => m.id === id);
  if (!memo) return;
  const text = memo.body || '';
  if (!text) {
    alert('コピーする本文がありません。');
    return;
  }

  // 押した瞬間にコピー回数と見た目を先に更新する。
  const now = new Date().toISOString();
  const next = promptMemos.map(m => m.id === id ? {
    ...m,
    copyCount: Number(m.copyCount || 0) + 1,
    lastCopiedAt: now,
    updatedAt: m.updatedAt || now
  } : m);
  promptMemos = next;
  showPromptCopyFeedbackSidepanel(id);

  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
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
    console.warn('Failed to record prompt copy', error);
  }
}

async function deletePromptMemoSidepanel(id) {
  const memo = promptMemos.find(m => m.id === id);
  if (!memo) return;
  if (!confirm(`プロンプトメモ「${memo.title || '無題'}」を削除しますか？`)) return;
  const next = promptMemos.filter(m => m.id !== id);
  promptMemos = next;
  const saved = await savePromptData(['promptMemos']);
  if (!saved) return;
  renderPromptMemos();
}
