# Plan — RUN-M2-3 (DOC-README-01)

Ordered tasks, owned files, conventions the checks rely on, and the checks. Read `spec.md` first. Documentation only; the code is read-only.

## Tasks and owners

| # | Task | Files (owned) | Who |
|---|---|---|---|
| T1 | README.md in the fixed section order | `README.md` | controller (fact-bound prose, written from the code read at step 2) |
| T2 | `docs/verification.md` completed | `docs/verification.md` | controller |
| T3 | API reference notes | `docs/api/README.md` | controller |
| T4 | ADR path corrections | `docs/adr/0001-monorepo-and-independent-services.md` (+ any ADR the checker flags) | controller |
| T5 | Static checker | `docs/state/runs/RUN-M2-3/evidence/check_docs.py` (+ `check_docs_mutations.py`) | Codex (one background job), from this plan's rules; independent of how the README is written |
| T6 | Curl runner and screenshot script | `evidence/run_curl_examples.py`, `evidence/take_screenshots.mjs` (+ `evidence/README`-less: commands recorded in `evidence/commands.txt`) | Claude subagent (Sonnet 5.5, high), disjoint files |
| T7 | Screenshots | `docs/assets/calculator-desktop.png`, `docs/assets/calculator-mobile.png` | controller runs T6's script |
| T8 | Records | `closure.md`, `findings.md`, run folder evidence outputs | controller |

Order: T1–T4 and T5/T6 in parallel (T5/T6 do not read the README: they take the conventions below). Then run T5 (all rules), T6 runner, T7, `make docs-api`. Fix, re-run only the failing piece, then once more the pieces whose inputs changed.

## README conventions (the checker, the runner and the prose agree on these)

- Only `##` headings are sections; exactly, in order: `Overview`, `Features`, `Quick start`, `Architecture`, `API usage`, `Design decisions`, `Testing & coverage`, `Configuration`, `Observability`, `CI/CD`, `Project layout`, `Trade-offs & future work`. The title `# FullStackCalculator` stays the only `#`.
- Overview shows `docs/assets/calculator-desktop.png` and `docs/assets/calculator-mobile.png` as images (relative paths, alt text).
- Relative links only to tracked files (`git ls-files`); no URL scheme links except `https://` references to public standards (RFC 9457, OpenAPI) are **not used at all** — the README makes no external link (the task: no link to something the repository does not contain). The four RUN-M2-2 paths (`.github/dependabot.yml`, `scripts/ci/image-smoke.sh`, `scripts/ci/edge-smoke.sh`, plus the workflow `.github/workflows/ci.yml.disabled` which is already tracked) appear only as inline code, never as links.
- **Design decisions** table: header `| ADR | Decision | Status |`; each row `| [0001](docs/adr/0001-….md) | <title> | Accepted |`. Equal (number, title, status, file) to the rows of `docs/adr/README.md`.
- **Configuration** table: header `| Variable | Read by | Default | Meaning |`; the first cell is the variable in backticks; the default cell is a backticked value or `—`. Variable set = the set read by `backend/internal/config/config.go` (`get("CALC_*", default)`), `scripts/ci/env.sh` (exports), `compose.yaml` (`${VAR…}` and `environment:` keys), `.env.example` (commented assignments), the `Makefile` (`VAR ?=`, `VAR :=`, `export` list), `frontend/vite.config.ts` and `frontend/src/vite-env.d.ts` (`process.env.*`, `VITE_*`), `frontend/Dockerfile` (`ENV` names) — minus the explicit exclusions `NGINX_ENVSUBST_FILTER` (fixed by the image), `WF_*`, `HOME`, `PATH`, `CI`, `TARGETARCH`, `BUILDPLATFORM`, `REDOCLY_*` and shell-internal names; sources also include `frontend/playwright.config.ts`, `frontend/e2e/**`, `frontend/src/main.tsx` (so `E2E_STACK` and `E2E_COMPOSE_OVERRIDE` are table rows). CALC_* defaults equal the config.go defaults; `WEB_PORT` 8080, `API_UPSTREAM` `api:8081`, `VITE_PORT` 5173, `API_PROXY_TARGET` `http://localhost:8081`, `FUZZTIME` 30s, `COMPOSE_PROJECT_NAME` fullstackcalculator, `CALC_HTTP_ADDR` `:8081`, `CALC_ADMIN_ADDR` `:9091` equal the sources.
- **Problem catalog** table: header `| Code | Status | Title | Emitted by |`; rows in the order of the contract's `ProblemCode` enum; status and title equal `backend/internal/platform/httpx/problem.go` (service codes) and the edge constants in `deploy/nginx/default.conf.template` (`RATE_LIMITED` 429 `Too many requests`, `SERVICE_UNAVAILABLE` 503 `Service unavailable`, `PAYLOAD_TOO_LARGE` is both).
- **Curl blocks** (API usage): a fenced ```` ```bash ```` block with one `curl` command (line continuations with `\` allowed), always with `-H 'X-Request-ID: demo-1'`, against `http://localhost:8080`; immediately after it, a line ``Response `NNN`:`` and a fenced ```` ```json ```` block with the body (for GET `/healthz` and `/readyz` the line says `version` and `commit` depend on the build and the runner compares status and the `status` field only). The runner substitutes the base URL, runs the command with `-sS -o <body> -w '%{http_code}'` semantics (it appends its own `-o`/`-w`, never rewriting anything else), compares the status and the JSON body exactly (object key order ignored).
- **Commands**: every `make <target>` in the README is in `make help`; the command table lists all 21 targets exactly once with one-line purpose equal to `make help`'s wording (case aside).
- **Figures** (the same tokens appear in README «Testing & coverage» and in `docs/verification.md`, both stating revision `5a00a5d`): backend statements `98.11 %` (`782 of 797`); frontend `99.77 %` statements, `100 %` branches, `99.15 %` functions, `100 %` lines, `1342` tests; gates `90 %` backend, `90/85/90/90` frontend; per benchmark case the median ns/op as printed in `evidence/logs/make-bench.txt`'s gate table (grouped with commas), budgets `1,000,000` and `50,000,000`; image sizes `16.5 MB`, `5.3 MB`, `21.8 MB` (API), named layer sum / compressed / `docker images` listing, and `18.0 / 5.6 / 23.7 MB` for the all-in-one image. The checker re-derives the numbers from the RUN-M2-1 log files and the existing verification.md rows, never from the README.
- **Probes and 413**: the `/healthz` block is compared on status and the `status` field only; the 413 example is a pipeline (`printf '%05000d' … | curl … --data-binary @-`), so the runner defines a shell function `curl` that adds `-o <file> -w '%{http_code}'` and runs each block with `bash -c`.
- **Durations**: a README table whose values are copied from `docs/verification.md` (same tokens).
- **Wording**: no occurrence of the terms in the out-of-scope list kept outside the repository; no `TODO`; no URL schemes other than inside curl examples (`http://localhost…`) and the quick-start's `http://localhost:8080`.

