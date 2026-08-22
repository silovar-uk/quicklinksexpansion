# AI handoff memo — Quick Project Links / Log Relay

Updated: **2026-08-22**  
Version: **1.15.6**

## Product rule

Quick Project Links is a personal, deterministic browser tool. Do not turn it into an AI assistant unless the user explicitly changes that policy.

Log Relay follows one rule: **capture now, organize later**.

- Capture stores only user-written memo + time/internal state.
- Do not automatically capture URL, page title, selected text, tab lists, or AI-generated metadata.
- Existing logs are shown only inside the side panel.
- Preserve Links / REDS / Prompt behavior unless a request explicitly changes it.

Before cleanup/refactoring, read:

1. `CURRENT_BEHAVIOR.md` — user-visible behavior contract.
2. `ARCHITECTURE.md` — runtime graph, messages, storage and cleanup risk map.
3. `RESPONSIBILITY_MAP.md` — giant-file ownership and explicit non-targets.
4. this file — implementation guardrails and handoff notes.

## Canonical shortcuts

- `Alt + 1`: open Links.
- `Alt + 2`: open REDS.
- `Alt + 3`: open Prompt.
- `Alt + M`: add one-line Log Relay memo on a normal web page.
- `Alt + Shift + M`: toggle the Log Relay side panel.
- In LOG mode:
  - `Alt + Shift + 1`: すべて
  - `Alt + Shift + 2`: 未処理
  - `Alt + Shift + 3`: 保留
  - `Alt + Shift + 4`: 完了
  - `Alt + Shift + 5`: 削除

`shortcut-registry.js` is the canonical shared JavaScript registry for Log shortcuts and documents existing legacy Quick Links shortcut concepts.

### Shifted-number guardrail

`Alt+Shift+1..5` must be matched primarily from `KeyboardEvent.code` (`Digit1..5` / `Numpad1..5`), not only `KeyboardEvent.key`. Shift changes `key` to symbols on common layouts.

### M-key safety exception

`log-relay-capture.js` keeps a minimal direct M-key matcher so `Alt+M` remains available even if the shared shortcut registry is unavailable in a content-script context. Keep fallback behavior aligned with the registry.

### Side-panel user-gesture guardrail

`chrome.sidePanel.open()` must be initiated in the same eligible user-action turn as the keyboard shortcut. Do not `await` storage, `tabs.query()` or unrelated work before starting the open call when handling the direct command path.

`log-relay-toggle-background.js` currently owns the `quick-links-toggle-log` command path. It starts the transient open-request write and `chrome.sidePanel.open()` without awaiting between them.

`log-relay-content-command-guard.js` prevents the older page-side key path from double-firing `Alt+Shift+M`.

`log-relay-toggle-panel.js` handles the in-panel close case and reports LOG-panel presence back to the service worker.

Do not consolidate these layers solely for DRYness.

After an extension update, already-open web tabs still contain previously injected content scripts. Refresh affected pages after reloading the extension.

## REDS / X search — v1.15.6 contract

The current implementation is split into:

- `reds-x-search-core.js` — deterministic pure rules: default `REDSOFFICIAL`, account normalization, date increment, query generation and final X URL generation;
- `sidepanel.js` — effective button, Alt+X and routed runtime entry point; delegates X URL construction to the core;
- `reds-x-search-polish.js` — UI-only layer: account input injection, button state, account-input Enter handling, labels and DOM-lifecycle waiting.

Current behavior:

- default account: `REDSOFFICIAL`;
- account input is editable;
- `@handle`, `x.com/handle`, `twitter.com/handle` are normalized;
- keyword + account -> `keyword from:account`;
- keyword only -> keyword search;
- account only -> search the account name itself;
- both blank -> do not search;
- start date -> inclusive `since:`;
- end date -> next calendar date as exclusive `until:`;
- button / Enter / routed `Alt+X` paths must reach the same effective search behavior.

PHASE 4 removed the polish-layer overrides of `buildRedsXUrlSidepanel` / `runRedsXSearchSidepanel` and the capture-phase X-button interception. Do not reintroduce those bridges. Keep `reds-x-search-core.js` as the deterministic source for query rules and `sidepanel.js` as the effective runtime entry point.

The account field may intentionally be blank for keyword-only search. Default to `REDSOFFICIAL` only when the account UI is not present; do not coerce an explicitly blank field back to the default.

## Log states and views

Persistent states:

- `inbox` = 未処理
- `hold` = 保留
- `done` = 完了
- `trash` = 削除

Views:

- `all` = inbox + hold + done only
- `inbox`
- `hold`
- `done`
- `trash`

Trash is recoverable for 24 hours. `trashedAt + 24h` is the deletion boundary.

## Log storage architecture

### Source of truth

Each Log Relay entry is one `chrome.storage.local` record:

`logRelayEntry:<id>`

```json
{
  "id": "lr-...",
  "memo": "自由入力メモ",
  "status": "inbox",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "trashedAt": "ISO-8601 only while status=trash"
}
```

### Index

`logRelayIndex` contains entry IDs. It is rebuildable and is not the entry source of truth.

### UI preference

`logRelaySortDirection` remains in local storage.

