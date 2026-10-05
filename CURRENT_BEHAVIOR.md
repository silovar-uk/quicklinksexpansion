# Quick Project Links — Current Behavior

Baseline: **v1.17.1**  
Updated: **2026-10-05**

This is the behavior contract cleanup/refactor work must preserve unless a change is explicitly requested.

## Surfaces

- Floating POP: quick page-adjacent launcher.
- Side Panel: workbench for sustained search/edit/manage.
- Log Relay capture: one-line capture surface.
- Service Worker: mutation/effect authority.

## Floating POP dismissal

- Plain `Esc` behaves as **one step back** while the Floating POP owns keyboard scope.
- If an add/edit Prompt or Link overlay is open, `Esc` closes only that top overlay.
- If the Links project-filter menu is open, `Esc` closes that menu before collapsing the POP.
- Otherwise `Esc` collapses the expanded POP to the small launcher; it does not fully hide the launcher.
- After collapsing, keyboard focus moves to the launcher so the interaction has a visible continuation point.
- `Alt+W` remains a compatible collapse shortcut; `Alt+5` remains the explicit full-hide action.

## Shared search

Links / Prompt / X Search share one query state with revision metadata.

Editing in one surface propagates to the other without clobbering newer active input.

Shared search automatically expires through the background search-clear lifecycle.

## Links

- Search title / URL / notes.
- Project filtering, sorting, favorites and archive.
- Add/edit/delete/duplicate protection.
- Background-open keeps list context.
- Automatic project rules are deterministic.
- New installs start with neutral categories and no historical club-specific link seed.

## X Search

- Plain query works with no account/site default.
- Advanced fields: exact phrase, OR words, exclusions, hashtags, from/to/mentions, language, date range.
- Account URLs/handles normalize deterministically.
- Start date is inclusive.
- End date is converted to next-day exclusive `until:`.
- Query Mirror previews intent and final query.
- Enter / X button / Alt+X reach the same search behavior.

## Prompt

- Search/category/sort/copy/edit/delete.
- Copy count mutation is atomic through background state.

## Log Relay

- One-line capture through Alt+M.
- Side Panel toggle through Alt+Shift+M.
- Inbox / Hold / Done / Trash.
- Trash recovery window remains 24 hours.

## Panel presence

On Chrome with Side Panel open/close events, presence is event-driven and transient in `storage.session`.

Older Chrome falls back to the legacy heartbeat protocol.

Floating POP hides while the Side Panel is open in the same window.

## Context handoff

Opening Side Panel from Floating POP restores the current mode/query and relevant filter state.

Handoff data is one-shot, short-lived and transient.

## Compatibility

Mature DOM may still contain `reds` IDs/classes. Chrome command ID `quick-links-open-reds` remains to preserve shortcut assignments. Neither implies club-specific product behavior.

## Persistence

Persistent user records/settings live in `storage.local`.

Temporary presence/handoff state lives in `storage.session` where supported.

Conflict-aware Quick Links state commits remain centralized in the background mutation path.
