# Quick Project Links — Giant-file Responsibility Map

Baseline: **v1.15.6**  
Updated: **2026-08-22**  
Status: **PHASE 5 complete**

This map documents the mature responsibilities inside `sidepanel.js` and `content-floating-search.js`. It is a change-safety guide, not a request to split every section into a module.

## `sidepanel.js`

| Responsibility | Main anchors | State / dependencies | Current decision |
| --- | --- | --- | --- |
| Runtime and conflict-aware state | `sendRuntimeMessage`, `commitLocalState`, `applyCommittedState`, `bindUnifiedStorageListener` | `chrome.runtime`, storage snapshots, `quickLinksCommitState` | Keep together; mutation timing is cross-feature infrastructure. |
| Dynamic link fallback | `isDynamicQuickLinkUrl`, `resolveQuickLinkLocallySidepanel` | URL, JST calendar helpers | Keep local; deliberately not consolidated with background/content fallbacks. |
| Auto-project rules | `openAutoRuleManager`, `renderAutoRuleManager`, `persistAutoProjectRules` | `QuickLinksAutoRules`, projects, modal DOM | Keep in mature side panel until UI/state seams are characterized. |
| Shared search | `setSharedSearchQuery`, `persistSharedSearchQuery`, `syncSharedSearchInputs` | Links / REDS / Prompt inputs, storage revision fields | Keep together; all three modes share one lifecycle. |
| Projects and filters | `renderFilters`, project edit/picker functions, search-project-filter functions | items, projects, colors, modal DOM | Keep together; filtering and project mutation currently share state heavily. |
| Link rendering and CRUD | `renderList`, `addItem`, edit/archive/restore/delete functions | items, projects, runtime counters | Keep in mature side panel. |
| Backup import and exact-duplicate compaction | `handleImportData`, `cleanupDuplicateData` | `QuickLinksImportCore`, `QuickLinksAutoRules`, commit/render functions | Pure parsing/key/merge rules extracted in PHASE 5; orchestration stays here. |
| Keyboard and event binding | `setupEventListeners`, focus/navigation helpers | all view modes and modal state | Keep together; broad but user-visible and capture-phase-sensitive. |
| Help and panel presence | help modal functions, heartbeat functions | DOM, window ID, runtime messages | Keep in place; heartbeat is lifecycle-sensitive. |
| REDS search | `setupRedsSearchFeature`, URL builders, run functions | shared query, date state, X core | X deterministic rules already extracted; mature entry point stays here. |
| Prompt | `setupPromptMemoFeature`, category management, rendering and CRUD | prompt state, shared search, clipboard/runtime counters | Candidate for a future targeted phase only after dedicated characterization tests. |

## `content-floating-search.js`

| Responsibility | Main anchors | State / dependencies | Current decision |
| --- | --- | --- | --- |
| Runtime/storage resilience | `getChromeRuntime`, extension-context guards, `storageGet`, `storageSet`, `bindStorageSync` | page content-script lifecycle and invalidated extension contexts | Keep together; fallback behavior is browser-context-specific. |
| Shared search | `applySharedSearchQuery`, composition handlers, persistence | three floating tabs and side-panel routing | Keep together to preserve revision ordering. |
| Host and notices | `createHost`, `showFloatingNotice` | Shadow DOM and page document | Keep in content script. |
| Shortcut routing | keyboard handlers, route-to-sidepanel fallbacks, focus/navigation helpers | page focus, side-panel presence, capture guards | Keep together; do not centralize merely for DRYness. |
| Main renderer | `render`, `updatePanelResults`, list-event binding | nearly all floating UI state | Do not extract yet; this is the highest-coupling area. |
| Prompt | prompt category/filter/card/modal functions | prompt state, Shadow DOM, storage/runtime | Future candidate only with browser-focused characterization. |
| Add/edit Links | add/edit modal functions, duplicate hints, auto-project application | page URL/title, items, projects, `QuickLinksAutoRules` | Keep together; draft preservation and overwrite confirmation are coupled. |
| Search and project filter | item comparison/matching and filter-menu functions | items, projects, keyboard navigation | Pure scoring may be a future candidate after result-order tests exist. |
| URL open/copy and REDS | open/copy helpers and REDS builders/runners | runtime fallback, tab opening, date state | Keep local; page-context fallback differs from side panel. |
| Runtime messages | final `runtimeForMessages` listener | shortcut routing and active UI state | Keep at the content-script boundary. |

## PHASE 5 extraction boundary

`quick-links-import-core.js` now owns only deterministic rules:

- accepted current/legacy import shapes;
- Quick Link and Prompt exact-duplicate keys;
- duplicate record merge policy;
- duplicate list compaction;
- project-list reconstruction.

`sidepanel.js` still owns all effects:

- reading textarea/modal state;
- confirmation and alert messages;
- ID/timestamp creation during import;
- state replacement or conflict-aware commit;
- rendering after commit.

Load order in `sidepanel.html` is intentional:

1. `auto-project-rules.js`
2. `quick-links-import-core.js`
3. `sidepanel.js`

## Explicit non-targets

- no `sidepanel-wrapper.js` architecture changes;
- no Backlog/JST fallback consolidation;
- no Log Relay changes;
- no shortcut-handler consolidation;
- no storage key, schema or migration changes;
- no manifest version bump;
- no feature or UI change.

Future extraction requires a named responsibility, characterization coverage and a smaller change surface than the whole giant file.
