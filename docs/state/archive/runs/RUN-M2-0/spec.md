# RUN-M2-0 — Spec

Solo run in the main checkout. Members: UI-FIX-01, UI-DEPS-01, OBS-LOG-02. Owner decisions that apply: U22 (10-minute limit), U28, U29, U30, U32 (all taken; no question to the owner). Run start commit: `31b3443`.

Questions to the owner (step 1.6): none. Every decision of the three members is recorded (U28–U30, U32) and the dependency findings below were resolved by the rule of U32, not by choice.

Order of work (so each member is tested on the final toolchain): OBS-LOG-02 (Go only, independent) → UI-DEPS-01 (installs under the `deps` lease, no source edits unless a major forces them) → UI-FIX-01 (frontend source, tested on the final toolchain). Commits: one per member, UI-DEPS-01 one per package or compatible group.

## OBS-LOG-02 — Bound the method field of the access log

**Scope:** RF-OBS-05 as amended by U30; RNF-SEC-02; UC-OBS-01. Registered follow-up of OBS-LOG-01 (b).

**What exists** (graph + reading): `backend/internal/platform/httpx/middleware.go:45-54` `logAccess` writes `slog.String("method", r.Method)` raw while `path` and `user_agent` go through `truncateChars(…, maxLoggedChars)` (`maxLoggedChars = 256`, line 24). `truncateChars` (line 60) is rune-aware and allocation-free when the string fits. The metrics label is already bounded separately (`OTHER`), in `observability` (unchanged). `net/http` accepts any token as the method (bounded by the 16 KiB header limit), so a client can put ~16 KiB into every access line.

**What is missing:** the truncation of `method` and its tests. The doc comment of `AccessLog` and of `maxLoggedChars` say «path and user agent»; they must say «method, path and user agent».

**Decisions:** same helper and constant as `path`/`user_agent` (U30), no new constant, `remote_addr` unchanged (U30; its length is bounded by the socket address). Nothing else in `middleware.go` changes. Token characters are ASCII, so rune-vs-byte cannot differ for a valid method; `truncateChars` is still used so the three fields share one rule.

**Verification:** `go test -race -count=1 -cover ./internal/platform/httpx/ ./internal/httpapi/ ./internal/app/` (coverage not below httpx 96.8 %, httpapi 99.0 %, app 98.0 %); tests: 300-character method → 256 characters in the access line; a standard method unchanged; a 256-character method unchanged and a 257 cut; the metrics label of an unknown method stays `OTHER` (existing test is confirmed, one assertion added only if none covers a long method); mutation: truncation removed → the new test fails; `go vet ./...`, `golangci-lint run ./...`; live: built binary, curl over a socket with a 300-character method → logged `method` has 256 characters and the response is the 405 problem.

**Files:** `backend/internal/platform/httpx/middleware.go`, `backend/internal/platform/httpx/middleware_test.go`. Records: `docs/state/context/OBS.md` (the sentence on `path` and `user_agent` gains `method`).

## UI-FIX-01 — Accessible names of AC and xʸ; a client that tolerates older engines

**Scope:** RF-UI-01 as amended by U28, RF-UI-13, RNF-A11Y-01, UC-UI-01; U29 (RNF-REL-01). Registered follow-ups of UI-SCREEN-01 (b), (c).

**Shape (Impeccable, settled task):** mode Operate; surface brief `.impeccable/surfaces/frontend-src-features-calculator-ui.md` unchanged in direction. The only UI change is the text of two `aria-label` values; no CSS, token, layout or visible change. Binding constraints: WCAG 2.5.3 label in name (visible `AC` is the start of `AC, all clear`; visible `xʸ` the start of `xʸ, power`), keypad table stays the single source (RF-UI-01), the other 21 names do not change, the key stays ≥ 48 px. Anti-goals: no visible label change, no `aria-labelledby`/`aria-describedby` indirection, no `title`.

### (1) The two names