## Rules the checker implements (C1–C14), each proven by a mutation

- C1 link targets exist and are tracked (`git ls-files`), anchors exist, image files exist; no link to `docs/api/index.html`, `pre_plan/`, `PROJECT-BRIEF.md`, `.workflow/`, `CLAUDE.md`; applies to `README.md`, `docs/api/README.md`, `docs/verification.md`.
- C2 section order and count of `##` headings in the README.
- C3 Design decisions table = ADR index.
- C4 Configuration table = variables read by the sources (set equality both ways) and defaults.
- C5 Problem catalog = `ProblemCode` enum, status/title/source.
- C6 ADR plain-text paths exist as written (code spans containing `/` or ending in a known extension, with the exclusions of non-paths: MIME types, `host/path` module and library names, Go call forms, JSON fragments).
- C7 Make targets: every `make X` token exists; all 21 targets documented.
- C8 ports and defaults: `8080`, `8081`, `9091`, `5173`, `4110–4123`-style block statements are not in the README; the README ports equal `env.sh` main defaults and `compose.yaml`.
- C9 figures equal across README, verification.md and the RUN-M2-1 raw logs (token list above).
- C10 screenshots: both files exist, are tracked/staged, are PNG (signature), width 1280 × height 800 for desktop (scale 1), Pixel 7 width 412 × scale 2.625 = 1082 px wide for mobile (height ≥ 2000), each under 600 KB.
- C11 hard-rule wording: no `pre_plan`, `PROJECT-BRIEF`, `T[0-9]+` plan ids, `§`, no `(not yet|planned|future|deferred|skipped|removed|out of scope)` outside the Trade-offs section; no `Co-Authored`; no secrets patterns.
- C12 CI/CD section states: `ci.yml.disabled`, the rename to `ci.yml`, the six job names, the four triggers, the publish tags `sha-`, `main`, version, Dependabot weekly; contains no badge (`shields.io`, `actions/workflows/.../badge`) and no `github.io`.
- C13 `docs/api/README.md` names `make docs-api`, `docs/api/index.html` as git-ignored (`git check-ignore`), and does not link it.
- C15 Overview embeds both screenshots with non-empty alt text; Architecture has two fenced diagrams; the README names no registry path and no `env.sh`; plain paths absent on this branch must be in the pending list `.github/dependabot.yml`, `scripts/ci/image-smoke.sh`, `scripts/ci/edge-smoke.sh`, `scripts/ci/edge-stub-smoke.sh`, `scripts/ci/edge-mutations.sh`, `scripts/ci/publish-tags.sh` (reported as pending, not failed); CI/CD states the tags `sha-<full 40-character SHA>`, `main`, `X.Y.Z`.
- C14b the README contains `AC, all clear`, `xʸ, power` and `256 characters`.
- C14 trade-offs section contains the registered follow-up statements (userland proxy / one address; uncompressed bundle; `make up` restores a stopped `api`; each tab keeps its own history and the last writer wins; the exclusions CORS, accounts, expression parsing, distributed rate limiting, localisation).

