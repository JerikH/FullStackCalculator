# RUN-M1-3 — Spec

Run: RUN-M1-3 (wave W1, worker index 3, branch `wf/RUN-M1-3`). Member: **DOC-ADR-01** — Architecture decision records. Implements **RF-DOC-02** (part of UC-DOC-01, whose README walk-through belongs to DOC-README-01).

## Scope (literal)

- **RF-DOC-02:** `docs/adr/` shall hold an index and ADRs 0001–0008 (Context / Decision / Consequences / Alternatives considered): monorepo with independently deployable services; decimal arithmetic and string numbers; provider-owned OpenAPI contract; problem details and the 400/422 split; stdlib `net/http` and consumer-defined interfaces; server-authoritative arithmetic and a pure reducer; split and embedded delivery; observability and drain-aware readiness.
- **Task entry (DOC-ADR-01):** the eight files `0001-monorepo-and-independent-services.md`, `0002-decimal-arithmetic-and-string-numbers.md`, `0003-provider-owned-openapi-contract.md`, `0004-problem-details-and-status-semantics.md`, `0005-stdlib-http-and-consumer-interfaces.md`, `0006-server-arithmetic-and-pure-reducer.md`, `0007-split-and-embedded-delivery.md`, `0008-observability-and-drain-aware-readiness.md`, each with status, date, concrete context, decision, positive and negative consequences and rejected alternatives with reasons; the index table in `docs/adr/README.md` links all eight. Content comes from `srs.md` and the architecture; links only to committed files (or files the roadmap creates, written as plain paths). Verification: every ADR has the four sections; the index links resolve; a grep confirms no reference to anything outside the version 1 scope. Review level: single. No «Registered follow-up» lines on the entry; no linked findings (`findings/by-owner/DOC.md` does not exist; topic files `api-contract` and `deployment-infra` hold nothing addressed to DOC-ADR-01).
- **Owner decision U11:** status «Accepted», date 2026-10-22, on the existing template (no author field).

## What exists (verified)

- `docs/adr/README.md`: heading, the format line «MADR-lite (Context · Decision · Consequences · Alternatives considered)», status values, and an index table with the header `| ADR | Title | Status |` and no rows (RUN-M0-1, commit f2b9693).
- `docs/adr/0000-template.md`: `# ADR-NNNN: Title`, `- **Status:**`, `- **Date:**`, then `## Context`, `## Decision`, `## Consequences`, `## Alternatives considered`.
- Committed product files an ADR may link to: `backend/api/openapi.yaml`, `backend/api/spec.go`, `redocly.yaml`, `docs/spec/srs.md`, `LICENSE`, `PRODUCT.md`, `DESIGN.md`. The code graph of this worktree (indexed at step 2) has only the contract (2 YAML files, 1 Go file); `backend/go.mod` and `frontend/` do not exist yet (they arrive with RUN-M1-1 and RUN-M1-2 of this wave).
- Everything else the ADRs describe (packages `backend/internal/...`, `frontend/src/...`, Dockerfiles, `deploy/nginx/`, `compose.yaml`, `Makefile`) is specified in `srs.md` and created by later roadmap tasks, so it is written as plain code-span paths, never as links.

## What is missing — exactly what this run adds

1. Eight ADR files `docs/adr/0001-…` to `0008-…` (names above).
2. Eight rows in the index table of `docs/adr/README.md`, each linking its file.

Nothing else: no README.md, no `docs/api/`, no code, no change to `srs.md`, the template or the format line.

## Design decisions

