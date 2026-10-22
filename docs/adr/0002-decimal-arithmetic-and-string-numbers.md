# ADR-0002: Decimal arithmetic and decimal strings on the wire

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

A calculator must answer `0.1 + 0.2` with `0.3` (RF-CALC-05), and the [requirements](../spec/srs.md) make the Go service the only place where arithmetic happens. Four forces constrain the number representation.

- Operands and results must survive JavaScript, whose `Number` is an IEEE-754 binary double with about 15–17 significant digits and exact integers only up to 2^53. Any number that passes through a JSON number token in the browser can lose digits before the app sees it.
- Division, power and square root can produce results that never terminate (`1 ÷ 3`, `√2`), so a bounded precision is needed whichever representation is chosen.
- Every outcome must be classified: no input may produce an unclassified error (RF-CALC-09).
- Rounding must be visible to the user, so the result carries an `inexact` flag and the display shows `≈` before a rounded value (RF-CALC-09, RF-UI-06).

## Decision

The service computes with `cockroachdb/apd/v3` arbitrary-precision decimals under one fixed context, and every number on the wire is a decimal string.

- Context: precision 34, half-even rounding and adjusted exponents in [−6143, 6144], which is a decimal128-like range. The trapped and untrapped conditions are listed in RF-CALC-02.
- Wire format: every operand and result is a JSON string in JSON-number syntax (the «Decimal string» definition in the requirements), at most 128 characters and at most 34 significant digits, with the exponent range checked. All invalid operands are reported together, each with its index (RF-CALC-03).
- Bounds: the limits on operand length, significant digits and exponent range double as input bounds, so a hostile or accidental huge operand is rejected before any arithmetic runs (RNF-SEC-01).
- Output: results are formatted canonically, mirroring JavaScript `Number#toString` (RF-CALC-04). `inexact` is `true` exactly when the result was rounded (RF-CALC-09), and operands are echoed back unchanged (RF-API-03).
- Frontend: numbers are treated as text only, with string-based editing, grouping and sign display (RF-UI-03, RF-UI-05, RF-UI-06). The consequences of this for the client are developed in [ADR-0006](0006-server-arithmetic-and-pure-reducer.md).
- Display range: plain notation is used for adjusted exponents in [−6, 20], and otherwise lowercase scientific notation with an explicit exponent sign (`1e+21`, `1e-7`), so every formatted result matches the decimal-string syntax (RF-CALC-04).
- Errors: trapped decimal conditions plus a few explicit pre-checks (zero divisor, zero to a negative power, negative square root, non-finite result) classify every arithmetic failure into the 422 codes `DIVISION_BY_ZERO`, `UNDEFINED_RESULT` and `OVERFLOW` (RF-CALC-05, RF-CALC-06, RF-CALC-07, RF-CALC-09). Their status semantics are in [ADR-0004](0004-problem-details-and-status-semantics.md).

## Consequences

### Positive

- Results are exact decimals wherever they are representable, and precision of 34 digits holds from the service to the screen, so nothing is silently corrupted in the browser.
- Every failure of the arithmetic falls into one of three stable 422 codes, because the trapped conditions and the explicit pre-checks together leave no unclassified path (RF-CALC-09).
- The cost of one operation is bounded by the precision cap, so no per-request timeout is needed: every `BenchmarkCalculate` case must run under 1,000,000 ns/op (RNF-PERF-01).
- Canonical formatting mirrors `Number#toString`, so a result looks the same wherever it is shown and every formatted result is itself a valid operand (RF-CALC-04).
- Oversized or out-of-range operands are refused by validation, so the arithmetic only ever sees values inside the supported range.
- Rounding is never silent: the `inexact` flag travels with the result and drives the `≈` marker in the UI.

### Negative

- Parsing and validation are explicit code with their own messages and limits (RF-CALC-03) that must be maintained and tested.
- JSON number tokens are rejected: `["0.1"]` is valid while `[0.1]` fails validation because the operand has the wrong JSON type (RF-API-04), which is unusual for API clients.
- A third-party numeric library sits on the critical path, so its formatting and condition flags must be pinned by tests and by fuzzing (RF-OPS-14).
- The frontend cannot use `Number` or `Intl.NumberFormat` and implements its own string-only grouping and sign display (RF-UI-06).
- Results beyond 34 digits are rounded: `1 ÷ 3` gives `0.3333333333333333333333333333333333` with `inexact: true`.

## Alternatives considered

- **IEEE-754 binary floats** — `0.1 + 0.2` yields `0.30000000000000004`, rounding is silent with no inexact signal, NaN and infinities need special cases, and numbers parsed by JavaScript lose digits beyond double precision.
- **Integer fixed-scale** — a fixed number of decimal places cannot cover both `1e-7` and `1e+21`, a 64-bit integer overflows quickly, and division, power and square root need rounding rules anyway.
- **Unbounded precision** — a quotient such as one third and `√2` never terminate so a cap is needed regardless, and time and memory per request would become unbounded, which would require per-request timeouts and larger abuse limits.
- **JSON numbers on the wire** — a numeric token is parsed by JavaScript into a binary double before the app sees it, so digits beyond double precision are lost; strings keep every digit intact.
