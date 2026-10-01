(() => {
  'use strict';

  const MODES = Object.freeze({
    LINKS: 'links',
    X_SEARCH: 'x-search',
    PROMPTS: 'prompts',
    LOG: 'log'
  });

  // Existing DOM / command identifiers are compatibility boundaries, not product vocabulary.
  const LEGACY_MODE_ALIASES = Object.freeze({
    reds: MODES.X_SEARCH
  });

  const DOM_MODE_KEY = Object.freeze({
    [MODES.LINKS]: 'links',
    [MODES.X_SEARCH]: 'reds',
    [MODES.PROMPTS]: 'prompts',
    [MODES.LOG]: 'log'
  });

  const MESSAGES = Object.freeze({
    COMMIT_STATE: 'quickLinksCommitState',
    ENSURE_AUTO_PROJECT_RULES: 'quickLinksEnsureAutoProjectRules',
    RECORD_ITEM_CLICK: 'quickLinksRecordItemClick',
    RECORD_PROMPT_COPY: 'quickLinksRecordPromptCopy',
    RESOLVE_URL: 'quickLinksResolveUrl',
    OPEN_TAB: 'quickLinksOpenTab',
    OPEN_SIDE_PANEL: 'quickLinksOpenSidePanel',
    GET_CURRENT_WINDOW_ID: 'quickLinksGetCurrentWindowId',
    GET_SIDE_PANEL_STATE: 'quickLinksGetSidePanelWindowState',
    SIDE_PANEL_PRESENCE_CHANGED: 'quickLinksSidePanelPresenceChanged',
    LEGACY_SIDE_PANEL_HEARTBEAT: 'quickLinksSidePanelHeartbeat',
    SIDEPANEL_SHORTCUT: 'quickLinksSidepanelShortcut',
    FLOATING_SHORTCUT: 'quickLinksFloatingShortcut',
    HANDOFF_TO_SIDE_PANEL: 'quickLinksHandoffToSidePanel'
  });

  const STORAGE = Object.freeze({
    ITEMS: 'items',
    PROJECTS: 'projects',
    PROJECT_COLORS: 'projectColors',
    CURRENT_SORT_MODE: 'currentSortMode',
    FLOATING_SEARCH_ENABLED: 'floatingSearchEnabled',
    PROMPT_MEMOS: 'promptMemos',
    PROMPT_CATEGORIES: 'promptCategories',
    PROMPT_SORT_MODE: 'promptSortMode',
    SHARED_SEARCH_QUERY: 'sharedSearchQuery',
    SHARED_SEARCH_STATE: 'sharedSearchState',
    AUTO_PROJECT_RULES: 'autoProjectRules',
    LEGACY_SIDE_PANEL_HEARTBEATS: 'sidePanelHeartbeatsByWindow'
  });

  const SESSION = Object.freeze({
    SIDE_PANEL_PRESENCE: 'quickLinksSidePanelPresenceByWindow',
    UI_CONTEXT: 'quickLinksUiContext'
  });

  const COMMANDS = Object.freeze({
    OPEN_LINKS: 'quick-links-open-links',
    // Chrome persists user shortcut assignments by command ID. Keep this legacy ID indefinitely.
    OPEN_X_SEARCH: 'quick-links-open-reds',
    OPEN_PROMPTS: 'quick-links-open-prompts',
    CLEAR_SEARCH: 'quick-links-clear-search',
    ADD_LOG: 'quick-links-add-log',
    TOGGLE_LOG: 'quick-links-toggle-log'
  });

  const FLOATING_ACTION_BY_COMMAND = Object.freeze({
    [COMMANDS.OPEN_LINKS]: 'open-links',
    [COMMANDS.OPEN_X_SEARCH]: 'open-x-search',
    [COMMANDS.OPEN_PROMPTS]: 'open-prompts',
    [COMMANDS.CLEAR_SEARCH]: 'clear-search'
  });

  function canonicalMode(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (Object.values(MODES).includes(raw)) return raw;
    return LEGACY_MODE_ALIASES[raw] || '';
  }

  function domModeKey(value) {
    const canonical = canonicalMode(value);
    return canonical ? DOM_MODE_KEY[canonical] || canonical : '';
  }

  function modeFromDomKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'reds') return MODES.X_SEARCH;
    return canonicalMode(raw);
  }

  function normalizeUiContext(input = {}) {
    const mode = canonicalMode(input.mode) || MODES.LINKS;
    const query = String(input.query || '');
    const selectedId = String(input.selectedId || '');
    const projectFilter = String(input.projectFilter || '');
    const promptCategory = String(input.promptCategory || '');
    const createdAt = Number(input.createdAt || Date.now());
    return { mode, query, selectedId, projectFilter, promptCategory, createdAt };
  }

  const api = Object.freeze({
    MODES,
    LEGACY_MODE_ALIASES,
    DOM_MODE_KEY,
    MESSAGES,
    STORAGE,
    SESSION,
    COMMANDS,
    FLOATING_ACTION_BY_COMMAND,
    canonicalMode,
    domModeKey,
    modeFromDomKey,
    normalizeUiContext
  });

  globalThis.QuickLinksContract = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
