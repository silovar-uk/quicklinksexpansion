(() => {
  'use strict';

  const MODE_LABELS = Object.freeze({
    'mode-links': 'Links',
    'mode-reds': 'REDS',
    'mode-prompts': 'Prompt',
    'log-relay-mode': 'LOG'
  });

  function normalizeModeLabels() {
    for (const [id, labelText] of Object.entries(MODE_LABELS)) {
      const button = document.getElementById(id);
      const label = button?.querySelector('.app-mode-title');
      if (label && label.textContent !== labelText) label.textContent = labelText;
    }
  }

  function compactLinksToolbar() {
    const toolbar = document.querySelector('.link-list-toolbar');
    const addButton = document.getElementById('btn-add-current');
    const inputToolbar = document.querySelector('.input-toolbar');

    if (!toolbar || !addButton) return;

    if (addButton.dataset.shellPrepared !== 'true') {
      addButton.dataset.shellPrepared = 'true';
      addButton.classList.add('compact-add-current');
      addButton.title = '現在のページを追加（Alt+N）';

      const label = addButton.querySelector('span:not(.icon-plus)');
      if (label && !label.classList.contains('action-shortcut')) {
        label.textContent = 'ページ追加';
        label.classList.add('compact-add-label');
      }

      toolbar.classList.add('qpl-compact-toolbar');
      toolbar.insertBefore(addButton, toolbar.firstChild);
    }

    inputToolbar?.classList.add('add-current-detached');
  }

  function prepareShell() {
    document.body.classList.add('qpl-shell-ready');
    normalizeModeLabels();
    compactLinksToolbar();

    const modeTabs = document.querySelector('.app-mode-tabs');
    if (modeTabs && !modeTabs.dataset.shellObserved) {
      modeTabs.dataset.shellObserved = 'true';
      const observer = new MutationObserver(() => normalizeModeLabels());
      observer.observe(modeTabs, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prepareShell, { once: true });
  } else {
    prepareShell();
  }
})();
