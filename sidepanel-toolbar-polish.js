(() => {
  'use strict';

  function polishLinkToolbar() {
    const toolbar = document.querySelector('.link-list-toolbar');
    const addButton = document.getElementById('btn-add-current');
    const inputToolbar = document.querySelector('.input-toolbar');

    if (!toolbar || !addButton || addButton.dataset.toolbarPolished === 'true') return;

    addButton.dataset.toolbarPolished = 'true';
    addButton.classList.add('compact-add-current');
    addButton.title = '現在のページを追加（Alt+N）';

    const label = addButton.querySelector('span:not(.icon-plus)');
    if (label && !label.classList.contains('action-shortcut')) {
      label.textContent = 'ページ追加';
      label.classList.add('compact-add-label');
    }

    toolbar.classList.add('qpl-compact-toolbar');
    toolbar.insertBefore(addButton, toolbar.firstChild);

    if (inputToolbar) {
      inputToolbar.classList.add('add-current-detached');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', polishLinkToolbar, { once: true });
  } else {
    polishLinkToolbar();
  }
})();
