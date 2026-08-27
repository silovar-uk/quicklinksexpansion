# Quick Project Links — Interaction Contract

Baseline: **v1.15.9**  
Updated: **2026-08-27**

This document defines interaction meaning independently from Side Panel / Floating POP DOM details.

## Principle

**Same intent, same meaning, regardless of surface.**

A keyboard shortcut should express an action first. The active mode and active surface then resolve the DOM target.

```text
key input
  -> interaction action
  -> active mode
  -> active surface adapter
  -> DOM target
```

Do not add a new shortcut implementation that directly assumes `Links` when the intended action is mode-relative.

## Current shared actions

### `SELECT_PRIMARY`

Binding: `Alt + Q`

- Links -> focus the first visible Link primary target.
- Prompt -> focus the first visible Prompt copy action.
- REDS -> focus the current REDS search field.
- LOG -> focus the first visible Log Relay row checkbox.
- Empty list -> safe no-op while still consuming the shortcut; do not fall through and switch modes.
- The action must not change the active mode.

LOG is detected before the mature `mode-links` body state because Log Relay intentionally overlays the mature side-panel modes while keeping their classes in the DOM.

### Primary list navigation

Bindings after a primary list target is focused:

- `ArrowUp` -> previous primary target.
- `ArrowDown` -> next primary target.
- Stop at the first / last item; do not wrap.
- Applies to Links, Prompt and LOG list targets.
- REDS search remains a text/search control and does not opt into list navigation.

Native `Enter` / `Space` activation remains owned by the actual focused DOM control. The interaction layer should not synthesize a second activation path when native semantics are sufficient.

### Background-open continuity

Ctrl/Cmd+click and middle-click are background-open intents. They must not destroy the user's current browsing context while click history or other non-structural metadata is persisted.

- Side Panel and Floating POP must preserve the clicked Link's visual position across list re-rendering.
- If click-count sorting moves the clicked Link, preserve that Link as the visual anchor rather than blindly restoring an old absolute `scrollTop`.
- Preserve keyboard focus when the activated Link owned focus before the re-render.
- A new explicit user navigation intent (wheel, touch, pointer, ordinary key navigation) cancels stale restoration.
- Restoration may react to DOM mutation/layout completion, but must not depend on a guessed delay to make the behavior work.

`link-browsing-context-guard.js` owns this cross-surface continuity behavior.

## Surfaces

### Side Panel

Adapters currently resolve:

- Links: `#link-list .link-item .item-title`
- Prompt: `#prompt-list .prompt-card [data-prompt-copy]`
- REDS: `#reds-search`
- LOG: `#log-relay-root .lr-list [data-lr-id] .lr-row-check`

### Floating POP

Adapters currently resolve:

- Links: `#ql-list [data-open-url]`
- Prompt: `#ql-prompt-list .ql-prompt-card [data-prompt-copy]`
- REDS: `#ql-reds-query`

Surface selectors belong to `interaction-bridge.js`. Shortcut meaning belongs to `interaction-core.js`.

## Runtime ownership

- `interaction-core.js` is DOM-free and CommonJS-compatible for deterministic tests.
- `interaction-bridge.js` detects Side Panel vs Floating POP, resolves the active mode, owns primary-target focus/navigation, and installs the capture-phase keyboard bridge.
- `link-browsing-context-guard.js` preserves Link list context for background-open intents across Side Panel and Floating POP re-renders.
- `manifest.json` loads the interaction runtime before `content-floating-search.js`, then loads the browsing-context guard after the Floating POP runtime exists.
- `sidepanel-wrapper.js` loads the interaction runtime and browsing-context guard after the mature side panel has initialized.

The mature giant files still contain legacy Alt+Q branches. For v1.15.9 the shared bridge is the effective owner because its window-capture listener consumes recognized interactions before the document-capture legacy handlers. Remove legacy branches only in a separately characterized giant-file cleanup phase; do not reintroduce new behavior into them.

## Visual focus contract

Keyboard focus is a product state, not a late accessibility patch.

Primary targets use the shared focus tokens:

- `--qpl-focus-color`
- `--qpl-focus-width`
- `--qpl-focus-offset`

The bridge marks primary targets with `data-qpl-primary-target="true"` and ensures a consistent focus-visible outline in both document and Shadow DOM surfaces.

Visual selection, actual focus, and native activation target should point to the same control wherever possible.

## Rejection criteria

Reject a change if it:

- makes `Alt+Q` switch to Links from Prompt, REDS or LOG;
- fixes only Side Panel or only Floating POP where both surfaces exist;
- lets Ctrl/Cmd+click or middle-click jump a Link list back to the top after click-history persistence;
- restores only an old absolute `scrollTop` when click-count sorting has moved the activated item;
- adds a Prompt-only / Links-only shortcut shim for a mode-relative action;
- handles visual selection separately from actual keyboard focus without a clear reason;
- lets an empty list fall through to legacy Links selection;
- consumes ArrowUp/ArrowDown while focus is in ordinary search/text input;
- adds runtime JS without loading it through both required entry paths;
- passes unit tests but is absent from the packaged runtime.

## Tests

`tests/interaction-core.test.js` covers intent, mode routing, Side Panel / Floating POP, empty-state safety, Links / Prompt / LOG list navigation, and REDS focus behavior.

`tests/interaction-runtime-contract.test.js` verifies manifest/wrapper load order, retirement of the Prompt-only shim and presence of shared focus tokens.

`tests/browsing-context-guard.test.js` covers Ctrl/Cmd/middle-click intent detection, anchored scroll restoration math, scroll-bound clamping, and runtime loading through both surfaces.

## Release integrity

The packaged ZIP is treated as the real runtime artifact, not merely a copy of the repository.

CI must verify after ZIP creation that:

- `manifest.json` is at ZIP root;
- every packaged manifest reference exists inside the extracted ZIP;
- `interaction-core.js`, `interaction-bridge.js` and `link-browsing-context-guard.js` are present;
- the interaction content-script order precedes `content-floating-search.js` and the browsing-context guard follows it;
- the retired Prompt-only shim is absent;
- development Markdown files are not shipped.

## Next extraction candidates

Do not centralize everything at once. The next candidates should be taken one action at a time, with characterization first:

1. `FOCUS_SEARCH` (`Alt+4`)
2. `CREATE_NEW` (`Alt+N`)
3. mode switching (`Alt+1/2/3`)
4. search/filter intent routing

Keep Chrome user-gesture-sensitive actions, especially Side Panel open/toggle behavior, in their required execution contexts even when their semantic action name is shared.
