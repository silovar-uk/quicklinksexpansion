# Quick Project Links — Architecture

Baseline: **v1.15.6**  
Updated: **2026-08-22**

This document describes the current architecture. It is not a redesign proposal. For user-visible behavior that must survive cleanup work, see `CURRENT_BEHAVIOR.md`.

## 1. Runtime entry points

```text
manifest.json
│
├─ Service Worker
│  └─ background-wrapper.js
│     ├─ shortcut-registry.js
│     ├─ log-relay-core.js
│     ├─ background.js
│     ├─ search-auto-clear-background.js
│     ├─ log-relay-background.js
│     └─ log-relay-toggle-background.js
│
├─ Content Scripts
│  ├─ log-relay-content-command-guard.js
│  ├─ shortcut-registry.js
│  ├─ auto-project-rules.js
│  ├─ content-floating-search.js
│  └─ log-relay-capture.js
│
└─ Side Panel
   └─ sidepanel-wrapper.html
      └─ sidepanel-wrapper.js
         ├─ sidepanel.html / sidepanel.js
         ├─ qpl-design-tokens.css
         ├─ reds-x-search-polish.js
         ├─ shortcut-registry.js
         ├─ log-relay-core.js
         ├─ log-relay-panel.js
         ├─ log-relay-polish.js
         └─ log-relay-toggle-panel.js
```

`sidepanel.html` / `sidepanel.js` remain the mature core UI. `sidepanel-wrapper.js` waits for the base document initialization and then attaches focused feature modules. Do not change this load model casually: feature modules currently depend on the mature DOM and some existing global functions.

## 2. Major module responsibilities

### Core Quick Links

- `sidepanel.js` — side-panel Links / REDS / Prompt state, rendering, editing, search, filters, shortcuts and storage synchronization.
- `content-floating-search.js` — page-side floating Links / REDS / Prompt UI and page-context shortcut routing.
- `background.js` — serialized state commits, conflict-aware merge behavior, atomic click/copy counters, dynamic URL resolution, main Quick Links command routing and side-panel presence coordination.
- `auto-project-rules.js` — deterministic link normalization, duplicate comparison, LINE WORKS normalization, automatic project matching and link/prompt normalization.

### Shared / infrastructure

- `background-wrapper.js` — service-worker composition point.
- `sidepanel-wrapper.js` — side-panel composition point.
- `shortcut-registry.js` — canonical shared Log Relay shortcut matching plus legacy Quick Links shortcut documentation.
- `search-auto-clear-background.js` — three-minute shared-search expiry lifecycle.
- `qpl-design-tokens.css` — shared visual tokens and top-level mode layout.

### REDS / X search

- `reds-x-search-polish.js` currently contains the **effective v1.15.6 X-search behavior**: editable `REDSOFFICIAL` default account, handle normalization, account-only search, date query behavior and button/Enter integration.
- It currently overrides mature `sidepanel.js` X-search functions and intercepts the X-search button in the capture phase.
- This is a deliberate compatibility patch, but it is a future LEVEL 2 cleanup target after characterization tests exist.

### Log Relay

- `log-relay-core.js` — pure state/key/date helpers.
- `log-relay-background.js` — Log Relay storage mutation owner.
- `log-relay-capture.js` — page-side one-line capture UI.
- `log-relay-panel.js` — LOG mode list/status/edit/bulk UI.
- `log-relay-polish.js` — current light-blue translucent Log Relay visual layer and individual-delete UX patch.
- `log-relay-toggle-background.js` — service-worker side-panel toggle state and `chrome.sidePanel.open/close` handling.
- `log-relay-toggle-panel.js` — side-panel presence reporting and in-panel close shortcut handling.
- `log-relay-content-command-guard.js` — prevents old page-side `Alt+Shift+M` handling from double-firing the Chrome command path.

`log-relay-command-open-fix.js` remains in the repository but is not loaded by the current manifest/wrapper graph and watches the obsolete `quick-links-open-log` command. Treat it as a confirmed-dead cleanup candidate, not as active architecture.

## 3. Important event paths

### Quick Links mode commands

```text
Chrome command (Alt+1 / Alt+2 / Alt+3 / configured clear-search)
  -> background.js
  -> quickLinksFloatingShortcut / quickLinksSidepanelShortcut
  -> active content UI or side panel
```

### REDS X search

```text
button / Enter / Alt+X or routed side-panel action
  -> effective runRedsXSearchSidepanel
  -> reds-x-search-polish.js override
  -> build effective X query
  -> quickLinksOpenTab / chrome.tabs.create path
```

Current query contract is covered by `tests/reds-x-search-characterization.test.js`.

### Log capture

```text
Alt+M on page
  -> log-relay-capture.js
  -> runtime message: logRelayStore / add
  -> log-relay-background.js
  -> chrome.storage.local
```

### Log panel toggle

