# Quick Project Links — Responsibility Map

Baseline: **v1.15.8**  
Updated: **2026-08-25**

This map defines current ownership boundaries. It is a change-safety guide, not a request to split every large file.

## Shared interaction layer

### `interaction-core.js`

Owns DOM-free interaction meaning:

- `SELECT_PRIMARY`
- previous / next primary movement
- keyboard event -> action mapping
- mode -> primary role mapping

It must not know Side Panel selectors, Floating Shadow DOM selectors or Chrome APIs.

### `interaction-bridge.js`

Owns DOM/surface adaptation for shared interaction actions:

- Side Panel vs Floating POP detection;
- Links / Prompt / REDS / LOG mode detection;
- primary target selectors;
- `Alt+Q` focus routing;
- `ArrowUp` / `ArrowDown` primary-list movement;
- cross-surface focus-visible treatment.

For the interaction actions it recognizes, this bridge is the effective runtime owner. Do not add new mode-relative Alt+Q behavior to `sidepanel.js` or `content-floating-search.js`.

The mature giant files still contain legacy Alt+Q fallback branches. Removing those branches is a future characterized cleanup, not a reason to add new logic there.

## `sidepanel.js`

Keep these responsibilities in the mature Side Panel until a named extraction phase exists:

- conflict-aware state synchronization and commit orchestration;
- shared search lifecycle;
- projects, filters and project management;
- Link rendering / CRUD;
- Prompt rendering / CRUD and categories;
- REDS search orchestration;
- import UI orchestration;
- help and panel heartbeat lifecycle;
- mature event bindings not yet transferred to a shared interaction contract.

Do not move storage mutation semantics during visual cleanup.

## `content-floating-search.js`

Keep these browser-context responsibilities together unless specifically characterized:

- extension-context invalidation resilience;
- Floating POP host / Shadow DOM lifecycle;
- shared search synchronization;
- Floating renderer and draft preservation;
- add/edit flows;
- URL open/copy fallback behavior;
- page-side REDS behavior;
- mature shortcuts not yet transferred to the shared interaction layer.

Do not extract broad renderer sections merely for file-size reduction.

## `background.js`

Owns main Quick Links effectful backend behavior:

- serialized `quickLinksCommitState`;
- conflict-aware merge behavior;
- click/copy counters;
- dynamic URL resolution;
- tab opening;
- main command routing;
- Side Panel presence coordination.

Views should not bypass this mutation boundary with naive storage replacement.

## Deterministic cores

### `auto-project-rules.js`

- URL normalization and validation;
- duplicate comparison;
- LINE WORKS normalization;
- automatic project matching;
- Quick Link / Prompt record normalization.

### `quick-links-import-core.js`

- accepted import shapes;
- exact-duplicate keys;
- duplicate merge / compaction rules;
- project-list reconstruction.

### `reds-x-search-core.js`

- X account normalization;
- date boundary conversion;
- query construction;
- final X URL construction.

### `log-relay-core.js`

- Log Relay pure state/date/key helpers.

## Visual system

### `qpl-design-tokens.css`

Owns shared visual vocabulary:

- spacing scale;
- radius scale;
- typography scale;
- focus tokens;
- restrained shadow tokens;
- top-level mode-tab normalization.

Do not treat it as a dumping ground for one-off component CSS. Add a token only when it expresses reusable visual meaning.

## Log Relay

- `log-relay-background.js` — Log Relay mutation owner.
- `log-relay-capture.js` — page capture UI.
- `log-relay-panel.js` — LOG panel rendering / status / edit / bulk behavior.
- `log-relay-polish.js` — visual polish layer.
- `log-relay-toggle-background.js` — Chrome Side Panel toggle lifecycle.
- `log-relay-toggle-panel.js` — in-panel presence / close handling.
- `log-relay-content-command-guard.js` — duplicate-command guard.

Chrome user-gesture-sensitive Side Panel operations may require multiple execution contexts. Shared semantic naming does not override Chrome timing constraints.

## Runtime composition points

### `manifest.json`

Owns content-script runtime order. For the shared interaction slice:

```text
interaction-core.js
interaction-bridge.js
content-floating-search.js
```

The order is contract-tested.

### `sidepanel-wrapper.js`

Loads the mature Side Panel first, then focused shared modules. It must load:

```text
interaction-core.js
interaction-bridge.js
```

in that order.

Do not change the wrapper architecture casually.

## CI / release ownership

`.github/workflows/package-extension.yml` owns release integrity:

- repository syntax and tests;
- manifest references;
- runtime-only ZIP packaging;
- ZIP-root validation;
- extracted-package manifest validation;
- interaction runtime order validation;
- exclusion of retired shims and development Markdown;
- artifact upload and validated `release/` publication.

A source file existing in the repository is not sufficient proof that it exists in the installable runtime.

## Current safe extraction strategy

Use vertical responsibility slices:

1. define interaction or deterministic contract;
2. add characterization tests;
3. add a small pure core if useful;
4. add a thin context adapter if needed;
5. wire both runtime entry paths;
6. verify packaged artifact;
7. only then delete the retired shim / duplicated module.

`SELECT_PRIMARY` in v1.15.8 is the reference implementation of this strategy.

## Explicit high-risk non-targets

Do not casually:

- rewrite `sidepanel-wrapper.js` composition;
- rewrite the entire `sidepanel.js` / `content-floating-search.js` pair;
- rename storage keys or migration markers;
- consolidate Chrome Side Panel open/toggle timing solely for DRYness;
- centralize dynamic Backlog/JST fallback behavior without context-specific characterization.
