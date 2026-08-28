# Quick Project Links — Current Behavior Contract

Baseline: **v1.15.10**  
Updated: **2026-08-25**  
Purpose: preserve user-visible behavior while the codebase is reorganized.

This is a characterization contract. If a refactor changes one of these behaviors without an explicit product decision, treat it as a regression.

## Entry points

- Chrome action opens Quick Links through the Side Panel entry point in `manifest.json`.
- The page-side Floating POP is supplied by `content-floating-search.js`.
- The Side Panel uses `sidepanel-wrapper.html` / `sidepanel-wrapper.js`, which load the mature `sidepanel.html` / `sidepanel.js` UI and then focused feature modules.
- The service worker uses `background-wrapper.js`.

## Main modes

1. Links
2. REDS
3. Prompt
4. LOG / Log Relay

## Canonical shortcuts and interaction behavior

- `Alt + 1`: open Links.
- `Alt + 2`: open REDS.
- `Alt + 3`: open Prompt.
- `Alt + 4`: clear shared search and focus the current mode search field through the existing mature routing.
- `Alt + Q`: select the primary target of the **current mode without switching modes**.
  - Links -> first visible Link.
  - Prompt -> first visible Prompt copy action.
  - REDS -> REDS search field.
  - LOG -> first visible Log Relay row checkbox.
- After a Links / Prompt / LOG primary list target is focused, `ArrowUp` / `ArrowDown` move to the previous / next primary target and stop at the list edge.
- Empty lists are safe no-ops for `Alt+Q`; they must not fall through and switch to Links.
- `Alt+Shift+Q`, Ctrl/Meta variants and IME composition must not be treated as plain `Alt+Q`.
- `Alt + M`: capture one Log Relay memo on a normal web page.
- `Alt + Shift + M`: toggle the Log Relay Side Panel.
- In LOG mode, `Alt + Shift + 1..5` select All / Inbox / Hold / Done / Trash.

Side Panel and Floating POP must interpret the same mode-relative interaction with the same meaning where both surfaces exist. See `INTERACTION_CONTRACT.md`.

Chrome user-gesture-sensitive actions may still require handlers in more than one execution context. Do not consolidate those solely for DRYness.

## Shared search

- Links / REDS / Prompt participate in shared-search state.
- State uses `sharedSearchQuery` and `sharedSearchState` revision metadata.
- Search automatically clears after three minutes from the latest edit.
- An older writer state must not overwrite a newer one.

## REDS / X search

- Default X account: `REDSOFFICIAL`.
- Account is editable.
- `@handle`, `x.com/handle` and `twitter.com/handle` forms normalize to the handle.
- Keyword + account -> live X query using `keyword from:account`.
- Keyword only -> keyword search.
- Account only -> search the account name itself.
- Both blank -> no search URL.
- Start date is inclusive with `since:`.
- End date uses the following calendar day for exclusive `until:`.
- Button / Enter / Alt+X / runtime paths must reach the same effective behavior.

## Links and URL normalization

- Link sort modes are added date / project / click count / last used.
- Last-used sort uses valid `lastClickedAt` descending; never-used or invalid timestamps come after used links and fall back to added date descending.
- Side Panel and Floating POP must interpret the persisted link sort mode with the same meaning.

- `http:` / `https:` links are valid.
- unsafe/unsupported schemes such as `javascript:` are rejected.
- built-in `quicklinks://` dynamic URLs are valid stored links.
- duplicate comparison uses canonical URL rules rather than raw string equality.

### LINE WORKS

- supported bare channel IDs normalize to canonical LINE WORKS message URLs.
- different URL shapes with the same channel ID are treated as the same destination.
- UUID channel IDs normalize case-insensitively.

### Backlog dynamic links

- `quicklinks://backlog/updated?range=last-N-calendar-days` resolves when opened.
- supported N: 1 through 366.
- date boundaries use Asia/Tokyo calendar time.
- N=1 means today; N=2 means yesterday through today.
- existing status / sort query parameters are preserved.

## State mutation and conflict behavior

Main Quick Links mutation preserves concurrent edits rather than replacing the whole store blindly.

- local deletion wins over a stale copy of the same record;
- remote-only records survive unrelated local edits;
- click/copy counters merge by local delta;
- string-array state preserves unrelated remote additions while respecting local removals;
- object state applies local edits/deletions while preserving unrelated remote keys.

Do not replace this with naive view-local `chrome.storage.local.set()` state replacement.

## Backup import and duplicate cleanup

- Import accepts current combined backup and supported legacy Quick Links / Prompt shapes.
- Complete restore remains distinct from merge import and keeps confirmation.
- Quick Link exact-duplicate identity uses canonical URL + normalized title/project/note/archive state.
- Prompt exact-duplicate identity uses normalized title/body/category.
- Compaction preserves existing usage/history semantics.
- Project reconstruction keeps `未分類` and removes duplicate names.

## Log Relay

Persistent states:

- `inbox`
- `hold`
- `done`
- `trash`

Views:

- all
- inbox
- hold
- done
- trash

Behavior:

- Capture stores the user's memo and internal state, not automatic page metadata.
- Entry mutation is owned by the background Log Relay store path.
- Individual delete moves to Trash without prior row selection.
- Trash is reversible for 24 hours.
- Hard delete remains distinct from soft delete.
- Sorting and bulk operations remain available.
- LOG keeps its light-blue translucent visual language.
- When LOG is active, underlying mature mode classes may remain in the DOM; interaction detection must prefer `log-relay-active` so keyboard actions do not jump to hidden Links UI.

## Side-panel lifecycle

- `chrome.sidePanel.open()` must begin in the original eligible user-action turn where Chrome requires it.
- `Alt + Shift + M` must not double-fire through retired content-script paths.
- panel presence remains coordinated between Side Panel and service-worker contexts.

## Visual behavior

The UI should use a restrained hierarchy:

- spacing scale: 4 / 8 / 12 / 16 / 24;
- radius scale: 6 / 10 / 14;
- ordinary cards/controls primarily use border + spacing + typography;
- strong shadows are reserved for floating layers / modals;
- keyboard focus is visible and uses shared focus tokens.

Visual focus, actual DOM focus and native activation target should agree wherever possible.

## Runtime / release behavior

A source-level fix is incomplete if the installable ZIP does not contain or load it.

CI must continue to:

1. parse manifest;
2. syntax-check JavaScript;
3. validate source manifest references;
4. run deterministic tests;
5. build a runtime-only ZIP;
6. verify `manifest.json` at ZIP root;
7. extract the ZIP and validate packaged manifest references;
8. verify `interaction-core.js` -> `interaction-bridge.js` -> `content-floating-search.js` order;
9. reject retired Prompt-only shim and development Markdown leakage.

## Refactor rule

1. preserve this contract;
2. add characterization before moving risky behavior;
3. prefer one responsibility / interaction intent at a time;
4. verify packaged runtime, not only source;
5. if behavior drifts unexpectedly, treat it as a regression rather than a convenient new specification.
