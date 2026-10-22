# Plan — RUN-M2-2 (OPS-CI-02)

Interfaces and rules, no bodies. Spec: `spec.md` (D1–D10). Slices have disjoint owned files; the controller (this session) reviews every diff, runs the checks and commits. At most 1 Codex job and 2 Claude subagents at a time.

## Slice map

| Slice | Executor | Owned files | Depends on |
|---|---|---|---|
| A | controller | `tools/versions.env`, `scripts/ci/install-tools.sh` (Trivy), `frontend/.node-version`, `.github/dependabot.yml` | — |
| B | Codex (background) | `scripts/ci/lib.sh`, `scripts/ci/t3.sh`, `scripts/ci/publish-tags.sh`, `scripts/ci/publish-tags-test.sh`, `scripts/ci/setup-pnpm.sh` | A (Trivy pin names) |
| C | Claude subagent (Sonnet 5.5, high) | `scripts/ci/{image-smoke.sh,edge-smoke.sh,edge-stub-smoke.sh,edge-mutations.sh,stub-upstream.mjs,problem-check.py}` | — |
| D | Claude subagent (Sonnet 5.5, high) | `scripts/ci/check-workflow.py` | E (reads the workflow) and B (`t3.sh --list`) — starts after both exist |
| E | controller | `.github/workflows/ci.yml.disabled` | B's stage names (fixed below, so E is written in parallel) |

## 1. `t3.sh` interface (fixed here; slices B, D, E rely on it)

```
t3.sh [--job <name>] [--stage <name>]… [--keep-going] [--list] [-h]
jobs/stages (default order):
  contract  contract docs-api workflows shell publish-tags
  backend   modules static coverage-backend fuzz bench govulncheck build
  frontend  typecheck lint format coverage-frontend build audit
  e2e       (whole sequence only)
  images    dockerfiles compose-config build-api build-web build-aio smoke-api smoke-edge smoke-edge-stub smoke-aio export scan-api scan-web scan-aio
  images*   edge-mutations   (only by name)
  publish   tags push
```
- `--list` prints one line per job: `<job>: <stage> <stage> …` (stages by name only included after the default ones, marked by a trailing ` +edge-mutations` for the images job) and exits 0 without running anything or needing any tool. The structural check reads it.
- `--stage` is repeatable, in the order given, valid only with `--job`; a stage not in the job's list exits 2 with the list; `--job e2e` rejects `--stage`. No `--job` runs the jobs `contract backend frontend images` in full as today (T3 stays «for CI»; `e2e` and `publish` only by name).
- Exit: 0 all pass; 1 any failure; 2 usage error. The final table (`ci_finish`) is printed for every outcome.
- Stage functions are named `ci_t3_<job>_<stage with - as _>`; `ci_t3_run <job> <stage>` dispatches. Existing `ci_stage_*` (used by t0/t2) keep their behavior; `ci_stage_workflows`/`ci_stage_shell` are reused by `contract/workflows|shell`.

## 2. `lib.sh` additions (slice B)

Helpers: `ci_summary <markdown…>` appends to `$GITHUB_STEP_SUMMARY` when set (otherwise prints nothing); `ci_require_files <label> <path>…` records a `✘` row naming each missing or empty (`-s`) file; `ci_docker_names` sets `CI_API_IMAGE`, `CI_WEB_IMAGE`, `CI_AIO_IMAGE` = `calculator-api:$IMAGE_TAG`, `calculator-web:$IMAGE_TAG`, `calculator:$IMAGE_TAG` after `ci_compose_env`; `ci_smoke_port` = `${WEB_PORT}`; `ci_ghcr_owner` lower-cases `$GITHUB_REPOSITORY_OWNER`.

