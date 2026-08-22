(() => {
  const DEFAULT_X_ACCOUNT = 'REDSOFFICIAL';

  function normalizeAccount(value) {
    let raw = String(value || '').trim();
    if (!raw) return '';

    raw = raw.replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '');
    raw = raw.split(/[/?#]/, 1)[0];
    raw = raw.replace(/^@+/, '').trim();
    return raw;
  }

  function addDaysToDateValue(value, days) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function buildXSearchQuery(input = {}) {
    const keyword = String(input.keyword || '').trim();
    const account = normalizeAccount(input.account);
    if (!keyword && !account) return '';

    let query = keyword || account;
    if (keyword && account) query += ` from:${account}`;

    const start = String(input.start || '').trim();
    const end = String(input.end || '').trim();
    if (start) query += ` since:${start}`;
    if (end) {
      const exclusiveEnd = addDaysToDateValue(end, 1);
      if (exclusiveEnd) query += ` until:${exclusiveEnd}`;
    }
    return query;
  }

  function buildXSearchUrl(input = {}) {
    const query = buildXSearchQuery(input);
    return query ? `https://x.com/search?q=${encodeURIComponent(query)}&f=live` : '';
  }

  const api = Object.freeze({
    DEFAULT_X_ACCOUNT,
    normalizeAccount,
    addDaysToDateValue,
    buildXSearchQuery,
    buildXSearchUrl
  });

  globalThis.QuickLinksRedsXSearchCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
