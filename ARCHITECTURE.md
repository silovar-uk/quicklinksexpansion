# Quick Project Links — Architecture

Baseline: **v1.15.8**  
Updated: **2026-08-25**

This document describes the current runtime architecture and the boundaries that should survive future cleanup. User-visible interaction semantics are defined in `INTERACTION_CONTRACT.md`; broader behavior remains in `CURRENT_BEHAVIOR.md`.

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
│  ├─ interaction-core.js
│  ├─ interaction-bridge.js
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
         ├─ interaction-core.js
         ├─ interaction-bridge.js
         ├─ log-relay-core.js
         ├─ log-relay-panel.js
         ├─ log-relay-polish.js
         └─ log-relay-toggle-panel.js
```

`sidepanel.html` / `sidepanel.js` remain the mature core UI. `sidepanel-wrapper.js` waits for the base document initialization and then attaches focused feature modules. Do not replace that composition model casually.

## 2. Interaction architecture

v1.15.8 introduces a shared, intentionally small interaction layer.

### `interaction-core.js`

DOM-free interaction meaning:

- `SELECT_PRIMARY`
- `MOVE_PRIMARY_PREV`
- `MOVE_PRIMARY_NEXT`
- mode -> primary-role resolution
- keyboard-event -> action resolution

It is CommonJS-compatible so deterministic tests exercise the exact production rules.

### `interaction-bridge.js`

Runtime adapter between shared intent and DOM surfaces:

- detects Side Panel vs Floating POP;
- resolves Links / Prompt / REDS / LOG mode;
- maps each surface/mode to its primary DOM control;
- owns `Alt+Q` primary focus;
- owns `ArrowUp` / `ArrowDown` movement after a list primary target is focused;
- injects the shared focus-visible treatment into document or Shadow DOM as needed.

Important: the bridge installs on `window` capture. Mature legacy shortcut handlers live on `document` capture, so the shared interaction contract becomes the effective owner without requiring a risky edit to both giant mature files in the same phase.

Legacy Alt+Q branches still exist inside the giant files as unreachable fallback for recognized modes. Remove them only in a separately characterized cleanup phase.

## 3. Interaction flow

```text
keyboard event
  -> interaction-core.js (intent)
  -> interaction-bridge.js (surface + mode)
  -> primary DOM target
  -> native focus / native Enter or Space behavior
```

Examples:

```text
Prompt + Alt+Q
  -> SELECT_PRIMARY
  -> Prompt adapter
  -> first visible Copy button

REDS + Alt+Q
  -> SELECT_PRIMARY
  -> REDS adapter
  -> current search field

LOG + Alt+Q
  -> SELECT_PRIMARY
  -> Log Relay adapter
  -> first visible row checkbox
```

No `SELECT_PRIMARY` path may change the active mode.

## 4. Major module responsibilities

### Mature Quick Links UI

- `sidepanel.js` — Side Panel Links / REDS / Prompt state, rendering, editing, shared search, filters, mature event handlers and storage synchronization.
- `content-floating-search.js` — Floating POP Links / REDS / Prompt renderer, page-context lifecycle, storage resilience and mature fallback handlers.
- `background.js` — serialized state commits, conflict-aware merging, atomic counters, dynamic URL resolution, command routing and Side Panel presence coordination.
- `auto-project-rules.js` — deterministic URL normalization, duplicate comparison, LINE WORKS normalization, automatic project matching and record normalization.
- `quick-links-import-core.js` — DOM-free import parsing, duplicate keys, merge/compaction rules and project reconstruction.

### Shared infrastructure

- `interaction-core.js` — interaction semantics.
- `interaction-bridge.js` — surface adapters and keyboard focus/navigation.
- `qpl-design-tokens.css` — shared spacing, radius, typography, focus and restrained shadow tokens.
- `shortcut-registry.js` — canonical Log Relay shortcut matching plus existing shortcut registry/documentation responsibilities.
- `search-auto-clear-background.js` — shared-search expiry lifecycle.

### REDS / X search

- `reds-x-search-core.js` owns deterministic X-search rules and URL construction.
- `reds-x-search-polish.js` owns only Side Panel presentation additions.
- mature Side Panel entry points continue to execute the search.

### Log Relay

- `log-relay-core.js` — pure state/key/date helpers.
- `log-relay-background.js` — Log Relay storage mutation owner.
- `log-relay-capture.js` — page-side one-line capture UI.
- `log-relay-panel.js` — LOG list/status/edit/bulk UI.
- `log-relay-polish.js` — Log Relay visual layer.
- `log-relay-toggle-background.js` — side-panel toggle state and `chrome.sidePanel.open/close` handling.
- `log-relay-toggle-panel.js` — panel presence reporting and in-panel close shortcut handling.
- `log-relay-content-command-guard.js` — prevents old content paths from double-firing the Chrome command.

## 5. State and mutation boundaries

Main Quick Links writes use `quickLinksCommitState` and serialized merge logic in `background.js`. Do not replace this with view-local blind `chrome.storage.local.set()` writes.

Log Relay entry mutation belongs to `log-relay-background.js`.

Shared search remains coordinated through `sharedSearchQuery` / `sharedSearchState` revision metadata.

Do not rename storage keys or migration markers as part of UI cleanup without an explicit migration plan.

## 6. Chrome execution-context exception

Shared *meaning* does not imply one physical listener for every action.

Chrome user-gesture-sensitive flows—especially `chrome.sidePanel.open()` / toggle paths—must stay in execution contexts that preserve the original eligible user gesture. Do not centralize those merely for DRYness.

The safe pattern is:

```text
shared action name / contract
  -> required Chrome execution context
  -> context-specific effect
```

## 7. Visual system

`qpl-design-tokens.css` now keeps a deliberately small vocabulary:

- spacing: 4 / 8 / 12 / 16 / 24;
- radius: 6 / 10 / 14;
- typography: micro / meta / body / title;
- focus: color / width / offset;
- shadows: flat by default, floating-layer shadow separately.

Cards and ordinary controls should primarily use border, spacing and typography for hierarchy. Reserve stronger shadows for true floating surfaces and modals.

Keyboard focus is a first-class UI state. See `INTERACTION_CONTRACT.md`.

## 8. Release architecture

GitHub Actions is part of runtime correctness, not a convenience script.

Pipeline:

1. parse manifest;
2. syntax-check JavaScript;
3. validate repository manifest references;
4. run deterministic tests;
5. build runtime-only ZIP;
6. inspect ZIP root;
7. extract the ZIP and re-validate the *packaged* manifest references;
8. verify interaction runtime load order inside the packaged manifest;
9. reject retired shim / development Markdown leakage;
10. upload artifact and publish validated ZIP to `release/`.

The packaged ZIP—not the repository tree—is the final runtime artifact.

## 9. Tests

Core deterministic coverage includes:

- Log Relay state;
- REDS/X URL rules;
- auto-project rules;
- storage/dynamic URL characterization;
- import/deduplication;
- interaction intent and cross-surface routing;
- runtime interaction load contract.

Interaction-specific tests are in:

- `tests/interaction-core.test.js`
- `tests/interaction-runtime-contract.test.js`

## 10. Refactor rule

Before moving mature behavior:

1. identify one named responsibility;
2. pin user-visible behavior with characterization tests;
3. extract or reroute only that responsibility;
4. run syntax + deterministic tests;
5. verify packaged runtime, not only repository source;
6. treat unexpected behavior drift as a regression.

Prefer vertical slices such as `SELECT_PRIMARY` over a giant “clean up all shortcuts” rewrite.