Stage rules (each a `ci_run` row; a failure stops the job unless `--keep-going`; every long command is `timeout "${CI_STAGE_TIMEOUT:-600}"`):
- `contract/docs-api`: `make docs-api`, then `ci_require_files docs-api docs/api/index.html`. `contract/workflows`: existing actionlint row (named files only) plus `python3 scripts/ci/check-workflow.py` (row `workflows:structure`; needs `python3` with `yaml`, otherwise a `✘` row saying `install python3-yaml`). `contract/shell`: existing shellcheck row over all `*.sh`. `contract/publish-tags`: `bash scripts/ci/publish-tags-test.sh`.
- `backend/modules`: in `backend/`: `go mod download`, `go mod verify`, `go mod tidy -diff`. `backend/static`: the five fmt/vet/lint/vet-embedui/lint-embedui rows of `ci_stage_backend` plus `go test -race -tags embedui ./internal/web/` (all in `backend/`). `backend/coverage-backend`: `make coverage-backend`; require `coverage/backend/{index.html,coverage.out,summary.txt}`; summary block with the content of `coverage/backend/summary.txt` and the threshold line. `backend/fuzz`: `make fuzz`. `backend/bench`: `make bench`; require `coverage/bench/bench.txt`; summary block with the benchmark lines. `backend/govulncheck`: `ci_need backend govulncheck`; the pinned binary on `./...` in `backend/`, then again with `-tags embedui` (rows `backend:govulncheck`, `backend:govulncheck-embedui`). `backend/build`: `go build ./...` and `go build -tags embedui ./...` in `backend/`, two rows named `backend:build` and `backend:build-embedui`.
- `frontend/*`: `pnpm -C frontend run typecheck|lint|format:check|build`; `coverage-frontend`: `make coverage-frontend`, require the three reports, summary block with lines/statements/functions/branches read from `coverage/frontend/coverage-summary.json` with `jq` if present else `python3` (no `node` in the bash). `audit`: `pnpm -C frontend audit --prod --audit-level high`.
- `e2e`: pattern of `t2.sh --stage` (keep-going inside, `up_attempted`, `down` always). Run names `chromium`, `mobile-chromium`, `disruptive`; after each Playwright run (success or failure) `ci_e2e_save <run>` moves `frontend/playwright-report` and `frontend/test-results` into `coverage/e2e/<run>/` (`rm -rf` of the destination first; absent sources are not an error for a startup failure). On any failed row: `ci_e2e_logs` writes `coverage/e2e/logs/{ps.txt,compose.log}` (`docker compose ps -a`, `docker compose logs --no-color --timestamps`, each `timeout 120`, failures ignored but noted). Skipped Playwright stages after a failure are noted, not run. `down` runs `make down` and counts. Env: nothing new; `COMPOSE_PROJECT_NAME`/`WEB_PORT` are whatever the caller exported (the Makefile applies them).
- `images/*`: `dockerfiles` = `ci_stage_dockerfiles --full`; `compose-config` = `docker compose config --quiet` after `ci_compose_env`; `build-api|build-web` = `docker compose build api|web`; `build-aio` = `make image-aio`; `smoke-api` = `scripts/ci/image-smoke.sh "$CI_API_IMAGE" "$VERSION" "$COMMIT" "$((WEB_PORT + 1))"`; `smoke-edge` = `scripts/ci/edge-smoke.sh "$CI_WEB_IMAGE" "$CI_API_IMAGE"`; `smoke-edge-stub` = `scripts/ci/edge-stub-smoke.sh "$CI_WEB_IMAGE"`; `smoke-aio` = `make smoke-aio`; `export`: for each of the three images `docker save <ref> | gzip -n > coverage/images/<name>.tar.gz` (pipefail), `coverage/images/image-ids.txt` lines `<name> <ref> <image id> <COMMIT> <VERSION>`; `scan-<x>` (x = api, web, aio; the archive `coverage/images/<name>.tar.gz` must exist, else `✘ run the export stage first`): `ci_need images trivy`; row 1 `images:scan-<x>:db` = `trivy image --input <archive> --scanners vuln --skip-version-check --format json --exit-code 0 --output coverage/images/trivy-<name>.json` with `TRIVY_DB_REPOSITORY=ghcr.io/aquasecurity/trivy-db:2,public.ecr.aws/aquasecurity/trivy-db:2` exported for the command, retried up to 3 times (a loop around that one row, each attempt printed; three failures fail the stage); row 2 `images:scan-<x>:gate` = `trivy convert --format table --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --output coverage/images/trivy-<name>-gate.txt coverage/images/trivy-<name>.json` (its table goes to the job summary under `### Trivy <name>: fixable HIGH/CRITICAL`); row 3 (never fails the stage, recorded as a `note`) = `trivy convert --format table --severity HIGH,CRITICAL --exit-code 0 --output coverage/images/trivy-<name>-all.txt …`, with a first line saying it is informational: unfixed findings stay visible and are not part of the gate. If Trivy rejects the gzip archive, `export` keeps a plain `<name>.tar` for scanning and gzips only the uploaded copy (the first local scan decides; do not guess). Smoke stages first run `ci_need_cmd <stage> curl jq python3` (a missing command is a `✘` row naming it), the two edge stages also `python3 -c 'import yaml, jsonschema'`. Under `GITHUB_ACTIONS=true` a `VERSION` ending in `-dirty` is a `✘` in every `build-*` stage. `edge-mutations`: `scripts/ci/edge-mutations.sh "$CI_WEB_IMAGE" "${EDGE_MUTATIONS:-}"` (empty = the script's full list).
  Containers/networks created by smoke scripts carry `COMPOSE_PROJECT_NAME`-derived names (the scripts own that) and are removed on exit.
- `publish/tags`: `scripts/ci/publish-tags.sh` with `EVENT_NAME`, `REF`, `SHA` read from the environment (`GITHUB_EVENT_NAME`, `GITHUB_REF`, `GITHUB_SHA` fallbacks); prints the tags; exit 1 prints the reason. It writes nothing that `push` reads. `publish/push`: refuses unless `GITHUB_ACTIONS=true` and `GITHUB_TOKEN` is non-empty (`✘`, no docker call); recomputes the tags with the same function from the same three inputs (failure → `✘`, nothing pushed); `docker load -i` each archive in `$PUBLISH_IMAGES_DIR` (default `coverage/images`); checks each loaded image ID equals the third column of `image-ids.txt` for it (`✘ image <name> differs from the tested image`, before any login); `docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin <<<"$GITHUB_TOKEN"`; for every image × tag `docker tag` then `docker push ghcr.io/$(ci_ghcr_owner)/<name>:<tag>`; the pushed digests go to the summary. The token is never echoed, no `set -x`. The docker binary is whatever is on `PATH` (the shim test relies on it).

## 3. `publish-tags.sh` (slice B)

Sourceable library + CLI. Function `publish_tags <event> <ref> <sha> [main-ref]` prints tags and returns 0, or prints the reason on stderr and returns 1. `main-ref` defaults to `origin/main`. Rules (each has a test in `publish-tags-test.sh`, which builds a scratch repository under `mktemp -d` — never the working repository):
1. `<event>` must be `push`, else fail (`workflow_dispatch`, `pull_request` fail).
2. `<sha>` must match `^[0-9a-f]{40}$`.
3. `refs/heads/main` → `sha-<sha>` and `main`; any other branch ref fails.
4. `refs/tags/<name>`: `<name>` must match `^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`; the tag object must resolve to `<sha>` (`git rev-parse "refs/tags/<name>^{commit}"`); `<sha>` must be an ancestor of `<main-ref>` (`git merge-base --is-ancestor`; a missing `<main-ref>` fails). Output `sha-<sha>` and `<name without v>`.
5. Everything else (empty ref, `refs/pull/…`, `refs/tags/` alone, `refs/tags/v1.2.3/x`, whitespace, newline, `;` or `$(…)` inside the ref) fails; the ref is never evaluated, only matched.
Tests: `v1.2.3` on `main` passes with the two tags; `v0.0.0` and `v10.20.30` pass; `v1.2`, `v1.2.3-rc1`, `v01.2.3`, `v1.2.3+b1`, `1.2.3`, `V1.2.3` fail; a tag whose commit is on a side branch not merged to `main` fails; an annotated tag resolves to its commit and passes; a tag pointing at a different SHA than `<sha>` fails; main push passes with `main` and `sha-…`; branch `feature/x`, `refs/pull/1/merge`, event `pull_request`, event `workflow_dispatch`, a 39-char and an upper-case SHA, a hostile ref `refs/tags/v1.2.3;rm -rf x`, a missing `origin/main` all fail; no test starts docker or the network.

## 4. `setup-pnpm.sh` (slice B)

`scripts/ci/setup-pnpm.sh`: `corepack enable pnpm`; reads `packageManager` from `frontend/package.json` with `node -p` (fails if absent or not `pnpm@…`); `corepack install --global <that value>`; prints `pnpm --version`; bash 5 header like the siblings; shellcheck-clean.

## 5. Promoted scripts (slice C) — see spec D8

Copy then edit only what D8 lists; keep every check text. Specific edits: `image-smoke.sh` header; `edge-smoke.sh` = W3 script with `set -uo pipefail`, args `<web-image> <api-image> [scratch-dir]`, network `${PREFIX}-edge` (created, removed on exit), API container on that network with alias `api` and published on `127.0.0.1:$((WEB_PORT + 1))`, web container with `API_UPSTREAM=api:8081`, `D=http://127.0.0.1:$((WEB_PORT + 1))`, host log follower, `PREFIX=${PREFIX:-${COMPOSE_PROJECT_NAME:-fullstackcalculator-ci}}`, `WEB_PORT=${WEB_PORT:-8080}`, problem checker `$HERE/problem-check.py`, exit status = failures; remove the `ADMIN_ADDR` leftovers. `edge-stub-smoke.sh`: from the RUN-M2-1 `edge-smoke.sh` with `NODE_IMAGE` read from `frontend/Dockerfile` (`awk` on the first `FROM … node:` line; fail if absent), `HERE`-relative `stub-upstream.mjs`/`problem-check.py`, defaults per D8. `edge-mutations.sh`: calls `edge-stub-smoke.sh`. All pass `shellcheck -x` with the existing disables kept and justified. `stub-upstream.mjs` and `problem-check.py` verbatim (path comment fixes only).

## 6. `check-workflow.py` (slice D) — see spec D9

CLI: `check-workflow.py [--workflow PATH] [--dependabot PATH] [--root PATH]`; defaults to the repository's files; prints one line per violated rule `FAIL <rule-id>: <detail>` and exits 1, or `ok: N rules` and exits 0; no network; stdlib + PyYAML. Rule ids are stable strings (listed in the file's docstring) so the mutation checks can name them. Reads `t3.sh --list` through `subprocess` for the job/stage cross-check, `Makefile` target names with a regex over lines `^name:`, `frontend/Dockerfile` and `Dockerfile` for the Node tag, `frontend/.node-version`.