### Transient open request

`logRelayOpenPanelRequest` uses `chrome.storage.session` when available with local-storage fallback for compatibility.

## Mutation ownership

**Only `log-relay-background.js` should mutate Log Relay entry records.**

Capture and panel code send `logRelayStore` runtime messages. Supported actions:

- `list`
- `add`
- `updateMemo`
- `moveMany`
- `deleteMany`
- `setSort`
- `rebuildIndex`

Do not reintroduce direct Log entry `chrome.storage.local.set/remove` calls from capture or panel code.

Main Quick Links state uses the conflict-aware `quickLinksCommitState` background path. Do not replace it with naive view-level store replacement.

## Shared deterministic helpers

- `auto-project-rules.js`: link/prompt normalization, URL canonicalization, LINE WORKS logic, automatic project classification.
- `reds-x-search-core.js`: X account normalization, X query construction and date behavior.
- `log-relay-core.js`: Log normalization, state transitions, 24h expiry, sort, JST day boundary, keys/constants.
- `shortcut-registry.js`: shortcut matching and Log view mapping.
- `qpl-design-tokens.css`: shared visual tokens and top-mode layout.

## Current side-panel integration

`sidepanel.html` / `sidepanel.js` remain the mature core UI source of truth.

The base `sidepanel.html` script order is:

1. `auto-project-rules.js`
2. `quick-links-import-core.js`
3. `sidepanel.js`

`quick-links-import-core.js` owns only deterministic import shapes, exact-duplicate keys, merge/compaction policy and project reconstruction. Import confirmations, state commits and rendering remain in `sidepanel.js`. Keep this dependency order.

`sidepanel-wrapper.js` loads the base page, waits for its initialization boundary, then attaches:

1. `qpl-design-tokens.css`
2. `reds-x-search-core.js`
3. `reds-x-search-polish.js`
4. `shortcut-registry.js`
5. `log-relay-core.js`
6. `log-relay-panel.js`
7. `log-relay-polish.js`
8. `log-relay-toggle-panel.js`

Do not change the wrapper/load architecture during ordinary cleanup. The X-search layer requires `reds-x-search-core.js` before `reds-x-search-polish.js`, and feature initialization still occurs after the mature DOM lifecycle.

`background-wrapper.js` composes:

1. `shortcut-registry.js`
2. `log-relay-core.js`
3. `background.js`
4. `search-auto-clear-background.js`
5. `log-relay-background.js`
6. `log-relay-toggle-background.js`

## Removed legacy code

`log-relay-command-open-fix.js` was removed in PHASE 3 after confirming that it was not loaded by current manifest/wrapper entry points and only listened for the obsolete `quick-links-open-log` command.

Do not delete other guard/fix/polish files by name alone; prove their runtime graph first.

## UI principles

- Four top modes remain Links / REDS / Prompt / LOG.
- Log Relay keeps its distinct light-blue translucent visual language.
- Quick Links header text must remain readable in LOG mode.
- Bulk action controls appear only when needed.
- Status tabs remain sticky inside LOG.
- Preserve useful type hierarchy; do not solve density by endlessly shrinking text.

## Tests

Characterization baseline now includes:

- `tests/log-relay-core.test.js`
- `tests/reds-x-search-characterization.test.js`
- `tests/auto-project-rules-characterization.test.js`
- `tests/background-storage-and-dynamic-url-characterization.test.js`
- `tests/import-data-core-characterization.test.js`

The REDS/X tests import `reds-x-search-core.js` directly, so the deterministic production query rules are tested without DOM instrumentation.

Covered behavior includes:

- Log transitions / 24h expiry / shortcuts;
- REDS X default account / normalization / query generation / dates;
- LINE WORKS channel canonicalization;
- link input normalization;
- Backlog dynamic URL resolution in JST calendar boundaries;
- state merge/conflict behavior.
- import-shape compatibility and exact-duplicate merge/compaction behavior.

GitHub Actions must continue to run:

1. manifest JSON parse;
2. `node --check` for JavaScript;
3. `node --test tests/*.test.js`;
4. ZIP packaging.

## Cleanup sequence

- PHASE 1 — characterization tests and `CURRENT_BEHAVIOR.md`: completed.
- PHASE 2 — documentation and architecture cleanup: completed.
- PHASE 3 — confirmed dead code and low-risk pure-helper cleanup: completed.
- PHASE 4 — mature side-panel X-search ownership and compatibility-override removal: completed.
- PHASE 5 — giant-file responsibility map and import/deduplication core extraction: completed.

## Update workflow for future AI sessions

1. Preserve behavior unless explicitly asked to change it.
2. Read `CURRENT_BEHAVIOR.md` and `ARCHITECTURE.md` before refactoring.
3. Keep Log mutations in background.
4. Keep `Alt+M` robust across content-script registry failures.
5. Keep `Alt+Shift+1..5` physical-key-safe.
6. Preserve the original user-gesture timing for `sidePanel.open()`.
7. Prefer characterization tests before moving risky behavior.
8. Use small responsibility-level commits.
9. Run validation before packaging.
10. For manual distribution, provide the requested rootless ZIP with `manifest.json` directly at ZIP root.
