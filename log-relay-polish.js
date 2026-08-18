(() => {
  if (window.__quickLinksLogRelayPolishLoaded) return;
  window.__quickLinksLogRelayPolishLoaded = true;

  const style = document.createElement('style');
  style.id = 'log-relay-polish-style';
  style.textContent = `
    body.log-relay-active {
      --lr-sky-50: #f3fbff;
      --lr-sky-100: #e0f4ff;
      --lr-sky-200: #bae6fd;
      --lr-sky-300: #7dd3fc;
      --lr-sky-500: #0ea5e9;
      --lr-blue-500: #3b82f6;
      --lr-blue-700: #1d4ed8;
      background:
        radial-gradient(circle at 12% -8%, rgba(255,255,255,.96) 0 17%, rgba(255,255,255,0) 38%),
        radial-gradient(circle at 96% 4%, rgba(125,211,252,.42), rgba(125,211,252,0) 42%),
        linear-gradient(145deg, #e8f8ff 0%, #d9f1ff 48%, #eefaff 100%) !important;
      color: #12324a;
    }

    body.log-relay-active header {
      background: rgba(236, 248, 255, .66) !important;
      border-bottom-color: rgba(125, 211, 252, .38) !important;
      box-shadow: 0 8px 28px rgba(14, 116, 144, .08) !important;
      backdrop-filter: blur(18px) saturate(135%);
      -webkit-backdrop-filter: blur(18px) saturate(135%);
    }

    body.log-relay-active .app-mode-tabs {
      background: rgba(224, 244, 255, .62) !important;
      border-bottom-color: rgba(125, 211, 252, .36) !important;
      backdrop-filter: blur(16px) saturate(135%);
      -webkit-backdrop-filter: blur(16px) saturate(135%);
    }

    body.log-relay-active #log-relay-mode.active {
      background: linear-gradient(135deg, rgba(14,165,233,.92), rgba(59,130,246,.90)) !important;
      color: #fff !important;
      border-color: rgba(255,255,255,.58) !important;
      box-shadow: 0 8px 20px rgba(14,116,144,.20), inset 0 1px 0 rgba(255,255,255,.34) !important;
    }

    body.log-relay-active #log-relay-root {
      background: transparent !important;
      color: #12324a !important;
    }

    body.log-relay-active .lr-wrap {
      padding: 13px 12px 28px;
    }

    body.log-relay-active .lr-heading {
      margin: 2px 1px 12px;
      padding: 11px 12px;
      border: 1px solid rgba(255,255,255,.76);
      border-radius: 14px;
      background: linear-gradient(135deg, rgba(255,255,255,.68), rgba(224,244,255,.50));
      box-shadow: 0 12px 30px rgba(14,116,144,.09), inset 0 1px 0 rgba(255,255,255,.88);
      backdrop-filter: blur(18px) saturate(140%);
      -webkit-backdrop-filter: blur(18px) saturate(140%);
    }

    body.log-relay-active .lr-title {
      color: #0c4a6e !important;
      letter-spacing: -.02em;
    }

    body.log-relay-active .lr-sub {
      color: #47718b !important;
    }

    body.log-relay-active .lr-key {
      color: #0c4a6e !important;
      background: rgba(255,255,255,.60) !important;
      border-color: rgba(125,211,252,.50) !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.82), 0 5px 14px rgba(14,116,144,.08) !important;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    body.log-relay-active .lr-sticky {
      margin: 0 -3px 9px;
      padding: 4px 3px 9px;
      background: linear-gradient(180deg, rgba(225,245,255,.88) 0%, rgba(225,245,255,.68) 78%, rgba(225,245,255,0) 100%) !important;
      backdrop-filter: blur(16px) saturate(130%);
      -webkit-backdrop-filter: blur(16px) saturate(130%);
    }

    body.log-relay-active .lr-status-tab,
    body.log-relay-active .lr-tool-btn,
    body.log-relay-active .lr-small-btn,
    body.log-relay-active .lr-status-select,
    body.log-relay-active .lr-organize-menu {
      background: rgba(255,255,255,.62) !important;
      border-color: rgba(125,211,252,.42) !important;
      color: #315d77 !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.80), 0 5px 14px rgba(14,116,144,.06) !important;
      backdrop-filter: blur(12px) saturate(125%);
      -webkit-backdrop-filter: blur(12px) saturate(125%);
    }

    body.log-relay-active .lr-status-tab:hover,
    body.log-relay-active .lr-tool-btn:hover,
    body.log-relay-active .lr-small-btn:hover {
      background: rgba(255,255,255,.84) !important;
      border-color: rgba(56,189,248,.60) !important;
      color: #0c4a6e !important;
    }

    body.log-relay-active .lr-status-tab.active {
      background: linear-gradient(135deg, rgba(14,165,233,.90), rgba(59,130,246,.88)) !important;
      border-color: rgba(255,255,255,.66) !important;
      color: #fff !important;
      box-shadow: 0 7px 18px rgba(14,116,144,.18), inset 0 1px 0 rgba(255,255,255,.30) !important;
    }

    body.log-relay-active .lr-count {
      background: rgba(14,116,144,.08) !important;
      color: inherit;
    }

    body.log-relay-active .lr-status-tab.active .lr-count {
      background: rgba(255,255,255,.22) !important;
      color: #fff !important;
    }

    body.log-relay-active .lr-checkbox {
      accent-color: #0ea5e9 !important;
    }

    body.log-relay-active .lr-row-check {
      opacity: .42;
      transition: opacity .12s ease, transform .12s ease;
    }

    body.log-relay-active .lr-card:hover .lr-row-check,
    body.log-relay-active .lr-row-check:checked,
    body.log-relay-active .lr-row-check:focus-visible {
      opacity: 1;
      transform: scale(1.04);
    }

    body.log-relay-active .lr-select-all {
      color: #47718b !important;
    }

    body.log-relay-active .lr-selected-count {
      color: #075985 !important;
      background: rgba(186,230,253,.58) !important;
      border: 1px solid rgba(125,211,252,.38);
    }

    body.log-relay-active .lr-card {
      background: linear-gradient(145deg, rgba(255,255,255,.74), rgba(245,251,255,.58)) !important;
      border-color: rgba(255,255,255,.88) !important;
      box-shadow: 0 12px 30px rgba(14,116,144,.08), inset 0 1px 0 rgba(255,255,255,.90) !important;
      backdrop-filter: blur(18px) saturate(135%);
      -webkit-backdrop-filter: blur(18px) saturate(135%);
    }

    body.log-relay-active .lr-card:hover {
      border-color: rgba(125,211,252,.72) !important;
      box-shadow: 0 15px 34px rgba(14,116,144,.13), inset 0 1px 0 rgba(255,255,255,.94) !important;
    }

    body.log-relay-active .lr-card.selected {
      background: linear-gradient(145deg, rgba(240,249,255,.88), rgba(224,242,254,.72)) !important;
      border-color: rgba(56,189,248,.68) !important;
      box-shadow: 0 0 0 1px rgba(14,165,233,.08), 0 12px 28px rgba(14,116,144,.10) !important;
    }

    body.log-relay-active .lr-card.trash {
      background: linear-gradient(145deg, rgba(255,255,255,.72), rgba(254,242,242,.58)) !important;
      border-color: rgba(254,202,202,.72) !important;
    }

    body.log-relay-active .lr-time {
      color: #5f8296 !important;
    }

    body.log-relay-active .lr-memo {
      color: #173e56 !important;
    }

    body.log-relay-active .lr-edit {
      background: rgba(255,255,255,.72) !important;
      border-color: rgba(125,211,252,.56) !important;
      color: #12324a !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.84);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    body.log-relay-active .lr-edit:focus {
      border-color: #38bdf8 !important;
      box-shadow: 0 0 0 3px rgba(56,189,248,.15) !important;
    }

    body.log-relay-active .lr-small-btn.primary {
      background: linear-gradient(135deg, #0ea5e9, #3b82f6) !important;
      border-color: rgba(255,255,255,.58) !important;
      color: #fff !important;
    }

    body.log-relay-active .lr-bulkbar {
      background: rgba(224,242,254,.66) !important;
      border-color: rgba(125,211,252,.52) !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.78), 0 8px 20px rgba(14,116,144,.06);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    body.log-relay-active .lr-empty {
      background: rgba(255,255,255,.46) !important;
      border-color: rgba(125,211,252,.50) !important;
      color: #6b91a8 !important;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    body.log-relay-active .lr-icon-btn[data-lr-action="trash"] {
      width: auto !important;
      min-width: 38px;
      padding: 0 8px !important;
      font-size: 0 !important;
      color: #b45353 !important;
      background: rgba(255,255,255,.38) !important;
      border: 1px solid rgba(254,202,202,.62) !important;
    }

    body.log-relay-active .lr-icon-btn[data-lr-action="trash"]::after {
      content: "削除";
      font-size: 9px;
      font-weight: 800;
      line-height: 1;
    }

    body.log-relay-active .lr-icon-btn[data-lr-action="trash"]:hover,
    body.log-relay-active .lr-icon-btn[data-lr-action="trash"]:focus-visible {
      background: rgba(254,242,242,.82) !important;
      border-color: rgba(248,113,113,.45) !important;
      color: #991b1b !important;
    }

    @media (prefers-reduced-transparency: reduce) {
      body.log-relay-active header,
      body.log-relay-active .app-mode-tabs,
      body.log-relay-active .lr-heading,
      body.log-relay-active .lr-sticky,
      body.log-relay-active .lr-card,
      body.log-relay-active .lr-status-tab,
      body.log-relay-active .lr-tool-btn,
      body.log-relay-active .lr-small-btn,
      body.log-relay-active .lr-status-select,
      body.log-relay-active .lr-organize-menu {
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
    }
  `;
  document.head.appendChild(style);

  async function moveToTrash(id) {
    const response = await chrome.runtime.sendMessage({
      type: 'logRelayStore',
      action: 'moveMany',
      payload: { ids: [id], status: 'trash' }
    });
    if (!response?.ok) throw new Error(response?.error || 'Log Relayの削除に失敗しました。');
  }

  // Individual soft-delete is reversible for 24 hours, so make it a direct action.
  // Checkboxes remain only as an optional bulk-selection tool.
  document.addEventListener('click', async event => {
    const button = event.target.closest?.('#log-relay-root [data-lr-action="trash"]');
    if (!button) return;

    const card = button.closest('[data-lr-id]');
    const id = card?.dataset?.lrId;
    if (!id) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (button.disabled) return;
    button.disabled = true;
    try {
      await moveToTrash(id);
    } catch (error) {
      console.error('[Log Relay] 削除に失敗しました。', error);
      alert(error.message || 'Log Relayの削除に失敗しました。');
      button.disabled = false;
    }
  }, true);
})();
