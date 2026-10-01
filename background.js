// background.js
importScripts('auto-project-rules.js');

const APP_CONTRACT = globalThis.QuickLinksContract;
if (!APP_CONTRACT) throw new Error('QuickLinksContract is required before background.js');



// --- URL自動分類ルール ---
const AUTO_RULES_API = globalThis.QuickLinksAutoRules;
const LINEWORKS_TALK_RULE_MIGRATION_KEY = 'quickLinksAutoRuleLineworksTalkV1';
const LINEWORKS_TALK_RULE = Object.freeze({
  id: 'rule-lineworks-talk',
  keyword: 'talk.worksmobile.com',
  projectName: 'LINEWORKS',
  matchType: 'contains',
  caseSensitive: false,
  enabled: true
});

// --- ストレージ更新の直列化・競合回避 ---
let storageMutationQueue = Promise.resolve();

function enqueueStorageMutation(task) {
  const run = storageMutationQueue.then(task, task);
  storageMutationQueue = run.catch(() => {});
  return run;
}

function cloneStorageValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function storageValuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeRecordArray(remoteValue, baseValue, currentValue) {
  const remote = Array.isArray(remoteValue) ? remoteValue : [];
  const base = Array.isArray(baseValue) ? baseValue : [];
  const current = Array.isArray(currentValue) ? currentValue : [];
  const getId = (record, index) => String(record?.id || `__index_${index}`);
  const baseMap = new Map(base.map((record, index) => [getId(record, index), record]));
  const currentMap = new Map(current.map((record, index) => [getId(record, index), record]));
  const remoteMap = new Map(remote.map((record, index) => [getId(record, index), cloneStorageValue(record)]));
  const counterFields = new Set(['clickCount', 'copyCount']);

  // Local deletion wins. This also prevents stale editors from resurrecting a record.
  for (const id of baseMap.keys()) {
    if (!currentMap.has(id)) remoteMap.delete(id);
  }

  for (const [id, currentRecord] of currentMap) {
    const baseRecord = baseMap.get(id);
    const remoteRecord = remoteMap.get(id);

    if (!baseMap.has(id)) {
      // A newly-created local record. Keep an already-created remote record with the
      // same id, but merge the incoming fields instead of dropping either side.
      remoteMap.set(id, { ...(remoteRecord || {}), ...cloneStorageValue(currentRecord) });
      continue;
    }

    // The record was deleted by another view after this view loaded it. Deletion wins.
    if (!remoteMap.has(id)) continue;
    if (storageValuesEqual(baseRecord, currentRecord)) continue;

    const merged = { ...remoteRecord };
    const keys = new Set([...Object.keys(baseRecord || {}), ...Object.keys(currentRecord || {})]);
    for (const key of keys) {
      const baseField = baseRecord?.[key];
      const currentHasKey = Object.prototype.hasOwnProperty.call(currentRecord || {}, key);
      const currentField = currentRecord?.[key];
      if (currentHasKey && storageValuesEqual(baseField, currentField)) continue;
      if (!currentHasKey && Object.prototype.hasOwnProperty.call(baseRecord || {}, key)) {
        if (storageValuesEqual(remoteRecord?.[key], baseField)) delete merged[key];
        continue;
      }
      if (counterFields.has(key)) {
        const delta = Number(currentField || 0) - Number(baseField || 0);
        merged[key] = Math.max(0, Number(remoteRecord?.[key] || 0) + delta);
      } else if (key === 'updatedAt') {
        const remoteTime = Date.parse(remoteRecord?.updatedAt || '') || 0;
        const currentTime = Date.parse(currentField || '') || 0;
        merged.updatedAt = new Date(Math.max(remoteTime, currentTime, Date.now())).toISOString();
      } else {
        merged[key] = cloneStorageValue(currentField);
      }
    }
    remoteMap.set(id, merged);
  }

  const result = [];
  const used = new Set();
  current.forEach((record, index) => {
    const id = getId(record, index);
    if (!remoteMap.has(id) || used.has(id)) return;
    result.push(remoteMap.get(id));
    used.add(id);
  });
  remote.forEach((record, index) => {
    const id = getId(record, index);
    if (!remoteMap.has(id) || used.has(id)) return;
    result.push(remoteMap.get(id));
    used.add(id);
  });
  for (const [id, record] of remoteMap) {
    if (used.has(id)) continue;
    result.push(record);
  }
  return result;
}

