# Quick Project Links — Architecture

Baseline: **v1.17.0**  
Updated: **2026-10-01**

## 1. Runtime graph

```text
manifest.json
├─ Service Worker
│  └─ background-wrapper.js
│     ├─ app-contract.js
│     ├─ side-panel-presence-background.js
│     ├─ ui-context-background.js
│     ├─ shortcut-registry.js
│     ├─ log-relay-core.js
│     ├─ background.js
│     ├─ search-auto-clear-background.js
│     ├─ log-relay-background.js
│     └─ log-relay-toggle-background.js
├─ Content Scripts
│  ├─ app-contract.js
│  ├─ log-relay-content-command-guard.js
│  ├─ shortcut-registry.js
│  ├─ auto-project-rules.js
│  ├─ interaction-core.js
│  ├─ interaction-bridge.js
│  ├─ x-search-core.js
│  ├─ content-floating-search.js
│  ├─ link-browsing-context-guard.js
│  └─ log-relay-capture.js
└─ Side Panel
   └─ sidepanel-wrapper.js
      ├─ sidepanel.html / sidepanel.js
      ├─ qpl-design-tokens.css
      ├─ app-contract.js
      ├─ x-search-core.js
      ├─ x-search-sidepanel.js
      ├─ ui-context-sidepanel.js
      ├─ interaction-core.js
      ├─ interaction-bridge.js
      ├─ link-browsing-context-guard.js
      └─ Log Relay modules
```

## 2. Canonical vocabulary

`app-contract.js` is the vocabulary boundary.

Canonical modes:

- `links`
- `x-search`
- `prompts`
- `log`

The old `reds` token survives only where compatibility requires it, primarily mature DOM IDs/classes and the Chrome command ID `quick-links-open-reds`. New cross-module code must use `x-search`.

The contract also owns message names, persistent storage keys, transient session keys and command aliases.

## 3. Surface roles

### Floating POP — Launcher
Fast page-adjacent access. It owns a Shadow DOM renderer, lightweight drafts and page-context resilience. It should optimize for opening/copying, not reproduce every management control.

### Side Panel — Workbench
Longer-lived management surface for Links, Prompt and X Search plus Log Relay. Mature editing/storage orchestration remains here until extracted by named responsibility.

### Service Worker — State Authority
Owns serialized mutations, atomic counters, dynamic URL resolution, tab operations, command routing and cross-surface coordination.

## 4. Search model

Links / Prompt / X Search share `sharedSearchQuery` and revision metadata.

X-specific advanced filters are local X Search state and compile through `x-search-core.js`.

Opening Side Panel from Floating POP writes a short-lived `quickLinksUiContext` object to `storage.session`, opens the panel, then restores mode/query/filter state through `QuickLinksSidepanelApi`.

## 5. Panel presence

Current Chrome exposes `sidePanel.onOpened` and `sidePanel.onClosed`.

`side-panel-presence-background.js` therefore:

1. records presence in `storage.session`;
2. broadcasts presence changes to content scripts;
3. answers current-window presence queries.

The old local-storage heartbeat remains only when native events are unavailable. It is not the normal path.

## 6. State boundaries

Persistent user state -> `storage.local`.

Transient runtime coordination -> `storage.session`.

Main Quick Links writes -> background `quickLinksCommitState` merge path.

Log Relay entry mutation -> `log-relay-background.js`.

Do not rename existing persistent keys without an explicit migration.

## 7. Interaction

`interaction-core.js` owns DOM-free intent.

`interaction-bridge.js` resolves canonical mode + surface to actual controls.

`link-browsing-context-guard.js` preserves browsing/focus position for background-open link actions.

See `INTERACTION_CONTRACT.md`.

## 8. Visual system

`qpl-design-tokens.css` owns reusable spacing, radius, type, focus and surface tokens.

v1.17 treats the mode selector as one neutral workspace switch rather than four separately branded tabs. Floating POP uses the same neutral shell and remains visually lighter than the Side Panel.

## 9. Release correctness

The GitHub Actions package workflow is part of runtime correctness:

1. parse manifest;
2. syntax-check JavaScript;
3. validate referenced files;
4. run deterministic tests;
5. build runtime-only ZIP;
6. inspect ZIP root;
7. extract and validate packaged references/load order;
8. upload artifact and publish validated ZIP.

The ZIP is the final runtime artifact, not the repository tree.

## 10. Refactor rule

Refactor by vertical responsibility:

1. define contract;
2. characterize behavior;
3. extract one responsibility;
4. wire both surfaces only where meaning is shared;
5. run deterministic tests;
6. verify packaged runtime;
7. delete retired compatibility code.

Do not split giant files merely to reduce line count.
