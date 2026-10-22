# RUN-M2-0 — Plan

Interfaces and rules, no function bodies. Order: P1 OBS-LOG-02, P2 UI-DEPS-01, P3 UI-FIX-01, P4 run-level checks and closure. The spec (`spec.md`) holds the reasons.

## Dispatch

| Slice | Who | Owned files |
|---|---|---|
| P1 backend (middleware change + tests) | Codex (`codex:codex-rescue`, `--model gpt-6.1-sol --effort medium`, background, one job) | `backend/internal/platform/httpx/middleware.go`, `middleware_test.go` |
| P2 dependencies | controller (installs under the `deps` lease; nothing parallelisable) | `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/Dockerfile`, `.github/workflows/ci.yml.disabled`, `docs/state/context/test-environment.md`, `docs/state/context/OPS.md` |
| P3a client (helper + tests) | Codex, after P1 finishes and after P2's commit B (one Codex job at a time) | `frontend/src/shared/api/calculatorApi.ts`, `calculatorApi.test.ts` |
| P3b names (keypad table, history row names, test updates, axe helper) | Claude subagent, `model: "sonnet"`, `effort: "high"`, in parallel with P3a, after P2's commit B | `frontend/src/features/calculator/model/keypad.ts`, `keypad.test.ts`, `frontend/src/features/calculator/ui/{Keypad.test.tsx,Calculator.test.tsx,HistoryPanel.tsx,HistoryPanel.test.tsx,KeyButton.test.tsx,Display.test.tsx}`, `frontend/src/shared/theme/ThemeToggle.test.tsx`, `frontend/src/app/App.test.tsx`, `frontend/src/test/axe.ts` and `axe.test.ts` (new) |
| Records (controller only: single-writer rule and Impeccable records) | controller | `DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json`, `.impeccable/surfaces/frontend-src-features-calculator-ui.md`, `docs/state/context/UI.md`, `docs/state/context/OBS.md`, `docs/spec/srs.md`, `docs/spec/use-cases.md`, `docs/spec/roadmap.md`, `docs/state/tasks/*.md` |

**Concurrency inside P3 (plan review P2-5):** the two slices run at the same time on disjoint files, but each may run only `pnpm -C frontend exec vitest run <its own paths>` and `pnpm -C frontend exec eslint <its own files>`; neither runs `tsc`, `pnpm typecheck`, `pnpm lint` (whole), coverage, installs or Playwright. The controller runs the whole typecheck, lint, tests and coverage after both finish. P3 starts only after P2's commit B (no install or Node switch happens under a running vitest). Mutation restore (plan review P2-1): the file is copied to `$WF_SCRATCH/mut/<name>.orig` first, the mutation is applied, and the file is copied back followed by `cmp` and a check that the pattern was found; `git checkout -- <file>` is never used on files holding uncommitted work.

The controller reviews every diff, runs the checks, performs the mutation checks and runs git. Subagents and Codex never run git, never install, never run full suites.

## P1 — OBS-LOG-02

`logAccess` (`middleware.go`): the `method` attribute becomes `slog.String("method", truncateChars(r.Method, maxLoggedChars))`. Comments of `maxLoggedChars` and `AccessLog` name method, path and user agent. No other line changes.

Tests (`middleware_test.go`, tier T0/T1):
- `TestAccessLogBoundsMethod` table: method of 300 `A` → logged `method` is exactly 256 `A`; `GET` unchanged; 256 characters unchanged; 257 → 256; the line's `status` is still the one the handler wrote (the field is cut, nothing else); the test builds the request with `httptest.NewRequest` and a method string, handler writes 405, and goes through `Chain(…, RequestContext, AccessLog(logger))` like the neighbouring `TestAccessLogBoundsPathAndUserAgent`.
- Metrics: confirm the existing metrics test of unknown methods (`OTHER`) still passes; add one case with a 300-character method in `observability` only if no existing test covers a long method (controller decides after reading).
- Mutation (controller): remove the `truncateChars` call on `method` → the new test fails; restore from the scratch copy (`cmp`).
Records: `docs/state/context/OBS.md` (lines 12 and 24) gain `method`. Commit P1 = middleware + test + OBS.md (`fix(httpx): bound the logged method (OBS-LOG-02)`), run-folder records with it.
Checks: `go test -race -count=1 -cover ./internal/platform/httpx/ ./internal/httpapi/ ./internal/app/` (coverage ≥ 96.8 / 99.0 / 98.0 %), `go vet ./...`, `golangci-lint run ./...`; live: built binary with a free port block, a 300-character method over a socket (`printf 'AAAA… / HTTP/1.1…' | nc` or a Go/Python one-liner) → 405 problem response and the logged `method` of 256 characters; PID recorded and killed by PID.

