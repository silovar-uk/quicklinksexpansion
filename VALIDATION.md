# Quick Project Links v1.15.6 — Validation Baseline

Updated: **2026-08-22**

## Scope

This file records the current validation state for codebase cleanup/refactoring.

The current cleanup phases deliberately treat **v1.15.6 behavior as the contract**. See:

- `CURRENT_BEHAVIOR.md`
- `ARCHITECTURE.md`
- `AI_MEMO.md`

PHASE 1 added characterization coverage without changing production behavior. PHASE 5 extracts deterministic import/deduplication rules from `sidepanel.js` without changing the v1.15.6 user contract.

## Current deterministic tests

The repository contains:

- `tests/log-relay-core.test.js`
- `tests/reds-x-search-characterization.test.js`
- `tests/auto-project-rules-characterization.test.js`
- `tests/background-storage-and-dynamic-url-characterization.test.js`
- `tests/import-data-core-characterization.test.js`

The PHASE 1 baseline run completed with **27 / 27 tests passing**. PHASE 4 increased the suite to 29 tests. PHASE 5 adds six import-core characterization cases, bringing the full suite to **35 / 35 tests passing**.

## Behavior areas now fixed by tests

### Log Relay

- move to Trash sets `trashedAt`;
- restore removes `trashedAt`;
- 24-hour deletion boundary;
- deterministic sorting;
- index normalization;
- `Alt+M` matching;
- `Alt+Shift+M` matching;
- `Alt+Shift+1..5` physical-key-safe mapping.

### REDS / X

- default account remains `REDSOFFICIAL`;
- account input remains editable;
- `@handle` normalization;
- `x.com/handle` / `twitter.com/handle` normalization;
- keyword + account query behavior;
- keyword-only behavior;
- account-only behavior;
- blank keyword + blank account does not build a search;
- start-date `since:` behavior;
- end-date exclusive `until:` behavior;
- `sidepanel.js` owns effective X URL construction through `reds-x-search-core.js`;
- the polish layer does not override mature functions or capture-intercept the X button.

### Link / LINE WORKS normalization

- normal HTTP/HTTPS validation;
- unsafe/unsupported scheme rejection;
- `quicklinks://` built-in URL acceptance;
- bare LINE WORKS channel ID normalization;
- different LINE WORKS URL shapes with the same channel ID compare as the same destination;
- UUID channel normalization.

### Backlog dynamic URLs

- only the supported `quicklinks://backlog/updated?range=last-N-calendar-days` shape resolves;
- supported range remains 1–366 days;
- JST calendar boundaries remain deterministic;
- N=1 means today;
- N=2 means yesterday through today;
- existing Backlog sort/status parameters remain present.

### State merge/conflict behavior

- local deletion wins over a stale local copy;
- unrelated remote records survive local edits;
- counter fields merge by delta;
- string arrays preserve unrelated remote additions while respecting local removals;
- object state preserves unrelated remote keys while applying local edits/deletions.

### Import and exact-duplicate compaction

- current combined backup and legacy import shapes;
- canonical Quick Link duplicate identity, including active/archive separation;
- Prompt duplicate identity with normalized line endings;
- usage dates/counts/history and favorite-state preservation during compaction;
- project reconstruction with `未分類` first;
- `auto-project-rules.js` -> `quick-links-import-core.js` -> `sidepanel.js` load ownership.

## GitHub Actions validation order

`.github/workflows/package-extension.yml` currently performs:

1. parse `manifest.json`;
2. `node --check` all production JavaScript outside excluded directories;
3. `node --test tests/*.test.js`;
4. read manifest version;
5. package the extension ZIP;
6. upload the workflow artifact.

The workflow excludes `.github`, `backup`, `dist`, `tests`, and large unused Gemini source images from the installable artifact.

## Manual Chrome E2E

A real Chrome/unpacked-extension pass is still the final authority for browser-specific behavior that Node characterization tests cannot prove, especially:

- Chrome side-panel user-gesture timing;
- `Alt+Shift+M` open/close behavior across page and panel focus;
- content-script behavior on already-open tabs after extension reload;
- visual rendering and focus order;
- keyboard command assignment in `chrome://extensions/shortcuts`.

The deterministic suite reduces refactor risk but does not replace manual browser verification for these areas.

For PHASE 4, static entry-path inspection confirmed that the X button, account-input Enter, Alt+X and routed `search-x` action all reach `runRedsXSearchSidepanel()`. A real unpacked-extension Chrome run was not available in the validation environment, so browser E2E remains pending.

## Current cleanup rule

During cleanup:

- production behavior must remain consistent with `CURRENT_BEHAVIOR.md`;
- storage keys and message contracts remain stable unless explicitly migrated;
- unexpected behavior changes are regressions;
- LEVEL 0 documentation changes do not require a version bump;
- LEVEL 1+ code changes should be isolated and validated before the next cleanup theme.

## PHASE 5 validation result

1. all production JavaScript passed `node --check`;
2. all **35 / 35** deterministic tests passed;
3. the import-core characterization tests passed **6 / 6**;
4. no manifest, storage, Log Relay or wrapper-architecture changes were made;
5. `manifest.json` remains at v1.15.6.

Before any further extraction, select one named boundary from `RESPONSIBILITY_MAP.md` and add its behavior tests first. Do not split giant files solely to reduce line count.
