(() => {
  if (window.__quickLinksLogRelayPanelLoaded) return;
  window.__quickLinksLogRelayPanelLoaded = true;

  const ENTRY_PREFIX = 'logRelayEntry:';
  const SORT_KEY = 'logRelaySortDirection';
  const OPEN_REQUEST_KEY = 'logRelayOpenPanelRequest';
  const TRASH_TTL_MS = 24 * 60 * 60 * 1000;

  const STATUS = Object.freeze({
    inbox: '未処理',
    hold: '保留',
    done: '完了',
    trash: '削除'
  });
  const ACTIVE_STATUSES = ['inbox', 'hold', 'done'];
  const VIEW = Object.freeze({
    all: 'すべて',
    inbox: '未処理',
    hold: '保留',
    done: '完了',
    trash: '削除'
  });
  const VIEW_ORDER = ['all', 'inbox', 'hold', 'done', 'trash'];
  const VIEW_SHORTCUTS = Object.freeze({
    '1': 'all',
    '2': 'inbox',
    '3': 'hold',
    '4': 'done',
    '5': 'trash'
  });

  let activeView = 'inbox';
  let sortDirection = 'desc';
  let entries = [];
  let editingId = '';
  let selectedIds = new Set();

  function storageKey(id) {
    return `${ENTRY_PREFIX}${id}`;
  }

  function parseDate(value, fallback) {
    return Number.isFinite(Date.parse(value)) ? value : fallback;
  }

  function normalizeEntry(value, fallbackKey = '') {
    if (!value || typeof value !== 'object') return null;
    const id = String(value.id || fallbackKey.replace(ENTRY_PREFIX, '') || '').trim();
    const memo = String(value.memo || '').trim();
    if (!id || !memo) return null;

    const status = STATUS[value.status] ? value.status : 'inbox';
    const createdAt = parseDate(value.createdAt, new Date().toISOString());
    const updatedAt = parseDate(value.updatedAt, createdAt);
    const trashedAt = status === 'trash'
      ? parseDate(value.trashedAt, updatedAt)
      : null;

    return { id, memo, status, createdAt, updatedAt, trashedAt };
  }

  async function purgeExpiredTrashLocally() {
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    const expired = Object.entries(all)
      .filter(([key, value]) => {
        if (!key.startsWith(ENTRY_PREFIX) || value?.status !== 'trash') return false;
        const trashedAt = Date.parse(value?.trashedAt || value?.updatedAt || value?.createdAt);
        return Number.isFinite(trashedAt) && trashedAt + TRASH_TTL_MS <= now;
      })
      .map(([key]) => key);
    if (expired.length) await chrome.storage.local.remove(expired);
  }

  async function loadEntries() {
    await purgeExpiredTrashLocally();
    const all = await chrome.storage.local.get(null);
    entries = Object.entries(all)
      .filter(([key]) => key.startsWith(ENTRY_PREFIX))
      .map(([key, value]) => normalizeEntry(value, key))
      .filter(Boolean);

    const storedSort = all[SORT_KEY];
    if (storedSort === 'asc' || storedSort === 'desc') sortDirection = storedSort;
    pruneSelection();
  }

  function sorted(list) {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => direction * (Date.parse(a.createdAt) - Date.parse(b.createdAt)));
  }

  function visibleEntries() {
    const filtered = activeView === 'all'
      ? entries.filter(entry => entry.status !== 'trash')
      : entries.filter(entry => entry.status === activeView);
    return sorted(filtered);
  }

  function pruneSelection() {
    const visibleIds = new Set(
      (activeView === 'all'
        ? entries.filter(entry => entry.status !== 'trash')
        : entries.filter(entry => entry.status === activeView))
        .map(entry => entry.id)
    );
    selectedIds = new Set([...selectedIds].filter(id => visibleIds.has(id)));
  }

  async function saveEntry(entry) {
    const next = {
      ...entry,
      updatedAt: new Date().toISOString()
    };
    if (next.status === 'trash') {
      next.trashedAt = parseDate(next.trashedAt, next.updatedAt);
    } else {
      delete next.trashedAt;
    }
    const normalized = normalizeEntry(next);
    if (!normalized) return;
    const stored = { ...normalized };
    if (!stored.trashedAt) delete stored.trashedAt;
    await chrome.storage.local.set({ [storageKey(normalized.id)]: stored });
  }

  async function moveEntryToStatus(entry, status) {
    if (!entry || !STATUS[status]) return;
    const wasTrash = entry.status === 'trash';
    entry.status = status;
    if (status === 'trash' && !wasTrash) entry.trashedAt = new Date().toISOString();
    if (status !== 'trash') entry.trashedAt = null;
    await saveEntry(entry);
  }

  async function hardDelete(ids) {
    const keys = [...ids].map(storageKey);
    if (keys.length) await chrome.storage.local.remove(keys);
  }

  async function moveIdsToTrash(ids) {
    const targets = entries.filter(entry => ids.has(entry.id) && entry.status !== 'trash');
    for (const entry of targets) await moveEntryToStatus(entry, 'trash');
  }

  async function restoreIds(ids) {
    const targets = entries.filter(entry => ids.has(entry.id) && entry.status === 'trash');
    for (const entry of targets) await moveEntryToStatus(entry, 'inbox');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function isSameJstDay(a, b = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date(a)) === formatter.format(b);
  }

  function formatCreatedAt(value) {
    const date = new Date(value);
    if (isSameJstDay(date)) {
      return new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(date);
    }
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  }

  function startOfTodayJstMs(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now);
    const values = Object.fromEntries(
      parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)])
    );
    return Date.UTC(values.year, values.month - 1, values.day) - (9 * 60 * 60 * 1000);
  }

  function formatTrashRemaining(entry) {
    const trashedAt = Date.parse(entry.trashedAt || entry.updatedAt);
    if (!Number.isFinite(trashedAt)) return '24時間後に完全削除';
    const remaining = Math.max(0, trashedAt + TRASH_TTL_MS - Date.now());
    const hours = Math.ceil(remaining / (60 * 60 * 1000));
    if (hours >= 2) return `あと約${hours}時間で完全削除`;
    const minutes = Math.max(1, Math.ceil(remaining / (60 * 1000)));
    return `あと約${minutes}分で完全削除`;
  }

  function counts() {
    const result = {
      all: entries.filter(entry => entry.status !== 'trash').length,
      inbox: 0,
      hold: 0,
      done: 0,
      trash: 0
    };
    entries.forEach(entry => {
      if (Object.prototype.hasOwnProperty.call(result, entry.status)) result[entry.status] += 1;
    });
    return result;
  }

  function injectStyles() {
    if (document.getElementById('log-relay-style')) return;
    const style = document.createElement('style');
    style.id = 'log-relay-style';
    style.textContent = `
      body.log-relay-active > :not(header):not(.app-mode-tabs):not(#log-relay-root):not(script){display:none!important}
      body.log-relay-active header .header-search-area{display:none!important}

      .app-mode-tabs{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:4px!important;align-items:stretch!important}
      .app-mode-tabs .app-mode-btn,#log-relay-mode{width:auto!important;min-width:0!important;max-width:none!important;margin:0!important;padding:7px 3px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;font-size:10px!important}
      .app-mode-tabs .app-mode-title{font-size:10px!important;white-space:nowrap!important}
      #log-relay-mode{border:1px solid #cbd5e1;color:#475569;background:#fff}
      #log-relay-mode:hover,#log-relay-mode:focus-visible{background:#f8fafc;border-color:#94a3b8;color:#1e293b}
      #log-relay-mode.active{background:#1e293b;color:#fff;border-color:#1e293b;box-shadow:0 1px 2px rgba(15,23,42,.16)}

      #log-relay-root{display:none;min-height:0;flex:1;overflow:auto;background:#f3f4f6;color:#0f172a}
      body.log-relay-active #log-relay-root{display:block}
      .lr-wrap{padding:12px 12px 24px}
      .lr-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
      .lr-title{font-size:15px;font-weight:850;letter-spacing:-.015em;color:#0f172a}
      .lr-sub{font-size:10px;color:#64748b;margin-top:2px;line-height:1.45}
      .lr-key{font:700 9px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#475569;background:#fff;border:1px solid #cbd5e1;border-bottom-color:#94a3b8;border-radius:5px;padding:4px 6px;white-space:nowrap;box-shadow:0 1px 1px rgba(15,23,42,.05)}

      .lr-status-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin-bottom:8px}
      .lr-status-tab{min-width:0;border:1px solid #dbe3ec;background:#fff;color:#64748b;border-radius:7px;padding:6px 3px;font:750 9.5px/1.15 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;box-shadow:0 1px 1px rgba(15,23,42,.025)}
      .lr-status-tab:hover,.lr-status-tab:focus-visible{border-color:#94a3b8;color:#334155}
      .lr-status-tab[data-lr-status="all"].active{background:#334155;border-color:#334155;color:#fff}
      .lr-status-tab[data-lr-status="inbox"].active{background:#2563eb;border-color:#2563eb;color:#fff}
      .lr-status-tab[data-lr-status="hold"].active{background:#d97706;border-color:#d97706;color:#fff}
      .lr-status-tab[data-lr-status="done"].active{background:#059669;border-color:#059669;color:#fff}
      .lr-status-tab[data-lr-status="trash"].active{background:#dc2626;border-color:#dc2626;color:#fff}
      .lr-count{min-width:15px;height:15px;border-radius:999px;background:rgba(15,23,42,.07);display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-variant-numeric:tabular-nums}
      .lr-status-tab.active .lr-count{background:rgba(255,255,255,.2);color:#fff}

      .lr-toolbar{display:flex;align-items:center;gap:6px;margin-bottom:8px;min-height:29px}
      .lr-select-all{display:flex;align-items:center;gap:5px;min-width:0;color:#64748b;font-size:9.5px;font-weight:700;cursor:pointer}
      .lr-checkbox{width:14px;height:14px;margin:0;accent-color:#2563eb;cursor:pointer}
      .lr-selected-count{color:#475569;background:#e2e8f0;border-radius:999px;padding:2px 6px;font-size:8.5px;font-weight:800;white-space:nowrap}
      .lr-toolbar-spacer{flex:1}
      .lr-tool-btn{border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#475569;padding:5px 7px;font:750 9px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;white-space:nowrap}
      .lr-tool-btn:hover,.lr-tool-btn:focus-visible{background:#f8fafc;border-color:#94a3b8;color:#0f172a}
      .lr-tool-btn.danger{color:#b91c1c;border-color:#fecaca;background:#fff7f7}
      .lr-tool-btn.danger:hover{background:#fee2e2}
      .lr-bulkbar{display:flex;align-items:center;gap:5px;padding:7px 8px;margin:-1px 0 8px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:8px}
      .lr-bulklabel{font-size:9.5px;font-weight:800;color:#1d4ed8;margin-right:auto}
      .lr-bulkbar.trash{border-color:#fecaca;background:#fff7f7}
      .lr-bulkbar.trash .lr-bulklabel{color:#b91c1c}
      .lr-trash-note{margin:-1px 0 8px;padding:6px 8px;border-radius:7px;background:#fff7f7;border:1px solid #fecaca;color:#991b1b;font-size:9px;line-height:1.45}

      .lr-list{display:flex;flex-direction:column;gap:7px}
      .lr-card{background:#fff;border:1px solid #dbe3ec;border-radius:10px;padding:9px 10px;box-shadow:0 1px 2px rgba(15,23,42,.05);transition:border-color .12s ease,box-shadow .12s ease,background .12s ease}
      .lr-card:hover{border-color:#cbd5e1;box-shadow:0 2px 6px rgba(15,23,42,.07)}
      .lr-card.selected{border-color:#93c5fd;background:#f8fbff;box-shadow:0 0 0 1px rgba(59,130,246,.08)}
      .lr-card.trash{border-color:#fecaca;background:#fffafa}
      .lr-card-top{display:flex;align-items:center;gap:7px;margin-bottom:5px}
      .lr-time{font-size:10px;font-weight:750;color:#64748b;font-variant-numeric:tabular-nums;white-space:nowrap}
      .lr-card-status{font-size:8px;font-weight:800;border-radius:999px;padding:2px 5px;white-space:nowrap}
      .lr-card-status.inbox{color:#1d4ed8;background:#dbeafe}
      .lr-card-status.hold{color:#92400e;background:#fef3c7}
      .lr-card-status.done{color:#047857;background:#d1fae5}
      .lr-card-status.trash{color:#b91c1c;background:#fee2e2}
      .lr-actions{display:flex;align-items:center;gap:4px;margin-left:auto}
      .lr-status-select{border:1px solid #dbe3ec;background:#f8fafc;color:#475569;border-radius:6px;padding:4px 5px;font:700 9.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;outline:none;cursor:pointer}
      .lr-status-select:focus{border-color:#94a3b8}
      .lr-icon-btn{border:0;background:transparent;color:#64748b;width:24px;height:24px;border-radius:6px;cursor:pointer;padding:0;font-size:12px;display:grid;place-items:center}
      .lr-icon-btn:hover,.lr-icon-btn:focus-visible{background:#e2e8f0;color:#1e293b}
      .lr-icon-btn.danger{color:#b91c1c}
      .lr-icon-btn.danger:hover,.lr-icon-btn.danger:focus-visible{background:#fee2e2;color:#991b1b}
      .lr-memo{font-size:13px;line-height:1.55;color:#1e293b;white-space:pre-wrap;overflow-wrap:anywhere}
      .lr-trash-expiry{margin-top:5px;font-size:8.5px;color:#b91c1c;font-weight:650}
      .lr-edit{width:100%;resize:vertical;min-height:62px;border:1px solid #cbd5e1;border-radius:8px;padding:8px 9px;font:500 13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a;outline:none;background:#fff}
      .lr-edit:focus{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.12)}
      .lr-edit-actions{display:flex;justify-content:flex-end;gap:5px;margin-top:6px}
      .lr-small-btn{border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#475569;padding:5px 8px;font:750 10px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
      .lr-small-btn.primary{background:#1e293b;border-color:#1e293b;color:#fff}
      .lr-empty{border:1px dashed #cbd5e1;border-radius:10px;padding:26px 14px;text-align:center;color:#64748b;font-size:11px;line-height:1.65;background:rgba(255,255,255,.7)}
      .lr-shortcuts{margin-top:10px;color:#94a3b8;font-size:8.5px;line-height:1.5;text-align:center}
      .lr-shortcuts kbd{font:700 8px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;border:1px solid #dbe3ec;border-radius:4px;padding:2px 3px;color:#64748b}
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
    button.className = 'app-mode-btn';
    button.title = 'Log Relay';
    button.innerHTML = '<span class="app-mode-title">LOG</span>';
    tabs.appendChild(button);
    button.addEventListener('click', activateRelay);

    ['mode-links', 'mode-reds', 'mode-prompts'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', deactivateRelay, true);
    });
  }

  function activateRelay() {
    document.body.classList.add('log-relay-active');
    document.getElementById('log-relay-mode')?.classList.add('active');
    document.querySelectorAll('.app-mode-tabs .app-mode-btn').forEach(button => {
      if (button.id !== 'log-relay-mode') button.classList.remove('active');
    });
    render();
  }

  function deactivateRelay() {
    document.body.classList.remove('log-relay-active');
    document.getElementById('log-relay-mode')?.classList.remove('active');
  }

  function setView(view) {
    if (!VIEW[view]) return;
    activeView = view;
    editingId = '';
    selectedIds.clear();
    render();
  }

  async function setSortDirection(direction) {
    sortDirection = direction === 'asc' ? 'asc' : 'desc';
    await chrome.storage.local.set({ [SORT_KEY]: sortDirection });
    render();
  }

  function render() {
    const root = ensureRoot();
    const c = counts();
    const visible = visibleEntries();
    pruneSelection();
    const selectedCount = selectedIds.size;
    const allVisibleSelected = visible.length > 0 && visible.every(entry => selectedIds.has(entry.id));
    const viewLabel = VIEW[activeView];

    root.innerHTML = `
      <div class="lr-wrap">
        <div class="lr-heading">
          <div>
            <div class="lr-title">Log Relay</div>
            <div class="lr-sub">残すのは一瞬。整理は必要なときだけ。</div>
          </div>
          <span class="lr-key">Alt + Shift + M</span>
        </div>

        <div class="lr-status-tabs" role="tablist" aria-label="ログ表示">
          ${VIEW_ORDER.map((status, index) => `
            <button class="lr-status-tab${status === activeView ? ' active' : ''}" data-lr-status="${status}" type="button" title="Alt+Shift+${index + 1}">
              <span>${VIEW[status]}</span><span class="lr-count">${c[status]}</span>
            </button>`).join('')}
        </div>

        <div class="lr-toolbar">
          <label class="lr-select-all">
            <input class="lr-checkbox" id="lr-select-all" type="checkbox"${allVisibleSelected ? ' checked' : ''}${visible.length ? '' : ' disabled'}>
            <span>全選択</span>
          </label>
          <span class="lr-selected-count">${selectedCount}件選択</span>
          <span class="lr-toolbar-spacer"></span>
          ${activeView !== 'trash' ? '<button class="lr-tool-btn danger" data-lr-action="delete-yesterday" type="button">昨日まで削除</button>' : ''}
          <button class="lr-tool-btn" data-lr-action="sort" type="button">${sortDirection === 'desc' ? '新しい順 ↓' : '古い順 ↑'}</button>
        </div>

        ${selectedCount ? `
          <div class="lr-bulkbar${activeView === 'trash' ? ' trash' : ''}">
            <span class="lr-bulklabel">${selectedCount}件</span>
            ${activeView === 'trash'
              ? '<button class="lr-tool-btn" data-lr-action="bulk-restore" type="button">未処理へ戻す</button><button class="lr-tool-btn danger" data-lr-action="bulk-hard-delete" type="button">完全削除</button>'
              : '<button class="lr-tool-btn danger" data-lr-action="bulk-trash" type="button">まとめて削除</button>'}
          </div>` : ''}

        ${activeView === 'trash'
          ? '<div class="lr-trash-note">削除したログは24時間後に自動で完全削除されます。必要ならそれまでに未処理へ戻せます。</div>'
          : ''}

        <div class="lr-list">
          ${visible.length
            ? visible.map(entry => renderCard(entry)).join('')
            : `<div class="lr-empty">${escapeHtml(viewLabel)}のログはありません。${activeView === 'inbox' ? '<br>Webページで Alt + M から1行だけ残せます。' : ''}</div>`}
        </div>

        <div class="lr-shortcuts">
          表示切替：
          <kbd>Alt+Shift+1</kbd> すべて
          <kbd>2</kbd> 未処理
          <kbd>3</kbd> 保留
          <kbd>4</kbd> 完了
          <kbd>5</kbd> 削除
        </div>
      </div>`;
    bindRootEvents(root);
  }

  function renderCard(entry) {
    const isEditing = entry.id === editingId;
    const selected = selectedIds.has(entry.id);
    const isTrash = entry.status === 'trash';
    return `
      <article class="lr-card${selected ? ' selected' : ''}${isTrash ? ' trash' : ''}" data-lr-id="${escapeHtml(entry.id)}">
        <div class="lr-card-top">
          <input class="lr-checkbox" data-lr-action="select" type="checkbox" aria-label="このログを選択"${selected ? ' checked' : ''}>
          <time class="lr-time" datetime="${escapeHtml(entry.createdAt)}">${escapeHtml(formatCreatedAt(entry.createdAt))}</time>
          <span class="lr-card-status ${escapeHtml(entry.status)}">${escapeHtml(STATUS[entry.status])}</span>
          <div class="lr-actions">
            ${isTrash
              ? '<button class="lr-icon-btn" data-lr-action="restore" type="button" title="未処理へ戻す" aria-label="未処理へ戻す">↶</button><button class="lr-icon-btn danger" data-lr-action="hard-delete" type="button" title="完全削除" aria-label="完全削除">×</button>'
              : `<select class="lr-status-select" data-lr-action="status" aria-label="状態">
                  ${ACTIVE_STATUSES.map(status => `<option value="${status}"${status === entry.status ? ' selected' : ''}>${STATUS[status]}</option>`).join('')}
                </select>
                <button class="lr-icon-btn" data-lr-action="edit" type="button" title="編集" aria-label="編集">✎</button>
                <button class="lr-icon-btn danger" data-lr-action="trash" type="button" title="削除" aria-label="削除">⌫</button>`}
          </div>
        </div>
        ${isEditing
          ? `<textarea class="lr-edit" maxlength="500">${escapeHtml(entry.memo)}</textarea>
             <div class="lr-edit-actions"><button class="lr-small-btn" data-lr-action="cancel-edit" type="button">取消</button><button class="lr-small-btn primary" data-lr-action="save-edit" type="button">保存</button></div>`
          : `<div class="lr-memo">${escapeHtml(entry.memo)}</div>`}
        ${isTrash ? `<div class="lr-trash-expiry">${escapeHtml(formatTrashRemaining(entry))}</div>` : ''}
      </article>`;
  }

  function bindRootEvents(root) {
    root.querySelectorAll('[data-lr-status]').forEach(button => {
      button.addEventListener('click', () => setView(button.dataset.lrStatus));
    });

    root.querySelector('#lr-select-all')?.addEventListener('change', event => {
      const visible = visibleEntries();
      if (event.target.checked) visible.forEach(entry => selectedIds.add(entry.id));
      else visible.forEach(entry => selectedIds.delete(entry.id));
      render();
    });

    root.querySelector('[data-lr-action="sort"]')?.addEventListener('click', () => {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc').catch(error => console.error('[Log Relay] 並び順保存に失敗しました。', error));
    });

    root.querySelector('[data-lr-action="delete-yesterday"]')?.addEventListener('click', async () => {
      const cutoff = startOfTodayJstMs();
      const targets = visibleEntries().filter(entry => entry.status !== 'trash' && Date.parse(entry.createdAt) < cutoff);
      if (!targets.length) return;
      if (!confirm(`昨日までのログ ${targets.length}件を削除へ移動しますか？\n24時間以内なら戻せます。`)) return;
      await moveIdsToTrash(new Set(targets.map(entry => entry.id)));
      selectedIds.clear();
    });

    root.querySelector('[data-lr-action="bulk-trash"]')?.addEventListener('click', async () => {
      if (!selectedIds.size) return;
      if (!confirm(`選択した ${selectedIds.size}件を削除へ移動しますか？\n24時間以内なら戻せます。`)) return;
      await moveIdsToTrash(new Set(selectedIds));
      selectedIds.clear();
    });

    root.querySelector('[data-lr-action="bulk-restore"]')?.addEventListener('click', async () => {
      if (!selectedIds.size) return;
      await restoreIds(new Set(selectedIds));
      selectedIds.clear();
    });

    root.querySelector('[data-lr-action="bulk-hard-delete"]')?.addEventListener('click', async () => {
      if (!selectedIds.size) return;
      if (!confirm(`選択した ${selectedIds.size}件を完全に削除しますか？\nこの操作は元に戻せません。`)) return;
      await hardDelete(new Set(selectedIds));
      selectedIds.clear();
    });

    root.querySelectorAll('[data-lr-id]').forEach(card => {
      const id = card.dataset.lrId;
      const entry = entries.find(item => item.id === id);
      if (!entry) return;

      card.querySelector('[data-lr-action="select"]')?.addEventListener('change', event => {
        if (event.target.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        render();
      });

      card.querySelector('[data-lr-action="status"]')?.addEventListener('change', async event => {
        await moveEntryToStatus(entry, event.target.value);
      });

      card.querySelector('[data-lr-action="edit"]')?.addEventListener('click', () => {
        editingId = id;
        render();
        requestAnimationFrame(() => document.querySelector(`[data-lr-id="${CSS.escape(id)}"] .lr-edit`)?.focus());
      });

      card.querySelector('[data-lr-action="cancel-edit"]')?.addEventListener('click', () => {
        editingId = '';
        render();
      });

      card.querySelector('[data-lr-action="save-edit"]')?.addEventListener('click', async () => {
        const textarea = card.querySelector('.lr-edit');
        const memo = String(textarea?.value || '').trim();
        if (!memo) return textarea?.focus();
        entry.memo = memo;
        editingId = '';
        await saveEntry(entry);
      });

      card.querySelector('[data-lr-action="trash"]')?.addEventListener('click', async () => {
        await moveEntryToStatus(entry, 'trash');
        selectedIds.delete(id);
      });

      card.querySelector('[data-lr-action="restore"]')?.addEventListener('click', async () => {
        await moveEntryToStatus(entry, 'inbox');
        selectedIds.delete(id);
      });

      card.querySelector('[data-lr-action="hard-delete"]')?.addEventListener('click', async () => {
        if (!confirm('このログを完全に削除しますか？\nこの操作は元に戻せません。')) return;
        selectedIds.delete(id);
        await hardDelete(new Set([id]));
      });
    });
  }

  async function honorOpenRequest(request) {
    if (!request || typeof request !== 'object') return;
    const requestedAt = Number(request.requestedAt || 0);
    if (!Number.isFinite(requestedAt) || Date.now() - requestedAt > 15000) return;
    activateRelay();
    try {
      await chrome.storage.local.remove(OPEN_REQUEST_KEY);
    } catch (_) {}
  }

  async function initialize() {
    injectStyles();
    ensureRoot();
    ensureModeButton();
    await loadEntries();
    render();

    const initial = await chrome.storage.local.get(OPEN_REQUEST_KEY);
    await honorOpenRequest(initial[OPEN_REQUEST_KEY]);

    document.addEventListener('keydown', event => {
      const isAltShiftM = event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey
        && (event.code === 'KeyM' || String(event.key || '').toLowerCase() === 'm');
      if (isAltShiftM) {
        event.preventDefault();
        event.stopImmediatePropagation();
        activateRelay();
        return;
      }

      if (!document.body.classList.contains('log-relay-active')) return;

      const view = event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey
        ? VIEW_SHORTCUTS[String(event.key || '')]
        : null;
      if (view) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setView(view);
        return;
      }

      const plainAltNumber = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
        && ['1', '2', '3'].includes(String(event.key || ''));
      if (plainAltNumber) deactivateRelay();
    }, true);

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;

      if (changes[OPEN_REQUEST_KEY]?.newValue) {
        honorOpenRequest(changes[OPEN_REQUEST_KEY].newValue).catch(error => console.error('[Log Relay] LOG表示切替に失敗しました。', error));
      }

      const relevant = Object.keys(changes).some(key => key.startsWith(ENTRY_PREFIX) || key === SORT_KEY);
      if (!relevant) return;
      loadEntries()
        .then(() => render())
        .catch(error => console.error('[Log Relay] 再読込に失敗しました。', error));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