function mergeStringArray(remoteValue, baseValue, currentValue) {
  const remote = Array.isArray(remoteValue) ? remoteValue.map(String) : [];
  const base = new Set(Array.isArray(baseValue) ? baseValue.map(String) : []);
  const current = Array.isArray(currentValue) ? currentValue.map(String) : [];
  const currentSet = new Set(current);
  const removed = new Set([...base].filter(value => !currentSet.has(value)));
  const result = current.filter((value, index) => current.indexOf(value) === index);
  remote.forEach(value => {
    if (!removed.has(value) && !result.includes(value)) result.push(value);
  });
  return result;
}

function mergeObjectValue(remoteValue, baseValue, currentValue) {
  const remote = remoteValue && typeof remoteValue === 'object' && !Array.isArray(remoteValue)
    ? { ...remoteValue }
    : {};
  const base = baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue)
    ? baseValue
    : {};
  const current = currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
    ? currentValue
    : {};

  Object.keys(base).forEach(key => {
    if (!(key in current)) delete remote[key];
  });
  Object.entries(current).forEach(([key, value]) => {
    if (!(key in base) || !storageValuesEqual(base[key], value)) remote[key] = cloneStorageValue(value);
  });
  return remote;
}

async function commitStorageState(payload = {}) {
  const base = payload.base && typeof payload.base === 'object' ? payload.base : {};
  const current = payload.current && typeof payload.current === 'object' ? payload.current : {};
  const replaceKeys = new Set(Array.isArray(payload.replaceKeys) ? payload.replaceKeys : []);
  const keys = Object.keys(current);
  if (!keys.length) return {};

  return enqueueStorageMutation(async () => {
    const readKeys = new Set(keys);
    if (readKeys.has('items') || readKeys.has(AUTO_RULES_API.STORAGE_KEY)) readKeys.add('projects');
    if (readKeys.has('promptMemos')) readKeys.add('promptCategories');
    const stored = await chrome.storage.local.get([...readKeys]);
    const updates = {};
    const incomingSearchState = current.sharedSearchState;
    const storedSearchState = stored.sharedSearchState;
    const acceptIncomingSearch = !incomingSearchState
      || Number(incomingSearchState.updatedAt || 0) >= Number(storedSearchState?.updatedAt || 0);

    keys.forEach(key => {
      const next = current[key];
      if ((key === 'sharedSearchState' || key === 'sharedSearchQuery') && !acceptIncomingSearch) {
        updates[key] = cloneStorageValue(stored[key]);
      } else if (replaceKeys.has(key)) {
        updates[key] = cloneStorageValue(next);
      } else if (['items', 'promptMemos', AUTO_RULES_API.STORAGE_KEY].includes(key)) {
        updates[key] = mergeRecordArray(stored[key], base[key], next);
      } else if (['projects', 'promptCategories'].includes(key)) {
        updates[key] = mergeStringArray(stored[key], base[key], next);
      } else if (key === 'projectColors') {
        updates[key] = mergeObjectValue(stored[key], base[key], next);
      } else {
        updates[key] = cloneStorageValue(next);
      }
    });

    if (keys.includes('items') || keys.includes('projects') || keys.includes(AUTO_RULES_API.STORAGE_KEY)) {
      const finalItems = Array.isArray(updates.items) ? updates.items : (Array.isArray(stored.items) ? stored.items : []);
      const finalRules = Array.isArray(updates[AUTO_RULES_API.STORAGE_KEY])
        ? updates[AUTO_RULES_API.STORAGE_KEY]
        : (Array.isArray(stored[AUTO_RULES_API.STORAGE_KEY]) ? stored[AUTO_RULES_API.STORAGE_KEY] : []);
      const finalProjects = Array.isArray(updates.projects) ? updates.projects : (Array.isArray(stored.projects) ? [...stored.projects] : []);
      const requiredProjects = ['未分類', ...finalItems.map(item => item?.projectName || '未分類'), ...finalRules.map(rule => rule?.projectName).filter(Boolean)];
      requiredProjects.forEach(name => {
        const normalized = String(name || '未分類').trim() || '未分類';
        if (!finalProjects.includes(normalized)) finalProjects.push(normalized);
      });
      if (!storageValuesEqual(finalProjects, stored.projects)) updates.projects = finalProjects;
    }

    if (keys.includes('promptMemos') || keys.includes('promptCategories')) {
      const finalMemos = Array.isArray(updates.promptMemos) ? updates.promptMemos : (Array.isArray(stored.promptMemos) ? stored.promptMemos : []);
      const finalCategories = Array.isArray(updates.promptCategories) ? updates.promptCategories : (Array.isArray(stored.promptCategories) ? [...stored.promptCategories] : []);
      ['未分類', ...finalMemos.map(memo => memo?.categoryName || memo?.projectName || '未分類')].forEach(name => {
        const normalized = String(name || '未分類').trim() || '未分類';
        if (!finalCategories.includes(normalized)) finalCategories.push(normalized);
      });
      if (!storageValuesEqual(finalCategories, stored.promptCategories)) updates.promptCategories = finalCategories;
    }

    if (Array.isArray(updates.items)) {
      updates.items = updates.items
        .map((item, index) => AUTO_RULES_API.normalizeQuickLinkItem(item, index))
        .filter(Boolean);
    }
    if (Array.isArray(updates.promptMemos)) {
      updates.promptMemos = updates.promptMemos
        .map(memo => AUTO_RULES_API.createPromptMemo(memo, memo))
        .filter(result => result.ok)
        .map(result => result.memo);
    }

    await chrome.storage.local.set(updates);
    return updates;
  });
}


