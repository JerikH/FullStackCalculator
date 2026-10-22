# Evidence — RUN-M2-2 (OPS-CI-02)

Every command was run from the worktree after `eval "$(.workflow/bin/wf env --export)"` and `source scripts/ci/env.sh` (web 4110, API 4111, project `fullstackcalculator-run-m2-2`), one piece per command under `timeout`, with the `heavy` lease for coverage, fuzz, benchmark, image, smoke and scan pieces. Durations are wall-clock. Worktree commit `994158c` (+ `b772db9` for the review fixes; the image pieces ran at `994158c`, the pieces that the fixes touch were re-run after them).

## Static
| Command | Result |
|---|---|
| `bin/actionlint -shellcheck bin/shellcheck .github/workflows/ci.yml.disabled` | clean |
| `python3 -I scripts/ci/check-workflow.py` | `ok: 30 rules` |
| `bash docs/state/runs/RUN-M2-2/evidence/checker-mutations.sh` | 29 mutations, each CAUGHT by its rule id |
| `bash docs/state/runs/RUN-M2-2/evidence/action-shas.sh` | 5 actions, tag SHA equals the pinned SHA (checkout v7.0.1, setup-node v7.1.0, setup-go v7.0.0, upload-artifact v7.0.2, download-artifact v8.0.2) |
| `scripts/ci/t3.sh --list`, usage errors (unknown job, unknown stage, `--stage` without `--job`, `--job e2e --stage x`, unknown option, repeated `--job`) | listing printed; every usage error exits 2 |
| `bin/shellcheck -x` over every tracked and new `*.sh` (`t3.sh --job contract --stage shell`) | clean |

## Scripts with shims (no registry, no stack)
| Command | Result |
|---|---|
| `bash scripts/ci/publish-tags-test.sh` | 46 cases pass; 3 mutations of `publish-tags.sh` (no ancestry test, a `-rc1` suffix allowed, no tag-commit check) each fail at least one case |
| `bash docs/state/runs/RUN-M2-2/evidence/publish-push-shim-test.sh` | 12 cases pass (order load → inspect → login → exists → tag/push → logout; refusals without docker calls; token never in the log); 3 mutations of `lib.sh` (no image-ID check, token as an argument, no release-version guard) caught |
| `bash docs/state/runs/RUN-M2-2/evidence/e2e-shim-test.sh` | 10 checks pass (order up → chromium → mobile-chromium → disruptive → down; reports kept per run; logs before down; down after every failure); 3 mutations of `lib.sh` (no down after a failure, no logs, reports overwritten) caught |
| `scripts/ci/t3.sh --job backend|frontend --stage coverage-…` with a `make` that fails | stage exits 1 and the job summary still contains the totals |

## Job pieces
| Piece | Result | Time |
|---|---|---|
| `t3.sh --job contract` | pass (Redocly, type drift, docs-api, actionlint + structure, shellcheck of 40 files, publish-tags test) | 14.9 s |
| `--job frontend --stage typecheck --stage lint --stage format --stage audit` | pass; `No known vulnerabilities found` | 22.7 s |
| `--job frontend --stage coverage-frontend --stage build` (heavy) | pass; lines 100 %, statements 99.77 %, functions 99.15 %, branches 100 % (`outputs/job-summary-frontend.md`) | 33.6 s |
| `--job backend --stage modules --stage static --stage govulncheck --stage build` | pass (14 rows) | 24.8 s |
| `--job backend --stage coverage-backend` (heavy) | pass; 98.11 % (782 of 797) (`outputs/job-summary-backend.md`) | 17.7 s |
| `--job backend --stage fuzz` (heavy) | pass | 62.9 s |
| `--job backend --stage bench` (heavy) | pass; every case under budget | 47.8 s |
| `images`: `dockerfiles`, `compose-config` | pass | 0.3 s, 0.2 s |
| `images`: `build-api`, `build-web`, `build-aio` | pass (layers cached) | 5.5 s, 2.2 s, 3.6 s |
| `images`: `smoke-api` | 14 of 14, layers 16,490,496 bytes | 8.9 s |
| `images`: `smoke-edge` (`outputs/edge-smoke-real-service.txt`) | 80 of 80 | 14.6 s |
| `images`: `smoke-edge-stub` (`outputs/edge-stub-smoke-tail.txt`) | 599 passed, 0 failed | 83.3 s |
| `images`: `smoke-aio` | 58 of 58 | 7.6 s |
| `images`: `export` (`images/image-ids.txt`) | 3 archives (5.3, 25.8, 5.6 MB), manifest of 3 lines | 2.3 s |
| `images`: `scan-api`, `scan-web`, `scan-aio` (`images/trivy-*-gate.txt`) | Trivy 0.76.1, 0 HIGH/CRITICAL findings, gate pass | 27 s with the 129 MB database download, then 0.6–1.5 s |
| `images`: `edge-mutations` with `EDGE_MUTATIONS` = `M14`; `MLC MPB`; `M2 M8` (`outputs/edge-mutation-subsets.txt`) | 1 of 1; 2 of 2; 2 of 2 caught (no-inner-hop 503; `limit_conn`; probe body limit; header removed; request id removed) | 84 s; 167 s; 172 s |
| `docker build -f <copy with an empty dist> --target go-build .` (`outputs/root-dockerfile-empty-dist-mutation.txt`) | fails at `RUN test -f internal/web/dist/index.html` | — |
| `make bootstrap` twice; `scripts/bootstrap.sh` with `pnpm` off `PATH` | 2.3 s and 2.1 s, nothing new installed; exit 1 with «pnpm not found: enable it with 'corepack enable pnpm'» | — |
| `make dev-backend` + `make dev-frontend` on 4111 / 4113, stopped by PID | `/healthz` ok; Vite `/` 200; `POST /api/v1/operations/add` through Vite → `0.1 + 0.2 = 0.3` | 2 s to ready |
| `make clean` | `git status` identical before and after; `backend/internal/web/dist` keeps `.gitkeep` | — |
| `scripts/ci/t2.sh --base main` | `integration:make · all 21 targets present`; nothing started | 75 s |
| `pnpm -C frontend exec playwright test --list` | 374 tests in 11 files | 3 s |

## Not run (and why)
- The `e2e` job against a real stack, `make up`, `make e2e`: the wave plan forbids a second local run; proven with shims. (One accidental start through `t1.sh make:up …` is recorded in Findings of OPS-CI-02 (f).)
- The hosted jobs, `publish` against GHCR, the Trivy gate in a hosted runner: gate G1.
