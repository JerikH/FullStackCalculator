# RUN-M1-8 — plan (UI-HOOKS-01, UI-SCREEN-01)

Spec: `spec.md` (as corrected by its review log). Paths are under `frontend/src/` unless stated. Commands run from `frontend/` (`pnpm exec …`), each under `timeout 600` (U22). Interfaces and rules only; no function bodies.

## Dispatch map

| Slice | Owner | Files (disjoint) | Depends on |
|---|---|---|---|
| P0 | controller | `test/calculatorFake.ts`, `test/matchMedia.ts`, `test/cssEscape.ts`, `features/calculator/hooks/useMediaQuery.ts` + `.test.tsx` | — |
| H | Codex (background, `--model gpt-6.1-sol --effort medium`) | `features/calculator/hooks/{historyId,historyStorage,useCalculator,useKeyboardShortcuts,useDelayedBusy}.ts` + their tests; `shared/theme/{theme.ts,theme.test.ts,useTheme.ts,useTheme.test.tsx}`; `git mv`-less: the moved `shared/theme/theme-init.test.ts` is written by Codex as a new file and the controller deletes the old one | P0 |
| U1 | Claude subagent (sonnet, high, Impeccable) | `features/calculator/ui/{Display,Keypad,KeyButton,HistoryPanel}.tsx` + `.module.css` + `.test.tsx` | P0 |
| U2 | Claude subagent (sonnet, high, Impeccable) | `shared/theme/ThemeToggle.{tsx,module.css,test.tsx}`, `features/calculator/ui/Calculator.{tsx,module.css,test.tsx}`, `features/calculator/index.ts`, `app/App.{tsx,module.css,test.tsx}`, `app/boundaries.test.ts`, `main.tsx` | H, U1 |
| V | controller | evidence scripts under `docs/state/runs/RUN-M1-8/evidence/` | U2 |

