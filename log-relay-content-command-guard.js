(() => {
  if (window.__quickLinksLogRelayCommandGuardLoaded) return;
  window.__quickLinksLogRelayCommandGuardLoaded = true;

  window.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229 || event.repeat) return;
    const isM = event.code === 'KeyM' || String(event.key || '').toLowerCase() === 'm';
    if (!isM || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;

    // Alt+Shift+M is handled by chrome.commands so the service worker can
    // reliably toggle the side panel. Prevent the older content-script path
    // from sending a second open request for the same keystroke.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);
})();
