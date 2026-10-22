# RUN-M1-2 — spec (UI-SCAF-01, UI-CLIENT-01)

Wave W1, agent index 2, branch `wf/RUN-M1-2`. Owner answers that apply: U8 (split of `scripts/ci/lib.sh`), U9 (leases), U10 (package manager and dependency versions).

## Scope (literal)

**UI-SCAF-01** — RF-API-10, RF-UI-11 (`public/theme-init.js`), RF-UI-14 (`tokens.css`, `global.css`, favicon), RNF-QUAL-01 (Vitest coverage thresholds 90/90/90/85), RNF-QUAL-02 (strict TS, ESLint `strictTypeChecked` + react-hooks + jsx-a11y, Prettier), RNF-SEC-03 (no inline script in `index.html`). Package `calculator-web` (pnpm 10 via `packageManager`, Node ≥ 24), `@/` alias, scripts (`dev`, `build`, `preview`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:watch`, `test:coverage`, `gen:api`, `lint:api`, `e2e`), `safeStorage`, `cx`, test setup, Vite dev proxy `/api` → `API_PROXY_TARGET` (default `http://localhost:8081`) on `VITE_PORT` (default 5173). Temporary `main.tsx`. Registered follow-ups:
- F1 (Findings of UI-BASE-01 (a)): `tokens.css` from DESIGN.md — light focus `#b45309`, `--color-focus: #f59e0b` declared in both dark blocks, `--color-display-danger` in all three blocks — proved by `contrast.py --css`.
- F2 (Findings of OPS-CI-01 (b)): `@redocly/cli` 2.69.0 in the frontend lockfile; the contract stage of `scripts/ci/lib.sh` runs `pnpm -C frontend lint:api`; the CI `contract` job installs the frontend first; `REDOCLY_CLI_VERSION` leaves `tools/versions.env`.
- F3 (Findings of OPS-CI-01 (c)): run `scripts/ci/t0.sh` on the scaffold and fix the frontend stage (package scripts it calls, ESLint `--no-warn-ignored --max-warnings=0`, `vitest related` with no related test, distinguished without `--passWithNoTests`).
- F4 (Findings of OPS-CI-01 (i)): `lint:api` and `docs:api` run Redocly with `REDOCLY_TELEMETRY=off REDOCLY_SUPPRESS_UPDATE_NOTICE=true`.

**UI-CLIENT-01** — RF-UI-09; the error kinds consumed by RF-UI-08. `frontend/src/shared/api/` (`types.ts`, `problem.ts` with `PROBLEM_CODES` and `isProblem`, `calculatorApi.ts`, `apiContext.ts`, `CalculatorApiProvider.tsx`, `index.ts`). The `openapi-fetch` client receives `fetch: (request) => globalThis.fetch(request)`. Registered follow-up:
- F5 (Findings of API-CONTRACT-01 (b)): the generated `Problem` requires `detail` and `requestId`; `isProblem` checks both are strings and the problem result copies them without `undefined` checks (`detail?`/`requestId?` stay optional in the client's own `ApiError`).

Requirement text used (from `docs/spec/srs.md`):
- RF-API-10: types generated with `openapi-typescript` into `frontend/src/shared/api/schema.gen.ts`, committed; regenerating produces no diff.
- RF-UI-09: typed from the generated schema (`openapi-fetch`), never throws, times out after 8 s (`AbortSignal.any` of caller signal and timeout), returns `ok` or one of `problem(status, code, title, detail?, requestId?)`, `network`, `timeout`, `aborted`, `unexpected(status?)`; a non-2xx body is a problem only if it passes `isProblem`; base URL `VITE_API_BASE_URL || window.location.origin`; one instance injected through React context.
- RF-UI-08 (consumer): the client must distinguish network failure, timeout and each problem code, and carry `requestId`.
- RF-UI-11: `/theme-init.js`, external and blocking in `<head>`, applies `localStorage["calculator.theme.v1"]` (`light`/`dark` → `data-theme`; anything else → no attribute) before first paint, no inline script.
- RF-UI-14: tokens in `frontend/src/shared/styles/tokens.css`, system font stack, the palette, dark overrides under both `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`, favicon 32×32 accent rounded square with a white `=`; no UI library, icon system or runtime styling.
- RNF-QUAL-01/02, RNF-SEC-03 as quoted in the task entries.

Out of this run: every screen (UI-SCREEN-01), the model (UI-MODEL-01), hooks and `shared/theme` (UI-HOOKS-01), Playwright config and specs (OPS-E2E-01), the full CI workflow (OPS-CI-02).

## What exists

- `frontend/` does not exist. `backend/api/openapi.yaml` (frozen for the wave) and `redocly.yaml` exist; `ProblemCode` has 13 values, `OperationName` 7, `Problem.required` = `type, title, status, detail, code, requestId`, `instance` and `errors` optional, no `additionalProperties: false` on `Problem`.
- `scripts/ci/lib.sh`: `ci_stage_contract` runs Redocly through `pnpm --package=@redocly/cli@$REDOCLY_CLI_VERSION dlx` from the repository root (lib.sh:167-176); `ci_stage_frontend` (lib.sh:268-300) has never run; `ci_is_contract` matches only `openapi.yaml`/`redocly.yaml` (lib.sh:133); `ci_partition` (lib.sh:301-312) also adds contract paths to the backend stage. Callers: `t0.sh`/`t2.sh` (`ci_partition` + `ci_selected_stages`), `t3.sh` (`--job contract|frontend`).
- `tools/versions.env` ends with `REDOCLY_CLI_VERSION=2.69.0`; its only reader is `ci_stage_contract` (grep).
- `.github/workflows/ci.yml.disabled`: one `contract` job (Node 24.14.1, `corepack install --global pnpm@10.33.0+sha512.…`, installs actionlint/shellcheck, `t3.sh --job contract`).
- `DESIGN.md` frontmatter is the normative token list (23 colour tokens in light and dark); `contrast.py` in `docs/state/archive/runs/RUN-M0-1/evidence/` checks the CSS with `--css`.
- Toolchain: Node 24.14.1, pnpm 10.33.0 (nvm), Playwright 1.62.1 with Chromium.

## Design decisions

D1 — **Dependency versions (U10 under declared constraints).** Each dependency at its latest stable release whose declared peer ranges and Node engine range are satisfied by the rest of the set on the pinned runtime (Node 24.14.1 locally and in CI). Four packages cannot take their absolute latest:
- `typescript` 5.9.3: `typescript-eslint` 8.72.0 declares `typescript >=4.8.4 <6.1.0` and `openapi-typescript` 7.13.0 declares `^5.x`; 5.9.3 is the newest release satisfying both (6.0.3 breaks the second, 7.0.2 both).
- `eslint` and `@eslint/js` 9.39.5: `eslint-plugin-jsx-a11y` 6.10.2 (latest, required by RNF-QUAL-02) declares `eslint ^3 … ^9`.
- `jsdom` 29.1.1: jsdom 30.x declares `node ^22.22.2 || ^24.15.0 || >=26`, above the pinned 24.14.1.
- `@types/node` 24.19.2: the type definitions follow the runtime major (Node 24), so code using an API that Node 24 lacks fails the typecheck; the Vite template makes the same choice.
Everything else at its latest (vite 8.3.5, react/react-dom 19.3.1, @vitejs/plugin-react 6.1.2, openapi-fetch 0.17.0, openapi-typescript 7.13.0, @redocly/cli 2.69.0, vitest/@vitest/coverage-v8 5.0.5, msw 3.0.3, @testing-library/react 16.3.3, user-event 14.6.8, jest-dom 7.0.1, dom 10.4.2, vitest-axe 0.1.0, @playwright/test 1.64.1, @axe-core/playwright 4.14.0, @types/react(-dom) 19.3.0, typescript-eslint 8.72.0, eslint-plugin-react-hooks 7.1.1, eslint-plugin-react-refresh 0.5.7, eslint-config-prettier 10.1.8, globals 17.13.0, prettier 3.9.10). Versions are exact in `package.json` (no ranges): the lockfile is authoritative and Dependabot bumps both. `packageManager` is `pnpm@10.33.0+sha512.<same hash as the workflow>`; `engines.node` is `>=24`.

D2 — **Files written directly, not through `create-vite`.** The template is replaced almost entirely; its Vite 8 conventions are kept (`types: ["vite/client"]`, `tsBuildInfoFile` under `node_modules/.tmp`, `moduleDetection: force`, `erasableSyntaxOnly`, `tsconfig.json` with two references). `baseUrl` is not set (TS 6 deprecates it; `paths` works without it).

D3 — **Vite config.** `server.port` from `VITE_PORT` (integer 1–65535, else the config throws with a message; default 5173) with `strictPort: true`, so a worker never drifts onto another agent's port; proxy `/api` → `API_PROXY_TARGET ?? 'http://localhost:8081'`. Build `target: 'es2022'`, `sourcemap: true`. Vitest block as the plan (jsdom, `src/**/*.test.{ts,tsx}`, `restoreMocks`, coverage v8 into `../coverage/frontend` with reporters `text, html, lcov, json-summary`, thresholds lines/statements/functions 90 and branches 85; excluded: tests, `src/test/**`, `schema.gen.ts`, `main.tsx`, `vite-env.d.ts`).

D4 — **ESLint.** Flat config through `defineConfig` from `eslint/config` (the plan's `tseslint.config` helper is deprecated; same content): `js.configs.recommended`, `tseslint.configs.strictTypeChecked` + `stylisticTypeChecked`, `jsxA11y.flatConfigs.recommended`, the react-hooks flat recommended preset, `reactRefresh.configs.vite`, rules `consistent-type-imports`, `switch-exhaustiveness-check`, `restrict-template-expressions` (allowNumber), then `eslint-config-prettier`. Two additions so no linted file falls outside a configuration: `eslint.config.js` gets `js.configs.recommended` with Node globals; `public/theme-init.js` is linted (not ignored, unlike the plan) as an ES5 classic script with browser globals and `no-unused-vars` `caughtErrors: 'none'` (ES5 needs the catch binding). Ignored: `dist`, `coverage`, `playwright-report`, `test-results`, `schema.gen.ts`.

D5 — **Theme bootstrap and HTML.** `index.html` and `public/theme-init.js` as the plan. The build keeps `<script src="/theme-init.js">` un-bundled (classic script in `<head>`). Verified on `dist/index.html`: no `<script>` without `src`, no `<style>` element, no `style=` attribute, and `/theme-init.js` in `<head>` before the module script.

D6 — **Tokens** (F1). `tokens.css` = the plan's file with DESIGN.md values: adds `--color-display-danger: #ff8a80` to all three blocks, light `--color-focus: #b45309`, `--color-focus: #f59e0b` in both dark blocks. `global.css` as the plan. Proof: `contrast.py DESIGN.md --css frontend/src/shared/styles/tokens.css` exits 0.

D7 — **Generated types** (RF-API-10). `gen:api` as the plan. Drift is enforced, not only claimed: the contract stage gains `contract:types`, which regenerates to stdout through Prettier (`--stdin-filepath src/shared/api/schema.gen.ts`, so the project config applies) and `diff`s against the committed file, without writing the working tree. The plan's «`OperationName` union matches the contract» is checked by a type-level test in the client tests (D10).

D8 — **Contract stage switch** (F2, F4, U8). `lint:api` = `REDOCLY_TELEMETRY=off REDOCLY_SUPPRESS_UPDATE_NOTICE=true redocly lint ../backend/api/openapi.yaml --config ../redocly.yaml`; `docs:api` with the same variables. `ci_stage_contract`: needs pnpm, then `frontend/node_modules` (missing → `ci_problem contract 'run pnpm -C frontend install --frozen-lockfile'`), runs `pnpm -C frontend run lint:api` and `contract:types`. The stage is also selected when `frontend/package.json`, `frontend/pnpm-lock.yaml` or `frontend/src/shared/api/schema.gen.ts` change (they decide the Redocly/openapi-typescript versions or the generated output); these paths go to the contract stage only, not to the backend stage (`ci_partition` keeps adding only `openapi.yaml`/`redocly.yaml` to the backend). `REDOCLY_CLI_VERSION` and its comment leave `tools/versions.env`. The `contract` job adds `pnpm -C frontend install --frozen-lockfile` before `t3.sh --job contract`. RUN-M1-1 is told once when this lands (wave contract «Contract lint entry point»).

D9 — **Frontend stage** (F3). Targeted mode: typecheck always; ESLint and Prettier on the touched files as today; Vitest: when a file that changes every test's environment is touched (`package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig*.json`, `src/test/**`), `vitest run` (all tests); otherwise the stage lists the tests related to the touched source files (`vitest list --filesOnly --related` or the equivalent the installed version offers) and runs `vitest related --run` only when that list is non-empty, else notes `no related tests`. A failure of the listing itself fails the stage (no `--passWithNoTests`, nothing swallowed). Full mode (`t2`/`t3`) unchanged plus `frontend:build` (`pnpm -C frontend run build`) so the build is part of the CI-equivalent suite.

D10 — **API client** (RF-UI-09, F5). The plan's types, `problem.ts`, `calculatorApi.ts`, context and provider, with these deviations:
- `isProblem` checks every required field of the generated `Problem` (`type`, `title`, `detail`, `requestId` strings; `status` an integer 400–599; `code` ∈ `PROBLEM_CODES`) and, when present, `instance` (string) and `errors` (array of `{field: string, reason: string}`), so `value is Problem` is sound. The problem result copies `detail` and `requestId` unconditionally (F5); `ApiError` keeps them optional.
- The `ApiError.problem.status` is the body's `status` (plan), which `isProblem` constrains to 400–599.
- Success bodies are guarded too: a 2xx is `ok` only when the body is a `CalculationResult` for the requested operation (`operation` equal to the requested one, `operands` an array of strings, `result` a string, `inexact` a boolean); anything else (including an empty or 204 body) → `unexpected(status)`. Without this, a 2xx with a body the UI cannot show would reach the display as `ok`.
- Failure classification: the per-request `fetch` records the response status. In the `catch`: the caller's signal aborted → `aborted`; else the timeout signal aborted → `timeout`; else a response was received and the error is a `SyntaxError` (an unparsable 2xx body) → `unexpected(status)`; else → `network`. Caller abort wins over timeout when both fired.
- `PROBLEM_CODES` keeps the compile-time two-way check (`satisfies readonly ProblemCode[]` against extra codes, an `Exclude` against missing ones).
- `createCalculatorApi` copies `operands` (`[...operands]`) into the body and never mutates caller data.
- `useCalculatorApi` outside the provider throws a programming error (it is not an API call; the never-throw rule covers `calculate`).

D11 — **Placeholder page.** `main.tsx` renders `<main><h1>Calculator</h1></main>` with `global.css`; it is replaced by UI-SCREEN-01. No Impeccable shape for it (no surface is designed in this run); `impeccable detect` runs on the touched UI files as the T0 check, and the browser check confirms the theme bootstrap on the built `dist/` served with the exact RNF-SEC-03 policy header (a static server in the run evidence, not product code; the service and the edge that send it in production come later) and the token switch in light, dark, system-dark and light-under-dark-OS, with zero CSP violations.

## Files

Created: `frontend/package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `index.html`, `public/theme-init.js`, `public/favicon.svg`, `src/main.tsx`, `src/vite-env.d.ts`, `src/shared/styles/tokens.css`, `src/shared/styles/global.css`, `src/shared/storage/safeStorage.ts` (+ test), `src/shared/ui/cx.ts` (+ test), `src/shared/api/schema.gen.ts`, `src/test/setup.ts`, `src/shared/api/{types.ts, problem.ts, problem.test.ts, calculatorApi.ts, calculatorApi.test.ts, apiContext.ts, CalculatorApiProvider.tsx, CalculatorApiProvider.test.tsx, index.ts}`.
Changed: `scripts/ci/lib.sh` (`ci_is_*`, `ci_partition`, `ci_stage_contract`, `ci_stage_frontend`; never `ci_stage_backend`), `tools/versions.env`, `.github/workflows/ci.yml.disabled`.
Run folder: `docs/state/runs/RUN-M1-2/` (spec, plan, findings, closure, evidence).

## Verification

- T0: `scripts/ci/t0.sh --base main` on each commit (contract, workflows, shell and frontend stages); `actionlint` on the disabled workflow; `shellcheck` on `lib.sh`.
- UI-SCAF-01: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build`; `dist/` checks of D5; `pnpm gen:api` twice → no diff, and `contract:types` failing on a hand-edited `schema.gen.ts` (mutation); `contrast.py --css` exit 0 and failing with a dark-block `--color-focus` removed (mutation); `t3.sh --job contract` and `--job frontend`; `REDOCLY_CLI_VERSION` has no reader; Vite dev server on this agent's `VITE_PORT` (4123) proxying `/api` to `API_PROXY_TARGET` (4121, a stub listener since the Go service is not built yet) and refusing an occupied port.
- UI-CLIENT-01: `pnpm vitest run src/shared/api` in the Node environment with MSW — success; every one of the 13 problem codes; malformed problem bodies (unknown code, missing/ non-string `detail`/`requestId`/`type`/`title`, status out of range or a string, malformed `errors`) → `unexpected`; non-JSON error body; malformed and empty 2xx bodies; network failure; timeout; caller abort before and during the call; abort winning over timeout; operands not mutated; provider/hook in jsdom. Mutation checks: guard accepting unknown codes → the malformed-problem test fails; guard skipping `requestId` → its test fails; catch classifying abort as network → the abort test fails.
- Browser (T1): Playwright ad hoc (Chromium desktop and Pixel 7) on `dist/` served with the RNF-SEC-03 headers: the placeholder renders, `/theme-init.js` sets `data-theme` from storage before the app script, the page background follows light/dark/system-dark and light under a dark OS preference, invalid stored values and blocked storage leave the attribute absent, the favicon loads, no console errors and no CSP violations; widths 320/393/768/1280 without horizontal scroll.
- Coverage: `pnpm test:coverage` under the `heavy` lease.

## Review log

(filled at step 4)