At most 1 Codex job + 2 Claude subagents at once: H and U1 run in parallel (U1 types the Display prop structurally as `DisplayModel & { showSpinner }`, assignable from H's `CalculatorDisplay`, so it needs no H file); U2 starts only after **both** H and U1 are reviewed and typecheck together; the spec/plan reviews use the same budget.

## P0 — shared test support and the media-query hook

- `test/calculatorFake.ts`
  - `createFakeApi(options?: { ignoreAbort?: boolean }): FakeApi` where `FakeApi extends CalculatorApi { calls: readonly FakeCall[] }`, `FakeCall = { operation; operands: readonly string[] (copy); signal: AbortSignal | undefined; resolve(result: ApiResult<CalculationResult>): void }`. `calculate` returns a promise settled only by `resolve`; unless `ignoreAbort`, the promise settles `{ok:false, error:{kind:'aborted'}}` when the signal aborts (client-like behaviour); with `ignoreAbort` it keeps waiting (misbehaving transport).
  - Builders: `success(operation, operands, result, inexact = false)` → `{ok:true,data}`; `problem(code, requestId?)`, `networkError()`, `timeoutError()`, `unexpectedError(status?)`, `abortedError()`.
  - `apiWrapper(api, { strict = true })` returns a component wrapping children in `CalculatorApiProvider` (+ `StrictMode`) built with `createElement`.
- `test/matchMedia.ts`: `installMatchMedia(matches: boolean): { set(matches: boolean): void; listenerCount(): number; restore(): void }` replacing `window.matchMedia` with an object per query that supports `addEventListener`/`removeEventListener('change')`, firing listeners (inside `act` by the caller).
- `test/cssEscape.ts`: `installCssEscape(): () => void` defines `window.CSS.escape` (a minimal implementation) when absent and returns its restore function; needed because user-event's radio navigation calls `window.CSS.escape` for named groups and jsdom lacks it (probe: `TypeError … reading 'escape'`).
- `hooks/useMediaQuery.ts`: `useMediaQuery(query: string): boolean` via `useSyncExternalStore` (subscribe adds/removes the same `change` listener; snapshot `matchMedia(query).matches`; server snapshot and `matchMedia` not a function → `false`).
- Tests (`useMediaQuery.test.tsx`): initial true/false; change event re-renders; listener removed on unmount (`listenerCount() === 0`); no `matchMedia` → false (no throw).

## H — hooks and theme (UI-HOOKS-01)

Interfaces (exact):
```ts
// hooks/historyId.ts
export function newHistoryId(): string;                     // randomUUID → getRandomValues hex → timestamp+counter; 1..128 chars
// hooks/historyStorage.ts
export function loadHistory(): readonly HistoryEntry[];     // decodeHistory(safeStorage.get(HISTORY_STORAGE_KEY))
export function saveHistory(entries: readonly HistoryEntry[]): void; // safeStorage.set(KEY, encodeHistory(entries))
// hooks/useDelayedBusy.ts
export const BUSY_SPINNER_DELAY_MS = 150;
export function useDelayedBusy(busy: boolean, request: CalculationRequest | null): boolean;
// hooks/useKeyboardShortcuts.ts
export function useKeyboardShortcuts(execute: (command: KeyCommand) => void): void;
// hooks/useCalculator.ts
export interface CalculatorDisplay extends DisplayModel { readonly showSpinner: boolean }
export interface CalculatorController { display: CalculatorDisplay; history: readonly HistoryEntry[]; busy: boolean;
  execute(command: KeyCommand): void; recall(value: string): void; clearHistory(): void }
export function useCalculator(): CalculatorController;
// shared/theme/theme.ts
export type Theme = 'system' | 'light' | 'dark'; export const THEME_STORAGE_KEY = 'calculator.theme.v1';
export function readTheme(): Theme; export function applyTheme(theme: Theme): void; export function writeTheme(theme: Theme): void;
// shared/theme/useTheme.ts
export function useTheme(): { theme: Theme; setTheme(theme: Theme): void };
```
Rules → tests (T0 unless noted; every hook test uses the fake API from P0, `act` for dispatch and deferred resolution, literal fixtures such as `add ['0.1','0.2'] → '0.3'`, `divide ['1','3'] →` the 34-digit string typed out):
- *Init*: loads validated history, display `0`, no API call → `useCalculator.test.tsx` "initial".
- *Request effect*: binary calculation sends exactly `(operation, operands)` strings; `busy` until resolved; unary and chain continuations (follow the model; an intermediate chain success appends history).
- *Success*: output, one history row with a non-empty ≤128-character id, persisted once (`localStorage` has the envelope).
- *Failure*: mapped message and optional `requestId`; no history row; all kinds (problem with a request id, problem without, empty id, network, timeout, unexpected) → expected copy.
- *Explicit abort result*: `kind:'aborted'` resolves → no state change, no alert.
- *AC while pending*: the recorded signal is aborted; display resets; history kept; the late resolution (fake `ignoreAbort`) changes nothing.
- *Reused id regression* (rendered with `apiWrapper(api, { strict: false })`: under StrictMode the reducer runs twice per dispatched action, so the spy would double-count): AC, a new request (same numeric id 1), resolve the OLD promise late (fake with `ignoreAbort`) with a different result → display/history show only the new calculation **and the stale completion never reaches the reducer** (the test mocks `../model/reducer` with `vi.mock` + `importActual`, wrapping `calculatorReducer` in a spy, and counts `calculationSucceeded`/`calculationFailed` actions: one per accepted result). Mutation target: delete the guard line `if (!active || controller.signal.aborted) return;`; removing `active` alone is an equivalent mutant (defence in depth).
- *Unmount* aborts the in-flight signal; with `ignoreAbort` the promise is resolved after unmount and the (strict:false) reducer spy sees no completion action (React 19 emits no unmounted-update warning, so a `console.error` spy is not the oracle).
- *Rerender with the same request* does not re-call the API (calls.length stays 1).
- *StrictMode in-flight replay* (separate file `useCalculator.strict.test.tsx`; the premise needs a mount that already has a request, which the reducer never produces at init): `vi.mock('../model/reducer', …importActual…)` makes `createInitialState` return a busy state built through the real reducer (`press(createInitialState(), ['2','+','3','='])` from `model/testing`); mount under StrictMode with `createFakeApi({ignoreAbort:true})`: the effect runs, is cleaned up (first signal aborted) and runs again (calls.length 2, second signal live); resolving both yields exactly one accepted result and one history row.
- *Busy controls*: C, digits, operators, `recall`, `clearHistory` ignored; AC accepted.
- *Storage*: `loaded = useRef(state.history)` semantics: corrupt preload → empty history and **no write on mount (also under StrictMode)**; a valid preload also writes nothing on mount; blocked/throwing storage (`Storage.prototype.getItem/setItem` throwing) → still calculates, history in memory; first success writes; `clearHistory` writes the empty envelope.
- *Recall after error*: error cleared, value fresh, no API call until the next operation.
- *Stable callbacks*: `execute/recall/clearHistory` are referentially stable across renders.
- *newHistoryId*: uses `randomUUID` when present; when `crypto.randomUUID` is undefined uses `getRandomValues`; when neither (and when `crypto` itself is undefined or `randomUUID` throws), still unique across 1,000 calls, ≤128 characters and never throws.
- *useDelayedBusy* (fake timers, restored in `afterEach`; unmount test: `vi.getTimerCount() === 0` after unmount and after completion): hidden at 149 ms, visible at 150 ms; hidden when completion arrives at 100 ms (timer cleared); hidden right after AC; a replacement request object restarts the delay and the previous spinner is not shown in the render where the new request appears; no state update after unmount.
- *useKeyboardShortcuts*: every binding of `KEYPAD` (iterated from the table, plus `Enter`/`=`, `,`); unknown keys (` `, `R`, `N`, `Tab`, arrows) not prevented and not executed; Ctrl/Meta/Alt each; Shift allowed (`+`, `*`, `%`, `^`); `isComposing`; `keyCode 229` with `Enter`; already-prevented; targets: input text / textarea / select / contenteditable / role=textbox (ignored), a child span of a contenteditable (ignored), radio and checkbox inputs (digit handled, Enter ignored), button and a span inside a button (Enter ignored, `=` handled), `summary` (Enter ignored), body, the `window` itself and a text node target (handled); handled keys are `preventDefault`ed once; repeated keydown executes each time; rerender with a new callback → only the new one is called, one listener (`addEventListener`/`removeEventListener` spies balanced); unmount removes the listener.
- *Theme*: `readTheme` for `system|light|dark`, junk, empty, absent, throwing storage; `applyTheme` sets/removes the attribute (assert `hasAttribute` false for `system`); `useTheme` initial from storage, each transition persists and applies, explicit light with `matchMedia` dark preference leaves `data-theme="light"`, return to system removes it, blocked storage still applies for the session, StrictMode mounts once-correct; mount does not write storage.
- *theme-init consistency*: real `public/theme-init.js` vs `applyTheme(readTheme())` over the stored-value table (same attribute).
Targeted check (H): `pnpm exec vitest run src/features/calculator/hooks src/shared/theme src/test`; `pnpm typecheck`; `pnpm exec eslint src/features/calculator/hooks src/shared/theme src/test --max-warnings=0`; `pnpm exec prettier --check …`; directory-scoped coverage ≥ 95 % (`--coverage.include='src/features/calculator/hooks/**'`).
Not touched: `model/**`, `shared/api/**`, `shared/storage/**`, `setup.ts`, `public/theme-init.js` (unless a consistency test fails — then a finding first).

## U1 — leaf components (UI-SCREEN-01)

Interfaces (exact):
```ts
Display(props: { model: CalculatorDisplay }): React.JSX.Element
Keypad(props: { execute(command: KeyCommand): void }): React.JSX.Element
KeyButton(props: { definition: KeyDefinition; execute(command: KeyCommand): void }): React.JSX.Element
HistoryPanel(props: { entries: readonly HistoryEntry[]; recall(value: string): void; clearHistory(): void }): React.JSX.Element
```
Rules → tests (RTL + user-event + vitest-axe; no snapshots; accessible queries):
- *Keypad*: group named `Keypad` with 23 buttons whose accessible names equal `KEYPAD` `ariaLabel`s in order (digits by digit), `type="button"`; each click calls `execute` with the table's command object; `=` button has the `span2` placement class and row 5 / column 4; each button has exactly one row, one column class; no `style` attribute anywhere in the container; `mousedown` is default-prevented (`fireEvent.mouseDown` returns false) and focus does not move on `user.click`; keyboard activation (`Tab` to `7`, Enter/Space) calls `execute` once.
- *Display*: initial `0` in the Result output; expression line text; `aria-busy` true while busy and absent/false otherwise; value dimmed class only on the digits while busy (not the `≈`); spinner only when `showSpinner`, `aria-hidden`; inexact → visible `≈`, wrapper `title` exactly `Rounded to 34 significant digits`, the same sentence present as visually-hidden text; a 34-digit value rendered in full (string equality of the text content); size class xl/lg/md from the model; error → one `role="alert"` with the exact copy, `Ref: abc` only when `requestId` is present (absent → no `Ref`), the output text empty during error; nothing else carries `role="alert"`; hostile text (`<img src=x onerror=…>` as requestId) renders as text.
- *HistoryPanel*: rows and `Clear history` prevent default on `mousedown` (`fireEvent.mouseDown` returns false) so a mouse recall does not leave focus on the row; `<details>` + summary `History`; empty state `No calculations yet` and no Clear button; rows newest-first in given order, text from `historyExpression`; accessible name `Use result <formatted>` (grouping and U+2212 for negatives); click calls `recall` with the raw `entry.result`; Clear history calls `clearHistory` and then (after the parent re-renders with an empty list) the summary has focus; when the list does not become empty (clear ignored) focus does not move; open by default when `matchMedia('(min-width: 768px)')` matches, closed otherwise; user toggle (awaited `toggle` event; the handler reads `currentTarget.open`) persists across rerenders and unrelated prop changes; **every** breakpoint change discards the user's choice and re-applies the default, including crossings where `details.open` does not change: tests narrow→open→wide→narrow (collapsed), wide→close→narrow→wide (open), and a toggle within one breakpoint (the override is held as `boolean | null` plus the last seen `wide`, reset during render when `wide` changes); history ids appear nowhere in the DOM text/attributes; the focused summary is reachable by Tab and Enter/Space keydown on it is not default-prevented by anything in the panel (user-event does not synthesize the `summary` activation, probe: `details.open` stays false, so the native toggle itself is proved in the real browser, not in jsdom); axe zero violations for empty/populated.
- CSS modules (one per component) per DESIGN.md: tokens only; finite placement classes; focus ring from `global.css`; hover/active `color-mix`; ≥ 48 px targets; `font-variant-numeric: tabular-nums`; `overflow-wrap: anywhere`; no motion except the 120 ms background transition and the spinner rotation (both under the global reduced-motion rule; the spinner also has a static ring under `prefers-reduced-motion`).
Targeted check (U1): `pnpm exec vitest run src/features/calculator/ui`; typecheck; eslint/prettier on the directory; `impeccable detect src/features/calculator/ui`.

## U2 — integration (UI-SCREEN-01)

Interfaces: `ThemeToggle(): JSX.Element`; `Calculator(): JSX.Element`; `App(): JSX.Element`; `index.ts`: `export { Calculator } from './ui/Calculator'` only.
Rules → tests:
- *ThemeToggle*: `getByRole('radiogroup', {name: 'Theme'})` with radios `System`, `Light`, `Dark` (shared name); checked follows stored/chosen theme; click changes selection and `data-theme`; ArrowRight/ArrowLeft with `installCssEscape()` (restored in `afterEach`) move the selection natively; the arrow selection is proved again in the real browser; `System` removes the attribute; ≥ 3 segments each a `label`; keyboard calculator shortcuts do not fire on arrow keys.
- *Calculator* named extension cases (literal operands and display strings, explicit `calls.length`): UC-UI-01 E1 (`2 + 3 ×` issues add ['2','3'], shows the fake's '5', `× 4 =` issues multiply ['5','4']), E2 (`2 + ×` no request, `3 =` → multiply ['2','3']: the second operator replaces the first, corrected at step 8; the plan had said add), E3 (`5 + =` → add ['5','5']), E4 (`=` alone: no call), E5, E6 (error recovered by digit, by `.` (decimal), by C, by AC, by recall), E7 (network/timeout/unexpected copy), E8 (`≈` and the sentence), E9/E10; UC-UI-02 E1 (35th digit ignored), E2 (digit replaces a fresh result, `.` gives `0.`, ⌫ no-op, ± on a result including a scientific `1e+21`, `≈` kept), E3 (± on `0`, ⌫ on `-5` → `0`), E4 (`12.` sent as `12`); UC-UI-03 E5 (Clear history leaves the current entry/pending operator untouched), E6 (recall while busy ignored), E7 (re-render from storage shows the same rows); mouse recall then Enter → `add […]` request (focus did not stay on the row); click flow `2 + 3 =` → fake receives `add ['2','3']`, shows the fake's result; keyboard flow; unary + chain (`9 + 16 √ × 2 =` → `add ['9','4']`, `multiply ['13','2']` by resolving the fake with literal results); C vs AC; busy guards; error recovery via digit/C/AC/recall; click-to-keyboard regression (click `2`,`+`,`3` then Enter → one `add ['2','3']`); native activation (focus `7` by Tab, Enter and Space → one digit command, no `equals`); a separate element focused beforehand keeps focus after clicking a key (mousedown prevented), plus the separate body-focus regression (click `2`,`+`,`3`, Enter → one `add ['2','3']`); history recall as right operand; history persisted to `localStorage`; the spinner appears after 150 ms with fake timers.
- *App*: one `h1` `Calculator`, `banner` and `main` landmarks, single `Theme` group, axe zero violations for initial, populated-history, error, explicit light and dark (`data-theme` set) with real timers; exactly one alert container is mounted and empty when there is no error, and carries the message after a failure.
- *boundaries.test.ts*: source scan as in spec §5 (fails when a banned primitive is added; the test itself seeds nothing into the sources).
- `main.tsx`: as in spec; excluded from coverage (already configured); proven by the build and the real browser.
Targeted check (U2): `pnpm exec vitest run src/features/calculator src/shared src/app`; `pnpm typecheck && pnpm lint && pnpm format:check && pnpm build` (check `dist/index.html` has `/theme-init.js` and no inline script/style attribute); `impeccable detect`.

## V — verification and closure (controller)
1. T0 per slice; then T1: the directory test runs above, `pnpm test:coverage` once under `heavy` (`timeout 600`), mutation checks of the spec §5 list (each `timeout 120`, restored by `git checkout --`).
2. Review: rule → code → test table written into `evidence/rule-trace.md`; a second independent reader (Codex `review` or `exec -s read-only` with the template-3 checklist, since the double-review level applies to UI-HOOKS-01: cancellation and stale responses) and a security/edge-case reader (Claude subagent, template 4 adapted to the client: crafted storage, hostile ids, key events, CSP, secrets). Impeccable `critique` and `audit` on the built screen, `detect` clean, then `polish`.
3. Real-browser pieces (1)–(6) of spec §5 as separate commands; `evidence/` scripts: `playwright.adhoc.config.ts`, `flows.spec.ts`, `touch.spec.ts`, `layout.spec.ts`, `axe.spec.ts`, `policy.spec.ts`, helper `support.ts`, the second-identity shell script. Because `@playwright/test` resolves from `frontend/node_modules`, the specs are copied to `$WF_SCRATCH/e2e/` (with a `node_modules` symlink to `frontend/node_modules`) for the run; screenshots and JSON results are written to the committed `evidence/`.
4. Refresh `DESIGN.md` and `.impeccable/design.json` from the shipped CSS (Impeccable `document`, scan mode, through the `impeccable-documenter` agent); keep the token table unchanged unless a measurement forces it (re-run `contrast.py DESIGN.md --css`).
5. Findings to register: label-in-name deviations mandated by RF-UI-01/RF-UI-10 (note), Firefox `:active` suppressed by mousedown default-prevention (note), multi-tab history overwrite (note: each tab persists its own state), `keyCode` use for the Safari IME confirm keydown (rule).
6. `closure.md`, `findings.md`, `reindex.py --check`, `wf own check --diff`, `wf conflicts --wave W3`.

## Commits (explicit paths, no trailers beyond the repository rule: no AI co-author)
1. `docs(state): RUN-M1-8 spec` (step 3) and `docs(state): RUN-M1-8 plan` (step 6).
2. `feat(web): add calculator effects keyboard and theme hooks (RF-UI-02, RF-UI-04, RF-UI-07, RF-UI-10, RF-UI-11)` — UI-HOOKS-01 (H, P0, the theme-init move, hook evidence).
3. `feat(web): build accessible responsive calculator interface (UC-UI-01…04, RF-UI-01, …)` — UI-SCREEN-01 (U1, U2, CSS, main).
4. `docs(spec)`-free: `docs(state): RUN-M1-8 evidence and closure`; DESIGN.md/`.impeccable` refresh with the screen commit or its own `docs(design)`-style commit under the allowed scopes (`docs(state)` for records).

## 8. Review log

Step 6, independent read-only Codex review (`codex exec -s read-only`, gpt-6.1-sol, medium; it ran in-memory probes against the installed jsdom/user-event/React): 0 P0/P1, 9 P2, 1 P3 — all confirmed by their probes or by reading the cited lines, all applied above:
1. Idle-alert assertion contradicted the persistent alert container (spec §4.2) → assert one empty container.
2. «Focus stays on the clicked key» reversed the requirement (a prevented mousedown keeps the *previous* focus) → separate-element focus test + the body-focus Enter regression.
3. Summary Enter cannot toggle in user-event/jsdom → assert not prevented, prove the toggle in Playwright.
4. Radio arrow navigation throws without `window.CSS.escape` → `test/cssEscape.ts` shim (P0) and a real-browser arrow test.
5. The reducer spy double-counts under StrictMode → `strict: false` for that test.
6. The in-flight StrictMode replay had no way to start with a request → dedicated file mocking `createInitialState`.
7. Slice dependencies: U1 types Display structurally; U2 waits for both H and U1.
8. UC extension cases missing at component level → named cases added (E1–E4, E6 decimal, UC-UI-02 E2–E4, UC-UI-03 E5–E7).
9. The history override survived a breakpoint round trip (a defect of the spec's algorithm, also present in the U1 delivery) → reset on every breakpoint change; round-trip tests; HistoryPanel corrected by the controller.
10. `console.error` spy is vacuous for unmount (React 19) → `ignoreAbort` + late resolve + reducer spy; `vi.getTimerCount()` for the delayed-busy hook.
Equivalent-mutant check: deleting the whole stale guard is distinguishable once finding 5 is applied.
