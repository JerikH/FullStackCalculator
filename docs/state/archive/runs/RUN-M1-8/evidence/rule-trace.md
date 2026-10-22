# RUN-M1-8 — rule → code → test (step 8) and cross-layer trace (step 9)

Paths under `frontend/src/` (`H` = `features/calculator/hooks`, `U` = `features/calculator/ui`, `T` = `shared/theme`). Tests: unit/component = Vitest (1,309 in 33 files of the touched directories, 41 s); browser = ad hoc Playwright (`evidence/*.spec.ts`) against the real Go service; mutation = `evidence/mutations.txt` (22 of 22 killed).

## UI-HOOKS-01
| Rule | Code | Test (unit/component) | Browser / mutation |
|---|---|---|---|
| RF-UI-04 one request effect keyed on `[api, state.request]`, captured request object, nothing for `aborted`, failures through `toCalculatorError` | `H/useCalculator.ts:27-43` | `useCalculator.test.tsx` (success, every error kind, aborted, rebuilt-request rejection) | mutation `completion-with-rebuilt-request` killed |
| Stale completion after AC with a reused request number / unmount / StrictMode replay never reaches the reducer | `useCalculator.ts:33` (`active`, `signal.aborted`) + reducer identity guard | `useCalculator.test.tsx` (reused id, `ignoreAbort`), `useCalculator.unmount.test.tsx` (dispatch boundary), `useCalculator.strict.test.tsx` (in-flight replay) | flows E5 (delayed response, AC, late answer dropped); mutation `stale-guard-deleted` killed; `cleanup-abort-removed` killed |
| UC-UI-01 E5: only AC while busy | reducer (UI-MODEL-01) via `execute` | `useCalculator.test.tsx` busy case | flows E5 |
| RF-UI-10 history persistence, never on mount, blocked/corrupt storage tolerated | `useCalculator.ts:26,44-46`, `H/historyStorage.ts`, `H/historyId.ts` | `useCalculator.test.tsx` storage cases, `historyStorage.test.ts`, `historyId.test.ts` (UUID / getRandomValues / counter / throwing crypto) | flows (history across reload, corrupt history); mutation `persist-on-mount` killed |
| RF-UI-07 spinner after 150 ms keyed on the request identity | `H/useDelayedBusy.ts:7-16`, wired at `useCalculator.ts:47` | `useDelayedBusy.test.tsx` (149/150 ms, completion, AC, replacement object, unmount timer count), `useCalculator.test.tsx` wiring | flows busy test; mutations `spinner-delay-151`, `spinner-id-instead-of-identity`, `spinner-wiring-cut` killed |
| RF-UI-02 / UC-UI-01 E9–E10 keyboard: modifiers, prevented, IME, editable targets, Enter/Space on button/summary/radio, held operator keys ignored | `H/useKeyboardShortcuts.ts:11-32` | `useKeyboardShortcuts.test.tsx` (every KEYPAD binding, guards, foreign-realm targets, repeat) | flows keyboard tests; 6 keyboard mutations killed |
| RF-UI-11 theme state, `data-theme` set/removed, same result as `theme-init.js` | `T/theme.ts`, `T/useTheme.ts` | `theme.test.ts`, `useTheme.test.tsx`, `theme-init.test.ts` (real script + consistency table) | flows theme tests; mutations `theme-written-on-mount`, `theme-system-sets-attribute` killed |

## UI-SCREEN-01
| Rule | Code | Test | Browser |
|---|---|---|---|
| RF-UI-01 23 native buttons, names, 4×6 grid, `=` spans 2 rows, mousedown does not move focus | `U/Keypad.tsx:12`, `U/KeyButton.tsx:48-56`, `KeyButton.module.css` | `Keypad.test.tsx`, `KeyButton.test.tsx`, `Calculator.test.tsx` | layout: 23 keys ≥ 48 px at 4 widths × 5 themes × 2 projects |
| RF-UI-06 display: expression, grouping, U+2212, `≈` + explanation inside the polite output, size classes, never truncated | `U/Display.tsx` | `Display.test.tsx` (34-digit value, marker, sentence) | `1 ÷ 3` 34 digits; budget xl/lg/md at 320 and 1280 |
| RF-UI-07 dim at once (digits only), spinner after 150 ms | `Display.tsx` + CSS | `Display.test.tsx`, `Calculator.test.tsx` (fake timers) | busy flow (opacity 0.6, `Calculating`) |
| RF-UI-08 error copy in a persistent `role="alert"`, `Ref` only when present, server text never shown | `Display.tsx:31-39` | `Display.test.tsx`, `Calculator.test.tsx` E6/E7 | error flow: `Ref` = response `X-Request-ID`; unreachable; non-problem body |
| RF-UI-10 history list, recall raw result, Clear history, empty state, 20 cap | `U/HistoryPanel.tsx` | `HistoryPanel.test.tsx`, `Calculator.test.tsx` UC-UI-03 | history flow, cap 20, recall as right operand, mouse recall then Enter |
| RF-UI-11 radio group `Theme`, persisted, before first paint | `T/ThemeToggle.tsx` | `ThemeToggle.test.tsx` | theme flows; policy piece (attribute present when `<body>` appears) |
| RF-UI-12 layout: one column, 22.5rem + 18rem from 768 px, no horizontal scroll, `100dvh` | `Calculator.module.css`, `App.module.css`, `HistoryPanel.tsx:23-29` | `HistoryPanel.test.tsx` (breakpoint reset round trips) | layout matrix: `scrollWidth ≤ clientWidth`, column widths 360/288 px, history open ≥ 768 |
| RF-UI-13 WCAG 2.2 AA | all | `App.test.tsx` (vitest-axe: initial, history, error, light, dark) | `@axe-core/playwright` zero violations (both projects, both themes, initial/error/populated); dynamic-state contrast table in the run output; reduced motion |
| UC-UI-01 E1–E10, UC-UI-02 E1–E4, UC-UI-03 E3–E7, UC-UI-04 E1–E3 | model + hooks + UI | `Calculator.test.tsx` names each extension | flows (E5, E6, E8, 35th digit, C vs AC, `12.`, theme under a dark OS) |
| UI-CLIENT-01 (c) client created once | `main.tsx:8-21` | build + browser | all browser pieces |
| RF-UI-05 no arithmetic in the frontend | all sources | `app/boundaries.test.ts` (source scan) | — |
| RNF-SEC-03 policy | no inline style/script; CSS Modules; external `/theme-init.js` | `boundaries.test.ts` (`style=`, `dangerouslySetInnerHTML`) | policy piece: real nginx edge, 4 themes, zero CSP violations, clean console, axe zero |

## Cross-layer trace (UI → API → route)
`main.tsx` → `createCalculatorApi` (`shared/api/calculatorApi.ts`) → `CalculatorApiProvider` → `useCalculator` effect (`api.calculate`) → `POST /api/v1/operations/{op}` through the Vite proxy (dev) or the nginx edge (image) → Go router → operation handler (`backend/internal/httpapi`, not changed). The screen is the root route `/` (one role: anonymous visitor); the real requests, operand strings and `X-Request-ID` values were recorded by `recordRequests` in `flows.spec.ts`.
