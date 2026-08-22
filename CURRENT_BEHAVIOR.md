# Quick Project Links — Current Behavior Contract

Baseline: **v1.15.6**  
Purpose: preserve current user-visible behavior while the codebase is reorganized.

This document is a characterization contract, not a redesign proposal. If a refactor changes one of the behaviors below without an explicit product decision, treat that as a regression.

## Entry points

- Chrome action opens Quick Links through the side panel entry point defined by `manifest.json`.
- The page-side floating UI is supplied by `content-floating-search.js`.
- The side panel uses `sidepanel-wrapper.html` / `sidepanel-wrapper.js`, which load the mature `sidepanel.html` / `sidepanel.js` UI and then attach focused feature modules.
- The service worker uses `background-wrapper.js` as its composition point.

## Main modes

The product has four visible modes:

1. Links
2. REDS
3. Prompt
4. LOG / Log Relay

Links / REDS / Prompt behavior must remain available when Log Relay is added or reorganized.

## Canonical shortcuts

- `Alt + 1`: open Links.
- `Alt + 2`: open REDS.
- `Alt + 3`: open Prompt.
- `Alt + M`: capture one Log Relay memo on a normal web page.
- `Alt + Shift + M`: toggle the Log Relay side panel. Closed -> open in LOG; open -> close.
- In LOG mode, `Alt + Shift + 1..5` select All / Inbox / Hold / Done / Trash.
- Existing search/focus/filter shortcuts implemented by the mature Quick Links code remain part of the behavior contract.

Shortcut handling can exist in more than one execution context when required by Chrome's side-panel user-gesture rules. Do not consolidate handlers merely to reduce duplication.

## Shared search

- Links / REDS / Prompt participate in the existing shared-search state.
- Shared search state uses `sharedSearchQuery` and `sharedSearchState`.
- The search lifecycle currently includes automatic clearing after three minutes from the latest edit.
- Search synchronization must not allow an older writer state to overwrite a newer one.

## REDS / X search

Current X-search behavior:

- Default X account: `REDSOFFICIAL`.
- The account field is editable.
- `@handle` input is normalized to `handle`.
- `https://x.com/handle` and `https://twitter.com/handle` inputs are normalized to the handle.
- Keyword + account -> X live search using `keyword from:account`.
- Keyword only -> keyword search.
- Account only -> search the account name itself, not `from:account` only.
- Both keyword and account blank -> do not create a search URL.
- Start date is inclusive using `since:YYYY-MM-DD`.
- End date is represented by X's exclusive `until:` using the following calendar day.
- Search button, Enter handling, Alt+X/runtime paths must continue to reach the same effective search behavior.

## Links and URL normalization

- `http:` and `https:` URLs are valid normal links.
- Unsupported/unsafe schemes such as `javascript:` are rejected.
- Built-in `quicklinks://` dynamic URLs are valid stored links.
- Duplicate comparison uses the existing canonical URL rules rather than raw string equality.

### LINE WORKS

- A bare supported LINE WORKS channel ID is converted to the canonical `line.worksmobile.com/message/send` form.
- Different LINE WORKS URL shapes referring to the same `channelId` are treated as the same destination.
- UUID channel IDs are normalized case-insensitively.

### Backlog dynamic links

- `quicklinks://backlog/updated?range=last-N-calendar-days` resolves only when clicked/opened.
- Supported range: 1 through 366 calendar days.
- Date boundaries are calculated in Asia/Tokyo calendar time.
- N=1 means today; N=2 means yesterday through today.
- Resolved Backlog search keeps the existing status and sort query parameters.

## State mutation and conflict behavior

The mature Quick Links state commit path preserves concurrent edits rather than replacing the entire store blindly.

- Local deletion wins over a stale copy of the same record.
- Remote-only records survive a local edit to another record.
- Counter fields such as click/copy counts merge by local delta.
- String-array state preserves unrelated remote additions while respecting explicit local removals.
- Object state applies local edits/deletions while preserving unrelated remote keys.

Do not replace this behavior with naive `chrome.storage.local.set()` calls from individual views.

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

Behavior contract:

- Capture stores the user's memo and Log Relay internal state; it does not automatically capture page URL/title/selection/tab metadata.
- Entry mutations are owned by the background Log Relay store path.
- Individual delete moves an entry to Trash without requiring row selection first.
- Trash is reversible for 24 hours.
- Hard delete remains distinct from soft delete.
- Sorting and bulk operations remain available.
- Log Relay keeps its light-blue translucent visual language in both capture and panel UI.
- When Log Relay is active, the Quick Links header text remains readable against the light-blue background.

Storage keys:

- `logRelayEntry:<id>` — entry source of truth.
- `logRelayIndex` — rebuildable index.
- `logRelaySortDirection` — UI sort preference.
- `logRelayOpenPanelRequest` — transient panel-open coordination, session storage preferred where available.

## Side-panel lifecycle

- `chrome.sidePanel.open()` must be started inside the original eligible user-action turn where Chrome requires it.
- `Alt + Shift + M` uses the current toggle architecture and must not double-fire through old content-script paths.
- Panel presence is coordinated between side-panel and service-worker contexts.
- Do not remove guards/listeners solely because another layer appears to handle the same key; first prove the execution-context responsibility is redundant.

## Test baseline

The repository's deterministic test suite should cover at least:

- Log Relay state transitions and 24h trash boundary.
- Log Relay shortcut matching.
- X account default and normalization.
- X keyword/account/date query generation.
- LINE WORKS canonicalization.
- Dynamic Backlog URL resolution and JST date boundaries.
- Storage merge conflict behavior.

GitHub Actions should continue to run manifest parsing, JavaScript syntax checks, deterministic tests, then packaging.

## Refactor rule

For cleanup work:

1. preserve this contract;
2. add or update characterization tests before moving risky behavior;
3. prefer small commits by responsibility;
4. if behavior changes unexpectedly, revert the cleanup rather than accepting the change as a new specification.
