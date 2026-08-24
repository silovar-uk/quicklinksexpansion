(() => {
  'use strict';

  const Core = globalThis.QuickLinksInteractionCore;
  if (!Core) {
    console.warn('[Quick Links] interaction-core.js must load before interaction-bridge.js');
    return;
  }

  const FOCUS_STYLE_ID = 'qpl-interaction-focus-style';
  const PRIMARY_ATTR = 'data-qpl-primary-target';

  const SELECTORS = Object.freeze({
    sidepanel: Object.freeze({
      links: '#link-list .link-item .item-title',
      prompts: '#prompt-list .prompt-card [data-prompt-copy]',
      reds: '#reds-search',
      log: '#log-relay-root .lr-list [data-lr-id] .lr-row-check'
    }),
    floating: Object.freeze({
      links: '#ql-list [data-open-url]',
      prompts: '#ql-prompt-list .ql-prompt-card [data-prompt-copy]',
      reds: '#ql-reds-query'
    })
  });

  function visibleElement(element) {
    if (!element) return false;
    if (typeof element.getClientRects !== 'function') return true;
    return element.getClientRects().length > 0;
  }

  function sidepanelMode(doc) {
    const body = doc?.body;
    if (!body) return '';
    if (body.classList?.contains?.('log-relay-active') || doc.getElementById?.('log-relay-mode')?.classList?.contains?.('active')) {
      return 'log';
    }
    for (const mode of ['links', 'prompts', 'reds']) {
      if (body.classList?.contains?.(`mode-${mode}`)) return mode;
      if (doc.getElementById?.(`mode-${mode}`)?.classList?.contains?.('active')) return mode;
    }
    return '';
  }

  function floatingMode(root) {
    if (!root) return '';
    const activeByPane = {
      links: '#ql-pane-links.active',
      prompts: '#ql-pane-prompts.active',
      reds: '#ql-pane-reds.active'
    };
    for (const [mode, selector] of Object.entries(activeByPane)) {
      if (root.querySelector?.(selector)) return mode;
    }
    return '';
  }

  function detectInteractionContext(doc) {
    const mode = sidepanelMode(doc);
    if (mode) {
      return {
        surface: 'sidepanel',
        mode,
        root: doc,
        doc
      };
    }

    const host = doc?.getElementById?.('quick-links-floating-host');
    const root = host?.shadowRoot;
    const popupMode = floatingMode(root);
    if (!root || !popupMode) return null;
    return {
      surface: 'floating',
      mode: popupMode,
      root,
      doc
    };
  }

  function getPrimarySelector(context) {
    return SELECTORS[context?.surface]?.[Core.normalizeMode(context?.mode)] || '';
  }

  function getPrimaryTargets(context) {
    const selector = getPrimarySelector(context);
    if (!selector || !context?.root?.querySelectorAll) return [];
    return [...context.root.querySelectorAll(selector)].filter(visibleElement);
  }

  function getActiveElement(context) {
    if (!context) return null;
    if (context.surface === 'floating') return context.root?.activeElement || null;
    return context.doc?.activeElement || null;
  }

  function ensureFocusStyle(context) {
    if (!context?.doc?.createElement || !context?.root) return;
    const styleRoot = context.surface === 'floating' ? context.root : context.doc.head;
    if (!styleRoot?.appendChild || styleRoot.querySelector?.(`#${FOCUS_STYLE_ID}`)) return;

    const style = context.doc.createElement('style');
    style.id = FOCUS_STYLE_ID;
    style.textContent = `
      [${PRIMARY_ATTR}="true"]:focus-visible {
        outline: var(--qpl-focus-width, 2px) solid var(--qpl-focus-color, #2563eb) !important;
        outline-offset: var(--qpl-focus-offset, 2px) !important;
        box-shadow: none !important;
      }
    `;
    styleRoot.appendChild(style);
  }

  function decorateTargets(context, targets) {
    ensureFocusStyle(context);
    (targets || []).forEach(target => target?.setAttribute?.(PRIMARY_ATTR, 'true'));
  }

  function focusTarget(context, target) {
    if (!target) return false;
    ensureFocusStyle(context);
    target.setAttribute?.(PRIMARY_ATTR, 'true');
    try {
      target.focus({ preventScroll: true });
    } catch (_) {
      target.focus?.();
    }
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return true;
  }

  function focusPrimary(context) {
    const targets = getPrimaryTargets(context);
    decorateTargets(context, targets);
    if (!targets.length) return false;
    return focusTarget(context, targets[0]);
  }

  function movePrimary(context, direction) {
    if (!direction) return false;
    if (!['link', 'prompt', 'log'].includes(Core.getPrimaryRole(context?.mode))) return false;

    const targets = getPrimaryTargets(context);
    if (!targets.length) return false;
    decorateTargets(context, targets);

    const active = getActiveElement(context);
    const index = targets.indexOf(active);
    if (index < 0) return false;

    const nextIndex = Math.max(0, Math.min(targets.length - 1, index + direction));
    if (nextIndex !== index) focusTarget(context, targets[nextIndex]);
    return true;
  }

  function consume(event) {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
  }

  function handleKeyboardEvent(event, doc = globalThis.document) {
    const action = Core.getKeyboardAction(event);
    if (!action || !doc) return false;

    const context = detectInteractionContext(doc);
    if (!context) return false;

    if (action === Core.ACTIONS.SELECT_PRIMARY) {
      // Consume SELECT_PRIMARY for every recognized mode even when the list is empty.
      // This prevents mature legacy handlers from falling through and changing modes.
      consume(event);
      focusPrimary(context);
      return true;
    }

    const direction = Core.getMoveDirection(action);
    if (!direction) return false;
    if (!movePrimary(context, direction)) return false;
    consume(event);
    return true;
  }

  function install(win = globalThis.window, doc = globalThis.document) {
    if (!win?.addEventListener || !doc) return false;
    if (win.__quickLinksInteractionBridgeInstalled) return true;
    win.__quickLinksInteractionBridgeInstalled = true;
    win.addEventListener('keydown', event => handleKeyboardEvent(event, doc), true);
    return true;
  }

  const api = Object.freeze({
    SELECTORS,
    sidepanelMode,
    floatingMode,
    detectInteractionContext,
    getPrimarySelector,
    getPrimaryTargets,
    focusPrimary,
    movePrimary,
    handleKeyboardEvent,
    install
  });

  globalThis.QuickLinksInteractionBridge = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') install(window, document);
})();
