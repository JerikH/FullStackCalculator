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

**Missing:** the new names in the table and everywhere that quotes them; axe's experimental rule `label-content-name-mismatch` is not run anywhere (vitest-axe default rules do not include it) and a browser test pinned the two mismatches (that spec lives in the archived RUN-M1-8 evidence, not in the tree: `frontend/e2e/` does not exist until OPS-E2E-01).

**Design:**
- `keypad.ts`: `AC, all clear` and `xʸ, power`. `keypad.test.ts` fixture follows.
- New component test in `Keypad.test.tsx`: axe over the rendered keypad with `label-content-name-mismatch` enabled (vitest-axe `axe(container, { rules: { 'label-content-name-mismatch': { enabled: true } } })` — if the rule needs the `wcag21a` tag, run with `runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','experimental'] }`; the implementation proves which form executes the rule by a negative control: a keypad with the two old names must produce exactly the two violations). A table test also asserts for every one of the 23 keys that the normalized visible text is the start of the accessible name (case-insensitive, WCAG 2.5.3), independent of axe, so the rule does not depend on a library detail.
- The App-level axe tests (`App.test.tsx`) also enable the rule (they render the full keypad).
- `Calculator.test.tsx` queries follow the new names.
- Documentation records updated in the same commit: `DESIGN.md` names list, `.impeccable/design.json` sample, the surface brief's open note (resolved), `docs/state/context/UI.md` sentence.

### (2) The client tolerates older engines (U29)

**What exists:** `frontend/src/shared/api/calculatorApi.ts:62-94`. `AbortSignal.timeout` and `AbortSignal.any` are called at lines 63-64, outside the `try`; a missing API throws a `TypeError` out of `calculate`, the hook dispatches nothing and the display stays busy. `abortError(signal, timeout)` (line 38) classifies by comparing `signal.reason` with `timeout.reason`. Existing tests (`calculatorApi.test.ts`, Node environment, MSW) cover timeout (`timeoutMs: 50/100`), caller abort, racing abort and stale-response cases and run where both APIs exist.

**Design:** one small exported-for-test-free helper in `calculatorApi.ts` (module-private):

```
interface Combined { signal: AbortSignal; expired(): boolean; release(): void }
function combineSignals(caller: AbortSignal | undefined, timeoutMs: number): Combined
```
- Native path (both `AbortSignal.timeout` and, when a caller signal exists, `AbortSignal.any` are functions): `timeout = AbortSignal.timeout(timeoutMs)`; `signal = caller ? AbortSignal.any([caller, timeout]) : timeout`; `expired = () => signal.reason === timeout.reason` (only asked after `signal.aborted`); `release` is a no-op (the platform owns timer and listeners).
- Fallback path (otherwise): `AbortController`; a caller already aborted aborts it at once with the caller's reason and starts no timer; otherwise a `setTimeout(timeoutMs)` aborts it with a `TimeoutError` DOMException and sets `timedOut` only if it was not already aborted; a `{ once: true }` abort listener on the caller aborts it with the caller's reason; `release` clears the timer and removes the listener. `expired = () => timedOut`.
- `calculate` declares `let combined: Combined | undefined` before the `try`, builds it as the first statement inside the `try`, calls `combined.release()` in a `finally`, and both aborted checks read `combined?.signal.aborted` (a throw while building, e.g. no `AbortController` at all, becomes `{ kind: 'network' }` through the existing catch, never a throw). `abortError` becomes `abortError(combined)` using `expired()`.
- No change to the public type, to `DEFAULT_TIMEOUT_MS`, to `options.signal` semantics, or to any other file.

**Rejected alternatives:** documenting a minimum browser (U29 decided against); polyfilling globally (runtime patching of platform objects, bundle growth); always using the fallback (loses the platform's no-leak timers; a needless divergence between environments).

**Verification (new tests in `calculatorApi.test.ts`, Node environment, each restoring the globals in `afterEach`):** (a) `AbortSignal.any` deleted → result returned (not a rejection) and equals the 200 case; (b) `AbortSignal.timeout` deleted → same; (c) both deleted; (d) in each of (a)–(c) a caller abort is reported `aborted` and a timeout is reported `timeout`; (e) caller signal already aborted before the call → `aborted` without a request being sent in the fallback path as in the native path; (f) no listener or timer left after settle: spy on `setTimeout`/`clearTimeout` and on `signal.addEventListener/removeEventListener` of the caller signal (count of removals equals adds; every created timer cleared) for success, problem response, network error, timeout and abort; (g) both deleted and `AbortController` deleted → `{ ok: false, error: { kind: 'network' } }`, no throw; (h) with both present the existing tests keep passing. Mutations, each killed by at least one test: fallback removed (native only), cleanup removed (`release` empty), `combineSignals` moved back outside the `try`, `expired()` inverted, timer not cleared. Directory coverage 100 % for `src/shared/api` (heavy lease).

**Real-browser pieces (Impeccable `audit` of the keypad plus the UI standard of `CLAUDE.md`, ad hoc Playwright specs in the scratch directory against `go run ./cmd/calculator` + Vite on the main ports, Chromium and Pixel 7):** axe (`@axe-core/playwright`) with the experimental rule enabled on the initial and error states in Light, Dark and System under a dark OS preference, accessible names of the 23 keys read from the browser, `scrollWidth <= clientWidth` at 320, keys ≥ 48 px, focus visible, console clean, CSP clean; `addInitScript` deleting `AbortSignal.any` (and a second run deleting `AbortSignal.timeout`) then `0.1 + 0.2 =` shows `0.3` and not a busy display; `xʸ` reachable by the name `xʸ, power` and `^` still works. Run with a single `timeout 600` per piece.

**Files:** `frontend/src/features/calculator/model/keypad.ts` and `keypad.test.ts`, `frontend/src/features/calculator/ui/Keypad.test.tsx`, `Calculator.test.tsx`, `frontend/src/app/App.test.tsx` (axe rule), `frontend/src/shared/api/calculatorApi.ts` and `calculatorApi.test.ts`; records `DESIGN.md`, `.impeccable/design.json`, `.impeccable/surfaces/frontend-src-features-calculator-ui.md`, `docs/state/context/UI.md`. `tokens.css` and every CSS file untouched.

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

**Files:** `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/Dockerfile`, `.github/workflows/ci.yml.disabled`, `docs/state/context/test-environment.md`.

## Commands at risk for the 10-minute limit (U22)

Every command is wrapped in `timeout 600`; none is expected above 3 minutes: vitest 65 s, coverage 64 s (heavy), `docker build` 41 s cold (heavy), edge smoke about 2 min (one piece, own `timeout 600`), Go package tests about 25 s, Playwright pieces under 1 minute each (one per project and theme group). Leases: `deps` for installs (no tests running meanwhile), `heavy` for coverage and image builds; taken without `--wait`.

## Findings expected (to be written at step 12)

- `note`: typescript 5.9.3 and the jsx-a11y override stay, with the registry evidence (target none; revisit when `openapi-typescript` declares TypeScript 6/7 or `typescript-eslint` ≥ 6.1).
- `rule`: the Node pin 24.22.1 and where it lives; the dependency state after the run.
- `trap`s found during the run, each targeted at an open task when action is needed.

## Review log

(empty — filled at step 4)
