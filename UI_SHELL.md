# Quick Project Links — Side Panel Shell

Baseline: **v1.15.9**  
Updated: **2026-08-24**

## Purpose

The Side Panel shell owns only the persistent application chrome shared across Links / REDS / Prompt / LOG:

- quiet header utility controls;
- shared search presentation;
- four-mode navigation;
- compact Links list toolbar placement;
- width-aware shell density.

It does **not** own Link CRUD, Prompt logic, REDS query rules, Log Relay data mutation, storage merges or command routing.

## Runtime files

- `qpl-design-tokens.css` — semantic visual constants only. It should not contain component layout.
- `sidepanel-shell.css` — shell layout and visual states.
- `sidepanel-shell.js` — small DOM normalization needed by the mature `sidepanel.html`, including promotion of the existing page-add button into the Links toolbar and mode-label normalization.
- `sidepanel-wrapper.js` — composition point that loads tokens, shell, then focused feature modules.

The v1.15.8 `sidepanel-toolbar-polish.css/js` layer was removed when its behavior was promoted into the shell.

## Design principles

1. **Content first** — brand chrome must not consume the most valuable vertical space.
2. **Search is infrastructure** — shared search is more important than a persistent product title.
3. **Modes are navigation, not cards** — Links / REDS / Prompt / LOG use a flat tab strip.
4. **Quiet actions** — utility buttons are neutral until hovered or focused.
5. **Mode color is a signal** — use a thin active indicator rather than large colored surfaces.
6. **Width decides density** — reduce shortcut hints before reducing readable labels.
7. **No layout shift on hover/active**.

## Polish Layer Budget

A new `*-polish` file is not the default way to change global UI.

- one-release experiment: a polish layer may be acceptable;
- stable behavior that remains for multiple releases: promote it into an owning shell/component/core module;
- behavior reused by multiple surfaces: prefer shared tokens/components;
- three or more override layers touching the same DOM: treat as a refactor signal.

Do not split large files merely to reduce line count. Extraction still requires a named responsibility and characterization coverage.

## Regression contract

The shell must preserve:

- `Alt+N` and the existing `#btn-add-current` click handler;
- Links / REDS / Prompt / LOG mode IDs and click behavior;
- shared search input ID and synchronization behavior;
- Help / import / duplicate-cleanup / export button IDs;
- Log Relay's light-blue mode atmosphere;
- keyboard focus visibility.

`tests/ui-shell-contract.test.js` fixes the static ownership and composition rules. Real Chrome verification remains the authority for visual rendering and focus order.
