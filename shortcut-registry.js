(() => {
  const LOG_VIEW_BY_NUMBER = Object.freeze({
    '1': 'all',
    '2': 'inbox',
    '3': 'hold',
    '4': 'done',
    '5': 'trash'
  });

  const LOG_VIEW_NUMBER_BY_CODE = Object.freeze({
    Digit1: '1',
    Numpad1: '1',
    Digit2: '2',
    Numpad2: '2',
    Digit3: '3',
    Numpad3: '3',
    Digit4: '4',
    Numpad4: '4',
    Digit5: '5',
    Numpad5: '5'
  });

  const registry = Object.freeze({
    legacy: Object.freeze({
      links: 'Alt+1',
      reds: 'Alt+2',
      prompts: 'Alt+3',
      clearSearch: 'Alt+4',
      filter: 'Alt+F',
      sort: 'Alt+O',
      select: 'Alt+Q'
    }),
    log: Object.freeze({
      add: Object.freeze({ alt: true, shift: false, ctrl: false, meta: false, code: 'KeyM', label: 'Alt + M' }),
      open: Object.freeze({ alt: true, shift: true, ctrl: false, meta: false, code: 'KeyM', label: 'Alt + Shift + M' }),
      views: LOG_VIEW_BY_NUMBER
    })
  });

  function matches(event, spec) {
    if (!event || !spec) return false;
    return !!event.altKey === !!spec.alt
      && !!event.shiftKey === !!spec.shift
      && !!event.ctrlKey === !!spec.ctrl
      && !!event.metaKey === !!spec.meta
      && (event.code === spec.code || String(event.key || '').toLowerCase() === String(spec.code || '').replace(/^Key/, '').toLowerCase());
  }

  function getLogView(event) {
    if (!event || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return '';

    // Shift+数字では event.key が ! / @ 等になる配列があるため、物理キー位置を示す
    // event.code を優先する。key はテスト・特殊環境向けの後方互換フォールバック。
    const number = LOG_VIEW_NUMBER_BY_CODE[String(event.code || '')] || String(event.key || '');
    return LOG_VIEW_BY_NUMBER[number] || '';
  }

  const api = Object.freeze({ registry, matches, getLogView });
  globalThis.QuickLinksShortcuts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
