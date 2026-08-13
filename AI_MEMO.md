# AI handoff memo — Quick Project Links / Log Relay

Updated: 2026-08-13
Version: 1.13.1

## Purpose

Quick Project Links is a personal, deterministic browser tool. Do not turn it into an AI assistant. The design goal is to reduce friction in navigation, capture, and resumption while keeping the user's own judgment in control.

Log Relay adds a very small checkpoint layer:

- Capture now, organize later.
- Capture stores only the time and a user-written memo.
- Do not automatically store URL, page title, selected text, tab lists, or AI-generated metadata.
- Logs are visible and editable only inside the Chrome side panel.
- The capture overlay may show the text being entered, but it must never expose the existing log list on the web page.

## Agreed Log Relay behavior

### Capture

- Intended shortcut: `Alt + M` (M = Memo).
- `Alt + Space` is intentionally not used because it commonly conflicts with OS/window shortcuts.
- The input is one line only.
- `Enter`: save.
- `Esc`: close without saving.
- New log status: `inbox` = 未処理.
- Visible data: JST time + free memo.
- Internal fields (`id`, `status`, `createdAt`, `updatedAt`) are allowed only for persistence and organization.

### Side panel

Log Relay is the fourth side-panel mode after Links / REDS / Prompt.

Statuses:

- `inbox` → 未処理
- `hold` → 保留
- `done` → 完了

Default view: 未処理.
Within a status, newest first.
Allow status change, memo edit, and explicit delete.
Do not show Log Relay entries in the floating POP or normal web page UI.

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
  "status": "inbox",
  "createdAt": "ISO-8601 UTC string",
  "updatedAt": "ISO-8601 UTC string"
}
```

Do not migrate Log Relay into the Quick Links `items` array unless the user explicitly asks for that.

## Integration architecture

The change intentionally avoids invasive edits to the large existing files.

- `background-wrapper.js`
  - loads existing `background.js`
  - then loads `log-relay-background.js`
- `sidepanel-wrapper.html` / `sidepanel-wrapper.js`
  - loads the existing `sidepanel.html`
  - injects `log-relay-panel.js` before the closing body tag
  - preserves the existing side-panel implementation as the source of truth
- `log-relay-capture.js`
  - runs as a content script after the existing floating search script
  - handles the capture UI and direct `Alt + M` detection
- `log-relay-panel.js`
  - adds the fourth side-panel mode dynamically
  - does not modify `sidepanel.js` state or its Links/REDS/Prompt logic

Keep this “thin integration” approach for future maintenance unless there is a strong reason to refactor the core files.

## Shortcut policy

Log Relay uses `Alt + M` as the canonical shortcut. It is both registered as the Chrome extension command and listened for directly in the content script so the capture UI remains responsive where possible.

Do not silently add `Alt + Space` as a fallback. If `Alt + M` conflicts with a specific environment in the future, change the canonical shortcut explicitly and update the manifest, content-script detection, documentation, and ZIP together.

Because Chrome allows at most four suggested extension command shortcuts, v1.13.1 uses the four suggested slots for:

- Alt+1
- Alt+2
- Alt+3
- Alt+M

`quick-links-clear-search` remains defined but has no manifest-level suggested key. Existing page-side and side-panel `Alt+4` handlers remain in place.

## Non-goals

Do not add these without an explicit request:

- AI summarization or classification
- automatic priority scoring
- project/category assignment on capture
- URL/page-title capture
- tab/session restore
- reminders or notifications based on log age
- cloud sync beyond existing Chrome storage behavior
- Log Relay display in the floating POP

## Update workflow for future AI sessions

When updating this repository for the user:

1. Preserve existing Quick Links behavior unless the request explicitly changes it.
2. Prefer small additive files over rewriting the large core JS/HTML files.
3. Validate `manifest.json` and run JS syntax checks for every changed/new JS file.
4. Update this memo when architecture, shortcut behavior, or storage schema changes.
5. After implementation, provide the user with a ZIP containing the updated extension files.
6. Keep the repository and the delivered ZIP at the same version.
