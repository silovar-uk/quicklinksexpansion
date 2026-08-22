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
         │  └─ quick-links-import-core.js
         ├─ qpl-design-tokens.css
         ├─ reds-x-search-core.js
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
- `quick-links-import-core.js` — DOM-free import-shape parsing, exact-duplicate keys, duplicate record merge/compaction and project-list reconstruction. It depends on `QuickLinksAutoRules` and loads before `sidepanel.js`.
- `RESPONSIBILITY_MAP.md` — current ownership map and extraction guardrails for the two mature giant files.

### Shared / infrastructure

- `background-wrapper.js` — service-worker composition point.
- `sidepanel-wrapper.js` — side-panel composition point.
- `shortcut-registry.js` — canonical shared Log Relay shortcut matching plus legacy Quick Links shortcut documentation.
- `search-auto-clear-background.js` — three-minute shared-search expiry lifecycle.
- `qpl-design-tokens.css` — shared visual tokens and top-level mode layout.

### REDS / X search

- `reds-x-search-core.js` owns the deterministic, DOM-free X-search rules: default `REDSOFFICIAL`, account normalization, end-date increment, query construction and final X URL construction. It is CommonJS-compatible so tests can exercise the exact production logic directly.
- `sidepanel.js` owns the effective X-search entry point and delegates URL construction to `reds-x-search-core.js`, with the v1.15.6 fixed-account builder retained only as a core-not-yet-loaded fallback.
- `reds-x-search-polish.js` owns only the side-panel UI layer: editable account field injection, button state, account-input Enter handling, labels and DOM-lifecycle waiting.
- `sidepanel-wrapper.js` must load `reds-x-search-core.js` before `reds-x-search-polish.js`.
- PHASE 4 removed the polish-layer function overrides and capture-phase X-button interception. Button, Alt+X and routed runtime actions now use the mature `sidepanel.js` entry point directly.

### Log Relay

- `log-relay-core.js` — pure state/key/date helpers.
- `log-relay-background.js` — Log Relay storage mutation owner.
- `log-relay-capture.js` — page-side one-line capture UI.
- `log-relay-panel.js` — LOG mode list/status/edit/bulk UI.
- `log-relay-polish.js` — current light-blue translucent Log Relay visual layer and individual-delete UX patch.
- `log-relay-toggle-background.js` — service-worker side-panel toggle state and `chrome.sidePanel.open/close` handling.
- `log-relay-toggle-panel.js` — side-panel presence reporting and in-panel close shortcut handling.
- `log-relay-content-command-guard.js` — prevents old page-side `Alt+Shift+M` handling from double-firing the Chrome command path.

The obsolete `log-relay-command-open-fix.js` shim was removed during PHASE 3 after confirming that it was not loaded by the manifest/wrapper graph and only watched the retired `quick-links-open-log` command. The active command remains `quick-links-toggle-log` through `log-relay-toggle-background.js`.

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
  -> sidepanel.js runRedsXSearchSidepanel
  -> sidepanel.js buildRedsXUrlSidepanel
  -> reds-x-search-core.js
  -> deterministic query + X URL
  -> quickLinksOpenTab / chrome.tabs.create path
```

Current query contract is covered by `tests/reds-x-search-characterization.test.js`, which imports `reds-x-search-core.js` directly and pins the production ownership boundary between `sidepanel.js` and the UI-only polish layer.

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

Message names are currently string literals in their owning modules. Do not centralize them during low-risk cleanup merely for stylistic consistency.

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
- `tests/import-data-core-characterization.test.js`

The REDS/X characterization tests now exercise the pure production core directly. The other characterization tests may still assert implementation details when needed to prevent behavior drift during refactoring.

## 8. Cleanup risk map

### LEVEL 0 — documentation only

Safe: current behavior/architecture/validation documentation.

### LEVEL 1 — low risk with tests

Completed so far:

- removed the confirmed-dead `log-relay-command-open-fix.js` shim;
- extracted deterministic REDS/X search logic into `reds-x-search-core.js` without changing user-visible behavior;
- extracted deterministic import/deduplication logic into `quick-links-import-core.js` after mapping giant-file responsibilities.

Potential future LEVEL 1 work must still be judged by change surface. The duplicated dynamic Backlog/JST helpers span three large runtime files, so they are not being consolidated merely because the logic is similar.

### LEVEL 2 — medium risk

- Completed in PHASE 4: moved X-search URL construction ownership into the mature side-panel implementation and removed runtime function overrides/capture interception from the polish layer.
- PHASE 5 mapped both giant files and extracted only the DOM-free import/deduplication core. Broader feature splits remain medium risk and require dedicated characterization first.

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
