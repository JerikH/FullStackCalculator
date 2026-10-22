# Closure of RUN-M1-3 — 2026-10-22

Written by the agent that executed the run (wave W1, worker index 3); applied to the shared state by the integrator, exactly as written. Every item names its target file.

## Commits
| Member | Commit(s) on wf/RUN-M1-3 | Summary |
|---|---|---|
| DOC-ADR-01 | d8cf7b1, 622b36d, b8901d4 | Run spec, spec review + plan, plan review (`docs(state)`) |
| DOC-ADR-01 | 8460cea | `docs(adr): record the eight architecture decisions (RF-DOC-02)` — eight ADRs, the index rows, run-folder evidence and findings |
| DOC-ADR-01 | (this commit) | `docs(state): RUN-M1-3 closure` — `closure.md`, finding (e) |

## Per member

### DOC-ADR-01
- **current.md:** check `DOC-ADR-01`; add 🔎 findings: «Findings of DOC-ADR-01» (a)–(e). Run group row RUN-M1-3 → `done`.
- **tasks/DOC.md — DONE paragraph** (replaces «Open.» of DOC-ADR-01):
  `- [x] **DONE 2026-10-22 (run RUN-M1-3, commit 8460cea; 🔎 findings: «Findings of DOC-ADR-01» (a)–(e)).** Eight ADRs in docs/adr/ — 0001 monorepo with independently deployable services, 0002 decimal arithmetic and decimal strings on the wire, 0003 provider-owned OpenAPI contract, 0004 problem details and status semantics, 0005 standard-library HTTP and consumer-defined interfaces, 0006 server-authoritative arithmetic and a pure reducer, 0007 split and embedded delivery, 0008 observability and drain-aware readiness — on the existing template with status Accepted and date 2026-10-22 (U11), each with concrete context citing RF/RNF IDs, decision, positive and negative consequences and rejected alternatives with reasons; the index table of docs/adr/README.md links all eight. Facts traced to srs.md, the task entries and the contract; spec and plan each had an adversarial review, the ADRs a controller fact check plus one independent review (no P0/P1; 11 P2/P3 fixed). Verified by check_adrs.py (C1–C12: template shape, status/date, sections, consequences, alternatives, link allow-list, wording, index, requirement IDs, path traceability, length) PASS with 0 failures, 25/25 mutation checks caught, out-of-scope term grep 0 matches; evidence in docs/state/archive/runs/RUN-M1-3/evidence/.`
- **traceability.md row(s):** replace the RF-DOC-02 row with `| RF-DOC-02 | ✅ | 8460cea | Targeted tests: check_adrs.py PASS 0 failures, run_mutations.py 25/25, out-of-scope grep 0 matches (2026-10-22) | docs/adr/README.md index + ADRs 0001–0008; planned paths cited as plain text (Findings of DOC-ADR-01 (b)) |`. The UC-DOC-01 row stays ⬜ (README, API reference and verification record are DOC-README-01 and OPS-STACK-01); its notes may say «RF-DOC-02 done (RUN-M1-3)».
- **context/DOC.md additions:** under «Architecture as built»: `- ADRs (RUN-M1-3): docs/adr/0001–0008 + index; shape and link rules in Findings of DOC-ADR-01 (a); re-runnable checks docs/state/archive/runs/RUN-M1-3/evidence/check_adrs.py (run after staging) and run_mutations.py.` Under «Invariants every task inherits»: `- A new or superseding ADR follows the template with ### Positive / ### Negative under Consequences, links only committed files, and is added to the index; an ADR is superseded by a new one (status «Superseded by ADR-NNNN»), never rewritten.` Under «Decisions»: `- U11 — the eight ADRs are Accepted on 2026-10-22, template without an author field.`
- **context/test-environment.md additions:** `- Python evidence scripts: run with python3 -B or stage evidence by name — __pycache__ is not ignored (Findings of DOC-ADR-01 (e)).`
- **methodology.md:** none (DOC epic stays open: DOC-README-01).
- **Spec changes:** none.

## Registered follow-ups for other tasks
- `tasks/DOC.md` → entry `DOC-README-01`: `- Registered follow-up (from DOC-ADR-01): confirm every path the ADRs cite as plain text exists as written once the implementation lands, fix any renamed one, and link only committed files; the README «Design decisions» table reuses the ADR titles of docs/adr/README.md. 🔎 findings: «Findings of DOC-ADR-01» (b)`

## Needs from other tasks (blockers discovered)
- none.

## Targeted checks (the integrator re-runs these after merging)
```
python3 -B docs/state/archive/runs/RUN-M1-3/evidence/check_adrs.py        # after the git mv to archive; PASS, 0 failures
python3 -B docs/state/archive/runs/RUN-M1-3/evidence/run_mutations.py     # 25/25 mutations caught
grep -n -i -E -f <out-of-scope term list from the project instructions> docs/adr/*.md   # 0 matches
```
Both scripts find the repository root with `git rev-parse --show-toplevel`, so they work from the archived folder. C11 also accepts any path that exists in the merged tree, so the merge of RUN-M1-1/RUN-M1-2 can only make it pass more easily.

## Tests and CI changes
- none (documentation only; `scripts/ci/t0.sh --base main` selects no checks for the changed files — evidence/t0.txt).

## Notes for the integrator
- Integration order 1 of W1 (wave plan): docs/adr/ and this run folder only; `wf conflicts --wave W1` reports every pair clean.
- Consumer of «Package and file layout named in ADRs»: the ADRs cite `backend/internal/{calc,httpapi,platform/httpx,observability,config,buildinfo,web,app}`, `backend/cmd/calculator`, `frontend/src/shared/api/schema.gen.ts`, `frontend/src/features/calculator/{model,hooks,ui}/` and the hook name `useCalculator` as plain text, from the task entries. After merging RUN-M1-1 and RUN-M1-2, a path they created under a different name is a one-line ADR fix (Findings of DOC-ADR-01 (b)).
- The out-of-scope grep list is intentionally not committed (Findings of DOC-ADR-01 (c)).