```text
Alt+Shift+M
  -> Chrome command: quick-links-toggle-log
  -> log-relay-toggle-background.js
  -> chrome.sidePanel.open() or chrome.sidePanel.close()
  -> transient logRelayOpenPanelRequest
  -> side panel activates LOG mode
```

The open call must begin in the original eligible user-gesture turn. Do not introduce an `await` before `chrome.sidePanel.open()` in that path.

## 4. Runtime message catalog

### Main Quick Links

- `quickLinksEnsureAutoProjectRules` — ensure/migrate automatic classification rules.
- `quickLinksCommitState` — conflict-aware state commit.
- `quickLinksRecordItemClick` — atomic link click count/time update.
- `quickLinksRecordPromptCopy` — atomic prompt copy count/time update.
- `quickLinksSidePanelHeartbeat` — side-panel presence heartbeat.
- `quickLinksGetSidePanelWindowState` — query presence for a window.
- `quickLinksGetCurrentWindowId` — resolve active/last-focused window ID.
- `quickLinksResolveUrl` — resolve `quicklinks://` dynamic URL.
- `quickLinksOpenTab` — resolve/open a URL in a tab.
- `quickLinksOpenSidePanel` — request normal Quick Links side panel.
- `quickLinksFloatingShortcut` — route a command to page-side floating UI.
- `quickLinksSidepanelShortcut` — route a command/search action to the side panel.

### Log Relay

- `logRelayStore` — Log Relay data operations (`list`, `add`, `updateMemo`, `moveMany`, `deleteMany`, `setSort`, `rebuildIndex`).
- `logRelayPanelPresence` — current LOG-mode panel presence sent to toggle background logic.

Message names are currently string literals in their owning modules. Do not centralize them during LEVEL 0 cleanup.

## 5. Storage catalog

### Main Quick Links (`chrome.storage.local`)

- `items` — Quick Link records.
- `projects` — project/category names.
- `projectColors` — project color map.
- `currentSortMode` — Links sort mode.
- `showArchived` — archive visibility.
- `floatingSearchEnabled` — page-side floating UI setting.
- `autoProjectRules` — deterministic automatic classification rules.
- `promptMemos` — Prompt records.
- `promptCategories` — Prompt categories.
- `promptSortMode` — Prompt sort mode.
- `sharedSearchQuery` — compatibility/current shared query string.
- `sharedSearchState` — query, revision, writer and timestamp synchronization state.
- `sidePanelHeartbeatsByWindow` — side-panel presence by Chrome window.

Migration markers include:

- `quickLinksAutoRuleLineworksTalkV1`
- `quickLinksBuiltinBacklogLastTwoDaysV1`
- `quickLinksBuiltinBacklogDynamicRangesV2`

### Log Relay

- `logRelayEntry:<id>` — entry source of truth in local storage.
- `logRelayIndex` — rebuildable entry ID index.
- `logRelaySortDirection` — sort preference.
- `logRelayOpenPanelRequest` — transient open request; `chrome.storage.session` preferred, local fallback for compatibility.

Do not rename storage keys during cleanup without an explicit migration plan.

## 6. Conflict / mutation ownership

Main Quick Links writes use `quickLinksCommitState` and the serialized merge logic in `background.js`. This preserves concurrent changes and avoids stale views blindly overwriting newer data.

Log Relay entry mutation belongs to `log-relay-background.js`. Capture and panel code should not directly mutate Log Relay entry records.

## 7. Tests

Current deterministic suite:

- `tests/log-relay-core.test.js`
- `tests/reds-x-search-characterization.test.js`
- `tests/auto-project-rules-characterization.test.js`
- `tests/background-storage-and-dynamic-url-characterization.test.js`

The characterization tests are intentionally allowed to assert current implementation details when needed to prevent behavior drift during refactoring.

## 8. Cleanup risk map

### LEVEL 0 — documentation only

Safe: current behavior/architecture/validation documentation.

### LEVEL 1 — low risk with tests

- Remove files proven unreferenced, beginning with `log-relay-command-open-fix.js`.
- Extract deterministic pure helpers without changing callers or storage/message contracts.

### LEVEL 2 — medium risk

- Move the effective X-search implementation from `reds-x-search-polish.js` into the mature side-panel implementation and remove runtime function overrides.
- Split major feature responsibilities out of `sidepanel.js` or `content-floating-search.js`.

### LEVEL 3 — high risk / do not touch during ordinary cleanup

- Replace `sidepanel-wrapper.js` load architecture.
- Consolidate the multi-context `Alt+Shift+M` architecture solely for DRYness.
- Change storage schemas or migration markers.
- Change side-panel user-gesture timing.

## 9. Refactor rule

Before moving behavior:

1. confirm `CURRENT_BEHAVIOR.md`;
2. add/keep characterization coverage;
3. make one responsibility-level change;
4. run syntax + deterministic tests;
5. treat unexpected behavior drift as a regression, not as a convenient new specification.