**What exists:** `frontend/src/features/calculator/model/keypad.ts:31,36` hold `'all clear'` and `'power'` as `ariaLabel`; `KeyButton.tsx` renders `aria-label={definition.ariaLabel}` over the visible `label`. Consumers of the names (graph + grep): `model/keypad.test.ts:8,13` (the table fixture), `ui/Calculator.test.tsx` (`press(user, 'all clear')` at 307, 319, 400, 546; `press(user, …'power'…)` at 506; `getByRole('button', {name})` matches the full string), `ui/Keypad.test.tsx` (iterates `definition.ariaLabel`, no literal), `hooks/useKeyboardShortcuts.test.tsx` (keys, operation names only, no accessible names — confirmed by grep), `model/selectors.test.ts` and `model/reducer.test.ts` (the word `power` there is the operation name, not the key name: no change), `DESIGN.md:357` (name list), `.impeccable/design.json:619` (sample `aria-label="all clear"`), `.impeccable/surfaces/frontend-src-features-calculator-ui.md:32` (open note about the two names), `docs/state/context/UI.md` (sentence «until it closes the shipped names are…»). The archived M1 browser specs are read-only evidence and are not edited.

**Missing:** the new names in the table and everywhere that quotes them; the rule `label-content-name-mismatch` (axe-core 4.14.0, tags `wcag21a`, `wcag253`; not tagged `experimental`) is enabled by default but never executes in the component tests: in jsdom it needs a canvas `getContext('2d')` that jsdom returns as null, so axe reports it as `incomplete` («Skipping label-content-name-mismatch rule») and `toHaveNoViolations` ignores `incomplete` (review finding P1-1, measured by the reviewer). A browser test pinned the two mismatches (that spec lives in the archived RUN-M1-8 evidence, not in the tree: `frontend/e2e/` does not exist until OPS-E2E-01).

**Design:**
- `keypad.ts`: `AC, all clear` and `xʸ, power`. `keypad.test.ts` fixture follows.
- The rule must actually run in the component tests. A test helper `frontend/src/test/axe.ts` stubs `HTMLCanvasElement.prototype.getContext` with a minimal 2D context (`canvas`, `font`, `measureText`, `fillText`, `clearRect`, `getImageData`) for the duration of a run, restores it afterwards, and exports an `axe` wrapper that also fails when an entry of the result's `incomplete` list for `label-content-name-mismatch` carries an `error` on the rule result (axe 4.14.0 puts `error` there, not on its nodes; «a skipped rule never looks like a pass»); the stub gives `measureText` a non-zero width and `getImageData` non-zero pixel data (an all-zero image makes axe treat every label as an icon ligature and pass it), and is installed and restored inside each call with `try/finally`. The wrapper has its own small test (`axe.test.ts`: it throws for a result carrying such an error, and the real run without the stub is detected). `Keypad.test.tsx` and `App.test.tsx` use it. A negative control proves the rule executes: a keypad rendered with the two OLD names yields exactly two `label-content-name-mismatch` violations (`AC` and `xʸ`), and the new names yield none. The reviewer measured this with the stub: old names → exactly two violations, new names → none.
- A table test independent of axe checks WCAG 2.5.3 only where axe applies it (`isHumanInterpretable`: text that is not a single non-digit character and not only symbols or punctuation). The applicable set is asserted to be exactly `AC`, `xʸ` and the ten digits (so the set cannot widen or shrink silently): their accessible name starts with the visible text. The other 11 keys (`C`, `⌫`, `÷`, `√`, `%`, `×`, `−`, `+`, `=`, `±`, `.`) are not tested for prefix (their names are the RF-UI-01 words); a literal list of all 23 names in `keypad.test.ts` (one place only) guards the table against accidental edits.
- Every component axe test (`Keypad`, `KeyButton`, `Display`, `HistoryPanel`, `ThemeToggle`, `App`) uses the same helper so the skipped-rule trap cannot return anywhere.
- U28's «passes on all 23 keys» is reached in the sense axe defines: zero violations; 12 keys applicable and passing; the 11 single-symbol keys are reported by axe as `incomplete` (not applicable), also in a real browser. The browser piece asserts exactly that (zero violations, the 12 passes, the other 11 incomplete without an `error`) and the run records it as a `note` finding.
- `Calculator.test.tsx` queries follow the new names.
- Documentation records updated in the same commit: `DESIGN.md` names list, `.impeccable/design.json` sample, the surface brief's open note (resolved), `docs/state/context/UI.md` sentence.

