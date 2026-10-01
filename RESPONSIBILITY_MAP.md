# Quick Project Links — Responsibility Map

Baseline: **v1.17.0**  
Updated: **2026-10-01**

## Contracts and pure cores

### `app-contract.js`
Owns canonical mode names, message names, storage/session keys and legacy command aliases. New modules should import meaning from here instead of inventing strings.

### `interaction-core.js`
Owns keyboard intent and canonical mode -> primary role mapping. No DOM or Chrome APIs.

### `x-search-core.js`
Owns X query normalization, advanced operators, date conversion, Query Mirror text and final URL construction.

### `auto-project-rules.js`
Owns URL normalization, duplicate identity, project matching and record normalization.

### `quick-links-import-core.js`
Owns import shapes, duplicate keys, merge/compaction and project reconstruction.

## Surface adapters

### `interaction-bridge.js`
Maps interaction intent to Side Panel / Floating POP controls. Mature DOM may still use `reds` IDs, but the bridge returns canonical `x-search`.

### `ui-context-sidepanel.js`
Consumes short-lived handoff context and applies it only through `QuickLinksSidepanelApi`.

### `x-search-sidepanel.js`
Owns Side Panel X-search advanced presentation. It does not own query semantics.

## Mature surfaces

### `sidepanel.js`
Still owns mature Side Panel rendering, Link/Prompt CRUD orchestration, filters, shared-search lifecycle, X-search execution entry points, help and settings.

It exposes a deliberately small `QuickLinksSidepanelApi` for cross-module context restoration.

### `content-floating-search.js`
Owns Floating POP lifecycle, Shadow DOM rendering, lightweight drafts, page-context resilience and launcher interactions.

It hands off context rather than duplicating deeper Side Panel management.

## Service worker responsibilities

### `background.js`
Owns persistent Quick Links mutation semantics, dynamic URL resolution, tab operations, main command fan-out and install migrations/defaults.

### `side-panel-presence-background.js`
Owns Quick Links Side Panel presence. Native `sidePanel.onOpened/onClosed` + `storage.session` are primary; local heartbeat is compatibility fallback.

### `ui-context-background.js`
Owns user-gesture-safe Floating -> Side Panel open + transient context persistence.

### Log Relay background modules
Own Log Relay mutation/toggle semantics independently from the mature Quick Links state path.

## Visual system

### `qpl-design-tokens.css`
Owns reusable visual meaning, not component-specific hacks. Mode tabs use one neutral segmented-control language.

## Compatibility boundaries

The following old names may remain without representing product concepts:

- DOM IDs/classes containing `reds`.
- Chrome command ID `quick-links-open-reds`.

Do not spread these aliases into new modules.

## High-risk non-targets

Do not casually:

- rewrite all of `sidepanel.js` or `content-floating-search.js`;
- change persistent storage keys;
- change Chrome command IDs;
- centralize user-gesture-sensitive Side Panel open paths behind unrelated awaits;
- replace conflict-aware mutations with view-local writes.
