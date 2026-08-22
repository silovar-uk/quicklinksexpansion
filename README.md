# Quick Project Links v1.15.6

Quick Project Links is a personal Chrome extension for getting back to frequently used work links, REDS searches, prompts and short Log Relay notes with as little friction as possible.

The product is intentionally deterministic. It is not an AI assistant.

## Current modes

### Links

- Search and open saved links quickly.
- Project/category filtering and sorting.
- Favorites, archive and editing.
- Automatic project classification rules.
- Duplicate handling, including LINE WORKS channel IDs.
- Built-in dynamic Backlog links that resolve date ranges when opened.

### REDS

- Shared REDS search UI for web/X workflows.
- X account defaults to `REDSOFFICIAL` but is editable.
- Keyword + account searches with `from:account`.
- Account-only search works when the keyword is blank.
- `@handle`, `x.com/handle` and `twitter.com/handle` inputs are normalized.
- Start/end date conditions are supported.

### Prompt

- Save, search, categorize, sort and copy reusable prompts.
- Prompt copy counts are updated atomically through the background state path.

### LOG / Log Relay

Principle: **capture now, organize later**.

- `Alt + M` opens one-line capture on a normal web page.
- `Alt + Shift + M` toggles the Log Relay side panel.
- Entries move between 未処理 / 保留 / 完了 / 削除.
- Trash is recoverable for 24 hours.
- Individual soft-delete does not require selecting the row first.
- The capture popup and side panel use a distinct light-blue translucent visual language.

## Main shortcuts

- `Alt + 1` — Links
- `Alt + 2` — REDS
- `Alt + 3` — Prompt
- `Alt + M` — add a Log Relay memo
- `Alt + Shift + M` — toggle Log Relay side panel
- In LOG mode, `Alt + Shift + 1..5` — All / Inbox / Hold / Done / Trash

The mature Quick Links UI contains additional search/filter/focus shortcuts. Their current behavior is treated as part of the compatibility contract.

## Architecture

The extension has three execution areas:

1. service worker
2. page-side content scripts / floating UI
3. Chrome side panel

Composition entry points:

- `background-wrapper.js`
- `sidepanel-wrapper.html` / `sidepanel-wrapper.js`
- `manifest.json` content scripts

For the full runtime graph, message catalog, storage catalog and cleanup risk map, see [ARCHITECTURE.md](ARCHITECTURE.md).

For the exact behavior that cleanup work must preserve, see [CURRENT_BEHAVIOR.md](CURRENT_BEHAVIOR.md).

For AI/developer handoff guardrails, see [AI_MEMO.md](AI_MEMO.md).

## Important implementation guardrails

- Do not replace conflict-aware state commits with naive view-level `chrome.storage.local.set()` writes.
- Log Relay entry mutation belongs to `log-relay-background.js`.
- `chrome.sidePanel.open()` timing is user-gesture-sensitive; do not add unrelated awaits before it in shortcut paths.
- Multiple shortcut handlers can be intentional because service worker, content script and side panel are separate execution contexts.
- Do not change storage keys during cleanup without a migration plan.
- Do not treat a cleanup-induced behavior change as a new specification.

## Tests

Run deterministic tests:

```bash
node --test tests/*.test.js
```

Current test areas include:

- Log Relay state transitions and 24h trash boundary
- Log Relay shortcut matching
- REDS/X account normalization and query generation
- LINE WORKS URL/channel canonicalization
- Backlog dynamic URL resolution using JST calendar boundaries
- storage conflict/merge behavior

GitHub Actions also parses `manifest.json` and runs `node --check` on JavaScript before packaging.

## Packaging

The GitHub Actions workflow validates the extension and creates an installable ZIP on pushes to `main`.

For manually distributed builds used in this project, the preferred archive format is **rootless**: `manifest.json` is placed directly at the ZIP root rather than inside an extra enclosing folder.

## Development workflow

For cleanup/refactoring work:

1. read `CURRENT_BEHAVIOR.md`;
2. confirm or add characterization tests;
3. change one responsibility at a time;
4. run deterministic tests after each change;
5. avoid large “refactor everything” commits.

Current cleanup sequence:

- PHASE 1: behavior characterization — completed
- PHASE 2: documentation / architecture cleanup — completed
- PHASE 3: confirmed dead code and low-risk pure-helper cleanup — completed
- PHASE 4: mature side-panel X-search ownership and compatibility-override removal — completed
- PHASE 5: reconsider large-file boundaries only after the earlier phases are stable — next candidate

## Current baseline

Version: **1.15.6**  
Behavior baseline date: **2026-08-22**

Historical implementation details remain available in Git history. README now describes the current product rather than acting as a chronological release log.