### (3) The history rows have the same defect (new, measured in this run — U34)

**Found by:** the plan review (P1-1) and re-measured in a real browser (Chromium, axe-core via `@axe-core/playwright`, `withRules(['label-content-name-mismatch'])`, Go service + Vite, `2 + 3 =` entered): the rule reports `AC`, `xʸ` **and** the history row `<button aria-label="Use result 5">2 + 3 = 5</button>` (10 passes, 11 incomplete). RF-UI-10 and UC-UI-03 step 3 fixed the row name as `Use result <formatted result>`, whose text never contains the visible `12 × 3 = 36`; RUN-M1-8's spec (line 106) recorded it as an accepted deviation and its finding (b) described only the keys. `App.test.tsx:147,161` render a populated history, so the rule would fail them as soon as it genuinely runs.

**Decision U34 (controller, under the owner's standing delegation of 2026-10-22 «take the decisions that give the project the most complete result; fix what is cheap instead of accepting debt»):** the history row's accessible name is `<visible expression>, use result` (for example `12 × 3 = 36, use result`, `√16 = 4, use result`, `1 ÷ 3 ≈ 0.3333…, use result`): the visible text begins the name (WCAG 2.5.3) and the action stays in the name. Rejected: leaving rows out of the rule (U28's goal is the rule enabled and passing in the component and browser checks); changing the visible text (RF-UI-10 fixes it).

**What it changes:** `HistoryPanel.tsx:65` (`aria-label={`${historyExpression(entry)}, use result`}`; `formatEntry` is no longer imported there if nothing else uses it — to be checked by the build), `HistoryPanel.test.tsx` (lines 57–61, 71, 87), `Calculator.test.tsx` (413, 561–606), `App.test.tsx:106`; records: RF-UI-10 and a changelog row in `docs/spec/srs.md`, UC-UI-03 step 3 in `docs/spec/use-cases.md`, U34 in `docs/spec/roadmap.md` (and its changelog row), `PRODUCT.md:38` (binding copy), `DESIGN.md:380`, `.impeccable/design.json:675`. The archived RUN-M1-8 evidence specs keep their old names (read-only history); OPS-E2E-01 queries the new names (registered follow-up in its entry).

**Tests:** the row names follow the rule by a unit assertion over several entries (binary, unary, percentage, inexact, negative with U+2212, scientific): the accessible name equals `${visible text}, use result` and contains the visible text; the populated-history axe tests pass with the rule executing. Browser piece: initial, populated-history and error states.

### (2) The client tolerates older engines (U29)

**What exists:** `frontend/src/shared/api/calculatorApi.ts:62-94`. `AbortSignal.timeout` and `AbortSignal.any` are called at lines 63-64, outside the `try`; a missing API throws a `TypeError` out of `calculate`, the hook dispatches nothing and the display stays busy. `abortError(signal, timeout)` (line 38) classifies by comparing `signal.reason` with `timeout.reason`. Existing tests (`calculatorApi.test.ts`, Node environment, MSW) cover timeout (`timeoutMs: 50/100`), caller abort, racing abort and stale-response cases and run where both APIs exist.

**Design:** one small helper in `calculatorApi.ts` (module-private, not exported):

```
interface Combined { signal: AbortSignal; expired(): boolean; release(): void }
function combineSignals(caller: AbortSignal | undefined, timeoutMs: number): Combined
```
- Native path (both `AbortSignal.timeout` and, when a caller signal exists, `AbortSignal.any` are functions): `timeout = AbortSignal.timeout(timeoutMs)`; `signal = caller ? AbortSignal.any([caller, timeout]) : timeout`; `expired = () => signal.reason === timeout.reason` (only asked after `signal.aborted`); `release` is a no-op (the platform owns timer and listeners).
- Fallback path (otherwise): `AbortController`; a caller already aborted aborts it at once with the caller's reason and starts no timer; otherwise a `setTimeout(timeoutMs)` runs `if (!controller.signal.aborted) { timedOut = true; controller.abort(new DOMException('The operation timed out.', 'TimeoutError')); }` (`abort()` fires its listeners synchronously, and a caller can abort from inside such a listener, so the guard and the flag come before the abort call); a `{ once: true }` abort listener on the caller aborts it with the caller's reason; `release` clears the timer and removes the listener. `expired = () => timedOut`.
- `calculate` declares `let combined: Combined | undefined` before the `try`, builds it as the first statement inside the `try`, calls `combined?.release()` in a `finally` (optional chaining: if building threw, `combined` is undefined and the `finally` must not throw over the catch's `network` result), and both aborted checks read `combined?.signal.aborted` (a throw while building, e.g. no `AbortController` at all, becomes `{ kind: 'network' }` through the existing catch, never a throw). `abortError` becomes `abortError(combined)` using `expired()`.
- No change to the public type, to `DEFAULT_TIMEOUT_MS`, to `options.signal` semantics, or to any other file.

**Rejected alternatives:** documenting a minimum browser (U29 decided against); polyfilling globally (runtime patching of platform objects, bundle growth); always using the fallback (loses the platform's no-leak timers; a needless divergence between environments).

**Verification (new tests in `calculatorApi.test.ts`, Node environment, each restoring the globals in `afterEach`; the production hook always passes a caller signal (`useCalculator.ts:30-32`), so every fallback test passes one):** (a) `AbortSignal.any` deleted, caller signal given → a result is returned (not a rejection) and equals the 200 case; a separate case without a caller signal and only `any` deleted shows the native path is kept (`AbortSignal.timeout` called, no timer created); (b) `AbortSignal.timeout` deleted → same as (a) with a caller signal; (c) both deleted; (d) in each of (a)–(c) a caller abort mid-flight is reported `aborted` and a stalled fetch is reported `timeout`; (e) caller signal already aborted before the call → `aborted` in the fallback path (no timer, injected fetch never called) and in the native path (result only); (f) no leftover: only `setTimeout` calls whose delay equals `timeoutMs` are tracked and each returned id must reach `clearTimeout`; every listener added to the caller signal must be removed (adds ≤ removals counted per signal, never asserting equality for the already-aborted case), for success, problem response, network error, timeout and abort; (g) both deleted and `AbortController` deleted → `{ ok: false, error: { kind: 'network' } }`, no rejection (this guards the client only; the hook creates its own `AbortController` before calling, `useCalculator.ts:30`); (h) the timer fires after a caller abort already won (fake timers) → still `aborted`; (i) with both APIs present the existing tests keep passing. Mutations, each killed by at least one test: fallback removed (native only), cleanup removed (`release` empty), `combineSignals` moved back outside the `try`, `expired()` inverted, `clearTimeout` removed, the `!aborted` guard in the timer removed. Directory coverage 100 % for `src/shared/api` (heavy lease).

**Real-browser pieces (Impeccable `audit` of the keypad plus the UI standard of `CLAUDE.md`, ad hoc Playwright specs in the scratch directory against `go run ./cmd/calculator` + Vite on the main ports, Chromium and Pixel 7):** axe (`@axe-core/playwright`) with the rule `label-content-name-mismatch` run explicitly (`withRules`) on the initial and error states in Light, Dark and System under a dark OS preference, zero violations, 12 keys passing, the 11 single-symbol keys `incomplete` without an `error`, accessible names of the 23 keys read from the browser, `scrollWidth <= clientWidth` at 320, keys ≥ 48 px, focus visible, console clean, CSP clean; `addInitScript` deleting `AbortSignal.any` (and a second run deleting `AbortSignal.timeout`) then `0.1 + 0.2 =` shows `0.3` and not a busy display; `xʸ` reachable by the name `xʸ, power` and `^` still works. Run with a single `timeout 600` per piece.

**Files:** `frontend/src/features/calculator/model/keypad.ts` and `keypad.test.ts`, `frontend/src/features/calculator/ui/Keypad.test.tsx`, `Calculator.test.tsx`, `HistoryPanel.tsx` and `HistoryPanel.test.tsx`, `KeyButton.test.tsx`, `Display.test.tsx`, `frontend/src/shared/theme/ThemeToggle.test.tsx` and `frontend/src/app/App.test.tsx` (every component axe test uses the helper), `frontend/src/test/axe.ts` and `axe.test.ts` (new), `frontend/src/shared/api/calculatorApi.ts` and `calculatorApi.test.ts`; records `DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json`, `.impeccable/surfaces/frontend-src-features-calculator-ui.md`, `docs/state/context/UI.md`, `docs/spec/srs.md`, `docs/spec/use-cases.md`, `docs/spec/roadmap.md`, `docs/state/tasks/OPS.md` (follow-up in OPS-E2E-01). `tokens.css` and every CSS file untouched.

## UI-DEPS-01 — Dependency pins revisited once

**Scope:** U32; RNF-OPS-01, RNF-QUAL-02. Registered follow-up of UI-SCAF-01 (c).

**Facts measured on 2026-10-22 (`pnpm -C frontend outdated`, `npm view`):**

| Package | Pinned | Latest | Decision |
|---|---|---|---|
| `typescript` | 5.9.3 | 7.0.2 (6.0.3 is the last 6.x) | Stays: `openapi-typescript` 7.13.0 (its latest release; dist-tags `latest` 7.13.0, `next` 7.0.0-rc.1 is older) declares `typescript ^5.x`, so 6.x needs a peer override, which U32 excludes; 7.x is outside `typescript-eslint` 8.72.0's `>=4.8.4 <6.1.0`. Reason recorded as a `note` finding with the registry output as evidence. |
| `eslint-plugin-jsx-a11y` override | `eslint-plugin-jsx-a11y>eslint: 10` | plugin 6.10.2 (latest) declares `eslint ^3…^9` | Stays: the plugin does not declare ESLint 10. Recorded in the same note. |
| `jsdom` | 29.1.1 | 30.1.3 (`node ^22.22.2 \|\| ^24.15.0 \|\| >=26`) | Moves, together with the Node pin 24.14.1 → 24.22.1 (latest 24.x LTS, installed with nvm). |
| `@types/node` | 24.19.2 | 26.6.5; 24.x line latest is 24.19.2 | Stays on the Node 24 line (the typecheck must reject Node-26-only APIs): already the latest 24.x release. |
| `@redocly/cli` | 2.69.0 | 2.70.0 | Moves (own commit; `lint:api` and `docs:api` re-run). |
| every other package | latest | latest | `pnpm outdated` lists nothing else. |

**Node pin move (one commit, everywhere at once):** local installation (`nvm install 24.22.1`, default alias), `frontend/Dockerfile` build stage `node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53` (index digest from `docker buildx imagetools inspect`; Alpine 3.24 matches the nginx runtime stage), the `node-version` literal of the `contract` job in `.github/workflows/ci.yml.disabled`, and the toolchain table plus the trap lines of `docs/state/context/test-environment.md`. `packageManager` and `engines` stay (`>=24`). There is no root `Dockerfile` yet (OPS-STACK-01 creates it from the pin recorded here), no `frontend/.node-version` (OPS-CI-02's), and the archived `edge-smoke.sh` keeps its historical pin (archived paths are read-only evidence; OPS-E2E-01/OPS-STACK-01 use the extended copy).

**Source changes forced by jsdom 30:** none expected; if the 40-second component suite shows any, they are listed here before editing (amended spec).

**Verification:** `pnpm -C frontend install --frozen-lockfile` after each change (`deps` lease); `typecheck`, `lint`, `format:check`, `test` (about 65 s), `build`, `gen:api` twice with no diff and no diff to the committed `schema.gen.ts`, `lint:api`, `docs:api` builds (output not committed); `test:coverage` (`heavy`) at 90/90/90/85 or better; for the Node pin: `docker build -f frontend/Dockerfile` under `heavy` and the edge smoke against the stub (about 2 min, using the archived script with `NODE_IMAGE` overridden by the new pin where it takes one), `actionlint` of the workflow; `scripts/ci/t0.sh --base 31b3443`; `pnpm audit --prod --audit-level high`.

**Files:** `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/Dockerfile`, `.github/workflows/ci.yml.disabled`, `docs/state/context/test-environment.md`, `docs/state/context/OPS.md:11` (the build stage line) and the DONE paragraph of OPS-EDGE-01 in `docs/state/tasks/OPS.md:43,50` is history and stays (the new pin is recorded in the DONE paragraph of UI-DEPS-01 and in `context/OPS.md`).

## Commands at risk for the 10-minute limit (U22)

Every command is wrapped in `timeout 600`; none is expected above 3 minutes: vitest 65 s, coverage 64 s (heavy), `docker build` 41 s cold (heavy), edge smoke about 2 min (one piece, own `timeout 600`), Go package tests about 25 s, Playwright pieces under 1 minute each (one per project and theme group). Leases: `deps` for installs (no tests running meanwhile), `heavy` for coverage and image builds; taken without `--wait`.

## Findings expected (to be written at step 12)

- `debt` (target: ask the owner at closure, `OBS-backlog`): the 405 problem `detail` reflects `r.Method` (`httpapi/methods.go:24-26`), which RNF-SEC-02 calls «bounded by the HTTP token grammar» but is really bounded by the 16 KiB header limit (`app.go:90`); out of scope here (U30 names the access log only). The live check of OBS-LOG-02 will echo the 300-character method in the 405 body; that is expected.
- `note`: axe reports the 11 single-symbol keys as `incomplete` for `label-content-name-mismatch` (not applicable), also in a real browser; U28's «passes on all 23 keys» means zero violations.
- `trap`: jsdom cannot run `label-content-name-mismatch` without a canvas stub; axe reports a skipped rule as `incomplete`, which `toHaveNoViolations` ignores (fixed by the helper that fails on it).
- `note`: typescript 5.9.3 and the jsx-a11y override stay, with the registry evidence (target none; revisit when `openapi-typescript` declares TypeScript 6/7 or `typescript-eslint` ≥ 6.1).
- `rule`: the Node pin 24.22.1 and where it lives; the dependency state after the run.
- `trap`s found during the run, each targeted at an open task when action is needed.

## Review log

Reviewer: independent read-only Claude subagent (opus), template 2, 2026-10-22. All findings were triaged against the code; the two P1 were re-measured by the controller (rule tags and the canvas call at `axe.js:37469-37474`, `:21249`).

| # | Sev | Finding | Triage | Applied |
|---|---|---|---|---|
| 1 | P1 | The rule is not experimental and never runs in jsdom (canvas), so it is silently skipped today; `enabled: true` / `runOnly` change nothing | Confirmed | Helper with a canvas stub, failure on a skipped rule, negative control, wording of «experimental» dropped (U28's text is amended in the closure, not rewritten) |
| 2 | P1 | The «every key starts with its visible text» test fails on 10 keys | Confirmed (⌫/backspace etc.) | Applicable set (AC, xʸ, ten digits) asserted exactly; the other keys guarded by a literal list |
| 3 | P2 | «Passes on all 23 keys» is unreachable; 11 keys are `incomplete` in a real browser too | Confirmed | Browser piece asserts zero violations, 12 passes, 11 incomplete; `note` finding |
| 4 | P2 | `finally` calling `combined.release()` would replace the catch result with a `TypeError` | Confirmed | `combined?.release()` |
| 5 | P2 | Test (a) may stay on the native path (no caller signal) | Confirmed (`useCalculator.ts:30-32` always passes one) | Every fallback test passes a caller signal; one extra case keeps the native path |
| 6 | P2 | Test (f) counts unrelated timers and demands add = remove | Confirmed | Track only timers with `timeoutMs`; every add removed, no equality |
| 7 | P2 | The 405 detail reflects the method with the same 16 KiB bound | Confirmed (`methods.go:24-26`, `app.go:90`) | Out of scope (U30); `debt` finding for the owner; live check expectation stated |
| 8 | P3 | Timer ordering ambiguous | Confirmed | Spelled out in the design |
| 9 | P3 | (g) overstates (the hook creates its own AbortController) | Confirmed | Reworded |
| 10 | P3 | Node pin misses `context/OPS.md:11` | Confirmed | Added to the files |
| 11 | P3 | «exported-for-test-free» | Wording | Fixed |

Checked by the reviewer and correct: line references of the three members, coverage baselines, name consumers, the native `expired()` classification, every dependency row and the image digest, no scope creep.

### Plan review (step 6) consequences recorded here

Independent reader: Claude subagent (sonnet, high), 2026-10-22; findings and triage are in `plan.md`'s review log. The ones that change this spec: P1-1 (section 3 above, U34), P1-2 (the `error` is read from the rule result), P3-1 (stub details), P3-3 (every axe test uses the helper).
