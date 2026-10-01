# Quick Project Links — AI / Developer Handoff

Baseline: **v1.17.0**  
Updated: **2026-10-01**

## Read first

Before editing behavior, read:

1. `CURRENT_BEHAVIOR.md`
2. `ARCHITECTURE.md`
3. `RESPONSIBILITY_MAP.md`
4. `INTERACTION_CONTRACT.md`
5. `VALIDATION.md`

## Vocabulary

Use canonical modes from `app-contract.js`.

- `links`
- `x-search`
- `prompts`
- `log`

Do not introduce new product logic under the name `reds`.

Allowed compatibility exceptions:

- mature DOM IDs/classes such as `mode-reds` / `ql-reds-*`;
- Chrome command ID `quick-links-open-reds`.

These are aliases, not requirements for new naming.

## Architecture rules

- Floating POP is a launcher.
- Side Panel is a workbench.
- Service Worker is the state/effect authority.
- Shared meaning belongs in pure cores/contracts.
- Surface rendering remains surface-specific.
- Persistent data -> `storage.local`.
- Transient UI coordination -> `storage.session`.
- Main Quick Links mutation -> conflict-aware background path.
- Log Relay mutation -> Log Relay background module.

## X Search

No fixed club account, site or keyword may be added implicitly.

Use `x-search-core.js` for query semantics.

Side Panel presentation belongs to `x-search-sidepanel.js`.

## Panel presence

Native `sidePanel.onOpened/onClosed` is the normal presence path on current Chrome.

`side-panel-presence-background.js` owns it.

Heartbeat exists only as fallback and must not become the primary path again.

## Context handoff

Floating's Side Panel button preserves mode/query/filter context through `ui-context-background.js` -> `storage.session` -> `ui-context-sidepanel.js`.

Cross-module code must use `QuickLinksSidepanelApi`, not reach into mature Side Panel globals arbitrarily.

## UI

Prefer familiar controls first, advanced options second.

Mode navigation is a neutral workspace selector. Avoid giving each mode an unrelated visual brand.

Use focus-visible state deliberately.

Do not add decorative animation if it increases interaction latency.

## Refactoring giant files

Do not split `sidepanel.js` or `content-floating-search.js` just because they are large.

Extract one named responsibility only after tests describe it.

Delete dead compatibility files after runtime composition no longer references them.

## Release

Source-tree success is insufficient. The packaged ZIP must pass the same load-order/reference contract.

Never claim implementation complete before GitHub Actions package validation passes.
