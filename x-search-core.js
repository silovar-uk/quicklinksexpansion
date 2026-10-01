(() => {
  'use strict';

  function normalizeAccount(value) {
    let raw = String(value || '').trim();
    if (!raw) return '';
    raw = raw.replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '');
    raw = raw.split(/[/?#]/, 1)[0];
    return raw.replace(/^@+/, '').trim();
  }

  function addDaysToDateValue(value, days) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function splitTerms(value) {
    return String(value || '')
      .split(/[\s,、]+/)
      .map(term => term.trim())
      .filter(Boolean);
  }

  function quote(value) {
    const text = String(value || '').trim().replace(/"/g, '\\"');
    return text ? `"${text}"` : '';
  }

  function normalizeLanguage(value) {
    const lang = String(value || '').trim().toLowerCase();
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(lang) ? lang : '';
  }

  function buildXSearchQuery(input = {}) {
    const parts = [];
    const allWords = String(input.allWords ?? input.keyword ?? '').trim();
    if (allWords) parts.push(allWords);

    const exactPhrase = String(input.exactPhrase || '').trim();
    if (exactPhrase) parts.push(quote(exactPhrase));

    const anyWords = splitTerms(input.anyWords);
    if (anyWords.length === 1) parts.push(anyWords[0]);
    if (anyWords.length > 1) parts.push(`(${anyWords.join(' OR ')})`);

    splitTerms(input.excludeWords).forEach(term => parts.push(`-${term}`));
    splitTerms(input.hashtags).forEach(tag => parts.push(`#${tag.replace(/^#+/, '')}`));

    const fromAccount = normalizeAccount(input.fromAccount ?? input.account);
    const toAccount = normalizeAccount(input.toAccount);
    if (fromAccount) parts.push(`from:${fromAccount}`);
    if (toAccount) parts.push(`to:${toAccount}`);

    splitTerms(input.mentions).forEach(account => {
      const normalized = normalizeAccount(account);
      if (normalized) parts.push(`@${normalized}`);
    });

    const language = normalizeLanguage(input.language);
    if (language) parts.push(`lang:${language}`);

    const start = String(input.start || '').trim();
    const end = String(input.end || '').trim();
    if (start) parts.push(`since:${start}`);
    if (end) {
      const exclusiveEnd = addDaysToDateValue(end, 1);
      if (exclusiveEnd) parts.push(`until:${exclusiveEnd}`);
    }

    return parts.join(' ').trim();
  }

  function buildXSearchUrl(input = {}) {
    const query = buildXSearchQuery(input);
    return query ? `https://x.com/search?q=${encodeURIComponent(query)}&f=live` : '';
  }

  function getActiveFilterCount(input = {}) {
    const checks = [
      input.exactPhrase,
      input.anyWords,
      input.excludeWords,
      input.hashtags,
      input.fromAccount ?? input.account,
      input.toAccount,
      input.mentions,
      input.language,
      input.start,
      input.end
    ];
    return checks.filter(value => String(value || '').trim()).length;
  }

  function buildSummary(input = {}) {
    const lines = [];
    const allWords = String(input.allWords ?? input.keyword ?? '').trim();
    if (allWords) lines.push(`「${allWords}」を含む`);
    const exactPhrase = String(input.exactPhrase || '').trim();
    if (exactPhrase) lines.push(`「${exactPhrase}」に完全一致`);
    const anyWords = splitTerms(input.anyWords);
    if (anyWords.length) lines.push(`${anyWords.map(v => `「${v}」`).join(' / ')} のいずれかを含む`);
    const excluded = splitTerms(input.excludeWords);
    if (excluded.length) lines.push(`${excluded.map(v => `「${v}」`).join('・')}を除外`);
    const tags = splitTerms(input.hashtags).map(v => `#${v.replace(/^#+/, '')}`);
    if (tags.length) lines.push(`${tags.join('・')}を含む`);
    const fromAccount = normalizeAccount(input.fromAccount ?? input.account);
    const toAccount = normalizeAccount(input.toAccount);
    const mentions = splitTerms(input.mentions).map(normalizeAccount).filter(Boolean);
    if (fromAccount) lines.push(`@${fromAccount} の投稿`);
    if (toAccount) lines.push(`@${toAccount} 宛ての投稿`);
    if (mentions.length) lines.push(`${mentions.map(v => `@${v}`).join('・')} に言及`);
    const language = normalizeLanguage(input.language);
    if (language) lines.push(`言語: ${language}`);
    const start = String(input.start || '').trim();
    const end = String(input.end || '').trim();
    if (start && end) lines.push(`${start}〜${end}`);
    else if (start) lines.push(`${start}以降`);
    else if (end) lines.push(`${end}まで`);
    return lines.length ? lines.join(' / ') : '検索条件を入力すると、ここに検索意図が表示されます。';
  }

  const api = Object.freeze({
    normalizeAccount,
    addDaysToDateValue,
    splitTerms,
    normalizeLanguage,
    buildXSearchQuery,
    buildXSearchUrl,
    getActiveFilterCount,
    buildSummary
  });

  globalThis.QuickLinksXSearchCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
