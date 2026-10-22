# Permanent context — UI (Calculator web app)

Created 2026-10-22 by the bootstrap. Read at the start of any task of this epic.

## What this epic covers
RF-UI-01…RF-UI-14; UC-UI-01…UC-UI-04. The web app only: the API contract belongs to API, the edge to OPS.

## Design records (Impeccable)
- `PRODUCT.md`, `DESIGN.md` — written by UI-BASE-01; `.impeccable/` surface briefs — written at step 3 of each UI run (shape).
- Direction is fixed by RF-UI-14: token values change only when a measured contrast check fails.

## UI verification standard
Playwright against the real API (M1: `go run ./cmd/calculator` + Vite on the agent's ports; M2: the composed stack), projects Chromium desktop and `mobile-chromium` (Pixel 7, touch); themes System, Light, Dark and Light under a dark OS preference, with the theme bootstrap under the real CSP; widths 320, 393, 768, 1280 px; one role (anonymous visitor); axe zero violations (vitest-axe on the App, `@axe-core/playwright` on initial and error states in both themes); `scrollWidth <= clientWidth` at 320 px; keys ≥ 48 px; visible focus; contrast ≥ 4.5:1; reduced motion; no console errors and no CSP violations.

## Reference screen
The calculator screen (UI-SCREEN-01): display, keypad, history panel, theme control — every state of UC-UI-01…04.

## Architecture as built
- (nothing yet) — planned: `frontend/src/features/calculator/{model,hooks,ui}`, `frontend/src/shared/{api,storage,theme,styles,ui}`, `frontend/src/app/`.

## Invariants every task inherits
- The frontend never computes a numeric result (RF-UI-05).
- One `KEYPAD` table drives keypad and keyboard (RF-UI-01).
- No inline scripts or styles, no inline style attributes for grid placement, no UI library, icon system or runtime styling (RNF-SEC-03, RF-UI-14).
- Hook and component tests inject a fake API through context; MSW only in Node-environment client tests.

## Where to look
- Open debt: `findings/by-owner/UI.md`
- Topics: `findings/by-topic/ui-accessibility.md`, `design-system.md`, `state-machine.md`
