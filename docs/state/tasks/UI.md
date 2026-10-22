# UI — Calculator web app

### UI-BASE-01 — Design baseline [FE] — M0 [topic: design-system, ui-accessibility]

- [x] **DONE 2026-10-22 (run RUN-M0-1, commits e90d084, 235cc53; 🔎 findings: «Findings of UI-BASE-01» (a)–(e)).** Built `PRODUCT.md` (platform, users, purpose, positioning, operating context, capabilities and the exact copy of RF-UI-06/08/10/11/13, principles, accessibility), `DESIGN.md` (north star «The Precision Instrument»; normative frontmatter tokens mapping 1:1 to the `--color-*` custom properties of tokens.css for light and both dark blocks; type scale, spacing, radius, key variants with hover/active mixes, keypad grid, display hierarchy and states, layout and 320 px budgets, focus ring, theme control, history panel, favicon) and `.impeccable/design.json`. Measured every relied-on pair with the WCAG 2.x formula in light, dark and system-dark (text ≥ 4.5:1, indicators ≥ 3:1, 0 failing); two values changed on a measured failure (U5): light focus `#b45309`, display error colour `#ff8a80`. Verified: `contrast.py` (DESIGN.md mode and `--css` mode, eight stylesheet mutations failing as expected), a record consistency check (26 checks, four mutations failing), `impeccable detect` clean (no UI source yet). Evidence in docs/state/archive/runs/RUN-M0-1/evidence/ (contrast.txt, contrast-css.txt, design-records.txt, impeccable-detect.txt).
  **Scope:** RF-UI-14; the visual rules of RF-UI-01, RF-UI-06, RF-UI-12, RF-UI-13 as design records. Impeccable `init`/`document` produce `PRODUCT.md` (purpose, the single anonymous visitor role, tone, English copy, the exact copy of RF-UI-08/RF-UI-10/RF-UI-11) and `DESIGN.md` (the full token palette for both themes, spacing/radius/type scale, the four key variants, keypad grid, display hierarchy, layout breakpoints, focus ring, reduced motion, favicon, no UI library/icon system/runtime styling). Measures text/background contrast for every token pair in light, dark and system-dark, and non-text contrast of the focus ring on every key variant; adjusts token values only where a measurement fails and records the measured ratios. Writes `docs/state/context/UI.md`. The reference screen is the calculator built by UI-SCREEN-01.
  **UI:** none built (records only).
  **Verification:** contrast table with every pair ≥ 4.5:1 (text) and ≥ 3:1 (focus/non-text), computed with a WCAG formula script whose output is in the run evidence; `impeccable detect` has nothing to scan yet; DESIGN.md token names match those UI-SCAF-01 will put in `tokens.css`.
  **Review level:** single.
  **Needs from the owner:** nothing.

### UI-SCAF-01 — Frontend scaffold, tooling, tokens and generated types [FE] — M1 [topic: design-system, api-contract, testing-environment]

