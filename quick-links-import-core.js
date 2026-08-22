(() => {
  function getAutoRules() {
    const api = globalThis.QuickLinksAutoRules;
    if (!api) throw new Error('QuickLinksAutoRules is required before quick-links-import-core.js');
    return api;
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
      getAutoRules().canonicalizeComparableUrl(item?.url || ''),
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
    return getAutoRules().normalizeFavoriteType(value);
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

    // Display fields use the existing record because this function only merges exact duplicate keys.
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
      const normalizedItem = getAutoRules().normalizeQuickLinkItem(item, index);
      if (!normalizedItem) return;
      const key = getQuickLinkDuplicateKey(normalizedItem);
      if (map.has(key)) {
        const compactedIndex = map.get(key);
        compacted[compactedIndex] = mergeQuickLinkRecord(compacted[compactedIndex], normalizedItem);
        removed++;
      } else {
        map.set(key, compacted.length);
        compacted.push(normalizedItem);
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
        const compactedIndex = map.get(key);
        compacted[compactedIndex] = mergePromptMemoRecord(compacted[compactedIndex], memo);
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

  const api = Object.freeze({
    normalizeImportedQuickLinkItems,
    normalizeImportedAutoProjectRules,
    normalizeImportedPromptMemoItems,
    normalizeImportedPromptCategories,
    getQuickLinkDuplicateKey,
    getPromptMemoDuplicateKey,
    mergeQuickLinkRecord,
    mergePromptMemoRecord,
    compactDuplicateQuickLinks,
    compactDuplicatePromptMemos,
    normalizeProjectsFromItems
  });

  globalThis.QuickLinksImportCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
