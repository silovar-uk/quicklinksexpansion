(() => {
  if (window.top !== window) return;

  const STORAGE_KEYS = ['items', 'projects', 'projectColors', 'floatingSearchEnabled', 'sidePanelHeartbeat', 'promptMemos', 'promptCategories', 'promptSortMode'];
  const RESULT_LIMIT = 30;
  const SIDE_PANEL_HEARTBEAT_TTL_MS = 2500;

  let items = [];
  let promptMemos = [];
  let promptCategories = ['未分類'];
  let promptCategoryFilter = 'ALL';
  let projects = ['未分類'];
  let projectColors = {};
  let floatingSearchEnabled = true;
  let sidePanelHeartbeat = 0;
  let lastPanelVisibleState = null;
  let mode = 'icon'; // hidden | icon | panel
  let userDismissed = false;
  let searchQuery = '';
  let promptSearchQuery = '';
  let promptSortMode = 'POPULAR';
  let promptEditingId = null;
  let promptDraft = null;
  let promptCopyFeedbackId = null;
  let promptCopyFeedbackTimer = null;
  let editingId = null;
  let addDraft = null;
  let activeTab = 'links';
  let redsQuery = '';
  let redsDateStart = '';
  let redsDateEnd = '';
  let host = null;
  let shadow = null;

  let shieldBound = false;

  function getChromeStorageLocal() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return null;
      return chrome.storage.local;
    } catch (_) {
      return null;
    }
  }

  function hasChromeStorageChangeListener() {
    try {
      return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.onChanged;
    } catch (_) {
      return false;
    }
  }

  async function storageGet(keys, fallback = {}) {
    const local = getChromeStorageLocal();
    if (!local) {
      console.warn('[Quick Links] chrome.storage.local が使えないため、ページ側ポップの初期化を一時スキップします。ページ再読み込み、または拡張機能の再読み込み後に再度お試しください。');
      return fallback;
    }
    try {
      return await local.get(keys);
    } catch (error) {
      console.warn('[Quick Links] chrome.storage.local.get に失敗しました。', error);
      return fallback;
    }
  }

  async function storageSet(values) {
    const local = getChromeStorageLocal();
    if (!local) {
      console.warn('[Quick Links] chrome.storage.local が使えないため、保存をスキップしました。ページを再読み込みしてください。');
      return false;
    }
    try {
      await local.set(values);
      return true;
    } catch (error) {
      console.warn('[Quick Links] chrome.storage.local.set に失敗しました。', error);
      return false;
    }
  }

  init();

  async function init() {
    const data = await storageGet(STORAGE_KEYS);
    items = data.items || [];
    promptMemos = Array.isArray(data.promptMemos) ? data.promptMemos : [];
    promptCategories = normalizePromptCategories(data.promptCategories);
    promptSortMode = normalizePromptSortMode(data.promptSortMode);
    projects = data.projects || ['未分類'];
    projectColors = data.projectColors || {};
    floatingSearchEnabled = data.floatingSearchEnabled !== false;
    sidePanelHeartbeat = Number(data.sidePanelHeartbeat || 0);

    createHost();
    bindStorageSync();
    window.setInterval(() => {
      const visible = isSidePanelEffectivelyOpen();
      if (visible !== lastPanelVisibleState) render();
    }, 1000);
    render();
  }

  function bindStorageSync() {
    if (!hasChromeStorageChangeListener()) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.items) items = changes.items.newValue || [];
      if (changes.promptMemos) promptMemos = Array.isArray(changes.promptMemos.newValue) ? changes.promptMemos.newValue : [];
      if (changes.promptCategories) promptCategories = normalizePromptCategories(changes.promptCategories.newValue);
      if (changes.promptSortMode) promptSortMode = normalizePromptSortMode(changes.promptSortMode.newValue);
      if (changes.projects) projects = changes.projects.newValue || ['未分類'];
      if (changes.projectColors) projectColors = changes.projectColors.newValue || {};
      if (changes.floatingSearchEnabled) {
        const wasEnabled = floatingSearchEnabled;
        floatingSearchEnabled = changes.floatingSearchEnabled.newValue !== false;
        if (!wasEnabled && floatingSearchEnabled && userDismissed) {
          userDismissed = false;
          mode = 'icon';
        }
      }
      if (changes.sidePanelHeartbeat) sidePanelHeartbeat = Number(changes.sidePanelHeartbeat.newValue || 0);
      render();
    });
  }

  function createHost() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'quick-links-floating-host';
    host.style.position = 'fixed';
    host.style.right = '16px';
    host.style.bottom = '16px';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';
    shadow = host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);
    bindShortcutShield();
  }


  function bindShortcutShield() {
    if (!shadow || shieldBound) return;
    shieldBound = true;
    const shieldTypes = [
      'keydown', 'keypress', 'keyup',
      'beforeinput', 'input',
      'compositionstart', 'compositionupdate', 'compositionend',
      'paste', 'cut'
    ];

    shieldTypes.forEach(type => {
      shadow.addEventListener(type, shieldKeyboardEvent, false);
    });
  }

  function shieldKeyboardEvent(e) {
    if (!isEditableEventTarget(e.target)) return;
    e.stopPropagation();
  }

  function isEditableEventTarget(target) {
    if (!target || !(target instanceof Element)) return false;
    if (target.closest('.ql-search, .ql-input, .ql-textarea')) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable === true;
  }

  function isSidePanelEffectivelyOpen() {
    return !!sidePanelHeartbeat && (Date.now() - sidePanelHeartbeat) < SIDE_PANEL_HEARTBEAT_TTL_MS;
  }

  function render() {
    if (!host || !shadow) return;

    const sidePanelVisible = isSidePanelEffectivelyOpen();
    const activeBefore = shadow.activeElement?.id || '';
    const searchBefore = shadow.getElementById('ql-search-input');
    const searchSelection = searchBefore
      ? { start: searchBefore.selectionStart ?? null, end: searchBefore.selectionEnd ?? null }
      : null;

    lastPanelVisibleState = sidePanelVisible;
    if (!floatingSearchEnabled || sidePanelVisible || mode === 'hidden') {
      host.style.display = 'none';
      return;
    }

    host.style.display = 'block';
    host.style.pointerEvents = 'none';

    const filtered = getFilteredItems();
    const listHtml = filtered.length
      ? filtered.map(renderItem).join('')
      : `<div class="ql-empty">${searchQuery ? '一致するリンクが見つかりません' : '表示できるリンクがありません'}</div>`;
    const filteredPrompts = getFilteredPromptMemos();
    const promptListHtml = filteredPrompts.length
      ? filteredPrompts.map(renderPromptMemoCard).join('')
      : `<div class="ql-empty">${promptSearchQuery ? '一致するプロンプトが見つかりません' : 'プロンプトメモがありません'}</div>`;

    const projectOptions = projects.map(p => `<option value="${escapeHtml(p)}"></option>`).join('');
    const promptCategoryOptions = getPromptCategories().map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
    const promptFilterHtml = renderPromptCategoryFilters();
    const editingItem = editingId ? items.find(item => item.id === editingId) : null;

    shadow.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }
        .ql-wrap {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #1f2937;
          pointer-events: auto;
        }
        .ql-launcher {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: flex-end;
        }
        .ql-add-btn,
        .ql-icon-btn {
          border: none;
          border-radius: 999px;
          color: white;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
          box-shadow: 0 10px 22px rgba(15, 23, 42, 0.28);
        }
        .ql-icon-btn {
          width: 48px;
          height: 48px;
          background: #c81e1e;
        }
        .ql-add-btn {
          width: 38px;
          height: 38px;
          background: #6b7280;
          font-size: 22px;
          font-weight: 800;
          line-height: 1;
        }
        .ql-icon-btn:hover { transform: translateY(-1px); box-shadow: 0 14px 28px rgba(15, 23, 42, 0.32); background: #991b1b; }
        .ql-add-btn:hover { transform: translateY(-1px); box-shadow: 0 14px 28px rgba(15, 23, 42, 0.24); background: #4b5563; }
        .ql-panel {
          width: 320px;
          background: #fff1f2;
          border: 1px solid #fecaca;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 20px 48px rgba(15, 23, 42, 0.22);
        }
        .ql-header {
          background: #c81e1e;
          color: white;
          padding: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .ql-title-wrap { min-width: 0; }
        .ql-title { font-size: 13px; font-weight: 700; line-height: 1.2; }
        .ql-sub { font-size: 11px; color: rgba(255,255,255,0.72); margin-top: 2px; }
        .ql-header-actions { display: flex; align-items: center; gap: 6px; }
        .ql-panel-open-btn {
          width: 30px;
          height: 30px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          background: rgba(255,255,255,0.10);
          color: white;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }
        .ql-panel-open-btn:hover { background: rgba(255,255,255,0.18); }
        .ql-header-btn {
          width: 30px; height: 30px; border: none; border-radius: 8px; cursor: pointer;
          background: rgba(255,255,255,0.08); color: white; font-size: 15px; line-height: 1;
        }
        .ql-header-btn:hover { background: rgba(255,255,255,0.16); }
        .ql-collapse-btn {
          background: #2563eb;
          box-shadow: 0 6px 14px rgba(37, 99, 235, 0.34);
          font-weight: 800;
        }
        .ql-collapse-btn:hover { background: #1d4ed8; }
        .ql-body { padding: 10px; background: #fff1f2; }
        .ql-tabs {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 10px;
        }
        .ql-tab-btn {
          border: 1px solid #e5e7eb;
          background: rgba(255,255,255,0.82);
          color: #374151;
          border-radius: 10px;
          padding: 8px 6px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.1;
          min-width: 0;
        }
        .ql-tab-btn:hover { transform: translateY(-1px); }
        .ql-tab-btn#ql-tab-links {
          background: #eff6ff;
          border-color: #bfdbfe;
          color: #1d4ed8;
        }
        .ql-tab-btn#ql-tab-reds {
          background: #fee2e2;
          border-color: #fca5a5;
          color: #b91c1c;
        }
        .ql-tab-btn#ql-tab-prompts {
          background: #fef3c7;
          border-color: #fcd34d;
          color: #92400e;
        }
        .ql-tab-btn.active-links {
          background: #2563eb !important;
          border-color: #1d4ed8 !important;
          color: white !important;
          box-shadow: 0 3px 10px rgba(37, 99, 235, 0.22);
        }
        .ql-tab-btn.active-reds {
          background: #dc2626 !important;
          border-color: #b91c1c !important;
          color: white !important;
          box-shadow: 0 3px 10px rgba(220, 38, 38, 0.22);
        }
        .ql-tab-btn.active-prompts {
          background: #d97706 !important;
          border-color: #b45309 !important;
          color: white !important;
          box-shadow: 0 3px 10px rgba(217, 119, 6, 0.24);
        }
        .ql-pane { display: none; }
        .ql-pane.active { display: block; }
        .ql-search-row { position: relative; margin-bottom: 8px; }
        .ql-search, .ql-reds-input, .ql-date-input {
          width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 34px 10px 12px;
          font-size: 13px; outline: none; background: white; color: #1f2937;
        }
        .ql-date-input { padding: 9px 10px; }
        .ql-search:focus, .ql-reds-input:focus, .ql-date-input:focus {
          border-color: #dc2626; box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.14);
        }
        .ql-clear {
          position: absolute; top: 50%; right: 8px; transform: translateY(-50%);
          width: 22px; height: 22px; border: none; border-radius: 999px; cursor: pointer;
          background: transparent; color: #7f1d1d; display: ${searchQuery ? 'inline-flex' : 'none'};
          align-items: center; justify-content: center;
        }
        .ql-clear:hover { background: #e2e8f0; color: #0f172a; }
        .ql-result-meta {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 11px; color: #64748b; margin-bottom: 8px; padding: 0 2px;
          gap: 8px;
        }
        .ql-prompt-sort-wrap {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #92400e;
          font-size: 10px;
          white-space: nowrap;
        }
        .ql-prompt-sort {
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid #fcd34d;
          background: #fffbeb;
          color: #92400e;
          border-radius: 999px;
          padding: 4px 20px 4px 8px;
          font-size: 10px;
          font-weight: 800;
          max-width: 118px;
          outline: none;
          cursor: pointer;
          background-image: linear-gradient(45deg, transparent 50%, #92400e 50%), linear-gradient(135deg, #92400e 50%, transparent 50%);
          background-position: calc(100% - 10px) 50%, calc(100% - 6px) 50%;
          background-size: 4px 4px, 4px 4px;
          background-repeat: no-repeat;
        }
        .ql-prompt-sort:focus {
          border-color: #d97706;
          box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.14);
        }
        .ql-list { max-height: 188px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 2px; }
        .ql-quick-date-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          margin-bottom: 8px;
        }
        .ql-quick-date-btn {
          border: 1px solid #fca5a5;
          background: white;
          color: #991b1b;
          border-radius: 999px;
          padding: 6px 8px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          min-width: 0;
          white-space: nowrap;
        }
        .ql-quick-date-btn:hover { background: #fee2e2; }
        .ql-date-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr);
          gap: 6px;
          align-items: center;
          margin-bottom: 10px;
        }
        .ql-date-sep {
          font-size: 12px;
          color: #7f1d1d;
          text-align: center;
          width: 18px;
        }
        .ql-date-input {
          min-width: 0;
          font-size: 12px;
          padding: 8px 8px;
        }
        .ql-reds-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .ql-reds-note {
          font-size: 10px;
          color: #7f1d1d;
          margin-top: 8px;
          line-height: 1.4;
        }
        .ql-reds-btn {
          border: none;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .ql-reds-btn.primary {
          background: #dc2626;
          color: white;
        }
        .ql-reds-btn.primary:hover { background: #b91c1c; }
        .ql-reds-btn.secondary {
          background: #111827;
          color: white;
        }
        .ql-reds-btn.secondary:hover { background: #000; }

        .ql-prompt-actions {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: center;
          margin-bottom: 8px;
        }
        .ql-prompt-add-btn {
          border: none;
          border-radius: 10px;
          background: #d97706;
          color: white;
          font-size: 12px;
          font-weight: 800;
          padding: 10px 12px;
          cursor: pointer;
          white-space: nowrap;
        }
        .ql-prompt-add-btn:hover { background: #b45309; }
        .ql-prompt-filter-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
        .ql-prompt-filter-btn { border: 1px solid #fde68a; background: #fff; color: #92400e; border-radius: 999px; padding: 5px 8px; font-size: 10px; font-weight: 800; cursor: pointer; max-width: 100%; }
        .ql-prompt-filter-btn.active { background: #d97706; border-color: #b45309; color: white; }
        .ql-prompt-filter-btn:hover { filter: brightness(0.97); }
        .ql-prompt-badge { display: inline-flex; align-self: flex-start; border: 1px solid #fde68a; background: #fff7ed; color: #92400e; border-radius: 999px; padding: 3px 8px; font-size: 10px; font-weight: 800; }
        .ql-prompt-list { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 2px; }
        .ql-prompt-card {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 12px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 7px;
          box-shadow: 0 3px 8px rgba(146, 64, 14, 0.08);
        }
        .ql-prompt-card-title { font-size: 13px; font-weight: 800; color: #78350f; line-height: 1.35; }
        .ql-prompt-card-body {
          font-size: 11px;
          color: #57534e;
          line-height: 1.45;
          max-height: 48px;
          overflow: hidden;
          white-space: pre-wrap;
        }
        .ql-prompt-card-meta { display: flex; justify-content: space-between; gap: 8px; font-size: 10px; color: #a16207; }
        .ql-prompt-card-actions { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; }
        .ql-prompt-card-btn {
          border: none;
          border-radius: 8px;
          padding: 7px 8px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          background: white;
          color: #92400e;
          border: 1px solid #fde68a;
        }
        .ql-prompt-card-btn.primary { background: #d97706; color: white; border-color: #d97706; }
        .ql-prompt-card-btn.copied { background: #16a34a !important; color: white !important; border-color: #15803d !important; box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.16); transform: translateY(1px) scale(0.98); }
        .ql-prompt-card.copied { outline: 2px solid rgba(22, 163, 74, 0.35); box-shadow: 0 6px 14px rgba(22, 163, 74, 0.14); }
        .ql-prompt-card-btn.danger { color: #b91c1c; border-color: #fecaca; }
        .ql-prompt-add-btn, .ql-reds-btn, .ql-quick-date, .ql-prompt-card-btn { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ql-prompt-card-btn:hover { filter: brightness(0.97); }
        .ql-char-count { font-size: 10px; color: #64748b; text-align: right; margin-top: -2px; }
        .ql-item {
          background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px;
          display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: start;
        }
        .ql-item:hover { border-color: #fca5a5; box-shadow: 0 4px 10px rgba(220, 38, 38, 0.10); }
        .ql-open { min-width: 0; cursor: pointer; }
        .ql-item-title {
          font-size: 13px; font-weight: 600; color: #1f2937; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px;
        }
        .ql-item-url {
          font-size: 10px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        .ql-item-note {
          font-size: 10px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 4px;
        }
        .ql-badge {
          display: inline-flex; align-items: center; max-width: 100%; margin-bottom: 6px;
          border-radius: 999px; font-size: 10px; font-weight: 700; padding: 3px 8px; border: 1px solid #e2e8f0;
        }
        .ql-badge-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
        .ql-badge-archived {
          display: inline-flex; align-items: center;
          border-radius: 999px; font-size: 10px; font-weight: 700; padding: 3px 8px;
          background: #e5e7eb; color: #475569; border: 1px solid #cbd5e1;
        }
        .ql-edit-btn {
          border: none; background: #eff6ff; color: #1d4ed8; border-radius: 8px; padding: 7px 9px;
          cursor: pointer; font-size: 12px; font-weight: 700;
        }
        .ql-edit-btn:hover { background: #dbeafe; }
        .ql-empty {
          background: white; border: 1px dashed #fda4af; border-radius: 12px; padding: 18px 14px; text-align: center;
          font-size: 12px; color: #64748b;
        }
        .ql-modal-layer {
          position: fixed; inset: 0; background: rgba(15, 23, 42, 0.18); display: flex; align-items: flex-end; justify-content: flex-end;
          padding: 16px; pointer-events: auto;
        }
        .ql-modal {
          width: 320px; background: white; border: 1px solid #dbe2ea; border-radius: 16px; overflow: hidden;
          box-shadow: 0 20px 48px rgba(15, 23, 42, 0.22);
        }
        .ql-modal-header {
          background: #c81e1e; color: white; padding: 12px; display: flex; align-items: center; justify-content: space-between;
        }
        .ql-modal-title { font-size: 13px; font-weight: 700; }
        .ql-modal-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; }

        .ql-modal-mode-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; padding: 5px; }
        .ql-modal-mode-btn { border: none; border-radius: 9px; padding: 8px 10px; font-size: 11px; font-weight: 800; cursor: pointer; background: transparent; color: #991b1b; white-space: nowrap; }
        .ql-modal-mode-btn.active { background: #c81e1e; color: white; box-shadow: 0 2px 8px rgba(200, 30, 30, 0.18); }
        .ql-modal-section { display: none; flex-direction: column; gap: 8px; }
        .ql-modal-section.active { display: flex; }
        .ql-char-count { font-size: 10px; color: #92400e; text-align: right; margin-top: -4px; }
        .ql-modal-hint { font-size: 10px; color: #64748b; margin-top: -2px; }
        .ql-edit-layer {
          position: fixed; inset: 0; background: rgba(15, 23, 42, 0.18); display: flex; align-items: flex-end; justify-content: flex-end;
          padding: 16px; pointer-events: auto;
        }
        .ql-edit-modal {
          width: 320px; background: white; border: 1px solid #dbe2ea; border-radius: 16px; overflow: hidden;
          box-shadow: 0 20px 48px rgba(15, 23, 42, 0.22);
        }
        .ql-edit-header {
          background: #c81e1e; color: white; padding: 12px; display: flex; align-items: center; justify-content: space-between;
        }
        .ql-edit-title { font-size: 13px; font-weight: 700; }
        .ql-edit-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
        .ql-label { font-size: 11px; color: #475569; font-weight: 700; margin-bottom: -2px; }
        .ql-input, .ql-textarea {
          width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 9px 10px; font-size: 13px;
          outline: none; background: white; color: #1f2937;
        }
        .ql-input::placeholder, .ql-textarea::placeholder { color: #94a3b8; opacity: 1; }
        .ql-input:focus, .ql-textarea:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); }
        .ql-textarea { min-height: 72px; resize: vertical; font-family: inherit; }
        .ql-edit-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
        .ql-btn-secondary, .ql-btn-primary {
          border-radius: 10px; padding: 9px 12px; font-size: 12px; font-weight: 700; cursor: pointer;
        }
        .ql-btn-secondary { border: 1px solid #cbd5e1; background: white; color: #475569; }
        .ql-btn-primary { border: none; background: #2563eb; color: white; }
        .ql-btn-secondary:hover { background: #f8fafc; }
        .ql-btn-primary:hover { background: #1d4ed8; }
      </style>
      <div class="ql-wrap">
        ${mode === 'icon' ? `
          <div class="ql-launcher">
            <button class="ql-add-btn" id="ql-open-add" title="現在のページを追加" aria-label="現在のページを追加">+</button>
            <button class="ql-icon-btn" id="ql-open-panel" title="Quick Linksを検索">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="M20 20l-3.5-3.5"></path>
              </svg>
            </button>
          </div>
        ` : `
          <div class="ql-panel" role="dialog" aria-label="Quick Links検索">
            <div class="ql-header">
              <div class="ql-title-wrap">
                <div class="ql-title">Quick Links 検索</div>
                <div class="ql-sub">すべてのリンクからすぐ検索</div>
              </div>
              <div class="ql-header-actions">
                <button class="ql-panel-open-btn" id="ql-open-sidepanel" title="サイドパネルを開く" aria-label="サイドパネルを開く">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="2"></rect>
                    <path d="M9 4v16"></path>
                  </svg>
                </button>
                <button class="ql-header-btn" id="ql-close" title="閉じる">×</button>
                <button class="ql-header-btn ql-collapse-btn" id="ql-collapse" title="小さくする">−</button>
              </div>
            </div>
            <div class="ql-body">
              <div class="ql-tabs">
                <button class="ql-tab-btn ${activeTab === 'links' ? 'active-links' : ''}" id="ql-tab-links" title="Quick Links">🔗 Links</button>
                <button class="ql-tab-btn ${activeTab === 'reds' ? 'active-reds' : ''}" id="ql-tab-reds" title="Reds Search">⚽ Reds</button>
                <button class="ql-tab-btn ${activeTab === 'prompts' ? 'active-prompts' : ''}" id="ql-tab-prompts" title="Prompt Memo">📝 Prompt</button>
              </div>
              <div class="ql-pane ${activeTab === 'links' ? 'active' : ''}" id="ql-pane-links">
                <div class="ql-search-row">
                  <input class="ql-search" id="ql-search-input" type="text" placeholder="検索（タイトル・URL・備考...）" value="${escapeHtml(searchQuery)}">
                  <button class="ql-clear" id="ql-clear-search" title="検索をクリア">×</button>
                </div>
                <div class="ql-result-meta">
                  <span id="ql-result-count">${filtered.length}件</span>
                  <span>新しいタブで開きます</span>
                </div>
                <div class="ql-list" id="ql-list">${listHtml}</div>
              </div>
              <div class="ql-pane ${activeTab === 'reds' ? 'active' : ''}" id="ql-pane-reds">
                <div class="ql-search-row">
                  <input class="ql-reds-input" id="ql-reds-query" type="text" placeholder="例：チケット、試合結果、移籍" value="${escapeHtml(redsQuery)}">
                </div>
                <div class="ql-quick-date-row">
                  <button class="ql-quick-date-btn" data-reds-range="today">今日</button>
                  <button class="ql-quick-date-btn" data-reds-range="yesterday">昨日</button>
                  <button class="ql-quick-date-btn" data-reds-range="week">1週間</button>
                  <button class="ql-quick-date-btn" data-reds-range="month">1ヶ月前〜</button>
                  <button class="ql-quick-date-btn" data-reds-range="year">1年以内</button>
                  <button class="ql-quick-date-btn" data-reds-range="older">1年前以前</button>
                </div>
                <div class="ql-date-row">
                  <input class="ql-date-input" id="ql-reds-date-start" type="date" value="${escapeHtml(redsDateStart)}">
                  <div class="ql-date-sep">〜</div>
                  <input class="ql-date-input" id="ql-reds-date-end" type="date" value="${escapeHtml(redsDateEnd)}">
                </div>
                <div class="ql-reds-actions">
                  <button class="ql-reds-btn primary" id="ql-reds-google">🌐 サイト内</button>
                  <button class="ql-reds-btn secondary" id="ql-reds-x">𝕏 公式X</button>
                </div>
                <div class="ql-reds-note">※ 𝕏 公式X は Ctrl+クリック風に、同じウインドウの裏タブで開きます。</div>
                <div class="ql-quick-date-row" style="margin-top:8px;">
                  <button class="ql-quick-date-btn" id="ql-reds-date-clear">クリア</button>
                </div>
              </div>
              <div class="ql-pane ${activeTab === 'prompts' ? 'active' : ''}" id="ql-pane-prompts">
                <div class="ql-prompt-actions">
                  <div class="ql-search-row" style="margin-bottom:0;">
                    <input class="ql-search" id="ql-prompt-search" type="text" placeholder="検索（タイトル・本文）" value="${escapeHtml(promptSearchQuery)}">
                    <button class="ql-clear" id="ql-clear-prompt-search" title="検索をクリア" style="display:${promptSearchQuery ? 'inline-flex' : 'none'}">×</button>
                  </div>
                  <button class="ql-prompt-add-btn" id="ql-prompt-new">＋ 新規</button>
                </div>
                <div class="ql-prompt-filter-row" id="ql-prompt-filter-row">${promptFilterHtml}</div>
                <div class="ql-result-meta">
                  <span id="ql-prompt-count">${filteredPrompts.length}件</span>
                  <label class="ql-prompt-sort-wrap" title="プロンプトメモの並び順">
                    並び
                    <select class="ql-prompt-sort" id="ql-prompt-sort-mode">
                      <option value="POPULAR" ${promptSortMode === 'POPULAR' ? 'selected' : ''}>よく使う</option>
                      <option value="ADDED" ${promptSortMode === 'ADDED' ? 'selected' : ''}>追加順</option>
                    </select>
                  </label>
                </div>
                <div class="ql-prompt-list" id="ql-prompt-list">${promptListHtml}</div>
              </div>
            </div>
          </div>
        `}
        ${addDraft ? renderAddModal(projectOptions) : ''}
        ${promptDraft ? renderPromptMemoModal(promptDraft) : ''}
        ${editingItem ? renderEditModal(editingItem, projectOptions) : ''}
      </div>
    `;

    if (mode === 'icon') {
      shadow.getElementById('ql-open-add')?.addEventListener('click', openAddModal);
      shadow.getElementById('ql-open-panel')?.addEventListener('click', () => {
        userDismissed = false;
        mode = 'panel';
        render();
        setTimeout(() => shadow.getElementById('ql-search-input')?.focus(), 0);
      });
      if (addDraft) {
        shadow.getElementById('ql-cancel-add')?.addEventListener('click', closeAddModal);
        shadow.getElementById('ql-close-add')?.addEventListener('click', closeAddModal);
        shadow.getElementById('ql-save-add')?.addEventListener('click', saveAdd);
        shadow.getElementById('ql-add-mode-link')?.addEventListener('click', () => switchAddMode('link'));
        shadow.getElementById('ql-add-mode-prompt')?.addEventListener('click', () => switchAddMode('prompt'));
        shadow.getElementById('ql-add-layer')?.addEventListener('click', (e) => {
          if (e.target && e.target.id === 'ql-add-layer') closeAddModal();
        });
        const updateAddPromptCount = () => {
          const body = shadow.getElementById('ql-add-prompt-body')?.value || '';
          const el = shadow.getElementById('ql-add-prompt-char-count');
          if (el) el.textContent = `${body.length.toLocaleString()}文字`;
        };
        shadow.getElementById('ql-add-prompt-body')?.addEventListener('input', updateAddPromptCount);
        ['ql-add-title','ql-add-url','ql-add-project','ql-add-note','ql-add-prompt-title','ql-add-prompt-category','ql-add-prompt-body'].forEach(id => {
          shadow.getElementById(id)?.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAddModal();
            if ((addDraft?.mode || 'link') === 'prompt') {
              if (e.key === 'Enter' && (id !== 'ql-add-prompt-body' || e.ctrlKey)) {
                e.preventDefault();
                saveAdd();
              }
            } else if (e.key === 'Enter' && (id !== 'ql-add-note' || !e.shiftKey)) {
              e.preventDefault();
              saveAdd();
            }
          });
        });
      }
      return;
    }

    shadow.getElementById('ql-open-sidepanel')?.addEventListener('click', openSidePanel);
    shadow.getElementById('ql-close')?.addEventListener('click', () => {
      userDismissed = true;
      mode = 'hidden';
      render();
    });
    shadow.getElementById('ql-collapse')?.addEventListener('click', () => {
      userDismissed = false;
      mode = 'icon';
      render();
    });
    shadow.getElementById('ql-tab-links')?.addEventListener('click', () => {
      activeTab = 'links';
      render();
      setTimeout(() => shadow.getElementById('ql-search-input')?.focus(), 0);
    });
    shadow.getElementById('ql-tab-reds')?.addEventListener('click', () => {
      activeTab = 'reds';
      render();
      setTimeout(() => shadow.getElementById('ql-reds-query')?.focus(), 0);
    });
    shadow.getElementById('ql-tab-prompts')?.addEventListener('click', () => {
      activeTab = 'prompts';
      render();
      setTimeout(() => shadow.getElementById('ql-prompt-search')?.focus(), 0);
    });

    if (activeTab === 'links') {
      shadow.getElementById('ql-search-input')?.addEventListener('input', (e) => {
        searchQuery = e.target.value || '';
        updatePanelResults();
      });
      shadow.getElementById('ql-search-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const first = getFilteredItems()[0];
          if (first) openItem(first.url, first.id, { active: !(e.ctrlKey || e.metaKey), keepPanelOpen: true });
        } else if (e.key === 'Escape') {
          userDismissed = false;
          mode = 'icon';
          render();
        }
      });
      shadow.getElementById('ql-clear-search')?.addEventListener('click', () => {
        searchQuery = '';
        updatePanelResults();
        setTimeout(() => shadow.getElementById('ql-search-input')?.focus(), 0);
      });
      bindPanelListEvents();
    } else if (activeTab === 'reds') {
      shadow.getElementById('ql-reds-query')?.addEventListener('input', (e) => {
        redsQuery = e.target.value || '';
      });
      shadow.getElementById('ql-reds-query')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runRedsGoogleSearch();
        } else if (e.key === 'Escape') {
          userDismissed = false;
          mode = 'icon';
          render();
        }
      });
      shadow.getElementById('ql-reds-date-start')?.addEventListener('input', (e) => {
        redsDateStart = e.target.value || '';
      });
      shadow.getElementById('ql-reds-date-end')?.addEventListener('input', (e) => {
        redsDateEnd = e.target.value || '';
      });
      shadow.querySelectorAll('[data-reds-range]').forEach(btn => {
        btn.addEventListener('click', () => applyRedsQuickDate(btn.getAttribute('data-reds-range')));
      });
      shadow.getElementById('ql-reds-date-clear')?.addEventListener('click', () => {
        redsDateStart = '';
        redsDateEnd = '';
        render();
      });
      shadow.getElementById('ql-reds-google')?.addEventListener('click', runRedsGoogleSearch);
      shadow.getElementById('ql-reds-x')?.addEventListener('click', runRedsXSearch);
    } else if (activeTab === 'prompts') {
      bindPromptMemoEvents();
    }

    if (promptDraft) {
      bindPromptMemoModalEvents();
    }

    if (editingItem) {
      shadow.getElementById('ql-cancel-edit')?.addEventListener('click', closeEdit);
      shadow.getElementById('ql-close-edit')?.addEventListener('click', closeEdit);
      shadow.getElementById('ql-save-edit')?.addEventListener('click', saveEdit);
      shadow.getElementById('ql-edit-layer')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'ql-edit-layer') closeEdit();
      });
    }

    if (activeBefore === 'ql-search-input' && !editingItem && activeTab === 'links') {
      const nextSearch = shadow.getElementById('ql-search-input');
      if (nextSearch) {
        nextSearch.focus();
        if (searchSelection && searchSelection.start != null && searchSelection.end != null) {
          try {
            nextSearch.setSelectionRange(searchSelection.start, searchSelection.end);
          } catch (_) {}
        }
      }
    } else if (activeBefore === 'ql-reds-query' && !editingItem && activeTab === 'reds') {
      shadow.getElementById('ql-reds-query')?.focus();
    } else if (activeBefore === 'ql-prompt-search' && !promptDraft && activeTab === 'prompts') {
      shadow.getElementById('ql-prompt-search')?.focus();
    } else if (activeBefore === 'ql-edit-title' && editingItem) {
      shadow.getElementById('ql-edit-title')?.focus();
    }
  }

  function updatePanelResults() {
    if (!shadow || mode !== 'panel') return;
    const listEl = shadow.getElementById('ql-list');
    const countEl = shadow.getElementById('ql-result-count');
    const clearBtn = shadow.getElementById('ql-clear-search');
    if (!listEl || !countEl) return;

    const filtered = getFilteredItems();
    countEl.textContent = `${filtered.length}件`;
    if (clearBtn) {
      clearBtn.style.display = searchQuery ? 'inline-flex' : 'none';
    }
    listEl.innerHTML = filtered.length
      ? filtered.map(renderItem).join('')
      : `<div class="ql-empty">${searchQuery ? '一致するリンクが見つかりません' : '表示できるリンクがありません'}</div>`;
    bindPanelListEvents();
  }

  function bindPanelListEvents() {
    shadow.querySelectorAll('[data-open-url]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        openItem(
          el.getAttribute('data-open-url'),
          el.getAttribute('data-open-id'),
          {
            active: !(e.ctrlKey || e.metaKey),
            keepPanelOpen: true
          }
        );
      });
      el.addEventListener('auxclick', (e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        openItem(
          el.getAttribute('data-open-url'),
          el.getAttribute('data-open-id'),
          {
            active: false,
            keepPanelOpen: true
          }
        );
      });
    });
    shadow.querySelectorAll('[data-edit-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        editingId = el.getAttribute('data-edit-id');
        render();
        setTimeout(() => shadow.getElementById('ql-edit-title')?.focus(), 0);
      });
    });
  }


  function normalizePromptCategories(value) {
    const base = Array.isArray(value) ? value : [];
    const merged = ['未分類', ...base, ...((promptMemos || []).map(m => getPromptMemoCategory(m)))];
    return Array.from(new Set(merged.map(v => String(v || '').trim()).filter(Boolean)));
  }

  function getPromptMemoCategory(memo) {
    return String(memo?.categoryName || memo?.projectName || '未分類').trim() || '未分類';
  }

  function categoryInputValue(name) {
    const value = String(name || '').trim();
    return value && value !== '未分類' ? value : '';
  }

  function getPromptCategories() {
    return normalizePromptCategories(promptCategories);
  }

  function addPromptCategory(name) {
    const categoryName = String(name || '').trim() || '未分類';
    return normalizePromptCategories([...promptCategories, categoryName]);
  }

  const PROMPT_CATEGORY_PALETTE = [
    { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', cardBg: '#f8fbff', cardBorder: '#bfdbfe' },
    { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca', cardBg: '#fff7f7', cardBorder: '#fecaca' },
    { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', cardBg: '#f8fff9', cardBorder: '#bbf7d0' },
    { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe', cardBg: '#fbfaff', cardBorder: '#ddd6fe' },
    { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc', cardBg: '#f6feff', cardBorder: '#a5f3fc' },
    { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', cardBg: '#fffaf5', cardBorder: '#fed7aa' },
    { bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8', cardBg: '#fff8fb', cardBorder: '#fbcfe8' },
    { bg: '#fefce8', text: '#854d0e', border: '#fde68a', cardBg: '#fffdf2', cardBorder: '#fde68a' }
  ];

  function hashPromptCategoryName(name) {
    const str = String(name || '未分類');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function getPromptCategoryColor(name) {
    const categoryName = String(name || '未分類').trim() || '未分類';
    if (categoryName === '未分類') {
      return { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb', cardBg: '#ffffff', cardBorder: '#e5e7eb' };
    }
    return PROMPT_CATEGORY_PALETTE[hashPromptCategoryName(categoryName) % PROMPT_CATEGORY_PALETTE.length];
  }

  function promptCategoryButtonStyle(categoryName, active) {
    const colors = getPromptCategoryColor(categoryName);
    if (active) {
      return `background:${colors.text};color:white;border-color:${colors.text};box-shadow:0 2px 7px rgba(15,23,42,0.12);`;
    }
    return `background:${colors.bg};color:${colors.text};border-color:${colors.border};`;
  }

  function promptCategoryBadgeStyle(categoryName) {
    const colors = getPromptCategoryColor(categoryName);
    return `background:${colors.bg};color:${colors.text};border-color:${colors.border};`;
  }

  function promptCategoryCardStyle(categoryName) {
    const colors = getPromptCategoryColor(categoryName);
    return `background:${colors.cardBg};border-color:${colors.cardBorder};`;
  }

  function renderPromptCategoryFilters() {
    const categories = getPromptCategories();
    const total = (promptMemos || []).length;
    const allActive = promptCategoryFilter === 'ALL' ? ' active' : '';
    const buttons = [`<button class="ql-prompt-filter-btn${allActive}" style="${promptCategoryButtonStyle('すべて', promptCategoryFilter === 'ALL')}" data-prompt-category="ALL">すべて (${total})</button>`];
    categories.forEach(category => {
      const count = (promptMemos || []).filter(memo => getPromptMemoCategory(memo) === category).length;
      const active = promptCategoryFilter === category ? ' active' : '';
      buttons.push(`<button class="ql-prompt-filter-btn${active}" style="${promptCategoryButtonStyle(category, promptCategoryFilter === category)}" data-prompt-category="${escapeHtml(category)}">${escapeHtml(category)} (${count})</button>`);
    });
    return buttons.join('');
  }

  function bindPromptCategoryFilterEvents() {
    shadow.querySelectorAll('[data-prompt-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        promptCategoryFilter = btn.getAttribute('data-prompt-category') || 'ALL';
        updatePromptMemoList();
      });
    });
  }

  function normalizePromptSortMode(value) {
    return value === 'ADDED' ? 'ADDED' : 'POPULAR';
  }

  function getPromptMemoAddedTime(memo) {
    const raw = memo?.createdAt || memo?.addedAt || memo?.updatedAt || '';
    const time = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function getPromptMemoUpdatedTime(memo) {
    const raw = memo?.updatedAt || memo?.createdAt || memo?.addedAt || '';
    const time = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function getFilteredPromptMemos() {
    const q = normalizeString(promptSearchQuery || '');
    let list = Array.isArray(promptMemos) ? [...promptMemos] : [];
    if (promptCategoryFilter !== 'ALL') {
      list = list.filter(memo => getPromptMemoCategory(memo) === promptCategoryFilter);
    }
    if (q) {
      list = list.filter(memo =>
        normalizeString(memo.title || '').includes(q) ||
        normalizeString(memo.body || '').includes(q) ||
        normalizeString(getPromptMemoCategory(memo)).includes(q)
      );
    }
    return list.sort((a, b) => {
      if (promptSortMode === 'ADDED') {
        const addedDiff = getPromptMemoAddedTime(b) - getPromptMemoAddedTime(a);
        if (addedDiff !== 0) return addedDiff;
        return String(b.id || '').localeCompare(String(a.id || ''));
      }
      const useDiff = Number(b.copyCount || 0) - Number(a.copyCount || 0);
      if (useDiff !== 0) return useDiff;
      const updatedDiff = getPromptMemoUpdatedTime(b) - getPromptMemoUpdatedTime(a);
      if (updatedDiff !== 0) return updatedDiff;
      return getPromptMemoAddedTime(b) - getPromptMemoAddedTime(a);
    });
  }

  function renderPromptMemoCard(memo) {
    const body = String(memo.body || '');
    const preview = body.length > 120 ? body.slice(0, 120) + '…' : body;
    const categoryName = getPromptMemoCategory(memo);
    const copied = promptCopyFeedbackId === memo.id;
    const copyLabel = copied ? 'コピー済み' : 'コピー';
    return `
      <div class="ql-prompt-card${copied ? ' copied' : ''}" style="${promptCategoryCardStyle(categoryName)}" data-prompt-id="${escapeHtml(memo.id)}">
        <div class="ql-prompt-badge" style="${promptCategoryBadgeStyle(categoryName)}">${escapeHtml(categoryName)}</div>
        <div class="ql-prompt-card-title">${escapeHtml(memo.title || '無題のプロンプト')}</div>
        <div class="ql-prompt-card-body">${escapeHtml(preview || '本文なし')}</div>
        <div class="ql-prompt-card-meta">
          <span>${body.length.toLocaleString()}文字</span>
          <span>コピー ${Number(memo.copyCount || 0).toLocaleString()}回</span>
        </div>
        <div class="ql-prompt-card-actions">
          <button class="ql-prompt-card-btn primary${copied ? ' copied' : ''}" data-prompt-copy="${escapeHtml(memo.id)}">${copyLabel}</button>
          <button class="ql-prompt-card-btn" data-prompt-edit="${escapeHtml(memo.id)}">編集</button>
          <button class="ql-prompt-card-btn danger" data-prompt-delete="${escapeHtml(memo.id)}">削除</button>
        </div>
      </div>
    `;
  }

  function updatePromptMemoList() {
    if (!shadow || mode !== 'panel') return;
    const listEl = shadow.getElementById('ql-prompt-list');
    const countEl = shadow.getElementById('ql-prompt-count');
    const clearBtn = shadow.getElementById('ql-clear-prompt-search');
    const filterEl = shadow.getElementById('ql-prompt-filter-row');
    if (!listEl || !countEl) return;
    if (filterEl) filterEl.innerHTML = renderPromptCategoryFilters();
    bindPromptCategoryFilterEvents();
    const filtered = getFilteredPromptMemos();
    countEl.textContent = `${filtered.length}件`;
    if (clearBtn) clearBtn.style.display = promptSearchQuery ? 'inline-flex' : 'none';
    listEl.innerHTML = filtered.length
      ? filtered.map(renderPromptMemoCard).join('')
      : `<div class="ql-empty">${promptSearchQuery ? '一致するプロンプトが見つかりません' : 'プロンプトメモがありません'}</div>`;
    bindPromptMemoCardEvents();
  }

  function bindPromptMemoEvents() {
    bindPromptCategoryFilterEvents();
    shadow.getElementById('ql-prompt-search')?.addEventListener('input', (e) => {
      promptSearchQuery = e.target.value || '';
      updatePromptMemoList();
    });
    shadow.getElementById('ql-prompt-search')?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        userDismissed = false;
        mode = 'icon';
        render();
      }
    });
    shadow.getElementById('ql-clear-prompt-search')?.addEventListener('click', () => {
      promptSearchQuery = '';
      updatePromptMemoList();
      setTimeout(() => shadow.getElementById('ql-prompt-search')?.focus(), 0);
    });
    shadow.getElementById('ql-prompt-new')?.addEventListener('click', () => {
      promptDraft = { id: null, title: '', body: '', categoryName: promptCategoryFilter !== 'ALL' ? promptCategoryFilter : '未分類' };
      render();
      setTimeout(() => shadow.getElementById('ql-prompt-title')?.focus(), 0);
    });
    shadow.getElementById('ql-prompt-sort-mode')?.addEventListener('change', async (e) => {
      promptSortMode = normalizePromptSortMode(e.target.value);
      updatePromptMemoList();
      await storageSet({ promptSortMode });
    });
    bindPromptMemoCardEvents();
  }

  function bindPromptMemoCardEvents() {
    shadow.querySelectorAll('[data-prompt-copy]').forEach(btn => {
      btn.addEventListener('click', () => copyPromptMemo(btn.getAttribute('data-prompt-copy')));
    });
    shadow.querySelectorAll('[data-prompt-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const memo = promptMemos.find(m => m.id === btn.getAttribute('data-prompt-edit'));
        if (!memo) return;
        promptDraft = { ...memo };
        render();
        setTimeout(() => shadow.getElementById('ql-prompt-title')?.focus(), 0);
      });
    });
    shadow.querySelectorAll('[data-prompt-delete]').forEach(btn => {
      btn.addEventListener('click', () => deletePromptMemo(btn.getAttribute('data-prompt-delete')));
    });
  }

  function renderPromptMemoModal(memo) {
    const body = memo.body || '';
    return `
      <div class="ql-modal-layer" id="ql-prompt-layer">
        <div class="ql-modal" role="dialog" aria-modal="true" aria-label="プロンプトメモを編集">
          <div class="ql-modal-header" style="background:#d97706;">
            <div class="ql-modal-title">📝 プロンプトメモ</div>
            <button class="ql-header-btn" id="ql-close-prompt" title="閉じる">×</button>
          </div>
          <div class="ql-modal-body">
            <label class="ql-label">タイトル</label>
            <input class="ql-input" id="ql-prompt-title" type="text" value="${escapeHtml(memo.title || '')}" placeholder="例：画像生成プロンプトの整理">
            <label class="ql-label">分類</label>
            <input class="ql-input" id="ql-prompt-category" type="text" value="${escapeHtml(categoryInputValue(getPromptMemoCategory(memo)))}" list="ql-prompt-category-list" placeholder="未分類">
            <datalist id="ql-prompt-category-list">${getPromptCategories().map(c => `<option value="${escapeHtml(c)}"></option>`).join('')}</datalist>
            <label class="ql-label">本文</label>
            <textarea class="ql-textarea" id="ql-prompt-body" placeholder="AIに入力するプロンプト本文">${escapeHtml(body)}</textarea>
            <div class="ql-char-count" id="ql-prompt-char-count">${body.length.toLocaleString()}文字</div>
            <div class="ql-edit-actions">
              <button class="ql-btn-secondary" id="ql-cancel-prompt">キャンセル</button>
              <button class="ql-btn-primary" id="ql-save-prompt" style="background:#d97706;">保存</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindPromptMemoModalEvents() {
    const close = () => {
      promptDraft = null;
      render();
    };
    const updateCount = () => {
      const body = shadow.getElementById('ql-prompt-body')?.value || '';
      const el = shadow.getElementById('ql-prompt-char-count');
      if (el) el.textContent = `${body.length.toLocaleString()}文字`;
    };
    shadow.getElementById('ql-cancel-prompt')?.addEventListener('click', close);
    shadow.getElementById('ql-close-prompt')?.addEventListener('click', close);
    shadow.getElementById('ql-prompt-layer')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'ql-prompt-layer') close();
    });
    shadow.getElementById('ql-prompt-body')?.addEventListener('input', updateCount);
    ['ql-prompt-title', 'ql-prompt-category', 'ql-prompt-body'].forEach(id => {
      shadow.getElementById(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          savePromptMemo();
        }
      });
    });
    shadow.getElementById('ql-save-prompt')?.addEventListener('click', savePromptMemo);
  }

  async function savePromptMemo() {
    const title = shadow.getElementById('ql-prompt-title')?.value.trim() || '';
    const categoryName = shadow.getElementById('ql-prompt-category')?.value.trim() || '未分類';
    const body = shadow.getElementById('ql-prompt-body')?.value || '';
    if (!title && !body.trim()) return;
    const now = new Date().toISOString();
    let next = Array.isArray(promptMemos) ? [...promptMemos] : [];
    if (promptDraft && promptDraft.id) {
      next = next.map(memo => memo.id === promptDraft.id ? {
        ...memo,
        title: title || '無題のプロンプト',
        categoryName,
        body,
        updatedAt: now
      } : memo);
    } else {
      next.unshift({
        id: 'prompt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        title: title || '無題のプロンプト',
        categoryName,
        body,
        createdAt: now,
        updatedAt: now,
        copyCount: 0
      });
    }
    const nextPromptCategories = addPromptCategory(categoryName);
    promptMemos = next;
    promptCategories = nextPromptCategories;
    await storageSet({ promptMemos: next, promptCategories: nextPromptCategories });
    promptDraft = null;
    render();
  }

  function showPromptCopyFeedback(id) {
    promptCopyFeedbackId = id;
    if (promptCopyFeedbackTimer) clearTimeout(promptCopyFeedbackTimer);
    updatePromptMemoList();
    promptCopyFeedbackTimer = setTimeout(() => {
      if (promptCopyFeedbackId === id) {
        promptCopyFeedbackId = null;
        updatePromptMemoList();
      }
    }, 1300);
  }

  async function copyPromptMemo(id) {
    const memo = promptMemos.find(m => m.id === id);
    if (!memo) return;

    // 押した瞬間にコピー回数と見た目を先に更新する。
    const now = new Date().toISOString();
    const next = promptMemos.map(m => m.id === id ? {
      ...m,
      copyCount: Number(m.copyCount || 0) + 1,
      lastCopiedAt: now,
      updatedAt: m.updatedAt || now
    } : m);
    promptMemos = next;
    showPromptCopyFeedback(id);
    storageSet({ promptMemos: next });

    try {
      await navigator.clipboard.writeText(memo.body || '');
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = memo.body || '';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  }

  async function deletePromptMemo(id) {
    const memo = promptMemos.find(m => m.id === id);
    if (!memo) return;
    if (!confirm(`プロンプトメモ「${memo.title || '無題'}」を削除しますか？`)) return;
    const next = promptMemos.filter(m => m.id !== id);
    promptMemos = next;
    await storageSet({ promptMemos: next });
    updatePromptMemoList();
  }

  function renderItem(item) {
    const colors = getProjectColor(item.projectName);
    const noteHtml = item.note ? `<div class="ql-item-note">${escapeHtml(item.note)}</div>` : '';
    const archivedBadge = item.archived ? '<span class="ql-badge-archived">アーカイブ</span>' : '';
    return `
      <div class="ql-item">
        <div class="ql-open" data-open-url="${escapeHtml(item.url)}" data-open-id="${escapeHtml(item.id)}" title="${item.archived ? '開くとアーカイブ解除します / Ctrl+クリックで裏タブ' : 'クリックで新しいタブ / Ctrl+クリックで裏タブ'}">
          <div class="ql-badge-row">
            <span class="ql-badge" style="background:${colors.bg};color:${colors.text};border-color:${colors.border};">${escapeHtml(item.projectName || '未分類')}</span>
            ${archivedBadge}
          </div>
          <div class="ql-item-title">${escapeHtml(item.title || item.url)}</div>
          <div class="ql-item-url">${escapeHtml(item.url)}</div>
          ${noteHtml}
        </div>
        <button class="ql-edit-btn" data-edit-id="${escapeHtml(item.id)}" title="編集">編集</button>
      </div>
    `;
  }

  function renderEditModal(item, projectOptions) {
    return `
      <div class="ql-edit-layer" id="ql-edit-layer">
        <div class="ql-edit-modal" role="dialog" aria-modal="true" aria-label="リンクを編集">
          <div class="ql-edit-header">
            <div class="ql-edit-title">リンクを編集</div>
            <button class="ql-header-btn" id="ql-close-edit" title="閉じる">×</button>
          </div>
          <div class="ql-edit-body">
            <div class="ql-label">タイトル</div>
            <input class="ql-input" id="ql-edit-title" type="text" value="${escapeHtml(item.title || '')}">
            <div class="ql-label">URL</div>
            <input class="ql-input" id="ql-edit-url" type="text" value="${escapeHtml(item.url || '')}">
            <div class="ql-label">分類</div>
            <input class="ql-input" id="ql-edit-project" type="text" value="${escapeHtml(categoryInputValue(item.projectName || '未分類'))}" list="ql-project-list" placeholder="未分類">
            <datalist id="ql-project-list">${projectOptions}</datalist>
            <div class="ql-label">備考</div>
            <textarea class="ql-textarea" id="ql-edit-note">${escapeHtml(item.note || '')}</textarea>
            <div class="ql-edit-actions">
              <button class="ql-btn-secondary" id="ql-cancel-edit">キャンセル</button>
              <button class="ql-btn-primary" id="ql-save-edit">保存</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }


  function renderAddModal(projectOptions) {
    const draft = addDraft || {};
    const addType = draft.mode || 'link';
    const promptCategoryOptions = getPromptCategories().map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
    return `
      <div class="ql-modal-layer" id="ql-add-layer">
        <div class="ql-modal" role="dialog" aria-modal="true" aria-label="追加">
          <div class="ql-modal-header">
            <div class="ql-modal-title">＋ 追加</div>
            <button class="ql-header-btn" id="ql-close-add" title="閉じる">×</button>
          </div>
          <div class="ql-modal-body">
            <div class="ql-modal-mode-switch" role="tablist" aria-label="追加対象の切り替え">
              <button class="ql-modal-mode-btn ${addType === 'link' ? 'active' : ''}" id="ql-add-mode-link" type="button">🔗 Link</button>
              <button class="ql-modal-mode-btn ${addType === 'prompt' ? 'active' : ''}" id="ql-add-mode-prompt" type="button">📝 Prompt</button>
            </div>

            <div class="ql-modal-section ${addType === 'link' ? 'active' : ''}" id="ql-add-link-section">
              <div class="ql-label">タイトル</div>
              <input class="ql-input" id="ql-add-title" type="text" value="${escapeHtml(draft.title || '')}">
              <div class="ql-label">URL</div>
              <input class="ql-input" id="ql-add-url" type="text" value="${escapeHtml(draft.url || '')}">
              <div class="ql-label">分類</div>
              <input class="ql-input" id="ql-add-project" type="text" value="${escapeHtml(categoryInputValue(draft.projectName || '未分類'))}" list="ql-project-list-add" placeholder="未分類">
              <datalist id="ql-project-list-add">${projectOptions}</datalist>
              <div class="ql-label">備考</div>
              <textarea class="ql-textarea" id="ql-add-note">${escapeHtml(draft.note || '')}</textarea>
              <div class="ql-modal-hint">Enterで保存 / Escで閉じる</div>
            </div>

            <div class="ql-modal-section ${addType === 'prompt' ? 'active' : ''}" id="ql-add-prompt-section">
              <div class="ql-label">タイトル</div>
              <input class="ql-input" id="ql-add-prompt-title" type="text" value="${escapeHtml(draft.promptTitle || '')}" placeholder="例：SNS投稿案を整える">
              <div class="ql-label">分類</div>
              <input class="ql-input" id="ql-add-prompt-category" type="text" value="${escapeHtml(categoryInputValue(draft.promptCategoryName || (promptCategoryFilter !== 'ALL' ? promptCategoryFilter : '未分類')))}" list="ql-add-prompt-category-list" placeholder="未分類">
              <datalist id="ql-add-prompt-category-list">${promptCategoryOptions}</datalist>
              <div class="ql-label">本文</div>
              <textarea class="ql-textarea" id="ql-add-prompt-body" placeholder="AIに入力するプロンプト本文">${escapeHtml(draft.promptBody || '')}</textarea>
              <div class="ql-char-count" id="ql-add-prompt-char-count">${String(draft.promptBody || '').length.toLocaleString()}文字</div>
              <div class="ql-modal-hint">Ctrl+Enterで保存 / Escで閉じる</div>
            </div>

            <div class="ql-edit-actions">
              <button class="ql-btn-secondary" id="ql-cancel-add">キャンセル</button>
              <button class="ql-btn-primary" id="ql-save-add">${addType === 'prompt' ? '保存' : '追加'}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function captureAddDraftInputs() {
    if (!addDraft) return;
    const linkTitle = shadow.getElementById('ql-add-title');
    const linkUrl = shadow.getElementById('ql-add-url');
    const linkProject = shadow.getElementById('ql-add-project');
    const linkNote = shadow.getElementById('ql-add-note');
    if (linkTitle) addDraft.title = linkTitle.value;
    if (linkUrl) addDraft.url = linkUrl.value;
    if (linkProject) addDraft.projectName = linkProject.value;
    if (linkNote) addDraft.note = linkNote.value;

    const promptTitle = shadow.getElementById('ql-add-prompt-title');
    const promptCategory = shadow.getElementById('ql-add-prompt-category');
    const promptBody = shadow.getElementById('ql-add-prompt-body');
    if (promptTitle) addDraft.promptTitle = promptTitle.value;
    if (promptCategory) addDraft.promptCategoryName = promptCategory.value;
    if (promptBody) addDraft.promptBody = promptBody.value;
  }

  function switchAddMode(nextMode) {
    if (!addDraft || !['link', 'prompt'].includes(nextMode)) return;
    captureAddDraftInputs();
    addDraft.mode = nextMode;
    render();
    setTimeout(() => {
      const focusId = nextMode === 'prompt' ? 'ql-add-prompt-title' : 'ql-add-title';
      shadow.getElementById(focusId)?.focus();
    }, 0);
  }

  function safePageTitle() {
    return (document.title || safePageUrl() || '').trim();
  }

  function safePageUrl() {
    try { return String(location.href || '').trim(); } catch (_) { return ''; }
  }

  function openAddModal() {
    const url = safePageUrl();
    addDraft = {
      mode: 'link',
      title: safePageTitle() || url,
      url,
      projectName: getAutoProjectName(url) || '未分類',
      note: '',
      promptTitle: '',
      promptCategoryName: promptCategoryFilter !== 'ALL' ? promptCategoryFilter : '未分類',
      promptBody: ''
    };
    render();
    setTimeout(() => shadow.getElementById('ql-add-title')?.focus(), 0);
  }

  function closeAddModal() {
    addDraft = null;
    render();
  }

  function getAutoProjectName(url) {
    const value = String(url || '').trim();
    if (!value) return null;
    const lower = value.toLowerCase();

    // LINE WORKS IDだけ貼った場合
    if (!/^https?:\/\//i.test(value) && /^[a-zA-Z0-9-]+$/.test(value)) return 'LINEWORKS';

    // 社内・業務系
    if (lower.includes('line.worksmobile.com/message/send')) return 'LINEWORKS';
    if (lower.includes('board.worksmobile.com')) return '掲示板';
    if (lower.includes('mail.worksmobile.com/')) return 'メールアーカイブ';
    if (lower.includes('drive.worksmobile.com') || lower.includes('jp1-link.drive.worksmobile.com')) return 'LWドライブ';

    // Google / ストレージ系
    if (lower.includes('docs.google.com/spreadsheets')) return 'スプレッドシート';
    if (lower.includes('docs.google.com/presentation')) return 'Googleドキュメント';
    if (lower.includes('docs.google.com/document')) return 'Googleドキュメント';
    if (lower.includes('docs.google.com/forms')) return 'Googleドキュメント';
    if (lower.includes('drive.google.com')) return 'ストレージ';
    if (lower.includes('dropbox.com')) return 'ストレージ';

    // 浦和レッズ・公式系
    if (lower.includes('www.urawa-reds.co.jp') || lower.includes('rexclub.urawa-reds.co.jp') || lower.includes('jleague.jp')) return 'クラブ発信';
    if (lower.includes('urawa-demo.sb-factory.com')) return '一時保存';

    // 制作・AI・自作ツール系は分類を増やしすぎないため「ツール」に寄せる
    if (lower.includes('github.com')) return 'ツール';
    if (lower.includes('gemini.google.com') || lower.includes('claude.ai') || lower.includes('chatgpt.com') || lower.includes('copilot.microsoft.com')) return 'ツール';
    if (lower.includes('canva.com') || lower.includes('backlog.com') || lower.includes('00m.in')) return 'ツール';
    if (lower.includes('silovar-uk.github.io') || lower.includes('script.google.com/macros')) return 'ツール';
    if (lower.includes('platinumaps.jp')) return 'ツール';

    return null;
  }

  function normalizeIncomingUrl(url) {
    const value = String(url || '').trim();
    if (!value) return '';
    if (!/^https?:\/\//i.test(value) && /^[a-zA-Z0-9-]+$/.test(value)) {
      return `https://line.worksmobile.com/message/send?version=26&channelId=${encodeURIComponent(value)}`;
    }
    return value;
  }

  async function saveAdd() {
    captureAddDraftInputs();
    if ((addDraft?.mode || 'link') === 'prompt') {
      await savePromptFromAddModal();
      return;
    }

    const titleRaw = shadow.getElementById('ql-add-title')?.value?.trim() || '';
    const urlRaw = shadow.getElementById('ql-add-url')?.value?.trim() || '';
    const note = shadow.getElementById('ql-add-note')?.value || '';
    let projectName = shadow.getElementById('ql-add-project')?.value?.trim() || '未分類';
    const url = normalizeIncomingUrl(urlRaw);
    if (!url) return;
    projectName = getAutoProjectName(url) || projectName || '未分類';

    const duplicate = (items || []).find(item => item && item.url === url);
    if (duplicate && !duplicate.archived) {
      shadow.getElementById('ql-add-url')?.focus();
      return;
    }

    let nextItems = [...items];
    if (duplicate && duplicate.archived) {
      nextItems = nextItems.map(item => item.id === duplicate.id ? {
        ...item,
        title: titleRaw || item.title || url,
        url,
        projectName,
        note,
        archived: false
      } : item);
    } else {
      nextItems.unshift({
        id: `ql-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: titleRaw || url,
        url,
        projectName,
        note,
        addedAt: new Date().toISOString(),
        archived: false
      });
    }

    const nextProjects = projects.includes(projectName) ? projects : [...projects, projectName];
    await storageSet({ items: nextItems, projects: nextProjects });
    items = nextItems;
    projects = nextProjects;
    addDraft = null;
    mode = 'panel';
    activeTab = 'links';
    render();
    setTimeout(() => shadow.getElementById('ql-search-input')?.focus(), 0);
  }

  async function savePromptFromAddModal() {
    const title = shadow.getElementById('ql-add-prompt-title')?.value.trim() || '';
    const categoryName = shadow.getElementById('ql-add-prompt-category')?.value.trim() || '未分類';
    const body = shadow.getElementById('ql-add-prompt-body')?.value || '';
    if (!title && !body.trim()) {
      shadow.getElementById('ql-add-prompt-title')?.focus();
      return;
    }
    const now = new Date().toISOString();
    const next = [{
      id: 'prompt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      title: title || '無題のプロンプト',
      categoryName,
      body,
      createdAt: now,
      updatedAt: now,
      copyCount: 0
    }, ...(Array.isArray(promptMemos) ? promptMemos : [])];
    const nextPromptCategories = addPromptCategory(categoryName);
    promptMemos = next;
    promptCategories = nextPromptCategories;
    addDraft = null;
    mode = 'panel';
    activeTab = 'prompts';
    await storageSet({ promptMemos: next, promptCategories: nextPromptCategories });
    render();
    setTimeout(() => shadow.getElementById('ql-prompt-search')?.focus(), 0);
  }

  function getFilteredItems() {
    let list = (items || []).filter(item => item);
    const q = normalizeString(searchQuery.trim());

    if (q) {
      list = list
        .map(item => ({ item, score: getMatchScore(item, q) }))
        .filter(entry => entry.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (!!a.item.archived !== !!b.item.archived) return a.item.archived ? 1 : -1;
          return new Date(b.item.addedAt || 0) - new Date(a.item.addedAt || 0);
        })
        .map(entry => entry.item);
    } else {
      list = list.sort((a, b) => {
        if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
        return new Date(b.addedAt || 0) - new Date(a.addedAt || 0);
      });
    }

    return list.slice(0, RESULT_LIMIT);
  }

  function getMatchScore(item, q) {
    const title = normalizeString(item.title || '');
    const url = normalizeString(item.url || '');
    const project = normalizeString(item.projectName || '');
    const note = normalizeString(item.note || '');

    let score = 0;
    if (title.startsWith(q)) score += 14;
    else if (title.includes(q)) score += 10;
    if (project.includes(q)) score += 7;
    if (note.includes(q)) score += 5;
    if (url.includes(q)) score += 3;
    return score;
  }

  function closeEdit() {
    editingId = null;
    render();
    setTimeout(() => shadow.getElementById('ql-search-input')?.focus(), 0);
  }

  async function saveEdit() {
    const title = shadow.getElementById('ql-edit-title')?.value?.trim() || '';
    const url = shadow.getElementById('ql-edit-url')?.value?.trim() || '';
    const projectName = shadow.getElementById('ql-edit-project')?.value?.trim() || '未分類';
    const note = shadow.getElementById('ql-edit-note')?.value || '';
    if (!editingId || !url) return;

    const nextItems = [...items];
    const index = nextItems.findIndex(item => item.id === editingId);
    if (index === -1) return;

    nextItems[index] = {
      ...nextItems[index],
      title: title || url,
      url,
      projectName,
      note
    };

    const nextProjects = projects.includes(projectName) ? projects : [...projects, projectName];
    await storageSet({ items: nextItems, projects: nextProjects });
    items = nextItems;
    projects = nextProjects;
    closeEdit();
  }

  function getProjectColor(name) {
    if (!name || name === '未分類') {
      return { bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb' };
    }
    if (projectColors[name]) return projectColors[name];
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

  function normalizeString(str) {
    if (!str) return '';
    let s = String(str).toLowerCase();
    s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
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
    s = s.replace(reg, match => kanaMap[match]);
    s = s.replace(/ﾞ/g, '゛').replace(/ﾟ/g, '゜');
    s = s.replace(/[ァ-ヶ]/g, match => String.fromCharCode(match.charCodeAt(0) - 0x60));
    return s;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  }

  async function openItem(url, itemId, options = {}) {
    if (!url) return;
    if (itemId) {
      const index = items.findIndex(item => item && item.id === itemId);
      if (index >= 0) {
        const nextItems = [...items];
        nextItems[index] = {
          ...nextItems[index],
          archived: false,
          lastClickedAt: new Date().toISOString(),
          clickCount: Number(nextItems[index].clickCount || 0) + 1
        };
        items = nextItems;
        await storageSet({ items: nextItems });
      }
    }
    openUrlInTab(url, options);
  }

  function openUrlInTab(url, options = {}) {
    if (!url) return;
    chrome.runtime.sendMessage({
      type: 'quickLinksOpenTab',
      url,
      active: options.active !== false,
      indexOffset: typeof options.indexOffset === 'number' ? options.indexOffset : 1
    });
  }

  function openSidePanel() {
    chrome.runtime.sendMessage({ type: 'quickLinksOpenSidePanel' });
  }

  function formatDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function applyRedsQuickDate(rangeType) {
    const now = new Date();
    const start = new Date(now);
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    if (rangeType === 'today') {
      redsDateStart = formatDateInputValue(now);
      redsDateEnd = formatDateInputValue(now);
    } else if (rangeType === 'yesterday') {
      start.setDate(now.getDate() - 1);
      redsDateStart = formatDateInputValue(start);
      redsDateEnd = formatDateInputValue(start);
    } else if (rangeType === 'week') {
      start.setDate(now.getDate() - 7);
      redsDateStart = formatDateInputValue(start);
      redsDateEnd = formatDateInputValue(now);
    } else if (rangeType === 'month') {
      start.setDate(now.getDate() - 30);
      redsDateStart = formatDateInputValue(start);
      redsDateEnd = formatDateInputValue(now);
    } else if (rangeType === 'year') {
      redsDateStart = formatDateInputValue(oneYearAgo);
      redsDateEnd = formatDateInputValue(now);
    } else if (rangeType === 'older') {
      redsDateStart = '';
      redsDateEnd = formatDateInputValue(oneYearAgo);
    }
    render();
  }

  function buildRedsGoogleUrl() {
    const query = String(redsQuery || '').trim();
    if (!query) return '';
    let fullQuery = `${query} site:urawa-reds.co.jp`;
    if (redsDateStart) fullQuery += ` after:${redsDateStart}`;
    if (redsDateEnd) fullQuery += ` before:${redsDateEnd}`;
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  }

  function buildRedsXUrl() {
    const query = String(redsQuery || '').trim();
    if (!query) return '';
    let xQuery = `${query} from:REDSOFFICIAL`;
    if (redsDateStart) xQuery += ` since:${redsDateStart}`;
    if (redsDateEnd) xQuery += ` until:${redsDateEnd}`;
    return `https://x.com/search?q=${encodeURIComponent(xQuery)}&f=live`;
  }

  function runRedsGoogleSearch() {
    const url = buildRedsGoogleUrl();
    if (!url) {
      shadow.getElementById('ql-reds-query')?.focus();
      return;
    }
    openUrlInTab(url);
  }

  function runRedsXSearch() {
    const url = buildRedsXUrl();
    if (!url) {
      shadow.getElementById('ql-reds-query')?.focus();
      return;
    }
    openUrlInTab(url, { active: false });
  }
})();
