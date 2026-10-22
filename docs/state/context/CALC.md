# Permanent context — CALC (Calculation engine)

Created 2026-10-22 by the bootstrap. Read at the start of any task of this epic.

## What this epic covers
RF-CALC-01…RF-CALC-10 (reached through UC-API-01/02). Package `backend/internal/calc`: no HTTP, no JSON, no internal imports.

## Architecture as built
- backend/internal/calc (RUN-M1-1): decimal.go (Parse, Format, operand sentinels), errors.go (math/arity sentinels, OperandError, InvalidOperandsError, classify, Outcome), operations.go (catalog, pre-checks, power classification, exactness checks), calculator.go (New, Operations, Has, Calculate, flush below the range), fuzz and benchmark tests.

## Invariants every task inherits
- Precision 34, half-even, adjusted exponent [−6143, 6144] (RF-CALC-02).
- Error `.Error()` texts are the exact API details and reasons (RF-CALC-03, RF-CALC-05…09).
- Expectation tables are never edited to match apd; classification or pre-checks are fixed instead.
- A new operation is one catalog entry plus the contract enum; the contract test fails on divergence.
- Parse returns the reduced value; validation order is decided from the operand text, never by apd's parser (it fails on int32 exponents first).
- Every result is a valid operand: results below adjusted exponent −6143 flush to 0 (inexact), above the range are OVERFLOW.
- apd's flags are not trusted where measured wrong: Pow failures are classified from the operands; inexact is recomputed for exact fractional powers (bounded) and 1^y.

## Decisions
- Go module path `github.com/JerikH/FullStackCalculator/backend`.
- Worst-case fractional powers cost up to about 13 ms (Findings of CALC-OPS-01 (c), owner decision pending in CALC-backlog; it also bears on ADR 0002, Findings of W1 (c)).

## Where to look
- Open debt: `findings/by-owner/CALC.md`
- Topics: `findings/by-topic/numeric-precision.md`, `findings/by-topic/performance-scale.md`
