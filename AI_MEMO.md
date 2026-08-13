# AI handoff memo — Quick Project Links / Log Relay

Updated: 2026-08-13
Version: 1.14.0

## Purpose

Quick Project Links is a personal, deterministic browser tool. Do not turn it into an AI assistant. The design goal is to reduce friction in navigation, capture, and resumption while keeping the user's own judgment in control.

Log Relay is a lightweight checkpoint layer inside Quick Links:

- Capture now, organize later.
- Capture stores only the time and a user-written memo.
- Do not automatically store URL, page title, selected text, tab lists, or AI-generated metadata.
- Existing logs are visible and editable only inside the Chrome side panel.
- The capture overlay may show the text being entered, but it must never expose the existing log list on the web page.

## Canonical shortcuts

### Capture / open

- `Alt + M` → add one-line log memo.
- `Alt + Shift + M` → open the Chrome side panel and switch directly to LOG.
- Do not restore `Alt + Space` as a fallback.

`Alt + Shift + M` is detected directly by `log-relay-capture.js` on normal web pages and sent to the background, because Chrome only permits a limited number of manifest-level suggested shortcuts. `quick-links-open-log` remains as an unsuggested command so it can be manually mapped in Chrome if needed.

### LOG view shortcuts

Only while LOG is active:

- `Alt + Shift + 1` → すべて
- `Alt + Shift + 2` → 未処理
- `Alt + Shift + 3` → 保留
- `Alt + Shift + 4` → 完了
- `Alt + Shift + 5` → 削除

Existing `Alt + 1 / 2 / 3` behavior for Links / REDS / Prompt must keep working.

## Side-panel modes

The top mode bar is one row with four equal-width modes:

- LINKS
- REDS
- PROMPT
- LOG

Do not let adding LOG create a second row or increase the mode bar's vertical height. The Log Relay integration CSS intentionally compresses all four mode buttons horizontally.

## Log views and states

Persistent statuses:

- `inbox` → 未処理
- `hold` → 保留
- `done` → 完了
- `trash` → 削除

Display-only view:

- `all` → すべて. Shows inbox + hold + done, but does not mix deleted entries into the normal list.

Default view: 未処理.

The user can:

- change 未処理 / 保留 / 完了 per entry,
- sort newest-first or oldest-first,
- select entries with checkboxes,
- select all visible entries,
- move selected entries to 削除,
- move all entries created before today (JST) in the current view to 削除,
- restore deleted entries to 未処理,
- permanently delete selected deleted entries,
- permanently delete a deleted entry individually.

Counts should remain small and visible on the five view tabs and selection toolbar.

## Trash policy

Deleting is a two-stage operation.

1. Normal delete moves an entry to `status: "trash"` and adds `trashedAt`.
2. A trashed entry is automatically and permanently removed 24 hours after `trashedAt`.

Use `chrome.alarms` in `log-relay-background.js` to schedule the next exact expiry. Also purge expired trash on startup/install and when the side panel loads, so entries do not survive indefinitely if the browser was closed at the expiry moment.

Manual permanent delete is allowed from the 削除 view.

## Storage schema

Each log uses its own `chrome.storage.local` key to reduce overwrite races between tabs.

Key:

```text
logRelayEntry:<id>
```

Value:

```json
{
  "id": "lr-...",
  "memo": "自由入力メモ",
  "status": "inbox | hold | done | trash",
  "createdAt": "ISO-8601 UTC string",
  "updatedAt": "ISO-8601 UTC string",
  "trashedAt": "ISO-8601 UTC string, only while status=trash"
}
```

Additional keys:

```text
logRelaySortDirection   // "asc" | "desc"
logRelayOpenPanelRequest
```

Do not migrate Log Relay into the Quick Links `items` array unless the user explicitly asks.

## Design direction

Log Relay should look like a native part of Quick Links, not a quiet secondary plugin.

Keep the current useful typography hierarchy, but use stronger UI rhythm consistent with the rest of Quick Links:

- normal cards: white with clearer borders/shadow,
- selected cards: blue emphasis,
- 未処理: blue,
- 保留: amber,
- 完了: green,
- 削除: red,
- すべて: slate,
- compact counts and controls,
- avoid excessive vertical expansion.

## Integration architecture

Keep the integration thin:

- `background-wrapper.js`
  - loads existing `background.js`
  - then loads `log-relay-background.js`
- `sidepanel-wrapper.html` / `sidepanel-wrapper.js`
  - load the existing `sidepanel.html`
  - inject `log-relay-panel.js`
  - preserve existing side-panel implementation as source of truth
- `log-relay-capture.js`
  - capture UI
  - direct `Alt + M`
  - direct `Alt + Shift + M` panel request
- `log-relay-panel.js`
  - fourth mode
  - five views
  - sort / selection / bulk actions
  - LOG-only keyboard view shortcuts
- `log-relay-background.js`
  - Chrome command routing
  - LOG side-panel opening
  - 24-hour trash expiry scheduling

Prefer additive Log Relay files over invasive rewrites of the large legacy core files.

## Non-goals

Do not add without explicit request:

- AI summarization or classification
- automatic priority scoring
- project/category assignment on capture
- URL/page-title capture
- tab/session restore
- reminders based on log age
- Log Relay display in floating POP
- cloud backends

## Update workflow for future AI sessions

When updating this repository:

1. Preserve existing Quick Links behavior unless the user explicitly changes it.
2. Prefer small additive files over rewriting large core JS/HTML.
3. Validate `manifest.json`.
4. Run JS syntax checks for every active `.js` file outside `backup/`.
5. Update this memo when architecture, shortcuts, storage, or UX rules change.
6. Keep repository version and delivered ZIP version identical.
7. Always provide the updated extension as a ZIP after implementation.
