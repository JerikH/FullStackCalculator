# Closure of RUN-M1-8 — 2026-10-22

Written by the agent that executed the run; applied to the shared state by the integrator, exactly as written. Wave W3, branch `wf/RUN-M1-8`, worktree index 2.

## Commits
| Member | Commit(s) on wf/RUN-M1-8 | Summary |
|---|---|---|
| UI-HOOKS-01 | a08c288, 569c43f | `feat(web)`: effect layer (`useCalculator`, `useDelayedBusy`, `useKeyboardShortcuts`, `historyStorage`, `historyId`, `useMediaQuery`), theme (`theme.ts`, `useTheme`, moved and extended `theme-init.test.ts`), typed API fake, controllable `matchMedia`, `CSS.escape` shim |
| UI-SCREEN-01 | 3329e28 | `feat(web)`: `Display`, `Keypad`, `KeyButton`, `HistoryPanel`, `Calculator`, `ThemeToggle`, `App`, the real `main.tsx`, `global.css` tap-highlight reset, `DESIGN.md` and `.impeccable/` refreshed |
| records | ad358f2, fc03eff (spec, plan) and the closing records commit of this branch (last commit) | run folder `docs/state/runs/RUN-M1-8/` (spec, plan, evidence, closure, findings) |

## Per member

### UI-HOOKS-01
- **current.md:** check `UI-HOOKS-01`; add 🔎 findings: «Findings of UI-HOOKS-01» (a), (b).
- **tasks/UI.md — DONE paragraph** (replaces «Open.»):
  `- [x] **DONE 2026-10-22 (run RUN-M1-8, commits a08c288, 569c43f; 🔎 findings: «Findings of UI-HOOKS-01» (a), (b)).** Built frontend/src/features/calculator/hooks/ and frontend/src/shared/theme/: useCalculator (the single calculation effect keyed on [api, state.request] with AbortController, effect-instance flag and the captured request object; failures through toCalculatorError; history persisted only after the first change so a mount, StrictMode replay or corrupt/blocked read never writes), historyStorage and historyId (randomUUID → getRandomValues → counter, never throws, for insecure contexts), useDelayedBusy (150 ms, keyed on the request identity), useKeyboardShortcuts (modifier/prevented/IME/Safari keyCode 229, editable and native-activation guards, realm-independent targets, held operator keys ignored), useMediaQuery, theme/useTheme (persist in the event path, system removes the attribute) and theme-init.test.ts moved with a consistency table against the real script; test support src/test/{calculatorFake,matchMedia,cssEscape}.ts. Verified: 155 hook and theme tests (1,309 in the touched directories, 41 s) under StrictMode with a controllable deferred fake incl. a transport that ignores abort; 22 of 22 production mutations killed (stale guard deleted, rebuilt request object, cleanup abort removed, persist on mount, 150→151 ms, identity→id, spinner wiring cut, each keyboard guard, repeat guard, theme write on mount, …); package coverage 99.76 % statements / 100 % branches / 99.1 % functions / 100 % lines; typecheck, ESLint (0 warnings), Prettier clean; t0 --base main green (55 s). Double review: spec (Claude), plan (Codex, with in-memory probes), second independent reader of the hooks (Codex) 3 P2 + 2 P3 all fixed, security/edge-case review (Claude) 0 P0/P1. Evidence in docs/state/archive/runs/RUN-M1-8/evidence/ (mutations.txt, rule-trace.md).`
- **traceability.md row(s):** `| UI-HOOKS-01 | ✅ | a08c288, 569c43f | Targeted tests: 155 hook/theme tests, 22 mutations killed, coverage 99.76/100/99.1/100 (2026-10-22) | Browser behaviour proven with UI-SCREEN-01 (keyboard, busy, history, theme flows against the real service) |`; update the `UC-UI-01 / …`, `UC-UI-03 / RF-UI-10`, `UC-UI-04 / RF-UI-11` rows with the UI-SCREEN-01 evidence below.
- **context/UI.md additions:** under «Architecture as built»: `features/calculator/hooks/` (RUN-M1-8, Findings of UI-HOOKS-01 (a)): useCalculator is the only place that starts calculation IO; completions carry the captured request object; history persists only after the first change; theme radios are not «editable» for the keyboard hook; held operator keys are ignored; `newHistoryId` never throws. Replace the «Planned: …» line (hooks, ui, theme, app now exist).
- **context/test-environment.md additions:** «Ad hoc real-browser pieces»: `docs/state/runs/RUN-M1-8/evidence/` (archived path after closing) holds `servers.sh start|stop [BASE]` (Go service + Vite for a port block, PIDs recorded), `run-piece.sh <spec> <project>` (copies the specs to `$WF_SCRATCH/e2e` with a `node_modules` symlink, `timeout 600`, writes `results/` and `shots/`), the five specs and `mutations.py`; measured durations: flows 25 s, touch 6 s, layout 20–24 s per project, axe 17 s per project, policy 12 s, web image build 12 s (warm), coverage 41 s, t0 55 s. Traps: see «Findings of UI-HOOKS-01» (b) and «Findings of UI-SCREEN-01» (e).
- **methodology.md:** none.
- **Spec changes:** none required. RF-UI-02 is silent on key repeat: the hook ignores a held operator/equals/sign/AC key (still `preventDefault`ed) and repeats digits, `.`, ⌫ and C; the owner may add a sentence to RF-UI-02.