async function recordItemClickAtomic(id) {
  const targetId = String(id || '');
  if (!targetId) throw new Error('リンクIDがありません。');
  return enqueueStorageMutation(async () => {
    const data = await chrome.storage.local.get(['items']);
    const currentItems = Array.isArray(data.items) ? data.items : [];
    const index = currentItems.findIndex(item => String(item?.id || '') === targetId);
    if (index < 0) throw new Error('対象リンクが見つかりません。');
    const now = new Date().toISOString();
    const normalized = AUTO_RULES_API.normalizeQuickLinkItem(currentItems[index], index);
    const nextItem = {
      ...normalized,
      archived: false,
      lastClickedAt: now,
      updatedAt: now,
      clickCount: Math.max(0, Number(normalized?.clickCount || 0)) + 1
    };
    const nextItems = [...currentItems];
    nextItems[index] = nextItem;
    await chrome.storage.local.set({ items: nextItems });
    return { item: nextItem, items: nextItems };
  });
}

async function recordPromptCopyAtomic(id) {
  const targetId = String(id || '');
  if (!targetId) throw new Error('プロンプトIDがありません。');
  return enqueueStorageMutation(async () => {
    const data = await chrome.storage.local.get(['promptMemos']);
    const currentMemos = Array.isArray(data.promptMemos) ? data.promptMemos : [];
    const index = currentMemos.findIndex(memo => String(memo?.id || '') === targetId);
    if (index < 0) throw new Error('対象プロンプトが見つかりません。');
    const now = new Date().toISOString();
    const built = AUTO_RULES_API.createPromptMemo({
      ...currentMemos[index],
      copyCount: Math.max(0, Number(currentMemos[index]?.copyCount || 0)) + 1,
      lastCopiedAt: now,
      updatedAt: now
    }, currentMemos[index]);
    if (!built.ok) throw new Error(built.error || 'プロンプトを更新できませんでした。');
    const nextMemos = [...currentMemos];
    nextMemos[index] = built.memo;
    await chrome.storage.local.set({ promptMemos: nextMemos });
    return { memo: built.memo, promptMemos: nextMemos };
  });
}

