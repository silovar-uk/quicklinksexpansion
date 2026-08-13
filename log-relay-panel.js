(() => {
  if (window.__quickLinksLogRelayPanelLoaded) return;
  window.__quickLinksLogRelayPanelLoaded = true;

  const Core = globalThis.QuickLinksLogRelayCore;
  const Shortcuts = globalThis.QuickLinksShortcuts;
  if (!Core) throw new Error('QuickLinksLogRelayCore is required before log-relay-panel.js');

  const STORE_MESSAGE = 'logRelayStore';
  const { ENTRY_PREFIX, INDEX_KEY, SORT_KEY, OPEN_REQUEST_KEY, TRASH_TTL_MS, STATUS, VIEW_ORDER } = Core;
  const VIEW = Object.freeze({ all: 'すべて', inbox: '未処理', hold: '保留', done: '完了', trash: '削除' });

  let activeView = 'inbox';
  let sortDirection = 'desc';
  let entries = [];
  let editingId = '';
  let selectedIds = new Set();
  let refreshTimer = null;

  async function store(action, payload = {}) {
    const response = await chrome.runtime.sendMessage({ type: STORE_MESSAGE, action, payload });
    if (!response?.ok) throw new Error(response?.error || 'Log Relayの操作に失敗しました。');
    return response.data;
  }

  async function loadEntries() {
    const state = await store('list');
    entries = Array.isArray(state?.entries) ? state.entries.map(entry => Core.normalizeEntry(entry)).filter(Boolean) : [];
    sortDirection = state?.sortDirection === 'asc' ? 'asc' : 'desc';
    pruneSelection();
  }

  function scheduleRefresh(delay = 35) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      loadEntries().then(render).catch(error => console.error('[Log Relay] 再読込に失敗しました。', error));
    }, delay);
  }

  function visibleEntries() {
    const filtered = activeView === 'all'
      ? entries.filter(entry => entry.status !== 'trash')
      : entries.filter(entry => entry.status === activeView);
    return Core.sortEntries(filtered, sortDirection);
  }

  function pruneSelection() {
    const visibleIds = new Set((activeView === 'all'
      ? entries.filter(entry => entry.status !== 'trash')
      : entries.filter(entry => entry.status === activeView)).map(entry => entry.id));
    selectedIds = new Set([...selectedIds].filter(id => visibleIds.has(id)));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function isSameJstDay(a, b = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
    return formatter.format(new Date(a)) === formatter.format(b);
  }

  function formatCreatedAt(value) {
    const date = new Date(value);
    if (isSameJstDay(date)) {
      return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    }
    return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function formatTrashRemaining(entry) {
    const trashedAt = Date.parse(entry.trashedAt || entry.updatedAt);
    if (!Number.isFinite(trashedAt)) return '24時間後に完全削除';
    const remaining = Math.max(0, trashedAt + TRASH_TTL_MS - Date.now());
    const hours = Math.ceil(remaining / (60 * 60 * 1000));
    if (hours >= 2) return `あと約${hours}時間`;
    const minutes = Math.max(1, Math.ceil(remaining / (60 * 1000)));
    return `あと約${minutes}分`;
  }

  function counts() {
    const result = { all: 0, inbox: 0, hold: 0, done: 0, trash: 0 };
    for (const entry of entries) {
      if (entry.status !== 'trash') result.all += 1;
      if (Object.hasOwn(result, entry.status)) result[entry.status] += 1;
    }
    return result;
  }

  function injectStyles() {
    if (document.getElementById('log-relay-style')) return;
    const style = document.createElement('style');
    style.id = 'log-relay-style';
    style.textContent = `
      body.log-relay-active > :not(header):not(.app-mode-tabs):not(#log-relay-root):not(script){display:none!important}
      body.log-relay-active header .header-search-area{display:none!important}
      #log-relay-mode.active{background:var(--qpl-text-strong,#0f172a)!important;color:#fff!important;border-color:var(--qpl-text-strong,#0f172a)!important;box-shadow:var(--qpl-shadow-sm)!important}
      #log-relay-root{display:none;min-height:0;flex:1;overflow:auto;background:var(--qpl-bg,#f3f4f6);color:var(--qpl-text-strong,#0f172a)}
      body.log-relay-active #log-relay-root{display:block}
      .lr-wrap{padding:var(--qpl-space-3,12px) var(--qpl-space-3,12px) 24px}
      .lr-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
      .lr-title{font-size:15px;font-weight:850;letter-spacing:-.015em;color:var(--qpl-text-strong,#0f172a)}
      .lr-sub{font-size:10px;color:var(--qpl-muted,#64748b);margin-top:2px;line-height:1.45}
      .lr-key{font:700 9px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#475569;background:#fff;border:1px solid var(--qpl-border-strong,#cbd5e1);border-radius:5px;padding:4px 6px;white-space:nowrap;box-shadow:var(--qpl-shadow-sm)}
      .lr-sticky{position:sticky;top:0;z-index:8;margin:0 -2px 8px;padding:2px 2px 7px;background:linear-gradient(var(--qpl-bg,#f3f4f6) 82%,rgba(243,244,246,0));backdrop-filter:blur(5px)}
      .lr-status-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin-bottom:7px}
      .lr-status-tab{min-width:0;border:1px solid var(--qpl-border,#dbe3ec);background:#fff;color:var(--qpl-muted,#64748b);border-radius:7px;padding:6px 3px;font:750 9.5px/1.15 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;box-shadow:0 1px 1px rgba(15,23,42,.025)}
      .lr-status-tab:hover,.lr-status-tab:focus-visible{border-color:var(--qpl-border-strong,#cbd5e1);color:#334155}.lr-status-tab[data-lr-status="all"].active{background:#334155;border-color:#334155;color:#fff}.lr-status-tab[data-lr-status="inbox"].active{background:var(--qpl-primary,#2563eb);border-color:var(--qpl-primary,#2563eb);color:#fff}.lr-status-tab[data-lr-status="hold"].active{background:var(--qpl-hold,#d97706);border-color:var(--qpl-hold,#d97706);color:#fff}.lr-status-tab[data-lr-status="done"].active{background:var(--qpl-done,#059669);border-color:var(--qpl-done,#059669);color:#fff}.lr-status-tab[data-lr-status="trash"].active{background:var(--qpl-danger,#dc2626);border-color:var(--qpl-danger,#dc2626);color:#fff}
      .lr-count{min-width:15px;height:15px;border-radius:999px;background:rgba(15,23,42,.07);display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-variant-numeric:tabular-nums}.lr-status-tab.active .lr-count{background:rgba(255,255,255,.2);color:#fff}
      .lr-toolbar{display:flex;align-items:center;gap:6px;min-height:29px}.lr-select-all{display:flex;align-items:center;gap:5px;min-width:0;color:var(--qpl-muted,#64748b);font-size:9.5px;font-weight:700;cursor:pointer}.lr-checkbox{width:14px;height:14px;margin:0;accent-color:var(--qpl-primary,#2563eb);cursor:pointer}.lr-selected-count{color:#475569;background:#e2e8f0;border-radius:999px;padding:2px 6px;font-size:8.5px;font-weight:800;white-space:nowrap}.lr-toolbar-spacer{flex:1}.lr-tool-btn{border:1px solid var(--qpl-border-strong,#cbd5e1);border-radius:7px;background:#fff;color:#475569;padding:5px 7px;font:750 9px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;white-space:nowrap}.lr-tool-btn:hover,.lr-tool-btn:focus-visible{background:#f8fafc;border-color:#94a3b8;color:#0f172a}.lr-tool-btn.danger{color:#b91c1c;border-color:#fecaca;background:#fff7f7}.lr-organize{position:relative}.lr-organize>summary{list-style:none}.lr-organize>summary::-webkit-details-marker{display:none}.lr-organize-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:15;width:130px;padding:5px;background:#fff;border:1px solid var(--qpl-border,#dbe3ec);border-radius:8px;box-shadow:var(--qpl-shadow-md);display:flex;flex-direction:column;gap:3px}.lr-organize-menu button{width:100%;text-align:left;border:0;background:transparent;border-radius:6px;padding:6px 7px;color:#475569;font:700 9.5px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}.lr-organize-menu button:hover{background:#f1f5f9;color:#0f172a}
      .lr-bulkbar{display:flex;align-items:center;gap:5px;padding:7px 8px;margin:0 0 8px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:8px}.lr-bulklabel{font-size:9.5px;font-weight:800;color:#1d4ed8;margin-right:auto}.lr-bulkbar.trash{border-color:#fecaca;background:#fff7f7}.lr-bulkbar.trash .lr-bulklabel{color:#b91c1c}.lr-trash-note{margin:0 0 8px;padding:6px 8px;border-radius:7px;background:#fff7f7;border:1px solid #fecaca;color:#991b1b;font-size:9px;line-height:1.45}
      .lr-list{display:flex;flex-direction:column;gap:7px}.lr-card{background:#fff;border:1px solid var(--qpl-border,#dbe3ec);border-radius:var(--qpl-radius-lg,10px);padding:9px 10px;box-shadow:var(--qpl-shadow-sm);transition:border-color .12s ease,box-shadow .12s ease,background .12s ease}.lr-card:hover{border-color:var(--qpl-border-strong,#cbd5e1);box-shadow:var(--qpl-shadow-md)}.lr-card.selected{border-color:#93c5fd;background:#f8fbff;box-shadow:0 0 0 1px rgba(59,130,246,.08)}.lr-card.trash{border-color:#fecaca;background:#fffafa}.lr-card-top{display:flex;align-items:center;gap:7px;margin-bottom:5px}.lr-time{font-size:10px;font-weight:750;color:var(--qpl-muted,#64748b);font-variant-numeric:tabular-nums;white-space:nowrap}.lr-card-status{font-size:8px;font-weight:800;border-radius:999px;padding:2px 5px;white-space:nowrap}.lr-card-status.inbox{color:#1d4ed8;background:#eff6ff}.lr-card-status.hold{color:#b45309;background:#fffbeb}.lr-card-status.done{color:#047857;background:#ecfdf5}.lr-card-status.trash{color:#b91c1c;background:#fef2f2}.lr-actions{margin-left:auto;display:flex;align-items:center;gap:4px}.lr-status-select{border:0;background:#f1f5f9;color:#475569;border-radius:6px;padding:4px 5px;font:650 10px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;outline:none;cursor:pointer}.lr-icon-btn{border:0;background:transparent;color:#94a3b8;width:24px;height:24px;border-radius:6px;cursor:pointer;padding:0;font-size:12px;display:grid;place-items:center}.lr-icon-btn:hover,.lr-icon-btn:focus-visible{background:#f1f5f9;color:#334155}.lr-icon-btn.danger:hover,.lr-icon-btn.danger:focus-visible{background:#fef2f2;color:#b91c1c}.lr-memo{font-size:13px;line-height:1.55;color:#1e293b;white-space:pre-wrap;overflow-wrap:anywhere}.lr-expiry{margin-top:5px;color:#b91c1c;font-size:8.5px;font-weight:650}.lr-edit{width:100%;resize:vertical;min-height:62px;border:1px solid var(--qpl-border-strong,#cbd5e1);border-radius:8px;padding:8px 9px;font:500 13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a;outline:none;background:#fff}.lr-edit:focus{border-color:#94a3b8;box-shadow:0 0 0 2px rgba(148,163,184,.18)}.lr-edit-actions{display:flex;justify-content:flex-end;gap:5px;margin-top:6px}.lr-small-btn{border:1px solid var(--qpl-border,#dbe3ec);border-radius:7px;background:#fff;color:#475569;padding:5px 8px;font:700 10px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}.lr-small-btn.primary{background:#0f172a;border-color:#0f172a;color:#fff}.lr-empty{border:1px dashed var(--qpl-border-strong,#cbd5e1);border-radius:10px;padding:26px 14px;text-align:center;color:#94a3b8;font-size:11px;line-height:1.65;background:rgba(255,255,255,.55)}
    `;
    document.head.appendChild(style);
  }

  function ensureRoot() {
    let root = document.getElementById('log-relay-root');
    if (root) return root;
    root = document.createElement('section');
    root.id = 'log-relay-root';
    root.setAttribute('aria-label', 'Log Relay');
    document.body.appendChild(root);
    return root;
  }

  function ensureModeButton() {
    const tabs = document.querySelector('.app-mode-tabs');
    if (!tabs || document.getElementById('log-relay-mode')) return;
    const button = document.createElement('button');
    button.id = 'log-relay-mode';
    button.type = 'button';
    button.className = 'app-mode-btn log has-shortcut';
    button.title = 'LOG（Alt+Shift+M）';
    button.innerHTML = '<span class="app-mode-title">↪ LOG</span><kbd class="app-mode-shortcut">Alt+Shift+M</kbd>';
    tabs.appendChild(button);
    button.addEventListener('click', activateRelay);
    ['mode-links', 'mode-reds', 'mode-prompts'].forEach(id => document.getElementById(id)?.addEventListener('click', deactivateRelay, true));
  }

  function activateRelay() {
    document.body.classList.add('log-relay-active');
    document.querySelectorAll('.app-mode-tabs .app-mode-btn').forEach(button => button.classList.remove('active'));
    document.getElementById('log-relay-mode')?.classList.add('active');
    render();
  }

  function deactivateRelay() {
    document.body.classList.remove('log-relay-active');
    document.getElementById('log-relay-mode')?.classList.remove('active');
  }

  function setActiveView(view) {
    if (!VIEW[view]) return;
    activeView = view;
    editingId = '';
    selectedIds.clear();
    render();
  }

  function render() {
    const root = ensureRoot();
    const c = counts();
    const visible = visibleEntries();
    const allVisibleSelected = visible.length > 0 && visible.every(entry => selectedIds.has(entry.id));
    const selectedCount = selectedIds.size;

    root.innerHTML = `
      <div class="lr-wrap">
        <div class="lr-heading">
          <div><div class="lr-title">Log Relay</div><div class="lr-sub">残すのは一瞬。整理はここで。　Alt+Shift+1〜5で表示切替</div></div>
          <span class="lr-key">Alt + M</span>
        </div>
        <div class="lr-sticky">
          <div class="lr-status-tabs" role="tablist">
            ${VIEW_ORDER.map((view, index) => `<button class="lr-status-tab${view === activeView ? ' active' : ''}" data-lr-status="${view}" type="button" title="${VIEW[view]}（Alt+Shift+${index + 1}）"><span>${VIEW[view]}</span><span class="lr-count">${c[view]}</span></button>`).join('')}
          </div>
          <div class="lr-toolbar">
            <label class="lr-select-all"><input class="lr-checkbox" id="lr-select-all" type="checkbox"${allVisibleSelected ? ' checked' : ''}${visible.length ? '' : ' disabled'}><span>すべて選択</span></label>
            ${selectedCount ? `<span class="lr-selected-count">${selectedCount}件</span>` : ''}
            <span class="lr-toolbar-spacer"></span>
            <button class="lr-tool-btn" id="lr-sort" type="button" title="並び順を切り替える">${sortDirection === 'desc' ? '↓ 新しい順' : '↑ 古い順'}</button>
            ${activeView !== 'trash' ? `<details class="lr-organize"><summary class="lr-tool-btn">整理 ▾</summary><div class="lr-organize-menu"><button id="lr-delete-before-today" type="button">昨日までを削除</button></div></details>` : ''}
          </div>
        </div>
        ${selectedCount ? renderBulkBar(selectedCount) : ''}
        ${activeView === 'trash' ? '<div class="lr-trash-note">削除したログは24時間後に自動で完全削除されます。必要ならここから元に戻せます。</div>' : ''}
        <div class="lr-list">${visible.length ? visible.map(renderCard).join('') : renderEmpty()}</div>
      </div>`;
    bindRootEvents(root, visible);
  }

  function renderBulkBar(selectedCount) {
    if (activeView === 'trash') {
      return `<div class="lr-bulkbar trash"><span class="lr-bulklabel">${selectedCount}件を選択中</span><button class="lr-tool-btn" id="lr-bulk-restore" type="button">元に戻す</button><button class="lr-tool-btn danger" id="lr-bulk-hard-delete" type="button">完全削除</button></div>`;
    }
    return `<div class="lr-bulkbar"><span class="lr-bulklabel">${selectedCount}件を選択中</span><button class="lr-tool-btn danger" id="lr-bulk-trash" type="button">削除</button></div>`;
  }

  function renderEmpty() {
    if (activeView === 'trash') return '<div class="lr-empty">削除したログはありません。</div>';
    return `<div class="lr-empty">${VIEW[activeView]}のログはありません。<br>Webページで Alt + M から1行だけ残せます。</div>`;
  }

  function renderCard(entry) {
    const isEditing = entry.id === editingId;
    const selected = selectedIds.has(entry.id);
    const statusChip = activeView === 'all' || entry.status === 'trash'
      ? `<span class="lr-card-status ${entry.status}">${STATUS[entry.status]}</span>` : '';
    return `
      <article class="lr-card${selected ? ' selected' : ''}${entry.status === 'trash' ? ' trash' : ''}" data-lr-id="${escapeHtml(entry.id)}">
        <div class="lr-card-top">
          <input class="lr-checkbox lr-row-check" type="checkbox" aria-label="このログを選択"${selected ? ' checked' : ''}>
          <time class="lr-time" datetime="${escapeHtml(entry.createdAt)}">${escapeHtml(formatCreatedAt(entry.createdAt))}</time>
          ${statusChip}
          <div class="lr-actions">
            ${entry.status === 'trash'
              ? `<button class="lr-small-btn" data-lr-action="restore" type="button">戻す</button><button class="lr-icon-btn danger" data-lr-action="hard-delete" type="button" title="完全削除" aria-label="完全削除">×</button>`
              : `<select class="lr-status-select" data-lr-action="status" aria-label="状態">${['inbox','hold','done'].map(status => `<option value="${status}"${status === entry.status ? ' selected' : ''}>${STATUS[status]}</option>`).join('')}</select><button class="lr-icon-btn" data-lr-action="edit" type="button" title="編集" aria-label="編集">✎</button><button class="lr-icon-btn danger" data-lr-action="trash" type="button" title="削除" aria-label="削除">×</button>`}
          </div>
        </div>
        ${isEditing
          ? `<textarea class="lr-edit" maxlength="500">${escapeHtml(entry.memo)}</textarea><div class="lr-edit-actions"><button class="lr-small-btn" data-lr-action="cancel-edit" type="button">取消</button><button class="lr-small-btn primary" data-lr-action="save-edit" type="button">保存</button></div>`
          : `<div class="lr-memo">${escapeHtml(entry.memo)}</div>`}
        ${entry.status === 'trash' ? `<div class="lr-expiry">${escapeHtml(formatTrashRemaining(entry))}で完全削除</div>` : ''}
      </article>`;
  }

  function bindRootEvents(root, visible) {
    root.querySelectorAll('[data-lr-status]').forEach(button => button.addEventListener('click', () => setActiveView(button.dataset.lrStatus)));

    root.querySelector('#lr-select-all')?.addEventListener('change', event => {
      if (event.target.checked) visible.forEach(entry => selectedIds.add(entry.id));
      else visible.forEach(entry => selectedIds.delete(entry.id));
      render();
    });

    root.querySelector('#lr-sort')?.addEventListener('click', async () => {
      const next = sortDirection === 'desc' ? 'asc' : 'desc';
      sortDirection = await store('setSort', { direction: next });
      render();
    });

    root.querySelector('#lr-delete-before-today')?.addEventListener('click', async () => {
      const cutoff = Core.startOfTodayJstMs();
      const ids = visible.filter(entry => Date.parse(entry.createdAt) < cutoff).map(entry => entry.id);
      if (!ids.length) return;
      if (!confirm(`${ids.length}件を「削除」へ移動しますか？`)) return;
      await store('moveMany', { ids, status: 'trash' });
      selectedIds.clear();
      scheduleRefresh(0);
    });

    root.querySelector('#lr-bulk-trash')?.addEventListener('click', async () => {
      if (!selectedIds.size || !confirm(`${selectedIds.size}件を「削除」へ移動しますか？`)) return;
      await store('moveMany', { ids: [...selectedIds], status: 'trash' });
      selectedIds.clear();
      scheduleRefresh(0);
    });

    root.querySelector('#lr-bulk-restore')?.addEventListener('click', async () => {
      if (!selectedIds.size) return;
      await store('moveMany', { ids: [...selectedIds], status: 'inbox' });
      selectedIds.clear();
      scheduleRefresh(0);
    });

    root.querySelector('#lr-bulk-hard-delete')?.addEventListener('click', async () => {
      if (!selectedIds.size || !confirm(`${selectedIds.size}件を完全削除します。元に戻せません。`)) return;
      await store('deleteMany', { ids: [...selectedIds] });
      selectedIds.clear();
      scheduleRefresh(0);
    });

    root.querySelectorAll('[data-lr-id]').forEach(card => {
      const id = card.dataset.lrId;
      const entry = entries.find(item => item.id === id);
      if (!entry) return;

      card.querySelector('.lr-row-check')?.addEventListener('change', event => {
        if (event.target.checked) selectedIds.add(id); else selectedIds.delete(id);
        render();
      });
      card.querySelector('[data-lr-action="status"]')?.addEventListener('change', async event => {
        await store('moveMany', { ids: [id], status: event.target.value });
        scheduleRefresh(0);
      });
      card.querySelector('[data-lr-action="edit"]')?.addEventListener('click', () => {
        editingId = id; render();
        requestAnimationFrame(() => document.querySelector(`[data-lr-id="${CSS.escape(id)}"] .lr-edit`)?.focus());
      });
      card.querySelector('[data-lr-action="cancel-edit"]')?.addEventListener('click', () => { editingId = ''; render(); });
      card.querySelector('[data-lr-action="save-edit"]')?.addEventListener('click', async () => {
        const textarea = card.querySelector('.lr-edit');
        const memo = String(textarea?.value || '').trim();
        if (!memo) return textarea?.focus();
        await store('updateMemo', { id, memo });
        editingId = '';
        scheduleRefresh(0);
      });
      card.querySelector('[data-lr-action="trash"]')?.addEventListener('click', async () => {
        if (!confirm('このログを「削除」へ移動しますか？')) return;
        await store('moveMany', { ids: [id], status: 'trash' });
        selectedIds.delete(id);
        scheduleRefresh(0);
      });
      card.querySelector('[data-lr-action="restore"]')?.addEventListener('click', async () => {
        await store('moveMany', { ids: [id], status: 'inbox' });
        selectedIds.delete(id);
        scheduleRefresh(0);
      });
      card.querySelector('[data-lr-action="hard-delete"]')?.addEventListener('click', async () => {
        if (!confirm('このログを完全削除します。元に戻せません。')) return;
        await store('deleteMany', { ids: [id] });
        selectedIds.delete(id);
        scheduleRefresh(0);
      });
    });
  }

  async function currentWindowId() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.windowId ?? null;
    } catch (_) { return null; }
  }

  async function consumeOpenRequest() {
    const area = chrome.storage.session || chrome.storage.local;
    const stored = await area.get(OPEN_REQUEST_KEY);
    const request = stored[OPEN_REQUEST_KEY];
    if (!request) return false;
    const windowId = await currentWindowId();
    if (Number.isInteger(request.windowId) && Number.isInteger(windowId) && request.windowId !== windowId) return false;
    await area.remove(OPEN_REQUEST_KEY);
    activateRelay();
    return true;
  }

  async function initialize() {
    injectStyles();
    ensureRoot();
    ensureModeButton();
    await loadEntries();
    render();
    await consumeOpenRequest();

    document.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229 || event.repeat) return;
      if (Shortcuts?.matches(event, Shortcuts.registry.log.open)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        activateRelay();
        return;
      }
      if (!document.body.classList.contains('log-relay-active')) return;
      const view = Shortcuts?.getLogView(event);
      if (view) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setActiveView(view);
        return;
      }
      const plainAltNumber = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && ['1','2','3'].includes(String(event.key || ''));
      if (plainAltNumber) deactivateRelay();
    }, true);

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'session' && changes[OPEN_REQUEST_KEY]) {
        consumeOpenRequest().catch(error => console.warn('[Log Relay] LOG表示要求の処理に失敗しました。', error));
        return;
      }
      if (areaName !== 'local') return;
      if (!Object.keys(changes).some(key => key.startsWith(ENTRY_PREFIX) || key === INDEX_KEY || key === SORT_KEY)) return;
      scheduleRefresh();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