### UI-SCREEN-01
- **current.md:** check `UI-SCREEN-01`; add 🔎 findings: «Findings of UI-SCREEN-01» (a)–(g).
- **tasks/UI.md — DONE paragraph** (replaces «Open.»):
  `- [x] **DONE 2026-10-22 (run RUN-M1-8, commit 3329e28; 🔎 findings: «Findings of UI-SCREEN-01» (a)–(g)).** Built the calculator screen: Display (persistent role="alert" region, polite atomic output with the ≈ marker and its hidden explanation, digits-only dimming, delayed spinner), Keypad/KeyButton from the single KEYPAD table with finite placement classes and mousedown default-prevention, HistoryPanel (one details, breakpoint-aware open state reset on every crossing, raw-result recall, Clear history refocusing the summary after keyboard use only), ThemeToggle (native radio group), App shell, the real main.tsx (client created once), CSS Modules on the existing tokens (hover tones only under (hover: hover), tap-highlight reset), DESIGN.md and .impeccable/design.json refreshed from the shipped CSS (token table unchanged, contrast.py 0 failing, record check 26/0). Verified: 1,309 tests (vitest-axe zero violations on initial, history, error, light, dark; source-scanning boundaries test); real browser (ad hoc Playwright, Chromium desktop and Pixel 7, real Go service through Vite): all seven operations with exact operands, chaining (2+3×4, 9+16√×2), 0.1+0.2=0.3, 1÷3 with ≈ and 34 digits, 1÷0 with Ref equal to the response X-Request-ID, unreachable and non-problem answers, E5 (delayed response: digits ignored, immediate dimming, spinner after 150 ms, AC aborts, late answer dropped), 35th digit, C vs AC, 12. as 12, history across reload / recall as right operand / mouse recall then Enter / cap 20 / clear, themes incl. light under a dark OS, keyboard native activation; layout 320/393/768/1280 × System/Light/Dark/Light-under-dark-OS × 2 projects (no horizontal overflow, 23 keys + 3 segments + summary ≥ 48 px, focus ring 3px/2px, column widths 360/288 px, display budget at 320 px and 22.5rem with ≈, long accumulator / 128-character Ref / two-34-digit history row); @axe-core/playwright zero violations (initial, populated, error; light and dark; both projects; the experimental label-in-name rule pinned to two keys, Findings of UI-SCREEN-01 (b)); computed contrast of the dynamic states = DESIGN.md; U24 real policy on the web image built from the branch behind nginx (read-only, cap-drop ALL): 4 themes, theme attribute present when <body> appears, zero CSP violations, clean console, axe zero; second identity block side by side (Go service + Vite on 4120–4123 and 4190–4193). Impeccable finish review (3 material fixes, 2 applied) and impeccable detect (files and page) clean. Evidence in docs/state/archive/runs/RUN-M1-8/evidence/ (shots/, results/, second-identity.txt, impeccable-detect.txt, rule-trace.md).`
- **traceability.md row(s):**
  - `| UC-UI-01 / RF-UI-01, RF-UI-02, RF-UI-04, RF-UI-05, RF-UI-06, RF-UI-07, RF-UI-08, RF-UI-09, RF-UI-12, RF-UI-13 | ✅ | …existing…, a08c288, 3329e28 | …existing…; Live (2026-10-22): Chromium + Pixel 7 against the real service, 27 flow checks, layout 48 cases, axe, real nginx policy | the committed E2E suite is OPS-E2E-01 |`
  - `| UC-UI-02 / RF-UI-03, RF-UI-04 | ✅ | …, 3329e28 | …; Live (2026-10-22): digit cap, C vs AC, 12. | — |`
  - `| UC-UI-03 / RF-UI-10 | ✅ | …, a08c288, 3329e28 | …; Live (2026-10-22): reload, recall as right operand, cap 20, clear | — |`
  - `| UC-UI-04 / RF-UI-11 | ✅ | …, a08c288, 3329e28 | …; Live (2026-10-22): persistence across reload, light under a dark OS, arrows, bootstrap before first paint under the real policy | — |`
  - `| RF-UI-14 | ✅ | …, 3329e28 | …; Live (2026-10-22): component styling on the tokens, contrast of dynamic states measured in the browser | token values unchanged |`
  - `| RNF-A11Y-01 | 🟡 | a08c288, 3329e28 | vitest-axe (5 states) and @axe-core/playwright ad hoc (initial/error, light/dark, 2 projects) zero violations (2026-10-22) | the committed @axe-core/playwright E2E is OPS-E2E-01; the label-in-name deviation of two keys is Findings of UI-SCREEN-01 (b) |`
  - `UC-OPS-01` and `RF-OPS-02` rows: change 🟡 → ✅ (acceptance «a Vite dev server and a Go service of each identity side by side» recorded in evidence/second-identity.txt, 2026-10-22).
