(() => {
  'use strict';

  let api = globalThis.QuickLinksXSearchCore || null;
  if (!api && typeof require === 'function') {
    try { api = require('./x-search-core.js'); } catch (_) {}
  }
  if (!api) throw new Error('QuickLinksXSearchCore must load before this compatibility shim.');

  // Legacy module name kept only so older packaged/tests references fail gracefully.
  // Product behavior is owned by x-search-core.js and contains no club-specific defaults.
  globalThis.QuickLinksRedsXSearchCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
