(() => {
  'use strict';

  // Compatibility shim for older package references.
  // The generic X-search presentation is owned by x-search-sidepanel.js.
  globalThis.QuickLinksXSearchSidepanel?.bind?.();
})();