function canonicalizeComparableUrl(value) {
  return AUTO_RULES_API.canonicalizeComparableUrl(value);
}

async function ensureAutoProjectRules() {
  const data = await chrome.storage.local.get([
    AUTO_RULES_API.STORAGE_KEY,
    'projects',
    LINEWORKS_TALK_RULE_MIGRATION_KEY
  ]);
  const hasStoredRules = Array.isArray(data[AUTO_RULES_API.STORAGE_KEY]);
  let rules = hasStoredRules
    ? AUTO_RULES_API.normalizeRules(data[AUTO_RULES_API.STORAGE_KEY])
    : await AUTO_RULES_API.loadDefaultRules();

  // v1.12.22: LINE WORKSの現行Talk画面は talk.worksmobile.com を使う。
  // 既存利用者は保存済みルールが優先され、default JSONの追加だけでは反映されないため、
  // 一度だけ不足ルールを補完する。すでに同等ルールがある場合は重複追加しない。
  let rulesChanged = false;
  if (!data[LINEWORKS_TALK_RULE_MIGRATION_KEY]) {
    const hasTalkRule = rules.some(rule =>
      AUTO_RULES_API.isRuleValid(rule)
      && String(rule.keyword || '').trim().toLowerCase() === LINEWORKS_TALK_RULE.keyword
    );
    if (!hasTalkRule) {
      const normalizedTalkRule = AUTO_RULES_API.normalizeRule(LINEWORKS_TALK_RULE);
      const messageRuleIndex = rules.findIndex(rule => rule.id === 'rule-lineworks-message');
      rules.splice(messageRuleIndex >= 0 ? messageRuleIndex + 1 : 0, 0, normalizedTalkRule);
      rulesChanged = true;
    }
  }

  const currentProjects = Array.isArray(data.projects) ? [...data.projects] : [];
  const nextProjects = [...currentProjects];
  rules.forEach(rule => {
    if (!AUTO_RULES_API.isRuleValid(rule)) return;
    if (!nextProjects.includes(rule.projectName)) nextProjects.push(rule.projectName);
  });
  if (!nextProjects.includes('未分類')) nextProjects.push('未分類');

  const updates = {};
  if (!hasStoredRules || rulesChanged) updates[AUTO_RULES_API.STORAGE_KEY] = rules;
  if (!data[LINEWORKS_TALK_RULE_MIGRATION_KEY]) updates[LINEWORKS_TALK_RULE_MIGRATION_KEY] = true;
  if (JSON.stringify(currentProjects) !== JSON.stringify(nextProjects)) updates.projects = nextProjects;
  if (Object.keys(updates).length) await chrome.storage.local.set(updates);
  return rules;
}

async function getStoredAutoProjectRules() {
  const data = await chrome.storage.local.get([AUTO_RULES_API.STORAGE_KEY]);
  if (Array.isArray(data[AUTO_RULES_API.STORAGE_KEY])) {
    return AUTO_RULES_API.normalizeRules(data[AUTO_RULES_API.STORAGE_KEY]);
  }
  return ensureAutoProjectRules();
}

// --- 動的リンク: 表示は通常リンク、クリック時だけ日付付きURLへ解決する ---
const QUICK_LINKS_DYNAMIC_PROTOCOL = 'quicklinks:';
const BACKLOG_LAST_ONE_DAY_URL = 'quicklinks://backlog/updated?range=last-1-calendar-day';
const BACKLOG_LAST_TWO_DAYS_URL = 'quicklinks://backlog/updated?range=last-2-calendar-days';
const BACKLOG_BUILTIN_MIGRATION_KEY = 'quickLinksBuiltinBacklogLastTwoDaysV1';
const BACKLOG_DYNAMIC_RANGES_MIGRATION_KEY = 'quickLinksBuiltinBacklogDynamicRangesV2';
const BACKLOG_RANGE_MIN_DAYS = 1;
const BACKLOG_RANGE_MAX_DAYS = 366;

