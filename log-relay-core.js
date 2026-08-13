(() => {
  const ENTRY_PREFIX = 'logRelayEntry:';
  const INDEX_KEY = 'logRelayIndex';
  const SORT_KEY = 'logRelaySortDirection';
  const OPEN_REQUEST_KEY = 'logRelayOpenPanelRequest';
  const TRASH_TTL_MS = 24 * 60 * 60 * 1000;
  const STATUS = Object.freeze({ inbox: '未処理', hold: '保留', done: '完了', trash: '削除' });
  const ACTIVE_STATUSES = Object.freeze(['inbox', 'hold', 'done']);
  const VIEW_ORDER = Object.freeze(['all', 'inbox', 'hold', 'done', 'trash']);

  function storageKey(id) {
    return `${ENTRY_PREFIX}${id}`;
  }

  function makeId(now = Date.now()) {
    if (globalThis.crypto?.randomUUID) return `lr-${globalThis.crypto.randomUUID()}`;
    return `lr-${Number(now).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function validDateOr(value, fallback) {
    return Number.isFinite(Date.parse(value)) ? value : fallback;
  }

  function normalizeEntry(value, fallbackId = '', nowIso = new Date().toISOString()) {
    if (!value || typeof value !== 'object') return null;
    const id = String(value.id || fallbackId || '').trim();
    const memo = String(value.memo || '').trim();
    if (!id || !memo) return null;
    const status = STATUS[value.status] ? value.status : 'inbox';
    const createdAt = validDateOr(value.createdAt, nowIso);
    const updatedAt = validDateOr(value.updatedAt, createdAt);
    const normalized = { id, memo, status, createdAt, updatedAt };
    if (status === 'trash') normalized.trashedAt = validDateOr(value.trashedAt, updatedAt);
    return normalized;
  }

  function normalizeIndex(value) {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    return source
      .map(id => String(id || '').trim())
      .filter(id => id && !seen.has(id) && seen.add(id));
  }

  function moveToStatus(entry, status, nowIso = new Date().toISOString()) {
    const normalized = normalizeEntry(entry);
    if (!normalized || !STATUS[status]) return null;
    const next = { ...normalized, status, updatedAt: nowIso };
    if (status === 'trash') next.trashedAt = normalized.status === 'trash' && normalized.trashedAt ? normalized.trashedAt : nowIso;
    else delete next.trashedAt;
    return next;
  }

  function isTrashExpired(entry, nowMs = Date.now()) {
    const normalized = normalizeEntry(entry);
    if (!normalized || normalized.status !== 'trash') return false;
    const trashedAt = Date.parse(normalized.trashedAt || normalized.updatedAt);
    return Number.isFinite(trashedAt) && trashedAt + TRASH_TTL_MS <= nowMs;
  }

  function sortEntries(list, direction = 'desc') {
    const multiplier = direction === 'asc' ? 1 : -1;
    return [...(Array.isArray(list) ? list : [])].sort((a, b) => multiplier * (Date.parse(a.createdAt) - Date.parse(b.createdAt)));
  }

  function startOfTodayJstMs(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    return Date.UTC(values.year, values.month - 1, values.day) - (9 * 60 * 60 * 1000);
  }

  const api = Object.freeze({
    ENTRY_PREFIX, INDEX_KEY, SORT_KEY, OPEN_REQUEST_KEY, TRASH_TTL_MS,
    STATUS, ACTIVE_STATUSES, VIEW_ORDER,
    storageKey, makeId, normalizeEntry, normalizeIndex, moveToStatus,
    isTrashExpired, sortEntries, startOfTodayJstMs
  });

  globalThis.QuickLinksLogRelayCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
