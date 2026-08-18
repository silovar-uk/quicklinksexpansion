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
    shadow.innerHTML = `<style>
      .toast{
        font:750 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        color:#0c4a6e;
        background:linear-gradient(135deg,rgba(255,255,255,.90),rgba(224,244,255,.78));
        border:1px solid rgba(125,211,252,.62);
        box-shadow:0 12px 34px rgba(14,116,144,.18),inset 0 1px 0 rgba(255,255,255,.94);
        border-radius:999px;
        padding:8px 13px;
        letter-spacing:.01em;
        backdrop-filter:blur(18px) saturate(145%);
        -webkit-backdrop-filter:blur(18px) saturate(145%);
      }
    </style><div class="toast" role="status">${escapeHtml(message)}</div>`;
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
        .relay{
          position:relative;
          overflow:hidden;
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
          background:
            radial-gradient(circle at 92% -18%,rgba(125,211,252,.38),rgba(125,211,252,0) 44%),
            linear-gradient(145deg,rgba(255,255,255,.86),rgba(224,244,255,.72));
          border:1px solid rgba(255,255,255,.90);
          border-radius:15px;
          box-shadow:0 18px 50px rgba(14,116,144,.20),inset 0 1px 0 rgba(255,255,255,.96);
          padding:11px;
          backdrop-filter:blur(22px) saturate(150%);
          -webkit-backdrop-filter:blur(22px) saturate(150%);
        }
        .head{display:flex;align-items:center;justify-content:space-between;margin:0 2px 9px;color:#5f8296;font-size:11px;font-weight:750;letter-spacing:.02em}
        .name{color:#0c4a6e;font-weight:850}
        .row{display:flex;align-items:center;gap:8px}
        input{
          width:100%;min-width:0;border:0;outline:0;
          background:rgba(255,255,255,.66);
          color:#12324a;
          border-radius:10px;
          padding:11px 12px;
          font:500 14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
          box-shadow:inset 0 0 0 1px rgba(125,211,252,.52),inset 0 1px 0 rgba(255,255,255,.82);
          transition:background .12s ease,box-shadow .12s ease;
        }
        input::placeholder{color:#7ba0b4}
        input:focus{background:rgba(255,255,255,.88);box-shadow:inset 0 0 0 2px #38bdf8,0 0 0 3px rgba(56,189,248,.11)}
        button{
          flex:0 0 auto;
          border:1px solid rgba(255,255,255,.58);
          border-radius:10px;
          background:linear-gradient(135deg,#0ea5e9,#3b82f6);
          color:#fff;
          padding:11px 14px;
          font:800 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
          cursor:pointer;
          box-shadow:0 7px 18px rgba(14,116,144,.20),inset 0 1px 0 rgba(255,255,255,.30);
          transition:transform .12s ease,box-shadow .12s ease,filter .12s ease;
        }
        button:hover{filter:brightness(1.03);box-shadow:0 9px 22px rgba(14,116,144,.24),inset 0 1px 0 rgba(255,255,255,.34)}
        button:active{transform:translateY(1px);box-shadow:0 4px 12px rgba(14,116,144,.18),inset 0 1px 0 rgba(255,255,255,.28)}
        button:disabled{opacity:.58;cursor:default;filter:none}
        .hint{margin:8px 3px 0;color:#6b91a8;font-size:10px;line-height:1.4}
        kbd{
          font:700 9px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
          background:rgba(255,255,255,.62);
          border:1px solid rgba(125,211,252,.48);
          border-bottom-color:rgba(56,189,248,.48);
          border-radius:5px;
          color:#315d77;
          padding:2px 5px;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.86);
        }
        @media (prefers-reduced-transparency: reduce){.relay,.toast{backdrop-filter:none;-webkit-backdrop-filter:none}}
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