const BACKLOG_LAST_ONE_DAY_ITEM = {
  id: 'builtin-backlog-updated-last1day',
  title: 'Backlog｜更新：直近1日',
  url: BACKLOG_LAST_ONE_DAY_URL,
  projectName: 'ツール',
  note: '更新日：今日（クリック時に自動更新）'
};

const BACKLOG_LAST_TWO_DAYS_ITEM = {
  id: 'builtin-backlog-updated-last2days',
  title: 'Backlog｜更新：直近2日',
  url: BACKLOG_LAST_TWO_DAYS_URL,
  projectName: 'ツール',
  note: '更新日：昨日〜今日（クリック時に自動更新）'
};

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

function formatJstCalendarDate(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function shiftJstCalendarDate(days, now = new Date()) {
  const { year, month, day } = getJstCalendarParts(now);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + Number(days || 0));
  return shifted.toISOString().slice(0, 10);
}

function isQuickLinksDynamicUrl(value) {
  try {
    return new URL(String(value || '')).protocol === QUICK_LINKS_DYNAMIC_PROTOCOL;
  } catch (_) {
    return false;
  }
}

/**
 * `quicklinks://backlog/updated?range=last-N-calendar-days` を読み取り、
 * 今日を含む暦日N日間を返す。N=1 は今日のみ、N=2 は昨日〜今日。
 */
function parseBacklogCalendarRange(value) {
  try {
    const dynamicUrl = new URL(String(value || ''));
    if (dynamicUrl.protocol !== QUICK_LINKS_DYNAMIC_PROTOCOL) return null;
    if (dynamicUrl.hostname !== 'backlog' || dynamicUrl.pathname !== '/updated') return null;

    const rawRange = String(dynamicUrl.searchParams.get('range') || '');
    const match = rawRange.match(/^last-([1-9]\d*)-calendar-days?$/);
    if (!match) return null;

    const dayCount = Number(match[1]);
    if (!Number.isSafeInteger(dayCount)
      || dayCount < BACKLOG_RANGE_MIN_DAYS
      || dayCount > BACKLOG_RANGE_MAX_DAYS) return null;

    return { dayCount, rawRange };
  } catch (_) {
    return null;
  }
}

function buildBacklogUpdatedRangeUrl(dayCount, now = new Date()) {
  const days = Number(dayCount);
  if (!Number.isSafeInteger(days)
    || days < BACKLOG_RANGE_MIN_DAYS
    || days > BACKLOG_RANGE_MAX_DAYS) return '';

  const endDate = formatJstCalendarDate(getJstCalendarParts(now));
  const startDate = shiftJstCalendarDate(-(days - 1), now);
  const target = new URL('https://urawa-cr.backlog.com/FindIssueAllOver.action');

  // 既存のBacklog検索条件をそのまま固定。日付はクリック時にだけ生成する。
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

  // Backlogの画面検索（FindIssueAllOver.action）は、更新日の範囲を
  // updatedRange.begin / updatedRange.end（yyyy/MM/dd）で受け取る。
  target.searchParams.set('updatedRange.begin', startDate.replace(/-/g, '/'));
  target.searchParams.set('updatedRange.end', endDate.replace(/-/g, '/'));
  return target.toString();
}

function resolveQuickLinksDynamicUrl(value, now = new Date()) {
  if (!isQuickLinksDynamicUrl(value)) return String(value || '');

  const backlogRange = parseBacklogCalendarRange(value);
  if (backlogRange) return buildBacklogUpdatedRangeUrl(backlogRange.dayCount, now);
  return '';
}

function createBuiltInLink(item) {
  const built = AUTO_RULES_API.createQuickLinkItem({
    ...item,
    lastClickedAt: null,
    clickCount: 0,
    archived: false,
    favoriteType: 'none'
  });
  if (!built.ok) throw new Error(built.error || '組み込みリンクを作成できませんでした。');
  return built.item;
}

