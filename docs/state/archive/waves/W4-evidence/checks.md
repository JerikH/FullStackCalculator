# Wave W4 — integration checks (2026-10-22)

Run on integrate/W4 by the integrator in the main checkout; each command once, none above 3 minutes. Environment from `eval "$(.workflow/bin/wf env --export)"`; the service for the curl examples on ports 4101 (public) and 4103 (admin) of the main block, started from a binary built with `go build -o <scratch>/calc ./cmd/calculator` (0.5 s warm, `heavy` taken and released) and stopped by its PID.

## After the merge of RUN-M2-2 (1b2a5fa)
| Command | Result | Time |
|---|---|---|
| `python3 -I scripts/ci/check-workflow.py` | ok: 30 rules | 0.1 s |
| `bin/actionlint -shellcheck bin/shellcheck .github/workflows/ci.yml.disabled` | clean (exit 0) | 0.1 s |
| `scripts/ci/t3.sh --list` | six jobs with their stages | — |
| `scripts/ci/t3.sh --job contract` | pass (Redocly, type drift, docs-api, workflow lint and structure, shellcheck of every tracked script, publish-tag tests) | 15.2 s |
| `bash scripts/ci/publish-tags-test.sh` | 46 passed, 0 failed | 0.2 s |
| `bin/shellcheck -x scripts/*.sh scripts/ci/*.sh` | clean | 9.8 s |
| `checker-mutations.sh` / `e2e-shim-test.sh` / `publish-push-shim-test.sh` (RUN-M2-2 evidence) | 29 CAUGHT / 10 PASS / 12 PASS | 4.5 s / 0.5 s / 0.8 s |

## After the merge of RUN-M2-3 (1345485) and the README link edits
| Command | Result | Time |
|---|---|---|
| `check_docs.py --terms-file <list of 12 terms outside the repository>` | 16 passed, 0 failed, 0 pending (C11: 0 matches; C15: the six CI paths are links to tracked files) | under 1 s |
| `check_docs_mutations.py` | 40/40 mutations caught | 6.7 s |
| `check_adrs.py` | PASS: 0 failure(s) | 0.8 s |
| `make docs-api`; `git check-ignore -q docs/api/index.html` | written; ignored | 0.8 s |
| `run_curl_examples.py --readme README.md --base http://127.0.0.1:4101` | 20/20 OK | 0.2 s |

## Wave verification
| Command | Result | Time |
|---|---|---|
| `scripts/ci/t2.sh --base main` (default; starts no container) | pass: contract, workflows, shell (every tracked script), typecheck, lint, format, frontend unit tests, build, all 21 Make targets present | 62.4 s |
| `bin/actionlint …`; `bin/shellcheck -x …` after the README and record edits | clean; clean | 0.1 s; 10.6 s |
| `python3 .workflow/scripts/reindex.py --check` | OK | seconds |
| `git diff --stat 5a00a5d -- backend frontend deploy compose.yaml Dockerfile Makefile scripts tools` | only `scripts/ci/**` (not `env.sh`), `tools/versions.env` and the new `frontend/.node-version` | — |
| `git diff --quiet main -- frontend/package.json frontend/pnpm-lock.yaml`; `cat frontend/.node-version` | identical; 24.22.1 (the Node tag of `frontend/Dockerfile` and the root `Dockerfile`) | — |

Not re-run at integration: the image pieces, `make smoke-aio` and the Trivy scan (RUN-M2-2 ran them; `Makefile`, the Dockerfiles, `compose.yaml` and `scripts/smoke-aio.sh` did not change), the composed stack and `make e2e` (one recorded run, OPS-E2E-01).

## Semantic review of the two members together
- Script names: the workflow calls only `t3.sh --job … --stage …`; `lib.sh` maps `smoke-api` to `image-smoke.sh`, `smoke-edge` to `edge-smoke.sh` (real service), `smoke-edge-stub` to `edge-stub-smoke.sh`, the named stage `edge-mutations` to `edge-mutations.sh`, `publish-tags` to `publish-tags-test.sh`; `check-workflow.py` verifies each stage the workflow names is declared by `t3.sh --list`. The README names the same six files.
- `e2e` job commands (`lib.sh`, `ci_t3_e2e`): `make up`; `make e2e E2E_ARGS=--project=chromium`; the same for `mobile-chromium`; `E2E_STACK=1 make e2e` with the disruptive file last; logs on failure; `make down` after every outcome — equal to the Makefile target contract («Run browser tests against the running split stack», `E2E_ARGS` forwarded) and now to the README.
- Image sizes (U31): the README, `docs/verification.md` section 4 and `image-smoke.sh` all read the API image as the layer sum (16,490,496 bytes, 16.5 MB, under 20 MB); the compressed archive sizes of RUN-M2-2 (5.3, 25.8, 5.6 MB) are the third reading and do not contradict section 4.
- Scanner scope: Trivy runs on the three archives with `--ignore-unfixed` for the gate (fixable high and critical) and prints the unfixed ones as information; the README and the verification record say the same.
- Registry path: SRS and roadmap name `ghcr.io/jerikh/fullstackcalculator/<image>`, the workflow pushes `ghcr.io/<owner>/<image>`: registered as «Findings of W4» (c) for the owner; the README names no registry path.
