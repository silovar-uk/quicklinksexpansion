# Quick Project Links — Validation

Baseline: **v1.17.0**  
Updated: **2026-10-01**

## Deterministic suite

Run:

```bash
node --test tests/*.test.js
```

Coverage includes:

- app-contract canonical modes/messages/command aliases;
- X-search query semantics;
- interaction intent and surface routing;
- link browsing-context preservation;
- import/deduplication;
- storage merge/conflict behavior;
- dynamic Backlog URL behavior;
- Log Relay state and shortcuts;
- runtime load-order contracts;
- side-panel presence and UI-handoff source contracts.

## GitHub Actions order

`.github/workflows/package-extension.yml`:

1. parse manifest;
2. syntax-check JavaScript;
3. validate manifest references;
4. run deterministic tests;
5. build installable runtime-only ZIP;
6. validate ZIP root and packaged manifest references;
7. validate required runtime load order;
8. reject retired/development runtime leakage;
9. upload artifact;
10. publish validated ZIP under `release/`.

## Browser-specific checks

Node tests cannot prove browser UI timing.

Manual / future browser E2E should cover:

- Alt+1/2/3 routing;
- Alt+Q focus behavior;
- Floating -> Side Panel context handoff;
- Side Panel open/close presence suppression of Floating;
- Alt+Shift+M user-gesture-sensitive toggle;
- extension reload and already-open tabs;
- focus-visible and narrow-width layout.

## Cleanup rule

Behavior drift is a regression unless requested.

Before extraction:

1. name the responsibility;
2. characterize it;
3. extract it behind a contract;
4. run deterministic suite;
5. verify packaged artifact;
6. delete retired code only after replacement is active.