## P2 — UI-DEPS-01 (controller)

1. `wf lease acquire deps`; `nvm install 24.22.1` and make it the default alias (installation recipe in `test-environment.md`).
2. Commit A — `@redocly/cli` 2.70.0: edit the version in `package.json`, `pnpm -C frontend install` (lockfile updated), then `install --frozen-lockfile`, `lint:api`, `pnpm -C frontend exec redocly build-docs ../backend/api/openapi.yaml --config ../redocly.yaml -o $WF_SCRATCH/api.html` (the `docs:api` script writes into the tracked path, so it is not used), `git status` clean, `scripts/ci/t0.sh --base HEAD`.
3. Commit B — Node 24.22.1 + jsdom 30.1.3: `package.json` jsdom, lockfile; `frontend/Dockerfile` pin (`node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53`); `ci.yml.disabled` literal; `test-environment.md` rows; `context/OPS.md:11`. Then `typecheck`, `lint`, `format:check`, `test`, `build`, `gen:api` twice no diff, `lint:api`, `test:coverage` (heavy), `docker build` (heavy) + edge smoke, `actionlint`, `pnpm audit --prod --audit-level high`, a final `pnpm outdated` (only `typescript` and `@types/node` may remain, with their reasons), T0 (`--base 31b3443` for the commit-level check).
4. If jsdom 30 breaks a test: the break is diagnosed (systematic-debugging), the fix goes in the same commit and into the spec's amendment; a test is never weakened.
5. Findings: `note` (typescript and the jsx-a11y override stay, evidence), `rule` (new pin and where it lives).

## P3 — UI-FIX-01

### P3b — names (Sonnet subagent)

- `keypad.ts`: `key('all-clear', 'AC', 'AC, all clear', …)` and `key('power', 'xʸ', 'xʸ, power', …)`; nothing else.
- `keypad.test.ts`: the table fixture lines for those two keys follow; a literal list of the 23 accessible names equals `KEYPAD.map((k) => k.ariaLabel)` (the only place for that list).
- New `frontend/src/test/axe.ts` (spec, findings P1-1/P1-2 of the spec review and P1-2/P3-1 of the plan review): the rule `label-content-name-mismatch` (tags `wcag21a`, `wcag253`; on by default) needs a canvas 2D context that jsdom lacks, so it is skipped as `incomplete` with an `error`. The module exports `axe(container, options?)` wrapping `vitest-axe`'s `axe`: inside each call (try/finally) it replaces `HTMLCanvasElement.prototype.getContext` with a stub returning an object with `canvas`, `font`, `measureText` (non-zero `width`), `fillText`, `clearRect` and `getImageData` (non-zero pixel data), then restores the original; after the run it throws if any entry of `results.incomplete` with `id === 'label-content-name-mismatch'` has an `error` (the field is on the rule result, not on its nodes). `axe.test.ts`: the wrapper throws for a hand-built result carrying such an error and passes for one without; the old names (`<button aria-label="all clear">AC</button>`, `<button aria-label="power">xʸ</button>`) yield exactly two violations of the rule; the new names yield none; calling `vitest-axe`'s raw `axe` without the stub on the same markup yields the skipped-rule `error` (documents the trap).
- Every component axe test imports the wrapper instead of `vitest-axe`'s `axe`: `Keypad.test.tsx`, `KeyButton.test.tsx`, `Display.test.tsx`, `HistoryPanel.test.tsx`, `ThemeToggle.test.tsx`, `App.test.tsx`.
- `Keypad.test.tsx`: besides the axe test, a table test over `KEYPAD` for the keys axe applies the rule to (`label` neither a single non-digit character nor only symbols/punctuation): the name starts with the visible text; the applicable set equals exactly `AC`, `xʸ` and `0`–`9`.
- `HistoryPanel.tsx:65`: `aria-label={`${historyExpression(entry)}, use result`}`; remove the `formatEntry` import if it becomes unused. `HistoryPanel.test.tsx`: lines 57–61, 71, 87 follow (`'Use result 36'` → `'12 × 3 = 36, use result'` etc. — the subagent reads the fixtures for the exact strings); a table test over entries (binary, unary, percentage, inexact `≈`, negative with U+2212, scientific) asserting `accessibleName === `${visibleText}, use result``.
- `Calculator.test.tsx`: `'all clear'` → `'AC, all clear'` (4 places), the `power` key press → `'xʸ, power'` (`operation: 'power'` strings stay), `'Use result 5'` / `'Use result 36'` (lines 413, 561–606) → the new row names. `App.test.tsx:106` follows.
- Do NOT touch: any CSS, `KeyButton.tsx`, `calculatorApi*`, `package.json`, archived evidence, any record or spec file (the controller owns them).

