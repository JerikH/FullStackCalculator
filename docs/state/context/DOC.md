# Permanent context — DOC (Documentation)

Created 2026-10-22 by the bootstrap. Read at the start of any task of this epic.

## What this epic covers
RF-DOC-01…RF-DOC-04; UC-DOC-01. README, ADRs, API reference notes, verification record and screenshots.

## Architecture as built
- ADRs (RUN-M1-3): docs/adr/0001–0008 + index; shape and link rules in Findings of DOC-ADR-01 (a); re-runnable checks docs/state/archive/runs/RUN-M1-3/evidence/check_adrs.py (run after staging) and run_mutations.py.
- Planned (M2): `README.md`, `docs/api/README.md`, `docs/assets/` (DOC-README-01); `docs/verification.md` is created by OPS-E2E-01 (the recorded composed-stack run and the all-in-one smoke) and completed by DOC-README-01 (coverage totals, benchmark figures, source revisions).

## Invariants every task inherits
- Documentation links point only to committed files; generated `docs/api/index.html` stays ignored (RF-DOC-01, RF-DOC-03).
- Measured numbers name the source revision, toolchain, command and date (RF-DOC-04).
- A figure in the README equals the figure in `docs/verification.md`; RUN-M2-1's evidence is reused only while `git diff --stat <measured revision> -- backend frontend deploy compose.yaml Dockerfile Makefile scripts tools` is empty, otherwise the figure is re-measured as its own piece (U22).
- UC-DOC-01's acceptance is checked by script: links to tracked files only, section order, commands against the repository, curl examples against a running service, catalog and tables equal to their sources.
- A new or superseding ADR follows the template with ### Positive / ### Negative under Consequences, links only committed files, and is added to the index; an ADR is superseded by a new one (status «Superseded by ADR-NNNN»), never rewritten.

## Decisions
- U11 — the eight ADRs are Accepted on 2026-10-22, template without an author field.

## Where to look
- Open debt: `findings/by-owner/DOC.md`
- Topics: `findings/by-topic/deployment-infra.md`, `findings/by-topic/live-verification.md`
