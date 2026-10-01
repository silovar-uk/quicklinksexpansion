# Quick Project Links v1.17.0

Quick Project Links is a personal Chrome extension for finding saved links, reusable prompts, X posts and short Log Relay notes with minimal friction.

The product is intentionally deterministic. It is not an AI assistant.

## Product model

Quick Links has three user-facing work patterns:

- **Search** — Links / X Search / Prompt share one search phrase across surfaces.
- **Capture** — add a Link, Prompt or one-line Log entry without leaving the current context.
- **Manage** — use the Side Panel for editing, classification, archive and deeper controls.

The two UI surfaces have different jobs:

- **Floating POP = Launcher** — fast find/open/copy near the current page.
- **Side Panel = Workbench** — sustained search, editing and management.
- **Service Worker = State Authority** — serialized mutations, tab actions, presence and handoff coordination.

Opening the Side Panel from the Floating POP preserves the current search context.

## Modes

### Links
- Search and open saved links.
- Project/category filtering and sorting.
- Favorites, archive and editing.
- Automatic project rules and duplicate handling.

### X Search
- Plain keyword search by default.
- Optional exact phrase, OR, exclusions, hashtags, accounts, language and date filters.
- Query Mirror previews both intent and generated X query.
- No club-specific keyword, account or site defaults.

### Prompt
- Save, search, categorize, sort and copy reusable prompts.
- Copy counts use the background mutation path.

### Log Relay
- `Alt + M` captures a one-line memo.
- `Alt + Shift + M` toggles Log Relay.
- Inbox / Hold / Done / Trash states with recoverable Trash.

## Shortcuts

- `Alt + 1` — Links
- `Alt + 2` — X Search
- `Alt + 3` — Prompt
- `Alt + 4` — clear/focus current search
- `Alt + Q` — select the primary control for the current mode
- `Alt + M` — capture Log Relay memo
- `Alt + Shift + M` — toggle Log Relay

The Chrome command ID for Alt+2 remains `quick-links-open-reds` only to preserve existing user shortcut assignments. Product code canonicalizes it to X Search through `app-contract.js`.

## Architecture

Composition entry points:

- `background-wrapper.js`
- `manifest.json` content scripts
- `sidepanel-wrapper.html` / `sidepanel-wrapper.js`

Shared contracts:

- `app-contract.js` — canonical modes, messages, storage/session keys, command aliases.
- `interaction-core.js` / `interaction-bridge.js` — mode-relative keyboard meaning.
- `qpl-design-tokens.css` — shared visual vocabulary.
- `side-panel-presence-background.js` — event-driven panel presence with legacy heartbeat fallback.
- `ui-context-background.js` / `ui-context-sidepanel.js` — Floating -> Side Panel context handoff.

See `ARCHITECTURE.md`, `RESPONSIBILITY_MAP.md`, `CURRENT_BEHAVIOR.md` and `INTERACTION_CONTRACT.md` before refactoring mature behavior.

## Guardrails

- Do not bypass conflict-aware state commits with blind view-level storage replacement.
- Keep persistent user data in `storage.local`; transient UI coordination belongs in `storage.session`.
- Do not rename Chrome command IDs just to improve internal vocabulary.
- Side Panel open/close state uses native Side Panel events on current Chrome; heartbeat exists only as compatibility fallback.
- Do not make Floating POP and Side Panel identical. Shared meaning belongs in cores/contracts; presentation remains surface-specific.
- Every behavior change must pass source tests and packaged-runtime validation.

## Tests

```bash
node --test tests/*.test.js
```

GitHub Actions also syntax-checks production JavaScript, validates manifest references, builds the runtime-only ZIP and verifies the packaged runtime.

## Current baseline

Version: **1.17.0**  
Behavior baseline date: **2026-10-01**