## 7. Workflow (slice E) — see spec D2–D6

Jobs and steps (every `uses:` pinned; `name:` on every step):
- `contract` (10 min): checkout, setup-node (`node-version-file: frontend/.node-version`), `scripts/ci/setup-pnpm.sh`, `pnpm -C frontend install --frozen-lockfile`, `apt-get install python3-yaml` (sudo, `--no-install-recommends`), `install-tools.sh actionlint shellcheck`, then one `t3.sh --job contract --stage X` step per stage, upload `api-reference`.
- `backend` (25 min): checkout, setup-go (`go-version-file: backend/go.mod`, cache on `backend/go.sum`), `GOTOOLCHAIN: local`, `install-tools.sh golangci-lint govulncheck`, steps per stage, uploads `coverage-backend`, `benchmark`, `fuzz-crashers` (each `!cancelled()`).
- `frontend` (20 min): checkout, setup-node, setup-pnpm, frozen install, steps per stage, upload `coverage-frontend`.
- `e2e` (30 min, `needs: [contract, backend, frontend]`): checkout, setup-node, setup-pnpm, frozen install, `pnpm -C frontend exec playwright install --with-deps chromium`, one step `t3.sh --job e2e`, upload `playwright` (`coverage/e2e/`).
- `images` (40 min): checkout (`fetch-depth: 0`, tags), `install-tools.sh hadolint trivy`, `apt-get install python3-yaml python3-jsonschema`, steps per stage, uploads `image-reports` (`coverage/images/*.json`, `*.txt`), and three `images-<name>` archives (7 days).
- `publish` (15 min, `needs` the five, `permissions: contents: read, packages: write`, the `if:` of D5): checkout (`fetch-depth: 0`), download of the three archives into `coverage/images`, step `tags` (env `EVENT_NAME`, `REF`, `SHA` from `github.*`), step `push` (env `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, `GITHUB_REPOSITORY_OWNER`).
Top comment keeps the «rename to enable» header, extended with the job list.

## 8. Dependabot (slice A) — see spec D7

## 9. Checks (run once after the whole build; order; each under `timeout 600`; lease noted)

1. Static (no lease): `bash -n` + `shellcheck -x` of every new script (`scripts/ci/t3.sh --job contract --stage shell`); `actionlint -shellcheck bin/shellcheck .github/workflows/ci.yml.disabled`; YAML parse of both files; `check-workflow.py` (ok), then **mutations of the checker**, one per rule family, each restored (a copy of the workflow in `$WF_SCRATCH`, `--workflow`): unpinned `uses`, missing `persist-credentials`, `packages: write` at top level, `pull_request_target`, a `${{ }}` in a `run`, `publish.needs` missing `e2e`, a missing retention, a duplicated artifact name, an unknown stage, a missing script path, `.node-version` changed, a Dependabot ecosystem removed; each must print its `FAIL` id.
2. Action SHAs (lightweight and annotated tags, dereferenced): `git ls-remote` per action (`timeout 20`), annotated tags dereferenced, compared with the comment version.
3. `t3.sh --list`, usage errors (unknown job, unknown stage, `--stage` without `--job`, `--job e2e --stage x`) exit 2.
4. `publish-tags-test.sh` (all rules above); `t3.sh --job publish --stage push` with a shim `docker` on `PATH` recording calls (load → id check → login → tag → push, no push when an ID differs or the token is absent or `tags.txt` is missing).
5. `t3.sh --job contract` (all stages, about 15 s).
6. Frontend (`deps` lease for the install only): `t3.sh --job frontend --stage typecheck` … one stage per command; `coverage-frontend` and `build` under `heavy`.
7. Backend, one stage per command: `modules`, `static`, `govulncheck` (network), `build` without lease; `coverage-backend`, `fuzz`, `bench` under `heavy`, `bench` alone.
8. Images under `heavy`, one command per stage: `dockerfiles`, `compose-config`, `build-api`, `build-web`, `build-aio` (background, 2–4 min cold), `smoke-api`, `smoke-edge`, `smoke-edge-stub` (2.5 min), `smoke-aio`, `export`, `scan-api` after `install-tools.sh trivy`. One mutation subset of the promoted stub suite to prove the promotion (`EDGE_MUTATIONS="M14" … --stage edge-mutations`, 1.6 min). The empty-`dist` root Dockerfile mutation (`docker build --target go-build` of a copy, must fail at the app assertion).
9. `e2e` job through a `PATH` shim (`make`, `docker`) in `$WF_SCRATCH`: success order `up → e2e chromium → e2e mobile → e2e disruptive → down`; failure in the middle → logs collected, later Playwright stages skipped, `down` runs; failure of `up` → `down` still runs; the report move leaves `coverage/e2e/<run>/`. `t1.sh make:up make:e2e make:down` (the targets exist, nothing runs); `pnpm -C frontend exec playwright test --list` (both projects list their specs).
10. Default `t2.sh` (no stage): starts nothing and prints all 21 Make targets present; `t0.sh --base main` on the branch changes.
11. `wf own check --diff`, `wf conflicts --wave W4`, `git diff --cached --check`, `python3 .workflow/scripts/reindex.py --check`.

Mutation checks of the scripts: publish-tags (drop the ancestry test → the side-branch test fails; widen the regex → `v1.2.3-rc1` test fails); `ci_e2e` (remove the failure-path `down` → the shim test fails); `export`/`push` ID check (drop it → the differing-ID test fails). Each restored before the next.

## 10. What NOT to touch
`frontend/package.json`, `pnpm-lock.yaml`, `Makefile`, `compose.yaml`, Dockerfiles, `scripts/coverage.sh`, `smoke-aio.sh`, `bootstrap.sh`, `env.sh`, `t0.sh`, `t1.sh`, `t2.sh`, `.dockerignore` (unless a promoted script is found inside an image context — it is not), backend and frontend sources, shared records.

## Review log
(filled at step 6)
