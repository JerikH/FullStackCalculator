# Permanent context — UI (Calculator web app)

Created 2026-10-22 by the bootstrap. Read at the start of any task of this epic.

## What this epic covers
RF-UI-01…RF-UI-14; UC-UI-01…UC-UI-04. The web app only: the API contract belongs to API, the edge to OPS.

## Design records (Impeccable)
- `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` — written by UI-BASE-01 (RUN-M0-1). DESIGN.md frontmatter is normative: colour key `<name>` = light `--color-<name>`, `<name>-dark` = the value in both dark blocks of `tokens.css`. `.impeccable/` surface briefs — written at step 3 of each UI run (shape).
- Contrast proof: `python3 docs/state/archive/runs/RUN-M0-1/evidence/contrast.py DESIGN.md [--css frontend/src/shared/styles/tokens.css]` (text ≥ 4.5:1, indicators ≥ 3:1, light/dark/system-dark; `--css` also requires every colour token in each of the three blocks and identical dark blocks).
- Design imagery (owner, 2026-10-22): high-fidelity desktop and mobile mockups, design images and raster assets may be generated as comps for the shape and build steps; the shipped UI is code from the DESIGN.md tokens and is verified in the real browser.
- Direction is fixed by RF-UI-14: token values change only when a measured contrast check fails.

## UI verification standard
Playwright against the real API (M1: `go run ./cmd/calculator` + Vite on the agent's ports; M2: the composed stack), projects Chromium desktop and `mobile-chromium` (Pixel 7, touch); themes System, Light, Dark and Light under a dark OS preference, with the theme bootstrap under the real CSP; widths 320, 393, 768, 1280 px; one role (anonymous visitor); axe zero violations (vitest-axe on the App, `@axe-core/playwright` on initial and error states in both themes); `scrollWidth <= clientWidth` at 320 px; keys ≥ 48 px; visible focus; contrast ≥ 4.5:1; reduced motion; no console errors and no CSP violations.

## Reference screen
The calculator screen (UI-SCREEN-01): display, keypad, history panel, theme control — every state of UC-UI-01…04.

## Architecture as built
- `frontend/` package calculator-web (Findings of UI-SCAF-01 (a)); `src/shared/styles/{tokens,global}.css`, `src/shared/storage/safeStorage.ts`, `src/shared/ui/cx.ts`, `public/theme-init.js`, `src/shared/api/` (client, Findings of UI-CLIENT-01 (a)), `src/test/setup.ts` (matchMedia stub; vitest-axe typing in `src/test/vitest-axe.d.ts`); `src/main.tsx` is a placeholder until UI-SCREEN-01 (RUN-M1-2).
- Planned: `frontend/src/features/calculator/{model,hooks,ui}`, `frontend/src/shared/theme`, `frontend/src/app/`.

## Invariants every task inherits
- The frontend never computes a numeric result (RF-UI-05).
- One `KEYPAD` table drives keypad and keyboard (RF-UI-01).
- No inline scripts or styles, no inline style attributes for grid placement, no UI library, icon system or runtime styling (RNF-SEC-03, RF-UI-14).
- Measured token changes (U5): light focus `#b45309` (dark `#f59e0b`, declared in both dark blocks); error copy inside the display uses `--color-display-danger` `#ff8a80`, never `--color-danger` (Findings of UI-BASE-01 (a), (b)).
- Every interactive control is at least 48 × 48 px; the focus ring is a 3px `:focus-visible` outline with 2px offset, measured against the surfaces it sits on (Findings of UI-BASE-01 (b), (d)).
- Hook and component tests inject a fake API through context; MSW only in Node-environment client tests.
- The API client never rejects; only `CalculatorApiProvider` supplies it; hook and component tests inject a fake; only `src/shared/api` tests use MSW, in the Node environment with `onUnhandledFrame: 'error'` (Findings of UI-CLIENT-01 (a), UI-SCAF-01 (e)).
- Package-wide frontend inputs re-check the whole package in the tiers (Findings of UI-SCAF-01 (b)).
- `@playwright/test` 1.64.1 runs Chromium build 1248 (Findings of UI-SCAF-01 (e)).

## Where to look
- Open debt: `findings/by-owner/UI.md`
- Topics: `findings/by-topic/ui-accessibility.md`, `design-system.md`, `state-machine.md`
