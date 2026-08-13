(() => {
  if (window.top !== window) return;
  if (window.__quickLinksLogRelayCaptureLoaded) return;
  window.__quickLinksLogRelayCaptureLoaded = true;

  const Shortcuts = globalThis.QuickLinksShortcuts;
  const MESSAGE_OPEN = 'logRelayOpenCapture';
  const MESSAGE_PANEL = 'logRelayOpenPanel';
  const STORE_MESSAGE = 'logRelayStore';
  const HOST_ID = 'quick-links-log-relay-capture-host';
  const TOAST_ID = 'quick-links-log-relay-toast-host';

  function formatJstTime(date = new Date()) {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function showToast(message) {
    document.getElementById(TOAST_ID)?.remove();
    const host = document.createElement('div');
    host.id = TOAST_ID;
    host.style.cssText = 'all:initial;position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>.toast{font:600 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f8fafc;background:#0f172a;border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(15,23,42,.24);border-radius:999px;padding:8px 12px;letter-spacing:.01em}</style><div class="toast" role="status">${escapeHtml(message)}</div>`;
    (document.documentElement || document.body).appendChild(host);
    setTimeout(() => host.remove(), 1600);
  }

  async function store(action, payload = {}) {
    const response = await chrome.runtime.sendMessage({ type: STORE_MESSAGE, action, payload });
    if (!response?.ok) throw new Error(response?.error || '保存に失敗しました。');
    return response.data;
  }

  async function saveMemo(memo) {
    const text = String(memo || '').trim();
    if (!text) return false;
    const entry = await store('add', { memo: text });
    const savedAt = entry?.createdAt ? new Date(entry.createdAt) : new Date();
    showToast(`ログを保存 ${formatJstTime(savedAt)}`);
    return true;
  }

  function closeCapture() {
    document.getElementById(HOST_ID)?.remove();
  }

  function openCapture() {
    const existing = document.getElementById(HOST_ID);
    if (existing) {
      existing.shadowRoot?.querySelector('input')?.focus();
      return;
    }

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;top:18px;left:50%;transform:translateX(-50%);width:min(560px,calc(100vw - 28px));z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host{all:initial}*{box-sizing:border-box}
        .relay{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#fff;border:1px solid #dbe3ec;border-radius:13px;box-shadow:0 18px 50px rgba(15,23,42,.20);padding:10px}
        .head{display:flex;align-items:center;justify-content:space-between;margin:0 2px 8px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:.02em}.name{color:#334155}.row{display:flex;align-items:center;gap:8px}
        input{width:100%;min-width:0;border:0;outline:0;background:#f8fafc;color:#0f172a;border-radius:9px;padding:11px 12px;font:500 14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:inset 0 0 0 1px #e2e8f0}
        input:focus{background:#fff;box-shadow:inset 0 0 0 2px #94a3b8}
        button{flex:0 0 auto;border:0;border-radius:9px;background:#0f172a;color:#fff;padding:10px 13px;font:700 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
        .hint{margin:7px 3px 0;color:#94a3b8;font-size:10px;line-height:1.35}kbd{font:600 9px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#eef2f7;border:1px solid #dbe3ec;border-bottom-color:#cbd5e1;border-radius:4px;color:#64748b;padding:2px 4px}
      </style>
      <div class="relay" role="dialog" aria-label="Log Relayにメモを追加">
        <div class="head"><span class="name">↪ Log Relay</span><span>${escapeHtml(formatJstTime())}</span></div>
        <div class="row"><input type="text" maxlength="500" autocomplete="off" placeholder="いま残しておくこと…" aria-label="ログメモ"><button type="button">保存</button></div>
        <div class="hint"><kbd>Enter</kbd> 保存　<kbd>Esc</kbd> 閉じる　URLやページ情報は保存しません</div>
      </div>`;

    const input = shadow.querySelector('input');
    const button = shadow.querySelector('button');
    let saving = false;
    const submit = async () => {
      if (saving || !input.value.trim()) return;
      saving = true;
      button.disabled = true;
      try {
        if (await saveMemo(input.value)) closeCapture();
      } catch (error) {
        console.error('[Log Relay] 保存に失敗しました。', error);
        saving = false;
        button.disabled = false;
        input.focus();
      }
    };

    input.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') { event.preventDefault(); submit(); }
      else if (event.key === 'Escape') { event.preventDefault(); closeCapture(); }
    });
    button.addEventListener('click', submit);
    shadow.querySelector('.relay').addEventListener('mousedown', event => event.stopPropagation());
    (document.documentElement || document.body).appendChild(host);
    requestAnimationFrame(() => input.focus());
  }

  function matchesLogShortcut(event, kind) {
    const spec = Shortcuts?.registry?.log?.[kind];
    if (spec && typeof Shortcuts?.matches === 'function' && Shortcuts.matches(event, spec)) return true;

    // v1.15.1 safety fallback: Log Relayの起動を共通レジストリだけに依存させない。
    // content scriptの読み込み順・古いタブ・将来の共通基盤変更があっても、M系ショートカットを直接判定する。
    const isM = event.code === 'KeyM' || String(event.key || '').toLowerCase() === 'm';
    if (!isM || !event.altKey || event.ctrlKey || event.metaKey) return false;
    return kind === 'open' ? !!event.shiftKey : !event.shiftKey;
  }

  document.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229 || event.repeat) return;
    if (matchesLogShortcut(event, 'add')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openCapture();
      return;
    }
    if (matchesLogShortcut(event, 'open')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      chrome.runtime.sendMessage({ type: MESSAGE_PANEL }).catch(() => {});
    }
  }, true);

  try {
    chrome.runtime.onMessage.addListener(message => {
      if (message?.type === MESSAGE_OPEN) openCapture();
    });
  } catch (_) {}
})();
