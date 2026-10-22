# Permanent context — DOC (Documentation)

Created 2026-10-22 by the bootstrap. Read at the start of any task of this epic.

## What this epic covers
RF-DOC-01…RF-DOC-04; UC-DOC-01. README, ADRs, API reference notes, verification record and screenshots.

## Architecture as built
- ADRs (RUN-M1-3): docs/adr/0001–0008 + index; shape and link rules in Findings of DOC-ADR-01 (a); re-runnable checks docs/state/archive/runs/RUN-M1-3/evidence/check_adrs.py (run after staging) and run_mutations.py.
- Planned: `README.md`, `docs/api/README.md`, `docs/verification.md`, `docs/assets/`.

## Invariants every task inherits
- Documentation links point only to committed files; generated `docs/api/index.html` stays ignored (RF-DOC-01, RF-DOC-03).
- Measured numbers name the source revision, toolchain, command and date (RF-DOC-04).
- A new or superseding ADR follows the template with ### Positive / ### Negative under Consequences, links only committed files, and is added to the index; an ADR is superseded by a new one (status «Superseded by ADR-NNNN»), never rewritten.

## Decisions
- U11 — the eight ADRs are Accepted on 2026-10-22, template without an author field.

## Where to look
- Open debt: `findings/by-owner/DOC.md`
- Topics: `findings/by-topic/deployment-infra.md`, `findings/by-topic/live-verification.md`