- [ ] Open.
  **Scope:** RF-API-10, RF-UI-11 (`public/theme-init.js`), RF-UI-14 (`tokens.css`, `global.css`, favicon), RNF-QUAL-01 (Vitest coverage thresholds 90/90/90/85), RNF-QUAL-02 (strict TS, ESLint `strictTypeChecked` + react-hooks + jsx-a11y, Prettier), RNF-SEC-03 (no inline script in `index.html`). Package `calculator-web` (pnpm 10 via `packageManager`, Node ≥ 24), `@/` alias, scripts (`dev`, `build`, `preview`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:watch`, `test:coverage`, `gen:api`, `lint:api`, `e2e`), `safeStorage`, `cx`, test setup, Vite dev proxy `/api` → `API_PROXY_TARGET` (default `http://localhost:8081`) on `VITE_PORT` (default 5173). Temporary `main.tsx`.
  **UI:** placeholder page only (replaced by UI-SCREEN-01).
  **Verification:** `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build`; `dist/index.html` has no inline script and loads `/theme-init.js`; `pnpm gen:api` twice gives no diff; `OperationName` union matches the contract.
  **Review level:** single.
  **Needs from the owner:** nothing.
  - Registered follow-up (from UI-BASE-01): write tokens.css from DESIGN.md (light focus #b45309, --color-focus #f59e0b declared in both dark blocks, --color-display-danger in all three blocks) and prove it with contrast.py --css. 🔎 findings: «Findings of UI-BASE-01» (a)
  - Registered follow-up (from OPS-CI-01): pin @redocly/cli 2.69.0 in the frontend lockfile, switch the contract stage of scripts/ci/lib.sh to pnpm -C frontend lint:api (CI contract job installs the frontend first) and drop REDOCLY_CLI_VERSION from tools/versions.env. 🔎 findings: «Findings of OPS-CI-01» (b)
  - Registered follow-up (from OPS-CI-01): run scripts/ci/t0.sh on the scaffold and fix the frontend stage if needed (typecheck/lint/format:check/test scripts, ESLint --no-warn-ignored, vitest related with no related test, without --passWithNoTests). 🔎 findings: «Findings of OPS-CI-01» (c)
  - Registered follow-up (from OPS-CI-01): the lint:api and docs:api scripts run Redocly with REDOCLY_TELEMETRY=off and REDOCLY_SUPPRESS_UPDATE_NOTICE=true. 🔎 findings: «Findings of OPS-CI-01» (i)

### UI-CLIENT-01 — Typed, never-throwing API client [FE] — M1 [topic: api-contract, reliability-errors]

- [ ] Open.
  **Scope:** RF-UI-09; the error kinds consumed by RF-UI-08. `frontend/src/shared/api/` (`types.ts`, `problem.ts` with `PROBLEM_CODES` and `isProblem`, `calculatorApi.ts`, `apiContext.ts`, `CalculatorApiProvider.tsx`, `index.ts`). The `openapi-fetch` client receives `fetch: (request) => globalThis.fetch(request)`.
  **UI:** none.
  **Verification:** `pnpm vitest run src/shared/api` in the Node environment with MSW: success, every problem code, malformed problem body → `unexpected`, non-JSON error body, network failure, timeout, caller abort; `pnpm typecheck && pnpm lint`; mutation check: make the guard accept unknown codes and watch the malformed-problem test fail.
  **Review level:** single.
  **Needs from the owner:** nothing.
  - Registered follow-up (from API-CONTRACT-01): the generated Problem type requires detail and requestId; isProblem checks both are strings and the problem result copies them without undefined checks. 🔎 findings: «Findings of API-CONTRACT-01» (b)

### UI-MODEL-01 — Pure calculator model [FE] — M1 [topic: state-machine, numeric-precision]

- [ ] Open.
  **Scope:** RF-UI-01 (`KEYPAD` table, `commandForKey`, `actionForCommand`), RF-UI-03, RF-UI-04, RF-UI-05, RF-UI-06 (`formatEntry`, `selectDisplay`), RF-UI-08 (error copy mapping exhaustive over `ProblemCode`), RF-UI-10 (`decodeHistory`/`encodeHistory`, `historyExpression`). Directory `frontend/src/features/calculator/model/`: no React, DOM, fetch, storage, timers, randomness or numeric conversion of operands/results.
  **UI:** none.
  **Verification:** `pnpm exec vitest run src/features/calculator/model`: the entry-editing table, every transition and guard with frozen fixtures and reference identity for ignored actions, the sequences of UC-UI-01/02/03 (`2 + 3 × 4 =`, `2 + × 3 =`, `5 + =`, `0 + =`, `9 + 16 √ =`, `9 + 12 C 3 =`, recall), history cap and no history on failure/stale/duplicate, display formatting boundaries (10/11/16/17 chars), every malformed history input; typecheck, ESLint and Prettier on the directory; mutation check: let a busy state accept a digit and watch the busy-guard test fail.
  **Review level:** double (state transitions are the core of the client and carry the stale-response rules).
  **Needs from the owner:** nothing.

### UI-HOOKS-01 — Effects, keyboard, delayed busy, persistence and theme hooks [FE] — M1 [topic: state-machine, reliability-errors, ui-accessibility]

- [ ] Open.
  **Scope:** RF-UI-02, RF-UI-04 (the single request effect with `AbortController`, the effect-instance `active` flag and request-identity guard), RF-UI-07 (`useDelayedBusy`, 150 ms keyed on the request descriptor), RF-UI-10 (`loadHistory`/`saveHistory` through `safeStorage`), RF-UI-11 (`theme.ts`, `useTheme`, a test executing the real `public/theme-init.js`). Shared typed fake API for hook and component tests.
  **UI:** none (hooks only).
  **Verification:** `pnpm exec vitest run src/features/calculator/hooks src/shared/theme` covering every row of the integration table: success/failure/all error kinds, AC while pending aborts, AC then a new request with a reused number while the old promise resolves late, StrictMode replay accepts one result, unmount aborts, corrupt/blocked storage, every key binding and guard (modifiers, editable ancestors, IME, button/summary/radio Enter/Space, prevented events, listener cleanup), fake-timer spinner boundaries 149/150 ms; no `act` warnings; mutation check: remove the `active` flag and watch the reused-ID regression fail.
  **Review level:** double (cancellation and stale-response concurrency).
  **Needs from the owner:** nothing.

### UI-SCREEN-01 — Calculator screen, history, theme control and app shell [FE] — M1 [topic: ui-accessibility, design-system, live-verification]

- [ ] Open.
  **Scope:** UC-UI-01, UC-UI-02, UC-UI-03, UC-UI-04; RF-UI-01, RF-UI-06, RF-UI-07, RF-UI-08, RF-UI-10, RF-UI-11, RF-UI-12, RF-UI-13, RNF-A11Y-01. Components `Calculator`, `Display`, `Keypad`, `KeyButton`, `HistoryPanel` (+ breakpoint hook), `ThemeToggle`, `App`, the real `main.tsx` (API created once), CSS Modules on the existing tokens (no inline style attributes). The reference screen of the design baseline.
  **UI:** the calculator screen (display, keypad, history, theme control) in every state: initial, typing, pending expression, busy (dim + delayed spinner), exact and inexact result, error with Ref, empty and full history, each theme.
  **Verification:** `pnpm exec vitest run src/features/calculator src/shared/theme src/app` with vitest-axe zero violations; `pnpm typecheck && pnpm lint && pnpm format:check && pnpm build`; coverage thresholds met (`pnpm test:coverage`); Impeccable critique/audit/polish and `impeccable detect` clean; real-browser check (Playwright ad hoc, Chromium and Pixel 7) against `go run ./cmd/calculator` + Vite on the agent's ports: all seven operations, chaining, an error with Ref matching `X-Request-ID`, history recall across reload, themes, widths 320/393/768/1280, keys ≥ 48 px, no horizontal scroll, axe, no console errors; screenshots in the run evidence.
  **Review level:** single (UI; the diff is opened where it touches the API client contract).
  **Needs from the owner:** nothing.
  - Registered follow-up (from UI-BASE-01): apply DESIGN.md's display error colour, focus geometry, key state mixes, checked segment, 48 px targets, busy dimming of the digits only and the keypad budget rule; refresh DESIGN.md with Impeccable document in scan mode once the screen exists. 🔎 findings: «Findings of UI-BASE-01» (b)
  - Registered follow-up (from UI-BASE-01): verify the display size budget in the real browser at 320 px and in the 22.5rem column. 🔎 findings: «Findings of UI-BASE-01» (c)
  - Registered follow-up (from OPS-ENV-01): start the Go service and Vite for this agent and for a second identity's ports at the same time and record both answering (UC-OPS-01 acceptance). 🔎 findings: «Findings of OPS-ENV-01» (b)