### P3a — client (Codex)

Signatures (module-private, no new exports):
```
interface Combined { readonly signal: AbortSignal; expired(): boolean; release(): void }
function combineSignals(caller: AbortSignal | undefined, timeoutMs: number): Combined
function abortError(combined: Combined): ApiError   // 'timeout' if combined.expired(), else 'aborted'
```
Rules:
1. Native path iff `typeof AbortSignal.timeout === 'function'` and (no caller signal or `typeof AbortSignal.any === 'function')`: exactly today's behaviour; `release` no-op.
2. Fallback otherwise: `AbortController`; caller already aborted → abort immediately with `caller.reason`, no timer; else timer + `{ once: true }` caller listener; the timer callback checks `!controller.signal.aborted` before setting `timedOut` and aborting with a `TimeoutError` `DOMException`; `release` clears the timer and removes the listener (idempotent).
3. `calculate`: `let combined: Combined | undefined;` before `try`; first statement in the `try` builds it from `options.signal` and `timeoutMs`; `finally` calls `combined?.release()`; the two `signal.aborted` checks become `combined?.signal.aborted`; the request passes `combined.signal`; the catch with no `combined` yields `{ kind: 'network' }`.
4. Everything else in the file is unchanged (`toApiError`, `toCalculationResult`, the SyntaxError rule, `DEFAULT_TIMEOUT_MS`, option names).

Tests (Node environment, `calculatorApi.test.ts`, tier T1), one bullet each:
- `AbortSignal.any` deleted (`vi.stubGlobal` or property delete restored in `afterEach`), no caller signal → `ok: true` for a 200 (native timeout still used).
- `AbortSignal.any` deleted, caller signal given → `ok: true` result; then caller abort mid-flight → `{ kind: 'aborted' }`; then timeout with a stalled fetch → `{ kind: 'timeout' }`.
- `AbortSignal.timeout` deleted → the three outcomes above.
- both deleted → the three outcomes.
- caller already aborted before the call → `aborted`, in native and fallback paths, and the injected fetch is never called in the fallback path (the native path may call fetch; assert only the result there — see the plan review).
- cleanup: counting wrappers on `setTimeout`/`clearTimeout` and on the caller signal's `addEventListener`/`removeEventListener` (fallback path): after success, problem response, network error, timeout and abort every timer is cleared and every listener removed; no pending timers remain after `await`.
- `AbortController` deleted too → `{ ok: false, error: { kind: 'network' } }` and never a rejection.
- timer fires after a caller abort already won: `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` (restored with `vi.useRealTimers()` in `afterEach`; never mixed with MSW's `delay`), an injected `fetch` that ignores the abort and resolves later with a 200; the caller aborts, timers advance past `timeoutMs`, then the fetch resolves → the result is `aborted`, never `timeout` and never `ok` (kills the `!aborted` guard mutation).
- native path kept: with only `AbortSignal.any` deleted and no caller signal, `AbortSignal.timeout` is called (spy) and no `setTimeout` with `timeoutMs` is created.
- cleanup tests use a distinctive `timeoutMs` (4321) and track only `setTimeout` calls with that delay; each returned id must reach `clearTimeout`; every listener added to the caller signal must be removed. Globals are deleted with `Reflect.deleteProperty(AbortSignal, 'any')` (a bare `delete` is a TS2704 error) and restored in `afterEach` (`restoreMocks` in `vite.config.ts` does not restore them).
Mutations (controller, each must fail a test; restore from the scratch copy with `cmp`): fallback branch removed; `release` emptied; `combineSignals` call moved above the `try`; `expired()` negated; `clearTimeout` removed; the `!aborted` guard in the timer removed.
Checks: `pnpm -C frontend exec vitest run src/shared/api` (seconds), directory coverage 100 % (`heavy`), typecheck, lint, format (controller).

### Commit P3 (controller, after both slices and the records)

One commit `fix(ui): label-in-name for AC, xʸ and history rows; client tolerates older engines (UI-FIX-01)` with the product files of P3a and P3b, the records listed above and the run folder; the plan file and the spec amendments go with it (`plan.md` is committed with this P3 commit if not earlier).

## P4 — run-level checks and closure

1. Whole frontend: `typecheck`, `lint`, `format:check`, `test` (about 65 s), `test:coverage` (heavy, 64 s), `build`, `gen:api` twice no diff, `lint:api`; backend: the P1 checks plus `go test -race ./...` once (about 25 s) as a regression guard for the shared package; `scripts/ci/t0.sh --base 31b3443`.
2. Impeccable `audit` on the keypad (critique not needed: no visual change) and `impeccable detect` on `frontend/src/features/calculator/ui` clean.
3. Real browser (ad hoc scripts in `$WF_SCRATCH`, Go service + Vite on the main port block, PIDs recorded): the pieces listed in the spec for UI-FIX-01; measured durations recorded in `evidence/`.
4. Cross-layer trace (step 9) for UC-UI-01: component `KeyButton` → `useCalculator` → `createCalculatorApi.calculate` → `/api/v1/operations/{operation}` route → `calc` (graph `trace_path`), confirmed in the browser with the real API.
5. Security checklist (step 10): client change (no new input surface; reasons never displayed; timers released), log change (client-controlled `method` bounded), dependencies (`pnpm audit`).
6. Review: single level per member, the client change with in-memory probes (a Claude read-only reader + the controller's own mutation checks); a second reader only on the client helper (new code path with timers and listeners).
7. Records and closure per the template: `findings.md`, `closure.md`, evidence under `evidence/`, `tasks/*.md` DONE paragraphs, traceability rows, `reindex.py`, `git mv` to the archive, commit `docs(state): close RUN-M2-0`, `wf backup`.

## What not to touch

`tokens.css` and every CSS file; `openapi.yaml`; the `schema.gen.ts` (must not change); `frontend/package.json` except the two dependency lines and nothing in `engines`/`packageManager`; archived evidence; anything under OPS-STACK-01's, OPS-CI-02's or DOC-README-01's files.

## Review log

Reviewer: independent read-only Claude subagent (sonnet, high), template 2, 2026-10-22. Triage against code and measurements:

| # | Sev | Finding | Triage | Applied |
|---|---|---|---|---|
| P1-1 | P1 | History rows (`Use result 5` vs `2 + 3 = 5`) fail the rule once it runs; `App.test.tsx:147,161` would fail | Confirmed: the reviewer's jsdom probe and the controller's real-browser probe (Chromium: `AC`, `xʸ`, the row) | Spec section 3, U34, files and tests added |
| P1-2 | P1 | The wrapper reads `error` from the wrong object | Confirmed (rule result carries it) | Wrapper reads the rule result; its own test covers the throw |
| P2-1 | P2 | `git checkout -- <file>` after a mutation would destroy uncommitted work | Confirmed | Scratch copy + `cmp` |
| P2-2 | P2 | `context/OBS.md` unowned | Confirmed | Controller, committed with P1 |
| P2-3 | P2 | Native-path and timer-tracking rules dropped from the plan | Confirmed | Restored (timeoutMs 4321, spy on `AbortSignal.timeout`) |
| P2-4 | P2 | Fake-timer test underspecified | Confirmed | Written out |
| P2-5 | P2 | P3a/P3b concurrency (tsc buildinfo, eslint) and start before P2 | Confirmed | Slices limited to vitest/eslint on own files; P3 starts after P2 commit B |
| P3-1 | P3 | Stub details (non-zero data/width, try/finally) | Confirmed | In P3b |
| P3-2 | P3 | Vacuous prefix filter test; list repeated | Confirmed | Literal list in one place; applicable set asserted |
| P3-3 | P3 | Other axe users keep the trap | Confirmed | All component axe tests use the wrapper |
| P3-4 | P3 | Commit plan incomplete | Confirmed | Commit P1/P3 and records stated |
| P3-5 | P3 | Subagent owns a shared record | Confirmed | Records are controller-only |
| P3-6 | P3 | `docs:api` hard-coded output; missing `lint:api`/`outdated`; base inconsistency | Confirmed | Fixed in P2 |

Not found by the reviewer: gaps in the P1 tests, in six of the mutations, in the library behaviour (`openapi-fetch`/MSW do not use the two signal APIs; the canvas can be stubbed), in the 10-minute limit.
