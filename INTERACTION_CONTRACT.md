# Quick Project Links — Interaction Contract

Baseline: **v1.17.0**  
Updated: **2026-10-01**

## Principle

**Same intent, same meaning, surface-specific presentation.**

```text
key / click
  -> action
  -> canonical mode
  -> surface adapter
  -> native DOM target/effect
```

## Canonical modes

- Links: `links`
- X Search: `x-search`
- Prompt: `prompts`
- Log Relay: `log`

Legacy DOM token `reds` must canonicalize to `x-search` before shared interaction logic makes decisions.

## Primary selection

Binding: `Alt + Q`

- Links -> first visible Link primary target.
- Prompt -> first visible Prompt copy action.
- X Search -> current X search input.
- Log -> first visible row checkbox.
- Empty list -> consumed safe no-op.
- Must not switch mode.

After a list primary target owns focus:

- `ArrowUp` -> previous target.
- `ArrowDown` -> next target.
- Stop at ends; no wrap.
- X Search input does not participate in list movement.

Native Enter/Space activation remains owned by the focused control.

## Background-open continuity

Ctrl/Cmd+click and middle-click preserve current browsing context.

When click-history updates rerender a list, keep the activated Link as the visual anchor and preserve keyboard focus where possible.

`link-browsing-context-guard.js` owns this behavior across both surfaces.

## Floating -> Side Panel continuity

The Side Panel open button in Floating POP means **continue here**, not merely navigate to another surface.

The handoff preserves:

- canonical mode;
- shared search query;
- Links secondary project filter when relevant;
- Prompt category filter when relevant.

Transient handoff data uses `storage.session` and expires quickly.

## Focus

Keyboard focus is product state.

Shared primary targets use `--qpl-focus-*` tokens and `data-qpl-primary-target`.

Visual selection and actual focus should refer to the same control where possible.

## Rejection criteria

Reject a change if it:

- makes Alt+Q switch modes;
- fixes only one surface for shared interaction meaning;
- lets X Search regress to club-specific behavior;
- loses current query/mode when Floating expands into Side Panel;
- stores transient panel/handoff state as durable user data without a reason;
- intercepts Arrow keys while ordinary text/search input owns focus;
- creates a second synthetic activation when native control semantics already work.
