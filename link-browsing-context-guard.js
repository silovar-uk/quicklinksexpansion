(function initQuickLinksBrowsingContextGuard(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.QuickLinksBrowsingContextGuard = api;
  if (typeof document !== 'undefined') api.install();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createQuickLinksBrowsingContextGuard() {
  const STALE_CONTEXT_MS = 2200;

  function isBackgroundOpenEvent(event) {
    if (!event) return false;
    if (event.type === 'auxclick') return Number(event.button) === 1;
    if (event.type === 'click') return !!(event.ctrlKey || event.metaKey);
    if (event.type === 'keydown') {
      return (event.key === 'Enter' || event.key === ' ') && !!(event.ctrlKey || event.metaKey);
    }
    return false;
  }

  function computeAnchoredScrollTop({ scrollTop, anchorTopBefore, anchorTopAfter, maxScrollTop = Number.POSITIVE_INFINITY }) {
    const base = Number(scrollTop) || 0;
    const before = Number(anchorTopBefore) || 0;
    const after = Number(anchorTopAfter) || 0;
    const max = Number.isFinite(Number(maxScrollTop)) ? Math.max(0, Number(maxScrollTop)) : Number.POSITIVE_INFINITY;
    return Math.min(max, Math.max(0, base + (after - before)));
  }

  function getEventTarget(event, selector) {
    const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (node?.matches?.(selector)) return node;
      const closest = node?.closest?.(selector);
      if (closest) return closest;
    }
    const target = event?.target;
    return target?.matches?.(selector) ? target : target?.closest?.(selector) || null;
  }

  function focusWithoutScrolling(element) {
    if (!element || typeof element.focus !== 'function') return;
    try {
      element.focus({ preventScroll: true });
    } catch (_) {
      element.focus();
    }
  }

  function createSurfaceGuard({ rootNode, getList, targetSelector, getItemId, findTargetById }) {
    if (!rootNode || typeof rootNode.addEventListener !== 'function') return null;

    let pending = null;
    let restoreScheduled = false;
    let restoring = false;
    let cleanupTimer = null;

    function clearPending() {
      pending = null;
      restoreScheduled = false;
      if (cleanupTimer) {
        clearTimeout(cleanupTimer);
        cleanupTimer = null;
      }
    }

    function armCleanup() {
      if (cleanupTimer) clearTimeout(cleanupTimer);
      cleanupTimer = setTimeout(clearPending, STALE_CONTEXT_MS);
    }

    function capture(event) {
      if (!isBackgroundOpenEvent(event)) return;
      const list = getList();
      if (!list) return;
      const target = getEventTarget(event, targetSelector);
      if (!target || !list.contains(target)) return;
      const itemId = getItemId(target);
      if (!itemId) return;

      const listRect = list.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const active = rootNode.activeElement || document.activeElement;
      pending = {
        itemId: String(itemId),
        scrollTop: list.scrollTop,
        anchorTop: targetRect.top - listRect.top,
        restoreFocus: active === target || target.contains?.(active),
        capturedAt: Date.now()
      };
      armCleanup();
    }

    function restore() {
      restoreScheduled = false;
      if (!pending || (Date.now() - pending.capturedAt) > STALE_CONTEXT_MS) {
        clearPending();
        return;
      }

      const list = getList();
      if (!list) return;
      const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
      const target = findTargetById(pending.itemId);

      restoring = true;
      try {
        if (target && list.contains(target)) {
          const listRect = list.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          list.scrollTop = computeAnchoredScrollTop({
            scrollTop: list.scrollTop,
            anchorTopBefore: pending.anchorTop,
            anchorTopAfter: targetRect.top - listRect.top,
            maxScrollTop
          });
          if (pending.restoreFocus) focusWithoutScrolling(target);
        } else {
          list.scrollTop = Math.min(maxScrollTop, Math.max(0, pending.scrollTop));
        }
      } finally {
        restoring = false;
      }
    }

    function scheduleRestore() {
      if (!pending || restoreScheduled) return;
      restoreScheduled = true;
      const schedule = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : callback => Promise.resolve().then(callback);
      schedule(restore);
    }

    const observer = new MutationObserver(() => {
      if (pending) scheduleRestore();
    });
    observer.observe(rootNode, { childList: true, subtree: true });

    rootNode.addEventListener('click', capture, true);
    rootNode.addEventListener('auxclick', capture, true);
    rootNode.addEventListener('keydown', capture, true);

    const cancelOnNewIntent = event => {
      if (!pending || restoring) return;
      if (isBackgroundOpenEvent(event)) return;
      clearPending();
    };
    rootNode.addEventListener('wheel', cancelOnNewIntent, { capture: true, passive: true });
    rootNode.addEventListener('touchstart', cancelOnNewIntent, { capture: true, passive: true });
    rootNode.addEventListener('pointerdown', cancelOnNewIntent, true);
    rootNode.addEventListener('keydown', cancelOnNewIntent, true);

    return {
      clear: clearPending,
      disconnect() {
        clearPending();
        observer.disconnect();
      }
    };
  }

  function installSidePanel() {
    const list = document.getElementById('link-list');
    if (!list || document.documentElement.dataset.qplBrowsingContextGuard === 'sidepanel') return false;
    document.documentElement.dataset.qplBrowsingContextGuard = 'sidepanel';
    createSurfaceGuard({
      rootNode: document,
      getList: () => document.getElementById('link-list'),
      targetSelector: '#link-list .item-title',
      getItemId: target => target.closest('.link-item')?.dataset?.id || '',
      findTargetById: itemId => {
        const cards = document.querySelectorAll('#link-list .link-item[data-id]');
        for (const card of cards) {
          if (String(card.dataset.id || '') === String(itemId)) return card.querySelector('.item-title');
        }
        return null;
      }
    });
    return true;
  }

  function installFloatingPop() {
    const host = document.getElementById('quick-links-floating-host');
    const shadow = host?.shadowRoot;
    if (!shadow || host.dataset.qplBrowsingContextGuard === 'floating') return false;
    host.dataset.qplBrowsingContextGuard = 'floating';
    createSurfaceGuard({
      rootNode: shadow,
      getList: () => shadow.getElementById('ql-list'),
      targetSelector: '#ql-list [data-open-url]',
      getItemId: target => target.getAttribute('data-open-id') || '',
      findTargetById: itemId => {
        const targets = shadow.querySelectorAll('#ql-list [data-open-id]');
        for (const target of targets) {
          if (String(target.getAttribute('data-open-id') || '') === String(itemId)) return target;
        }
        return null;
      }
    });
    return true;
  }

  function install() {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return false;
    const sidePanelInstalled = installSidePanel();
    const floatingInstalled = installFloatingPop();
    if (floatingInstalled) return true;

    const root = document.documentElement;
    if (!root || root.dataset.qplBrowsingContextHostObserver === 'true') return sidePanelInstalled;
    root.dataset.qplBrowsingContextHostObserver = 'true';
    const hostObserver = new MutationObserver(() => {
      if (installFloatingPop()) hostObserver.disconnect();
    });
    hostObserver.observe(root, { childList: true, subtree: true });
    return sidePanelInstalled;
  }

  return {
    STALE_CONTEXT_MS,
    isBackgroundOpenEvent,
    computeAnchoredScrollTop,
    install
  };
});
