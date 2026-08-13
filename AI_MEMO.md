# AI handoff memo — Quick Project Links / Log Relay

Updated: 2026-08-13
Version: 1.15.1

## Product rule

Quick Project Links is a personal, deterministic browser tool. Do not turn it into an AI assistant unless the user explicitly changes that policy.

Log Relay follows one rule: **capture now, organize later**.

- Capture stores only user-written memo + time/internal state.
- Do not automatically capture URL, page title, selected text, tab lists, or AI-generated metadata.
- Existing logs are shown only inside the side panel.
- Preserve Links / REDS / Prompt behavior unless a request explicitly changes it.

## Canonical shortcuts

- `Alt + M`: add one-line Log Relay memo on a normal web page.
- `Alt + Shift + M`: open the side panel directly in LOG mode.
- In LOG mode:
  - `Alt + Shift + 1`: すべて
  - `Alt + Shift + 2`: 未処理
  - `Alt + Shift + 3`: 保留
  - `Alt + Shift + 4`: 完了
  - `Alt + Shift + 5`: 削除

`shortcut-registry.js` is the canonical JavaScript registry for Log shortcuts and documents the existing legacy Quick Links shortcuts.

**Safety exception:** `log-relay-capture.js` must also keep a minimal direct M-key matcher for `Alt+M` and `Alt+Shift+M`. v1.15.0 made capture activation depend entirely on `globalThis.QuickLinksShortcuts`; if that shared registry was unavailable in a content-script context, `Alt+M` became silent. Keep the fallback behavior exactly aligned with the registry. Do not add unrelated bindings there.

Chrome allows only four manifest-level suggested command shortcuts. The suggested slots remain Alt+1 / Alt+2 / Alt+3 / Alt+Shift+M. Alt+M is detected directly by the content script; `quick-links-add-log` remains available as a command without a suggested key.

After an extension update, already-open web tabs still contain the previously injected content scripts. A page reload is required before the newly installed content script can handle `Alt+M` on those tabs.

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

Trash is recoverable for 24 hours. `trashedAt + 24h` is the deletion boundary. Chrome alarms schedule the nearest expiry; startup and initialization also purge expired trash.

## Storage architecture

### Source of truth

Each Log Relay entry remains one `chrome.storage.local` record:

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

`logRelayIndex` contains entry IDs. It is a rebuildable index/cache, not the source of truth. Rebuild it from existing entry keys when missing or inconsistent.

### UI preferences

`logRelaySortDirection` remains in `chrome.storage.local`.

### Transient open request

`logRelayOpenPanelRequest` uses `chrome.storage.session` when available. It is transient UI coordination, not user data. A local-storage fallback exists only for compatibility.

## Mutation ownership

**Only `log-relay-background.js` should mutate Log Relay entries.**

Capture and panel code send `logRelayStore` runtime messages. Supported actions:

- `list`
- `add`
- `updateMemo`
- `moveMany`
- `deleteMany`
- `setSort`
- `rebuildIndex`

Bulk changes use one `chrome.storage.local.set()` for entry updates rather than one write per entry. A small in-service-worker mutation queue serializes concurrent Log mutations while the worker is alive.

Do not reintroduce direct `chrome.storage.local.set/remove` calls for Log entries from capture or panel code.

## Shared deterministic helpers

- `log-relay-core.js`: normalization, state transitions, 24h expiry, sort, JST day boundary, keys/constants. CommonJS-compatible for tests.
- `shortcut-registry.js`: canonical Log keyboard matching and view mapping. CommonJS-compatible for tests.
- `qpl-design-tokens.css`: shared surface/border/type/spacing/radius/shadow tokens plus the four-mode one-row tab layout.

## Side-panel integration

`sidepanel.html` remains the mature core UI source of truth. `sidepanel-wrapper.js` loads the core page as-is, then attaches:

1. `qpl-design-tokens.css`
2. `shortcut-registry.js`
3. `log-relay-core.js`
4. `log-relay-panel.js`

`background-wrapper.js` remains a simple `importScripts` composition point and loads shared helpers before the mature background and Log Relay service code.

## UI principles

- Four top modes must fit on one row: Links / REDS / Prompt / LOG.
- Shared mode buttons use `qpl-design-tokens.css`; Log Relay must not restyle the three other tabs from its private runtime CSS.
- Preserve the current useful type hierarchy; do not solve density by endlessly shrinking text.
- Bulk action controls appear only when something is selected.
- Status tabs are sticky inside the LOG scroll area.

## Tests and packaging

GitHub Actions must run, in this order:

1. manifest JSON parse
2. `node --check` for JavaScript
3. `node --test tests/*.test.js`
4. package ZIP

Tests include Log state transitions, trash 24h boundary, sort direction, index normalization, `Alt+M`, `Alt+Shift+M`, and Alt+Shift+1..5 view mapping.

The installable ZIP excludes `.github`, backup, tests, dist, and large unused Gemini source images.

## Update workflow for future AI sessions

1. Preserve behavior unless explicitly asked to change it.
2. Keep Log entry mutations in background.
3. Keep `Alt+M` robust even if the shared shortcut registry is unavailable.
4. Prefer shared core helpers over duplicated business logic.
5. Update tests when state/shortcut behavior changes.
6. Update this memo when architecture, shortcut, storage schema, or packaging changes.
7. Run validation before packaging.
8. Update GitHub and provide the user a ZIP at the exact same version.
