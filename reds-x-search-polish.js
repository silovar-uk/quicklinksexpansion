(() => {
  if (window.__quickLinksRedsXSearchPolishLoaded) return;
  window.__quickLinksRedsXSearchPolishLoaded = true;

  const DEFAULT_X_ACCOUNT = 'REDSOFFICIAL';
  const ACCOUNT_INPUT_ID = 'reds-x-account';
  const ACCOUNT_ROW_ID = 'reds-x-account-row';

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

  function currentKeyword() {
    return String(document.getElementById('reds-search')?.value || '').trim();
  }

  function currentAccount() {
    return normalizeAccount(document.getElementById(ACCOUNT_INPUT_ID)?.value || '');
  }

  function buildXSearchUrl() {
    const keyword = currentKeyword();
    const account = currentAccount();
    if (!keyword && !account) return '';

    let xQuery = '';
    if (keyword) {
      xQuery = keyword;
      if (account) xQuery += ` from:${account}`;
    } else {
      // No keyword: search the account name itself, including mentions and references.
      xQuery = account;
    }

    const start = String(document.getElementById('reds-date-start')?.value || '').trim();
    const end = String(document.getElementById('reds-date-end')?.value || '').trim();
    if (start) xQuery += ` since:${start}`;
    if (end) {
      const exclusiveEnd = addDaysToDateValue(end, 1);
      if (exclusiveEnd) xQuery += ` until:${exclusiveEnd}`;
    }

    return `https://x.com/search?q=${encodeURIComponent(xQuery)}&f=live`;
  }

  async function runXSearch() {
    const url = buildXSearchUrl();
    if (!url) {
      const keywordInput = document.getElementById('reds-search');
      const accountInput = document.getElementById(ACCOUNT_INPUT_ID);
      (keywordInput || accountInput)?.focus();
      return false;
    }

    try {
      if (typeof openUrlFromSidepanel === 'function') {
        return await openUrlFromSidepanel(url, { active: true });
      }
      await chrome.tabs.create({ url, active: true });
      return true;
    } catch (error) {
      console.error('[Quick Links] X検索を開けませんでした。', error);
      return false;
    }
  }

  function updateButtonState() {
    const button = document.getElementById('reds-x');
    if (!button) return;
    const canSearch = !!(currentKeyword() || currentAccount());
    button.disabled = !canSearch;
    button.setAttribute('aria-disabled', canSearch ? 'false' : 'true');
    button.title = canSearch
      ? 'X検索（Alt+X）'
      : '検索語またはXアカウントを入力してください';
  }

  function injectStyles() {
    if (document.getElementById('reds-x-search-polish-style')) return;
    const style = document.createElement('style');
    style.id = 'reds-x-search-polish-style';
    style.textContent = `
      #${ACCOUNT_ROW_ID} {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: 7px;
        margin: 0 0 8px;
      }
      #${ACCOUNT_ROW_ID} .reds-x-account-label {
        color: #991b1b;
        font-size: 10px;
        font-weight: 800;
        white-space: nowrap;
      }
      #${ACCOUNT_ROW_ID} .reds-x-account-wrap {
        display: flex;
        align-items: center;
        min-width: 0;
        border: 1px solid #fecaca;
        border-radius: 8px;
        background: #fff;
        overflow: hidden;
      }
      #${ACCOUNT_ROW_ID} .reds-x-account-at {
        flex: 0 0 auto;
        padding-left: 9px;
        color: #9f6161;
        font-size: 12px;
        font-weight: 800;
      }
      #${ACCOUNT_INPUT_ID} {
        min-width: 0;
        width: 100%;
        border: 0 !important;
        border-radius: 0 !important;
        padding: 8px 9px 8px 3px !important;
        background: transparent !important;
        color: #4c1d1d;
        font-size: 12px;
        outline: none !important;
        box-shadow: none !important;
      }
      #${ACCOUNT_ROW_ID} .reds-x-account-wrap:focus-within {
        border-color: #dc2626;
        box-shadow: 0 0 0 3px rgba(220,38,38,.12);
      }
      #${ACCOUNT_ROW_ID} .reds-x-account-hint {
        grid-column: 2;
        margin-top: -3px;
        color: #9f6a6a;
        font-size: 9px;
        line-height: 1.35;
      }
      #reds-x:disabled {
        opacity: .45;
        cursor: default;
        transform: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function injectAccountField() {
    if (document.getElementById(ACCOUNT_INPUT_ID)) return;
    const searchRow = document.querySelector('#reds-view .reds-search-row');
    if (!searchRow) return;

    const row = document.createElement('div');
    row.id = ACCOUNT_ROW_ID;
    row.innerHTML = `
      <label class="reds-x-account-label" for="${ACCOUNT_INPUT_ID}">Xアカウント</label>
      <div class="reds-x-account-wrap">
        <span class="reds-x-account-at" aria-hidden="true">@</span>
        <input id="${ACCOUNT_INPUT_ID}" type="text" value="${DEFAULT_X_ACCOUNT}" autocomplete="off" spellcheck="false" aria-label="X検索アカウント">
      </div>
      <div class="reds-x-account-hint">変更可。検索語が空なら、このアカウント名そのものを検索します。</div>
    `;
    searchRow.insertAdjacentElement('afterend', row);

    const accountInput = row.querySelector(`#${ACCOUNT_INPUT_ID}`);
    accountInput?.addEventListener('input', updateButtonState);
    accountInput?.addEventListener('blur', () => {
      const normalized = normalizeAccount(accountInput.value);
      if (normalized && normalized !== accountInput.value) accountInput.value = normalized;
      updateButtonState();
    });
    accountInput?.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      runXSearch();
    });

    document.getElementById('reds-search')?.addEventListener('input', updateButtonState);
    updateButtonState();
  }

  function updateLabels() {
    const buttonLabel = document.querySelector('#reds-x > span');
    if (buttonLabel) buttonLabel.textContent = '𝕏 X検索';

    document.querySelectorAll('.help-guide-row').forEach(row => {
      const text = row.textContent || '';
      if (!text.includes('Alt + X') || !text.includes('公式X')) return;
      const description = row.querySelector('span');
      if (description) description.textContent = '入力した語と指定アカウントでXを検索します。検索語が空ならアカウント名を検索します。';
    });
  }

  function installFunctionOverrides() {
    // Keep every existing entry point (button, Alt+X and runtime messages) on one URL builder.
    try { buildRedsXUrlSidepanel = buildXSearchUrl; } catch (_) {}
    try { runRedsXSearchSidepanel = runXSearch; } catch (_) {}
  }

  function installButtonGuard() {
    document.addEventListener('click', event => {
      const button = event.target.closest?.('#reds-x');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (button.disabled) return;
      runXSearch();
    }, true);
  }

  function initialize() {
    injectStyles();
    injectAccountField();
    updateLabels();
    installFunctionOverrides();
    installButtonGuard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