- **context/UI.md additions:** «Reference screen» is built: the calculator screen of RUN-M1-8 (see «Findings of UI-SCREEN-01» (a) for the rule as built); `src/features/calculator/{hooks,ui}`, `src/shared/theme`, `src/app` now exist; DESIGN.md refreshed from the shipped CSS (RUN-M1-8). Invariants to add: mouse presses on keys, history rows and Clear history never move focus; hover tones only under `(hover: hover)`; the 768 px breakpoint is written in px in CSS and JS; the History summary is refocused only after keyboard activation; accessible names of AC/xʸ per RF-UI-01 (label-in-name deviation).
- **context/test-environment.md additions:** see UI-HOOKS-01.
- **methodology.md:** none (the UI epic closes with OPS-E2E-01's committed suite, the integrator decides).
- **Spec changes:** none.

## Findings to mark resolved by the integrator (`[resolved: <task>]`)
- `Findings of UI-MODEL-01` (b) → `[resolved: UI-HOOKS-01]`; (c) → `[resolved: UI-SCREEN-01]`.
- `Findings of UI-CLIENT-01` (c) → `[resolved: UI-SCREEN-01]`.
- `Findings of UI-BASE-01` (b), (c) → `[resolved: UI-SCREEN-01]`.
- `Findings of OPS-ENV-01` (b) → `[resolved: UI-SCREEN-01]`.
- New open debt of this run is targeted at `UI-backlog` (Findings of UI-SCREEN-01 (b), (c)); the owner decides both (label-in-name names; minimum browsers for `AbortSignal.any`).

## Registered follow-ups for other tasks
- `tasks/OPS.md` → entry `OPS-E2E-01`: `- Registered follow-up (from UI-SCREEN-01): the committed E2E suite can start from the ad hoc specs of RUN-M1-8 (archived evidence: flows, touch, layout, axe, policy, support.ts); wait for the Keypad group after goto, click the label of a theme radio, ignore the browser's «Failed to load resource» message for expected 4xx/5xx, run axe without the experimental label-content-name-mismatch rule and pin it separately. 🔎 findings: «Findings of UI-SCREEN-01» (b), (e)`

## Needs from other tasks (blockers discovered)
- none.

## Targeted checks (the integrator re-runs these after merging)
```
eval "$(.workflow/bin/wf env --export)"; source scripts/ci/env.sh
pnpm -C frontend install --frozen-lockfile            # lease deps; no dependency changed
timeout 600 pnpm -C frontend exec vitest run src/features/calculator src/shared src/app
timeout 600 pnpm -C frontend typecheck && timeout 600 pnpm -C frontend lint && timeout 600 pnpm -C frontend format:check && timeout 600 pnpm -C frontend build
timeout 600 pnpm -C frontend test:coverage            # lease heavy; 99.76 / 100 / 99.1 / 100 at 41 s
python3 docs/state/archive/runs/RUN-M0-1/evidence/contrast.py DESIGN.md --css frontend/src/shared/styles/tokens.css   # 0 failing
python3 docs/state/archive/runs/RUN-M0-1/evidence/check_design_records.py                                           # 26 checks, 0 failures
timeout 600 scripts/ci/t0.sh --base main
# browser (own ports): evidence/servers.sh start; evidence/run-piece.sh flows chromium-desktop; touch mobile-chromium; layout and axe on each project; servers.sh stop
```

## Tests and CI changes
- New suites only inside `frontend/src` (33 test files in the touched directories, 1,309 tests); no change to `scripts/ci/` or the disabled workflows: `src/test/**` changes already make the frontend stage re-check the whole package. `frontend/package.json` and the lockfile are unchanged (no new dependency; U26 not used).

## Notes for the integrator
- Contracts: no root-level file was added to `frontend/public/`, so no `contract` message was needed; the layout of the built app is unchanged (`dist/index.html` loads `/theme-init.js` first, one hashed JS, one hashed CSS, source maps). `backend/` and `deploy/` untouched.
- Embedded-app check after both merges (wave plan «Risks»): `pnpm -C frontend build`, copy `frontend/dist/` into `backend/internal/web/dist/`, `go build -tags embedui`, run, load `/` in Chromium, one calculation, theme bootstrap with zero CSP violations; the screen needs nothing else from the service.
- `DESIGN.md` is 26 KB (above the 25 KB guideline of the refresh); `.impeccable/surfaces/frontend-src-features-calculator-ui.md` is the surface brief (Impeccable file name derived from the primary target).
- Expected conflicts: none predicted (`wf conflicts --wave W3` is clean for this branch); `frontend/src/shared/styles/global.css` gained one rule block (tap-highlight reset) and nothing else shared changed.
- The web image check used `calculator-web:fullstackcalculator-run-m1-8` and the container `fullstackcalculator-run-m1-8-web`; both are removed or stopped (the image stays locally).