`check_docs_mutations.py` copies the documents to a scratch directory, breaks one rule at a time (a link, a section swap, an ADR row title, a missing variable, a wrong default, a catalog status, a Make target, a figure digit, a PNG size, a forbidden term, the CI wording, the trade-off statement), asserts each mutation was applied and each run fails with the expected rule id, and restores nothing in the repository (works on copies only).

## Screenshot and curl scripts (T6)

- `take_screenshots.mjs` (assertions per the review: the `.approx` span exists, the value span equals `0.3333333333333333333333333333333333`, the history row reads `1 ÷ 3 ≈ 0.3333333333333333333333333333333333`; blur the summary; `animations: 'disabled'`): arguments `--base http://127.0.0.1:4120 --out <dir>`; imports Playwright from `frontend/node_modules`; two contexts: desktop `{viewport:{width:1280,height:800}, deviceScaleFactor:1, colorScheme:'light'}` and `devices['Pixel 7']` with `colorScheme:'light'`; theme left at System (clears storage first); presses the keys `1`, `/`, `3`, `Enter` through the real keypad (clicks the buttons by accessible name `1`, `divide`, `3`, `equals`); waits for `output` text starting with `≈` and ending in `0.3333333333333333333333333333333333`; desktop: history visible (≥ 768 px); mobile: opens `<details>` by clicking its `summary`; fails on any console error or page error; writes the PNGs with `fullPage: false` for desktop and `fullPage: true` for mobile; prints the sizes. It never starts a server.
- `run_curl_examples.py` (`python3 -B -I`): arguments `--readme README.md --base http://127.0.0.1:4121`; parses the bash/json pairs as above; fails on any mismatch; prints a table of (example, status, ok).
- Controller procedure (not in the scripts): build the app (`pnpm -C frontend build`, copy `frontend/dist` into `backend/internal/web/dist`, `go build -tags embedui -o <scratch>/calc-embed ./cmd/calculator`) under the `heavy` lease; start `calc-embed` with `CALC_HTTP_ADDR=:4120 CALC_ADMIN_ADDR=:4122`; run the screenshot script; stop it by PID; remove the copied files from `backend/internal/web/dist` except `.gitkeep`. Start the plain binary on `:4121` for the curl runner.

## Targeted checks (once each after the build)

```
python3 -B -I docs/state/runs/RUN-M2-3/evidence/check_docs.py                  # seconds
python3 -B -I docs/state/runs/RUN-M2-3/evidence/check_docs_mutations.py        # seconds-minute
python3 -B -I docs/state/runs/RUN-M2-3/evidence/run_curl_examples.py ...       # seconds (service on 4121)
node docs/state/runs/RUN-M2-3/evidence/take_screenshots.mjs ...                # ~30 s (service on 4120)
make docs-api && git check-ignore -q docs/api/index.html                       # ~5 s
python3 -B -I docs/state/archive/runs/RUN-M1-3/evidence/check_adrs.py          # after staging, ADR edits keep their rules
python3 .workflow/scripts/reindex.py --check
git diff --stat 5a00a5d -- backend frontend deploy compose.yaml Dockerfile Makefile scripts tools   # empty
```

Before any of it: `pnpm -C frontend install --frozen-lockfile` under the `deps` lease (no `node_modules` exists in this worktree), then `pnpm -C frontend exec playwright --version` and a browser check.

Nothing in this run needs a migration, a container, `make up`, `make e2e`, an image build or a lease other than `heavy` (builds, screenshot) and `deps` (only if `node_modules` is missing).

## Do not touch

`backend/**`, `frontend/**` (pins, lockfile, sources, tests), `deploy/**`, `compose.yaml`, `Dockerfile`, `Makefile`, `.env.example`, `scripts/**`, `tools/**`, `docs/spec/**`, `docs/state/**` outside this run folder, `.github/**` (RUN-M2-2), the workflow package. The embedded `dist` copy is removed after the screenshots.

## Review log

(filled after the independent plan review)