1. **Shape of every ADR** — the template, filled: `# ADR-000N: <Title>`, `- **Status:** Accepted`, `- **Date:** 2026-10-22` (U11, no author line). Sections in the template order: `## Context`, `## Decision`, `## Consequences`, `## Alternatives considered`. Because the task asks for positive and negative consequences explicitly, `## Consequences` carries two sub-headings `### Positive` and `### Negative` (the template's «what we must now maintain» is part of Negative). `## Alternatives considered` lists each alternative as a bullet `**<Alternative>** — rejected because …` (at least the alternatives named in the fact sheets of this run's `plan.md`, each with a concrete reason). The `### Positive` / `### Negative` sub-headings are an intended extension of the template: the task asks for both kinds of consequence explicitly, and the four template sections stay unchanged.
2. **Content source** — facts (numbers, strings, names, IDs, paths) come only from committed records: `srs.md`, `use-cases.md`, `roadmap.md`, the task entries `docs/state/tasks/*.md` and the epic context `docs/state/context/*.md` (the package layout and the consumer-defined `Calculator` interface are named there, e.g. `tasks/API.md` entry API-ROUTES-01), plus the committed contract. The controller condenses them into per-ADR fact sheets in `plan.md`; the implementers read only `plan.md` and `srs.md`. Rationale, consequences and the reasons alternatives lost are authored reasoning about those facts. Each ADR cites the RF/RNF IDs it explains and states the concrete numbers it rests on (34 digits, 4096 bytes, `:9091`, 20 r/s burst 40, etc.) — never invented. No measured numbers (benchmarks, coverage, image size) appear: none exist yet, and a stated target (RNF-PERF-01: under 1,000,000 ns/op per benchmark case) is written as a requirement, not a result.
3. **Links** — relative Markdown links only to files committed on this branch (`../../backend/api/openapi.yaml`, `../../backend/api/spec.go`, `../../redocly.yaml`, `../spec/srs.md`, sibling ADRs). Paths the roadmap creates later are plain code spans. No anchors into `srs.md` (heading anchors are renderer-specific); the RF ID is the pointer.
4. **Self-contained wording** (project hard rule) — the ADRs read as a finished project's decisions: no citation of documents outside the repository, no task IDs (only RF/RNF/UC IDs), no section numbers of other documents, no test-tier names, no time limits, no wording suggesting reduced scope. Topology and delivery ADRs describe only the two topologies of version 1 (split compose stack and all-in-one image); the observability ADR describes only what the service exposes (logs, request IDs, Prometheus-format metrics on the admin listener, probes, drain) and names no external monitoring or orchestration product. Rejected alternatives are written as generic classes («a web framework», «a process supervisor», «distributed tracing») or as technologies the decision explicitly compares (binary floats, GraphQL), never as orchestration or monitoring products. CI is described as defined (jobs and what they check), never as running or publishing. «Out of scope» wording, if used, names only the ordinary design exclusions of the Scope section of `srs.md` (CORS, user accounts, expression parsing, distributed rate limiting, localisation).
5. **Index** — rows in numeric order `| [0001](0001-monorepo-and-independent-services.md) | Monorepo with independently deployable services | Accepted |`; the template stays out of the table (it is not a decision).
6. **Titles** (fixed here so index and files agree):
   - 0001 Monorepo with independently deployable services
   - 0002 Decimal arithmetic and decimal strings on the wire
   - 0003 Provider-owned OpenAPI contract
   - 0004 Problem details and status semantics
   - 0005 Standard-library HTTP and consumer-defined interfaces
   - 0006 Server-authoritative arithmetic and a pure reducer
   - 0007 Split and embedded delivery
   - 0008 Observability and drain-aware readiness
7. **Implementation** — two Claude subagents (Sonnet 5.5, effort high; no Codex in this run per the wave plan), disjoint files: A writes 0001–0004, B writes 0005–0008; the controller writes the index rows, the check script and reviews every file against `srs.md`.

## Verification

