(() => {
  'use strict';

  if (window.__quickLinksXSearchSidepanelLoaded) return;
  window.__quickLinksXSearchSidepanelLoaded = true;

  const Core = globalThis.QuickLinksXSearchCore;
  if (!Core) throw new Error('QuickLinksXSearchCore is required before x-search-sidepanel.js');

  const ids = {
    main: 'reds-search',
    exact: 'x-search-exact',
    any: 'x-search-any',
    exclude: 'x-search-exclude',
    hashtags: 'x-search-hashtags',
    from: 'x-search-from',
    to: 'x-search-to',
    mentions: 'x-search-mentions',
    language: 'x-search-language',
    start: 'reds-date-start',
    end: 'reds-date-end',
    summary: 'x-search-summary',
    query: 'x-search-query-preview',
    count: 'x-search-filter-count',
    details: 'x-search-advanced'
  };

  function value(id) {
    return document.getElementById(id)?.value || '';
  }

  function collectInput() {
    return {
      allWords: value(ids.main),
      exactPhrase: value(ids.exact),
      anyWords: value(ids.any),
      excludeWords: value(ids.exclude),
      hashtags: value(ids.hashtags),
      fromAccount: value(ids.from),
      toAccount: value(ids.to),
      mentions: value(ids.mentions),
      language: value(ids.language),
      start: value(ids.start),
      end: value(ids.end)
    };
  }

  function buildUrl() {
    return Core.buildXSearchUrl(collectInput());
  }

  function refresh() {
    const input = collectInput();
    const summary = document.getElementById(ids.summary);
    const query = document.getElementById(ids.query);
    const count = document.getElementById(ids.count);
    const button = document.getElementById('reds-x');
    const builtQuery = Core.buildXSearchQuery(input);
    if (summary) summary.textContent = Core.buildSummary(input);
    if (query) query.textContent = builtQuery || '—';
    if (count) {
      const n = Core.getActiveFilterCount(input);
      count.textContent = n ? String(n) : '';
      count.hidden = !n;
    }
    if (button) {
      const enabled = !!builtQuery;
      button.disabled = !enabled;
      button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    }
  }

  function clearAdvanced() {
    [ids.exact, ids.any, ids.exclude, ids.hashtags, ids.from, ids.to, ids.mentions, ids.start, ids.end]
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    const language = document.getElementById(ids.language);
    if (language) language.value = '';
    refresh();
    document.getElementById(ids.main)?.focus();
  }

  function injectStyle() {
    if (document.getElementById('x-search-sidepanel-style')) return;
    const style = document.createElement('style');
    style.id = 'x-search-sidepanel-style';
    style.textContent = `
      #mode-reds.active {
        background:#111827 !important;
        border-color:#111827 !important;
        color:#fff !important;
        box-shadow:0 7px 16px rgba(17,24,39,.18) !important;
      }
      #reds-view { background:#f8fafc !important; }
      #reds-view .reds-tools-card {
        border-color:#d7dee8 !important;
        box-shadow:none !important;
      }
      #reds-view .reds-tools-title { color:#111827 !important; }
      #reds-view .reds-search-row input,
      #reds-view .reds-date-grid input,
      #reds-view .x-search-field {
        border:1px solid #d7dee8 !important;
        color:#172033 !important;
      }
      #reds-view .reds-search-row input:focus,
      #reds-view .reds-date-grid input:focus,
      #reds-view .x-search-field:focus {
        border-color:#111827 !important;
        box-shadow:0 0 0 3px rgba(17,24,39,.08) !important;
      }
      .x-search-disclosure {
        margin:8px 0;
        border:1px solid #e2e8f0;
        border-radius:10px;
        background:#fff;
      }
      .x-search-disclosure > summary {
        display:flex;
        align-items:center;
        gap:6px;
        cursor:pointer;
        list-style:none;
        padding:9px 10px;
        font-size:11px;
        font-weight:800;
        color:#334155;
      }
      .x-search-disclosure > summary::-webkit-details-marker { display:none; }
      .x-search-filter-count {
        min-width:18px;
        height:18px;
        padding:0 5px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        border-radius:999px;
        background:#111827;
        color:#fff;
        font-size:9px;
      }
      .x-search-advanced-body {
        border-top:1px solid #e2e8f0;
        padding:10px;
        display:grid;
        gap:10px;
      }
      .x-search-group { display:grid; gap:6px; }
      .x-search-group-title {
        font-size:10px;
        font-weight:900;
        color:#64748b;
        letter-spacing:.04em;
      }
      .x-search-field-grid {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:6px;
      }
      .x-search-field {
        width:100%;
        border-radius:8px;
        padding:8px 9px;
        font-size:11px;
        background:#fff;
        outline:none;
      }
      .x-search-field-grid .wide { grid-column:1 / -1; }
      .x-search-mirror {
        margin-top:8px;
        border:1px solid #e2e8f0;
        border-radius:10px;
        background:#f8fafc;
        padding:9px 10px;
      }
      .x-search-mirror-label {
        font-size:9px;
        font-weight:900;
        color:#64748b;
        margin-bottom:4px;
      }
      #x-search-summary {
        font-size:11px;
        line-height:1.55;
        color:#0f172a;
      }
      .x-search-query-details { margin-top:6px; }
      .x-search-query-details summary {
        cursor:pointer;
        font-size:9px;
        color:#64748b;
        font-weight:800;
      }
      #x-search-query-preview {
        display:block;
        margin-top:5px;
        padding:7px 8px;
        border-radius:7px;
        background:#0f172a;
        color:#e2e8f0;
        font-size:9px;
        line-height:1.45;
        white-space:pre-wrap;
        word-break:break-word;
      }
      #reds-x {
        width:100%;
        background:#111827 !important;
      }
      #reds-x:disabled { opacity:.42; cursor:default; }
      .x-search-clear-advanced {
        border:0;
        background:transparent;
        color:#64748b;
        font-size:10px;
        font-weight:800;
        cursor:pointer;
        justify-self:start;
        padding:0;
      }
      @media (max-width:360px) {
        .x-search-field-grid { grid-template-columns:1fr; }
        .x-search-field-grid .wide { grid-column:auto; }
      }
    `;
    document.head.appendChild(style);
  }

  function bind() {
    injectStyle();
    const selectors = [
      ids.main, ids.exact, ids.any, ids.exclude, ids.hashtags, ids.from, ids.to,
      ids.mentions, ids.language, ids.start, ids.end
    ];
    selectors.forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.dataset.xSearchBound === 'true') return;
      el.dataset.xSearchBound = 'true';
      el.addEventListener('input', refresh);
      el.addEventListener('change', refresh);
    });
    const clear = document.getElementById('x-search-clear-advanced');
    if (clear && clear.dataset.xSearchBound !== 'true') {
      clear.dataset.xSearchBound = 'true';
      clear.addEventListener('click', clearAdvanced);
    }
    refresh();
  }

  const api = Object.freeze({ collectInput, buildUrl, refresh, clearAdvanced, bind });
  globalThis.QuickLinksXSearchSidepanel = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once:true });
  } else {
    bind();
  }
})();
