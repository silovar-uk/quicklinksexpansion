(() => {
  if (window.__quickLinksRedsXSearchPolishLoaded) return;
  window.__quickLinksRedsXSearchPolishLoaded = true;

  const Core = globalThis.QuickLinksRedsXSearchCore;
  if (!Core) throw new Error('QuickLinksRedsXSearchCore is required before reds-x-search-polish.js');

  const ACCOUNT_INPUT_ID = 'reds-x-account';
  const ACCOUNT_ROW_ID = 'reds-x-account-row';
  let initObserver = null;

  function currentAccount() {
    return Core.normalizeAccount(document.getElementById(ACCOUNT_INPUT_ID)?.value || '');
  }

  function updateButtonState() {
    const button = document.getElementById('reds-x');
    if (!button) return;
    const keyword = String(document.getElementById('reds-search')?.value || '').trim();
    const canSearch = !!(keyword || currentAccount());
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
    if (document.getElementById(ACCOUNT_INPUT_ID)) return true;
    const searchRow = document.querySelector('#reds-view .reds-search-row');
    if (!searchRow) return false;

    const row = document.createElement('div');
    row.id = ACCOUNT_ROW_ID;
    row.innerHTML = `
      <label class="reds-x-account-label" for="${ACCOUNT_INPUT_ID}">Xアカウント</label>
      <div class="reds-x-account-wrap">
        <span class="reds-x-account-at" aria-hidden="true">@</span>
        <input id="${ACCOUNT_INPUT_ID}" type="text" value="${Core.DEFAULT_X_ACCOUNT}" autocomplete="off" spellcheck="false" aria-label="X検索アカウント">
      </div>
      <div class="reds-x-account-hint">変更可。検索語が空なら、このアカウント名そのものを検索します。</div>
    `;
    searchRow.insertAdjacentElement('afterend', row);

    const accountInput = row.querySelector(`#${ACCOUNT_INPUT_ID}`);
    accountInput?.addEventListener('input', updateButtonState);
    accountInput?.addEventListener('blur', () => {
      const normalized = Core.normalizeAccount(accountInput.value);
      if (normalized && normalized !== accountInput.value) accountInput.value = normalized;
      updateButtonState();
    });
    accountInput?.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof runRedsXSearchSidepanel === 'function') {
        runRedsXSearchSidepanel();
      }
    });

    document.getElementById('reds-search')?.addEventListener('input', updateButtonState);
    updateButtonState();
    return true;
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

  function initialize() {
    injectStyles();
    const ready = injectAccountField();
    updateLabels();
    if (ready && initObserver) {
      initObserver.disconnect();
      initObserver = null;
    }
    return ready;
  }

  function initializeWhenReady() {
    if (initialize()) return;
    if (initObserver || !document.documentElement) return;
    initObserver = new MutationObserver(() => {
      initialize();
    });
    initObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWhenReady, { once: true });
  } else {
    initializeWhenReady();
  }
})();