- `docs/state/runs/RUN-M1-3/evidence/check_adrs.py` (committed evidence script, stdlib Python), run after the ADRs are staged (`git ls-files` lists staged paths): for each of the eight files — exists; first line `# ADR-000N: <title from the index>`; `- **Status:** Accepted` and `- **Date:** 2026-10-22` and nothing else before the first section; the four `##` sections in template order, each non-empty; `### Positive` and `### Negative` under Consequences, each with at least two bullets; at least two alternatives `- **…** — <reason>` with a non-trivial reason; every relative Markdown link resolves to a git-tracked file (no anchors, no directory links); every cited RF/RNF/UC ID exists in `srs.md` or `use-cases.md`; every path-like code span is a tracked file or appears in the committed records of decision 2 (brace groups such as `{model,hooks,ui}` expanded); no scope-reduction or planning wording (a fixed list of ordinary words: deferred, skipped, postponed, descoped, not yet, for now, later version, TODO, TBD, `§`, and plan step numbers). Index: exactly eight rows, in order, each link resolves and its title matches the file's heading; status `Accepted`. Output saved to `evidence/check-adrs.txt`.
- **Out-of-scope terms grep** — the product and file names that version 1 does not build are, by the project's own rule, never written into committed files, so that list is not committed either: the controller greps the ADRs and the index with the project's untracked term list and records only the result (term count and «0 matches») in `evidence/check-adrs.txt`. The integrator re-runs the same grep from the project instructions.
- **Mutation checks** of the script (it must fail): remove a section from a copy, drop the Negative sub-heading, break an index link, insert a forbidden term — each run on a scratch copy of `docs/adr/`, results in `evidence/check-adrs-mutations.txt`.
- **Fact check**: every number, string, path and ID in the ADRs is traced to `srs.md` (or the committed contract) by the reviewer at step 8.
- **T0**: `scripts/ci/t0.sh --base main` (docs-only change; records what the tier runs). `git diff --cached --check` before each commit.
- No T1 integration test applies (no code); the check script and its mutations are this run's T1.

## Files this run touches

`docs/adr/0001-monorepo-and-independent-services.md` … `docs/adr/0008-observability-and-drain-aware-readiness.md` (new), `docs/adr/README.md` (index rows), `docs/state/runs/RUN-M1-3/**` (spec, plan, evidence, findings, closure). Declared with `wf own add`; `wf own check` → «No overlaps.»

## Contracts

Consumer of «Package and file layout named in ADRs» (providers RUN-M1-1, RUN-M1-2): paths come from `srs.md` and the task entries, written as plain text. This run provides no contract; no message is needed.

## Review log

Step 4 — independent read-only Claude subagent (Sonnet 5.5), 11 findings; triage:
1. P1 content source «only srs.md» is false for the package layout and consumer interfaces, and «decision table of the plan» was ambiguous — **accepted**: decision 2 now names every committed record facts may come from (verified: `docs/state/tasks/API.md` entry API-ROUTES-01 names the consumer-defined `Calculator` interface and `backend/internal/httpapi`); decision 1 now points at the fact sheets of this run's `plan.md`.
2. P2 a committed check script listing the not-built product names would itself break the self-contained rule — **accepted**: that grep runs from an untracked list and only its result is committed (Verification).
3. P2 a `T<n>` pattern collides with tier names — **accepted**: the ADRs mention no tiers, and the pattern targets plan step numbers only.
4. P2 alternatives vs banned product names contradicted each other — **accepted**: decision 4 states one rule (generic classes or the compared technologies).
5. P2 link resolution before staging, directory link, anchors — **accepted**: run after staging; directory removed from the linkable list; anchors and directory links fail.
6. P2 the script could not catch invented IDs or paths, trivial reasons, several mutations — **accepted**: ID and path traceability checks added; more mutation cases in the plan.
7. P2 fact traps — **accepted in part**: the draining 503 is Health JSON (added to the 0008 fact sheet; already in 0004). The reviewer's note that the 422 group contains `RATE_LIMITED` is wrong (RF-API-05: `RATE_LIMITED` is 429) — **rejected**.
8. P3 undefined scope-reduction words — **accepted**: the list is explicit.
9. P3 CI wording — **accepted**: CI is described as defined, never as running or publishing.
10. P3 1 ms/op source and a `§` in the spec — **accepted**: RNF-PERF-01 quoted as under 1,000,000 ns/op; `§` removed.
11. P3 Positive/Negative sub-headings extend the template — **accepted** as an intended extension, recorded in decision 1.
