(() => {
  const STORAGE_KEY = 'autoProjectRules';
  const DEFAULT_RULES_PATH = 'default-auto-project-rules.json';
  const MATCH_TYPES = new Set(['contains', 'startsWith', 'exact']);
  const LINEWORKS_CHANNEL_ID_PATTERN = /^(?:\d+|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;
  const LINEWORKS_CHANNEL_URL_BASE = 'https://line.worksmobile.com/message/send?version=26&channelId=';

  function isLineWorksChannelId(value) {
    return LINEWORKS_CHANNEL_ID_PATTERN.test(String(value || '').trim());
  }

  function buildLineWorksChannelUrl(value) {
    const channelId = String(value || '').trim();
    return isLineWorksChannelId(channelId)
      ? `${LINEWORKS_CHANNEL_URL_BASE}${encodeURIComponent(channelId)}`
      : '';
  }

  function normalizeLineWorksChannelId(value) {
    let channelId = String(value || '').trim();
    try { channelId = decodeURIComponent(channelId); } catch (_) {}
    if (!isLineWorksChannelId(channelId)) return '';
    return channelId.includes('-') ? channelId.toLowerCase() : channelId;
  }

  function extractLineWorksChannelId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const directId = normalizeLineWorksChannelId(raw);
    if (directId) return directId;

    let parsed;
    try { parsed = new URL(raw); } catch (_) { return ''; }
    const hostname = String(parsed.hostname || '').toLowerCase();
    const isLineWorksTalkHost = hostname === 'line.worksmobile.com' || hostname === 'talk.worksmobile.com';
    if (!isLineWorksTalkHost) return '';

    for (const [key, paramValue] of parsed.searchParams.entries()) {
      if (String(key).toLowerCase() !== 'channelid') continue;
      const id = normalizeLineWorksChannelId(paramValue);
      if (id) return id;
    }

    let decodedHash = String(parsed.hash || '');
    try { decodedHash = decodeURIComponent(decodedHash); } catch (_) {}
    const hashParamMatch = decodedHash.match(/(?:^|[?&#])channelid=([^&#/]+)/i);
    if (hashParamMatch) {
      const id = normalizeLineWorksChannelId(hashParamMatch[1]);
      if (id) return id;
    }

    // LINE WORKSの画面URL形式が変わっても、トーク系ホスト上の明示的な
    // message/channel/room/talk セグメントにchannelIdがあれば同一トークとして扱う。
    let routeText = `${parsed.pathname || ''}${decodedHash || ''}`;
    try { routeText = decodeURIComponent(routeText); } catch (_) {}
    const routeMatch = routeText.match(/\/(?:message|channel|room|talk)\/(\d+|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?=$|[/?&#])/i);
    if (routeMatch) return normalizeLineWorksChannelId(routeMatch[1]);

    return '';
  }

  function normalizeIncomingUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return buildLineWorksChannelUrl(raw) || raw;
  }

  function createLineWorksChannelMatch(value) {
    const channelId = String(value || '').trim();
    if (!isLineWorksChannelId(channelId)) return null;
    const builtin = {
      id: 'builtin-lineworks-channel-id',
      ruleId: 'builtin-lineworks-channel-id',
      keyword: 'channelId（番号のみ）',
      projectName: 'LINEWORKS',
      matchType: 'channelId',
      caseSensitive: false,
      enabled: true,
      priority: 0
    };
    return { ...builtin, matches: [{ ...builtin }] };
  }

  function createId(prefix = 'rule') {
    const random = Math.random().toString(36).slice(2, 9);
    return `${prefix}-${Date.now().toString(36)}-${random}`;
  }

  function normalizeMatchType(value) {
    const type = String(value || 'contains');
    return MATCH_TYPES.has(type) ? type : 'contains';
  }

  function normalizeRule(rule, index = 0) {
    const now = new Date().toISOString();
    return {
      id: String(rule?.id || createId(`rule${index + 1}`)),
      keyword: String(rule?.keyword || '').trim(),
      projectName: String(rule?.projectName || '未分類').trim() || '未分類',
      matchType: normalizeMatchType(rule?.matchType),
      caseSensitive: !!rule?.caseSensitive,
      enabled: rule?.enabled !== false,
      createdAt: rule?.createdAt || now,
      updatedAt: rule?.updatedAt || rule?.createdAt || now
    };
  }

  function normalizeRules(value) {
    if (!Array.isArray(value)) return [];
    const usedIds = new Set();
    return value
      .filter(rule => rule && typeof rule === 'object')
      .map((rule, index) => {
        const normalized = normalizeRule(rule, index);
        while (usedIds.has(normalized.id)) normalized.id = createId(`rule${index + 1}`);
        usedIds.add(normalized.id);
        return normalized;
      });
  }

  function isRuleValid(rule) {
    return !!rule && !!String(rule.keyword || '').trim() && !!String(rule.projectName || '').trim();
  }

  function ruleMatches(input, rule) {
    if (!rule?.enabled || !isRuleValid(rule)) return false;
    const sourceRaw = String(input || '').trim();
    const keywordRaw = String(rule.keyword || '').trim();
    if (!sourceRaw || !keywordRaw) return false;

    const source = rule.caseSensitive ? sourceRaw : sourceRaw.toLowerCase();
    const keyword = rule.caseSensitive ? keywordRaw : keywordRaw.toLowerCase();

    if (rule.matchType === 'exact') return source === keyword;
    if (rule.matchType === 'startsWith') return source.startsWith(keyword);
    return source.includes(keyword);
  }

  function getMatches(input, rules) {
    return normalizeRules(rules)
      .map((rule, index) => ({ rule, index }))
      .filter(entry => ruleMatches(input, entry.rule))
      .map(entry => ({
        ...entry.rule,
        priority: entry.index + 1
      }));
  }

  function match(input, rules) {
    const matches = getMatches(input, rules);
    if (!matches.length) return null;
    const first = matches[0];
    return {
      ruleId: first.id,
      keyword: first.keyword,
      projectName: first.projectName,
      matchType: first.matchType,
      caseSensitive: first.caseSensitive,
      priority: first.priority,
      matches
    };
  }


  function matchInput(input, rules) {
    const raw = String(input || '').trim();
    const lineWorksChannelMatch = createLineWorksChannelMatch(raw);
    if (lineWorksChannelMatch) return lineWorksChannelMatch;
    const normalized = normalizeIncomingUrl(raw);
    return match(normalized || raw, rules);
  }

  function mergeRules(baseRules, incomingRules) {
    const base = normalizeRules(baseRules);
    const incoming = normalizeRules(incomingRules);
    const existingSignatures = new Set(base.map(getRuleSignature));
    const existingIds = new Set(base.map(rule => rule.id));
    const merged = [...base];

    incoming.forEach(rule => {
      const signature = getRuleSignature(rule);
      if (existingSignatures.has(signature)) return;
      const copy = { ...rule };
      if (existingIds.has(copy.id)) copy.id = createId('rule-import');
      existingIds.add(copy.id);
      existingSignatures.add(signature);
      merged.push(copy);
    });
    return merged;
  }

  function getRuleSignature(rule) {
    return [
      String(rule?.keyword || '').trim(),
      String(rule?.projectName || '').trim(),
      normalizeMatchType(rule?.matchType),
      rule?.caseSensitive ? '1' : '0'
    ].join('\u001F');
  }

  async function loadDefaultRules() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return [];
    try {
      const response = await fetch(chrome.runtime.getURL(DEFAULT_RULES_PATH));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return normalizeRules(await response.json());
    } catch (error) {
      console.warn('[Quick Links] 初期自動分類ルールを読み込めませんでした。', error);
      return [];
    }
  }


  function normalizeFavoriteType(value, isFavorite = false) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'temporary') return 'temp';
    if (raw === 'permanent') return 'normal';
    if (raw === 'temp' || raw === 'normal' || raw === 'none') return raw;
    return isFavorite ? 'normal' : 'none';
  }

  function canonicalizeComparableUrl(value) {
    const lineWorksChannelId = extractLineWorksChannelId(value);
    if (lineWorksChannelId) return `lineworks-channel:${lineWorksChannelId}`;

    const normalized = normalizeIncomingUrl(value);
    if (!normalized) return '';
    if (/^quicklinks:\/\//i.test(normalized)) return normalized;
    try {
      const url = new URL(normalized);
      if (!['http:', 'https:'].includes(url.protocol)) return normalized;
      url.hostname = url.hostname.toLowerCase();
      if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) url.port = '';
      if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
      // Hash routes and service-specific fragments can identify different destinations
      // (e.g. LINE WORKS rooms and Google Sheets gid), so keep fragments intact.
      return url.toString();
    } catch (_) {
      return normalized;
    }
  }

  function normalizeAndValidateLinkInput(input = {}) {
    const rawUrl = String(input.url || '').trim();
    const normalizedUrl = normalizeIncomingUrl(rawUrl);
    if (!normalizedUrl) return { ok: false, error: 'URLを入力してください。', url: '', title: '' };

    let safeUrl = normalizedUrl;
    if (/^quicklinks:\/\//i.test(normalizedUrl)) {
      // Built-in dynamic URLs are allowed.
    } else {
      try {
        const parsed = new URL(normalizedUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return { ok: false, error: 'http または https のURLを入力してください。', url: '', title: '' };
        }
        safeUrl = parsed.toString();
      } catch (_) {
        return { ok: false, error: 'URLの形式を確認してください。', url: '', title: '' };
      }
    }

    const requestedTitle = String(input.title || '').trim();
    const fallbackTitle = String(input.fallbackTitle || '').trim();
    const title = requestedTitle || fallbackTitle || safeUrl;
    const projectName = String(input.projectName || '未分類').trim() || '未分類';
    const note = String(input.note || '');
    return { ok: true, url: safeUrl, title, projectName, note };
  }

  function createQuickLinkItem(input = {}, existing = null) {
    const now = new Date().toISOString();
    const validated = normalizeAndValidateLinkInput({
      url: input.url ?? existing?.url,
      title: input.title ?? existing?.title,
      fallbackTitle: input.fallbackTitle,
      projectName: input.projectName ?? existing?.projectName,
      note: input.note ?? existing?.note
    });
    if (!validated.ok) return { ok: false, error: validated.error, item: null };
    const base = existing && typeof existing === 'object' ? existing : {};
    const favoriteType = normalizeFavoriteType(input.favoriteType ?? base.favoriteType, input.isFavorite ?? base.isFavorite);
    const item = {
      ...base,
      id: String(input.id || base.id || `ql-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      title: validated.title,
      url: validated.url,
      projectName: validated.projectName,
      note: validated.note,
      addedAt: input.addedAt || base.addedAt || now,
      updatedAt: input.updatedAt || now,
      lastClickedAt: input.lastClickedAt ?? base.lastClickedAt ?? null,
      clickCount: Math.max(0, Number(input.clickCount ?? base.clickCount ?? 0) || 0),
      archived: input.archived ?? base.archived ?? false,
      isFavorite: favoriteType !== 'none',
      favoriteType,
      favoriteExpiry: favoriteType === 'temp' ? (input.favoriteExpiry ?? base.favoriteExpiry ?? null) : null
    };
    return { ok: true, item };
  }

  function normalizeQuickLinkItem(value, index = 0, options = {}) {
    const input = value && typeof value === 'object' ? value : {};
    const now = new Date().toISOString();
    const result = createQuickLinkItem({
      ...input,
      id: input.id || `import-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      fallbackTitle: input.url || '名称なし',
      updatedAt: input.updatedAt || input.addedAt || now
    }, input);
    if (result.ok) return result.item;
    if (options.preserveInvalid === false || !String(input.url || '').trim()) return null;
    const favoriteType = normalizeFavoriteType(input.favoriteType, input.isFavorite);
    return {
      ...input,
      id: String(input.id || `legacy-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`),
      title: String(input.title || input.url || '名称なし').trim() || '名称なし',
      url: String(input.url || '').trim(),
      projectName: String(input.projectName || '未分類').trim() || '未分類',
      note: String(input.note || ''),
      addedAt: input.addedAt || now,
      updatedAt: input.updatedAt || input.addedAt || now,
      lastClickedAt: input.lastClickedAt || null,
      clickCount: Math.max(0, Number(input.clickCount || 0) || 0),
      archived: !!input.archived,
      isFavorite: favoriteType !== 'none',
      favoriteType,
      favoriteExpiry: favoriteType === 'temp' ? (input.favoriteExpiry || null) : null,
      legacyInvalidUrl: true
    };
  }

  function createPromptMemo(input = {}, existing = null) {
    const base = existing && typeof existing === 'object' ? existing : {};
    const now = new Date().toISOString();
    const body = String(input.body ?? base.body ?? '');
    const requestedTitle = String(input.title ?? base.title ?? '').trim();
    if (!requestedTitle && !body.trim()) return { ok: false, error: 'タイトルか本文を入力してください。', memo: null };
    const memo = {
      ...base,
      id: String(input.id || base.id || `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      title: requestedTitle || '無題のプロンプト',
      categoryName: String(input.categoryName ?? base.categoryName ?? base.projectName ?? '未分類').trim() || '未分類',
      body,
      createdAt: input.createdAt || base.createdAt || now,
      updatedAt: input.updatedAt || now,
      copyCount: Math.max(0, Number(input.copyCount ?? base.copyCount ?? 0) || 0)
    };
    delete memo.projectName;
    return { ok: true, memo };
  }

  globalThis.QuickLinksAutoRules = Object.freeze({
    STORAGE_KEY,
    DEFAULT_RULES_PATH,
    MATCH_TYPES: Object.freeze([...MATCH_TYPES]),
    LINEWORKS_CHANNEL_ID_PATTERN,
    LINEWORKS_CHANNEL_URL_BASE,
    isLineWorksChannelId,
    buildLineWorksChannelUrl,
    normalizeLineWorksChannelId,
    extractLineWorksChannelId,
    normalizeIncomingUrl,
    normalizeFavoriteType,
    canonicalizeComparableUrl,
    normalizeAndValidateLinkInput,
    createQuickLinkItem,
    normalizeQuickLinkItem,
    createPromptMemo,
    createLineWorksChannelMatch,
    matchInput,
    createId,
    normalizeRule,
    normalizeRules,
    isRuleValid,
    ruleMatches,
    getMatches,
    match,
    mergeRules,
    loadDefaultRules
  });
})();