async function ensureBuiltInBacklogDynamicRangeLinks() {
  const data = await chrome.storage.local.get([
    'items',
    'projects',
    BACKLOG_BUILTIN_MIGRATION_KEY,
    BACKLOG_DYNAMIC_RANGES_MIGRATION_KEY
  ]);

  const currentItems = Array.isArray(data.items) ? [...data.items] : [];
  const currentProjects = Array.isArray(data.projects) ? [...data.projects] : [];
  let itemsChanged = false;
  let projectsChanged = false;

  const hasItem = (item) => currentItems.some(existing => existing && (
    existing.id === item.id || existing.url === item.url
  ));

  // 旧版利用者には、従来の直近2日リンクを一度だけ補完する。
  if (!data[BACKLOG_BUILTIN_MIGRATION_KEY] && !hasItem(BACKLOG_LAST_TWO_DAYS_ITEM)) {
    currentItems.unshift(createBuiltInLink(BACKLOG_LAST_TWO_DAYS_ITEM));
    itemsChanged = true;
  }

  // v1.5以降は、直近1日リンクを一度だけ追加する。
  if (!data[BACKLOG_DYNAMIC_RANGES_MIGRATION_KEY] && !hasItem(BACKLOG_LAST_ONE_DAY_ITEM)) {
    currentItems.unshift(createBuiltInLink(BACKLOG_LAST_ONE_DAY_ITEM));
    itemsChanged = true;
  }

  if (!currentProjects.includes('ツール')) {
    currentProjects.push('ツール');
    projectsChanged = true;
  }

  const updates = {};
  if (itemsChanged) updates.items = currentItems;
  if (projectsChanged) updates.projects = currentProjects;
  if (!data[BACKLOG_BUILTIN_MIGRATION_KEY]) updates[BACKLOG_BUILTIN_MIGRATION_KEY] = true;
  if (!data[BACKLOG_DYNAMIC_RANGES_MIGRATION_KEY]) updates[BACKLOG_DYNAMIC_RANGES_MIGRATION_KEY] = true;
  if (Object.keys(updates).length > 0) await chrome.storage.local.set(updates);
}

// --- 初期データ定義 (L_のデータをq_形式に変換) ---
const INITIAL_PROJECTS = ['仕事', '学習', 'ツール', 'あとで見る', '未分類'];

const INITIAL_COLORS = {
  '仕事': { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  '学習': { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
  'ツール': { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' },
  'あとで見る': { bg: '#fff7ed', text: '#9a3412', border: '#fed7aa' },
  '未分類': { bg: '#f8fafc', text: '#475569', border: '#cbd5e1' }
};

// New installs start empty. Existing user data is never replaced by these defaults.
const INITIAL_ITEMS = [];

// インストール時に初期データを保存
chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: "add-to-quick-links",
    title: "Quick Linksに追加",
    contexts: ["page", "link"]
  });

  // 既存データを確認
  const data = await chrome.storage.local.get(['items', 'projects', 'projectColors', 'floatingSearchEnabled', 'promptMemos', AUTO_RULES_API.STORAGE_KEY]);
  
  // 初期リンクは新規インストール時だけ投入。更新時に0件でも復活させない。
  if (details?.reason === 'install' && (!data.items || data.items.length === 0)) {
    const formattedItems = INITIAL_ITEMS.map((item, index) => {
      const built = AUTO_RULES_API.createQuickLinkItem({
        ...item,
        id: `init-${index}-${Math.random().toString(36).slice(2, 7)}`,
        note: '',
        clickCount: 0,
        archived: false,
        favoriteType: 'none'
      });
      if (!built.ok) throw new Error(built.error || `初期リンク${index + 1}を作成できませんでした。`);
      return built.item;
    });

    await chrome.storage.local.set({
      items: formattedItems,
      projects: INITIAL_PROJECTS,
      projectColors: INITIAL_COLORS,
      floatingSearchEnabled: true,
      promptMemos: []
    });
    console.log("Initial L_ data injected.");
  } else {
    const defaults = {};
    if (typeof data.floatingSearchEnabled === 'undefined') defaults.floatingSearchEnabled = true;
    if (!Array.isArray(data.promptMemos)) defaults.promptMemos = [];
    if (Object.keys(defaults).length > 0) {
      await chrome.storage.local.set(defaults);
    }
  }
  await ensureAutoProjectRules();
  await ensureBuiltInBacklogDynamicRangeLinks();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAutoProjectRules();
  await ensureBuiltInBacklogDynamicRangeLinks();
});

