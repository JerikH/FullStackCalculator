# Permanent context — CALC (Calculation engine)

Created 2026-10-22 by the bootstrap. Read at the start of any task of this epic.

## What this epic covers
RF-CALC-01…RF-CALC-10 (reached through UC-API-01/02). Package `backend/internal/calc`: no HTTP, no JSON, no internal imports.

## Architecture as built
- (nothing yet) — planned: `backend/internal/calc/` (decimal.go, operations.go, calculator.go, errors.go, fuzz and bench tests).

## Invariants every task inherits
- Precision 34, half-even, adjusted exponent [−6143, 6144] (RF-CALC-02).
- Error `.Error()` texts are the exact API details and reasons (RF-CALC-03, RF-CALC-05…09).
- Expectation tables are never edited to match apd; classification or pre-checks are fixed instead.
- A new operation is one catalog entry plus the contract enum; the contract test fails on divergence.

## Decisions
- Go module path `github.com/JerikH/FullStackCalculator/backend`.

## Where to look
- Open debt: `findings/by-owner/CALC.md`
- Topics: `findings/by-topic/numeric-precision.md`, `findings/by-topic/performance-scale.md`
