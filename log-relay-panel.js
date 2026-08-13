(() => {
  if (window.__quickLinksLogRelayPanelLoaded) return;
  window.__quickLinksLogRelayPanelLoaded = true;

  const ENTRY_PREFIX = 'logRelayEntry:';
  const STATUS = Object.freeze({ inbox: '未処理', hold: '保留', done: '完了' });
  const STATUS_ORDER = ['inbox', 'hold', 'done'];
  let activeStatus = 'inbox';
  let entries = [];
  let editingId = '';

  function storageKey(id) {
    return `${ENTRY_PREFIX}${id}`;
  }

  function normalizeEntry(value, fallbackKey = '') {
    if (!value || typeof value !== 'object') return null;
    const id = String(value.id || fallbackKey.replace(ENTRY_PREFIX, '') || '').trim();
    const memo = String(value.memo || '').trim();
    if (!id || !memo) return null;
    const status = STATUS[value.status] ? value.status : 'inbox';
    const createdAt = Number.isFinite(Date.parse(value.createdAt)) ? value.createdAt : new Date().toISOString();
    const updatedAt = Number.isFinite(Date.parse(value.updatedAt)) ? value.updatedAt : createdAt;
    return { id, memo, status, createdAt, updatedAt };
  }

  async function loadEntries() {
    const all = await chrome.storage.local.get(null);
    entries = Object.entries(all)
      .filter(([key]) => key.startsWith(ENTRY_PREFIX))
      .map(([key, value]) => normalizeEntry(value, key))
      .filter(Boolean)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async function saveEntry(entry) {
    const normalized = normalizeEntry({ ...entry, updatedAt: new Date().toISOString() });
    if (!normalized) return;
    await chrome.storage.local.set({ [storageKey(normalized.id)]: normalized });
  }

  async function deleteEntry(id) {
    await chrome.storage.local.remove(storageKey(id));
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

  function counts() {
    return STATUS_ORDER.reduce((acc, status) => {
      acc[status] = entries.filter(entry => entry.status === status).length;
      return acc;
    }, {});
  }

  function injectStyles() {
    if (document.getElementById('log-relay-style')) return;
    const style = document.createElement('style');
    style.id = 'log-relay-style';
    style.textContent = `
      body.log-relay-active > :not(header):not(.app-mode-tabs):not(#log-relay-root):not(script){display:none!important}
      body.log-relay-active header .header-search-area{display:none!important}
      #log-relay-mode{border-color:#cbd5e1;color:#334155;background:#f8fafc}
      #log-relay-mode.active{background:#0f172a;color:#fff;border-color:#0f172a}
      #log-relay-root{display:none;min-height:0;flex:1;overflow:auto;background:#f3f4f6;color:#0f172a}
      body.log-relay-active #log-relay-root{display:block}
      .lr-wrap{padding:12px 12px 22px}
      .lr-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
      .lr-title{font-size:15px;font-weight:800;letter-spacing:-.01em;color:#0f172a}
      .lr-sub{font-size:10px;color:#94a3b8;margin-top:2px;line-height:1.4}
      .lr-key{font:650 9px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#64748b;background:#fff;border:1px solid #dbe3ec;border-bottom-color:#cbd5e1;border-radius:5px;padding:4px 6px;white-space:nowrap}
      .lr-status-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:10px}
      .lr-status-tab{border:1px solid #dbe3ec;background:#fff;color:#64748b;border-radius:8px;padding:7px 6px;font:700 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px}
      .lr-status-tab.active{background:#e2e8f0;border-color:#cbd5e1;color:#0f172a}
      .lr-count{min-width:18px;height:18px;border-radius:999px;background:rgba(15,23,42,.06);display:inline-flex;align-items:center;justify-content:center;font-size:9px}
      .lr-list{display:flex;flex-direction:column;gap:7px}
      .lr-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:9px 10px;box-shadow:0 1px 1px rgba(15,23,42,.03)}
      .lr-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px}
      .lr-time{font-size:10px;font-weight:700;color:#94a3b8;font-variant-numeric:tabular-nums}
      .lr-actions{display:flex;align-items:center;gap:4px}
      .lr-status-select{border:0;background:#f1f5f9;color:#475569;border-radius:6px;padding:4px 5px;font:650 10px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;outline:none;cursor:pointer}
      .lr-icon-btn{border:0;background:transparent;color:#94a3b8;width:24px;height:24px;border-radius:6px;cursor:pointer;padding:0;font-size:12px;display:grid;place-items:center}
      .lr-icon-btn:hover,.lr-icon-btn:focus-visible{background:#f1f5f9;color:#334155}
      .lr-icon-btn.danger:hover,.lr-icon-btn.danger:focus-visible{background:#fef2f2;color:#b91c1c}
      .lr-memo{font-size:13px;line-height:1.55;color:#1e293b;white-space:pre-wrap;overflow-wrap:anywhere}
      .lr-edit{width:100%;resize:vertical;min-height:62px;border:1px solid #cbd5e1;border-radius:8px;padding:8px 9px;font:500 13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a;outline:none;background:#fff}
      .lr-edit:focus{border-color:#94a3b8;box-shadow:0 0 0 2px rgba(148,163,184,.18)}
      .lr-edit-actions{display:flex;justify-content:flex-end;gap:5px;margin-top:6px}
      .lr-small-btn{border:1px solid #dbe3ec;border-radius:7px;background:#fff;color:#475569;padding:5px 8px;font:700 10px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
      .lr-small-btn.primary{background:#0f172a;border-color:#0f172a;color:#fff}
      .lr-empty{border:1px dashed #cbd5e1;border-radius:10px;padding:26px 14px;text-align:center;color:#94a3b8;font-size:11px;line-height:1.65;background:rgba(255,255,255,.55)}
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
    button.title = 'Log Relay';
    button.innerHTML = '<span class="app-mode-title">↪ Log</span>';
    button.style.cssText = 'flex:1;min-width:0;border:1px solid #dbe3ec;border-radius:7px;padding:7px 5px;cursor:pointer;font:700 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    tabs.appendChild(button);
    button.addEventListener('click', activateRelay);

    ['mode-links', 'mode-reds', 'mode-prompts'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', deactivateRelay, true);
    });
  }

  function activateRelay() {
    document.body.classList.add('log-relay-active');
    document.getElementById('log-relay-mode')?.classList.add('active');
    document.querySelectorAll('.app-mode-tabs .app-mode-btn').forEach(button => button.classList.remove('active'));
    render();
  }

  function deactivateRelay() {
    document.body.classList.remove('log-relay-active');
    document.getElementById('log-relay-mode')?.classList.remove('active');
  }

  function render() {
    const root = ensureRoot();
    const c = counts();
    const visible = entries.filter(entry => entry.status === activeStatus);
    root.innerHTML = `
      <div class="lr-wrap">
        <div class="lr-heading">
          <div>
            <div class="lr-title">Log Relay</div>
            <div class="lr-sub">その場では残すだけ。整理はここで。</div>
          </div>
          <span class="lr-key">Alt + M</span>
        </div>
        <div class="lr-status-tabs" role="tablist">
          ${STATUS_ORDER.map(status => `<button class="lr-status-tab${status === activeStatus ? ' active' : ''}" data-lr-status="${status}" type="button"><span>${STATUS[status]}</span><span class="lr-count">${c[status]}</span></button>`).join('')}
        </div>
        <div class="lr-list">
          ${visible.length ? visible.map(entry => renderCard(entry)).join('') : `<div class="lr-empty">${STATUS[activeStatus]}のログはありません。<br>Webページで Alt + M から1行だけ残せます。</div>`}
        </div>
      </div>`;
    bindRootEvents(root);
  }

  function renderCard(entry) {
    const isEditing = entry.id === editingId;
    return `
      <article class="lr-card" data-lr-id="${escapeHtml(entry.id)}">
        <div class="lr-card-top">
          <time class="lr-time" datetime="${escapeHtml(entry.createdAt)}">${escapeHtml(formatCreatedAt(entry.createdAt))}</time>
          <div class="lr-actions">
            <select class="lr-status-select" data-lr-action="status" aria-label="状態">
              ${STATUS_ORDER.map(status => `<option value="${status}"${status === entry.status ? ' selected' : ''}>${STATUS[status]}</option>`).join('')}
            </select>
            <button class="lr-icon-btn" data-lr-action="edit" type="button" title="編集" aria-label="編集">✎</button>
            <button class="lr-icon-btn danger" data-lr-action="delete" type="button" title="削除" aria-label="削除">×</button>
          </div>
        </div>
        ${isEditing
          ? `<textarea class="lr-edit" maxlength="500">${escapeHtml(entry.memo)}</textarea><div class="lr-edit-actions"><button class="lr-small-btn" data-lr-action="cancel-edit" type="button">取消</button><button class="lr-small-btn primary" data-lr-action="save-edit" type="button">保存</button></div>`
          : `<div class="lr-memo">${escapeHtml(entry.memo)}</div>`}
      </article>`;
  }

  function bindRootEvents(root) {
    root.querySelectorAll('[data-lr-status]').forEach(button => {
      button.addEventListener('click', () => {
        activeStatus = button.dataset.lrStatus;
        editingId = '';
        render();
      });
    });

    root.querySelectorAll('[data-lr-id]').forEach(card => {
      const id = card.dataset.lrId;
      const entry = entries.find(item => item.id === id);
      if (!entry) return;

      card.querySelector('[data-lr-action="status"]')?.addEventListener('change', async (event) => {
        entry.status = event.target.value;
        await saveEntry(entry);
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
      card.querySelector('[data-lr-action="delete"]')?.addEventListener('click', async () => {
        if (!confirm('このログを削除しますか？')) return;
        editingId = '';
        await deleteEntry(id);
      });
    });
  }

  async function initialize() {
    injectStyles();
    ensureRoot();
    ensureModeButton();
    await loadEntries();
    render();

    document.addEventListener('keydown', (event) => {
      if (!document.body.classList.contains('log-relay-active')) return;
      const plainAltNumber = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
        && ['1', '2', '3'].includes(String(event.key || ''));
      if (plainAltNumber) deactivateRelay();
    }, true);

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !Object.keys(changes).some(key => key.startsWith(ENTRY_PREFIX))) return;
      loadEntries().then(() => render()).catch(error => console.error('[Log Relay] 再読込に失敗しました。', error));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