ensureAutoProjectRules().catch(error => console.warn('Failed to initialize auto project rules', error));

const QUICK_LINKS_FLOATING_COMMAND_ACTIONS = APP_CONTRACT.FLOATING_ACTION_BY_COMMAND;

chrome.commands.onCommand.addListener(async (command) => {
  const action = QUICK_LINKS_FLOATING_COMMAND_ACTIONS[command];
  if (!action) return;

  let activeTab = null;
  try {
    [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  } catch (_) {}
  const windowId = typeof activeTab?.windowId === 'number' ? activeTab.windowId : null;

  // Only the side panel in the active window should react.
  try {
    await chrome.runtime.sendMessage({
      type: APP_CONTRACT.MESSAGES.SIDEPANEL_SHORTCUT,
      action,
      windowId
    });
  } catch (_) {}

  try {
    if (!activeTab || typeof activeTab.id !== 'number') return;
    await chrome.tabs.sendMessage(activeTab.id, {
      type: APP_CONTRACT.MESSAGES.FLOATING_SHORTCUT,
      action,
      windowId
    });
  } catch (error) {
    console.warn('Failed to run Quick Links floating shortcut', command, error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'quickLinksEnsureAutoProjectRules') {
    ensureAutoProjectRules()
      .then(rules => sendResponse({ ok: true, rules }))
      .catch(error => sendResponse({ ok: false, error: String(error), rules: [] }));
    return true;
  }

  if (message && message.type === 'quickLinksCommitState') {
    commitStorageState(message.payload)
      .then(updates => sendResponse({ ok: true, updates }))
      .catch(error => sendResponse({ ok: false, error: String(error), updates: {} }));
    return true;
  }

  if (message && message.type === 'quickLinksRecordItemClick') {
    recordItemClickAtomic(message.id)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message && message.type === 'quickLinksRecordPromptCopy') {
    recordPromptCopyAtomic(message.id)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message && message.type === 'quickLinksGetCurrentWindowId') {
    (async () => {
      try {
        const currentWindow = await chrome.windows.getLastFocused();
        const windowId = currentWindow && currentWindow.id;
        if (typeof windowId !== 'number') throw new Error('No window available');
        sendResponse({ ok: true, windowId });
      } catch (error) {
        sendResponse({ ok: false, error: String(error), windowId: null });
      }
    })();
    return true;
  }

  if (message && message.type === 'quickLinksResolveUrl' && message.url) {
    try {
      const resolvedUrl = resolveQuickLinksDynamicUrl(message.url);
      if (!resolvedUrl) throw new Error('未対応の動的リンクです。');
      sendResponse({ ok: true, url: resolvedUrl });
    } catch (error) {
      console.warn('Failed to resolve URL', error);
      sendResponse({ ok: false, error: String(error), url: '' });
    }
    return false;
  }

  if (message && message.type === 'quickLinksOpenTab' && message.url) {
    (async () => {
      try {
        const resolvedUrl = resolveQuickLinksDynamicUrl(message.url);
        if (!resolvedUrl) throw new Error('未対応の動的リンクです。');
        const parsedUrl = new URL(resolvedUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('開けないURL形式です。');

        const createOptions = {
          url: parsedUrl.toString(),
          active: message.active !== false
        };

        let sourceTab = sender.tab;
        if (!sourceTab || typeof sourceTab.windowId !== 'number') {
          const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          sourceTab = activeTab || null;
        }

        if (sourceTab && typeof sourceTab.windowId === 'number') {
          createOptions.windowId = sourceTab.windowId;
          if (typeof sourceTab.index === 'number') {
            const indexOffset = typeof message.indexOffset === 'number' ? message.indexOffset : 1;
            const tabsInWindow = await chrome.tabs.query({ windowId: sourceTab.windowId });
            const desiredIndex = sourceTab.index + indexOffset;
            createOptions.index = Math.max(0, Math.min(desiredIndex, tabsInWindow.length));
          }
        }

        let createdTab;
        try {
          createdTab = await chrome.tabs.create(createOptions);
        } catch (firstError) {
          // タブ数の変化などでindexが無効になった場合は、同じウインドウで位置指定なしに再試行する。
          const retryOptions = { ...createOptions };
          delete retryOptions.index;
          try {
            createdTab = await chrome.tabs.create(retryOptions);
          } catch (secondError) {
            // 対象ウインドウが閉じられた場合は、最後にフォーカスされたウインドウへ開く。
            const finalOptions = { url: createOptions.url, active: createOptions.active };
            createdTab = await chrome.tabs.create(finalOptions);
          }
        }
        sendResponse({ ok: true, tabId: createdTab?.id || null, url: createOptions.url });
      } catch (error) {
        console.warn('Failed to open tab', error);
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (message && message.type === 'quickLinksOpenSidePanel') {
    (async () => {
      try {
        let windowId = sender.tab && sender.tab.windowId;
        if (typeof windowId !== 'number') {
          const lastFocused = await chrome.windows.getLastFocused();
          windowId = lastFocused && lastFocused.id;
        }

        if (typeof windowId === 'number') {
          await chrome.sidePanel.open({ windowId });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'No window available' });
        }
      } catch (error) {
        console.warn('Failed to open side panel', error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }


  return false;
});


chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'add-to-quick-links') return;
  enqueueStorageMutation(async () => {
    try {
      const targetUrl = info.linkUrl || info.pageUrl || tab?.url || '';
      const targetTitle = info.linkUrl ? (info.selectionText || targetUrl) : (tab?.title || targetUrl);
      const validated = AUTO_RULES_API.normalizeAndValidateLinkInput({ url: targetUrl, title: targetTitle });
      if (!validated.ok) throw new Error(validated.error);

      const data = await chrome.storage.local.get(['items', 'projects', AUTO_RULES_API.STORAGE_KEY]);
      const rules = Array.isArray(data[AUTO_RULES_API.STORAGE_KEY])
        ? AUTO_RULES_API.normalizeRules(data[AUTO_RULES_API.STORAGE_KEY])
        : await ensureAutoProjectRules();
      const autoMatch = AUTO_RULES_API.matchInput(targetUrl, rules);
      const autoProjectName = autoMatch?.projectName || '未分類';
      const built = AUTO_RULES_API.createQuickLinkItem({
        title: validated.title,
        url: validated.url,
        projectName: autoProjectName,
        note: ''
      });
      if (!built.ok) throw new Error(built.error);

      const currentItems = Array.isArray(data.items) ? data.items : [];
      const comparableTargetUrl = canonicalizeComparableUrl(validated.url);
      const isDuplicate = currentItems.some(item => canonicalizeComparableUrl(item.url) === comparableTargetUrl);
      if (isDuplicate) {
        await chrome.notifications.create({
          type: 'basic', iconUrl: 'icons/icon48.png', title: 'Quick Links',
          message: 'このリンクは既に登録されています。'
        });
        return;
      }

      const currentProjects = Array.isArray(data.projects) ? data.projects : [];
      const newProjects = currentProjects.includes(autoProjectName)
        ? currentProjects
        : [...currentProjects, autoProjectName];
      await chrome.storage.local.set({
        items: [built.item, ...currentItems],
        projects: newProjects
      });
    } catch (error) {
      console.error('Failed to add Quick Link from context menu', error);
      try {
        await chrome.notifications.create({
          type: 'basic', iconUrl: 'icons/icon48.png', title: 'Quick Links',
          message: `リンクを追加できませんでした：${error?.message || error}`
        });
      } catch (_) {}
    }
  });
});
