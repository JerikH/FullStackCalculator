# ADR-0006: Server-authoritative arithmetic and a pure reducer

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

The [requirements](../spec/srs.md) make the Go service the only place where arithmetic happens. Results are exact to 34 significant digits, as decided in [ADR-0002](0002-decimal-arithmetic-and-string-numbers.md), and the frontend must never compute one: no `Number`, `parseFloat`, `parseInt`, `BigInt`, `Intl.NumberFormat` on converted numbers, `eval` or decimal library on operands or results (RF-UI-05).

The browser still has real work to do. Calculator input is a state machine with several interacting concerns (RF-UI-04):

- sequential chaining of operators, where a second binary operator issues the pending operation, one pressed while fresh replaces the pending operator, and `=` with a pending operator issues it;
- an error state with its own recovery rules;
- a busy period during which most input is ignored;
- late responses that must never change the display, including after AC restarts request IDs.

Keypad and keyboard must behave identically (RF-UI-01, RF-UI-02), and cancelled or stale responses must never change the display or history (RNF-REL-01).

The decision is where arithmetic lives and how the calculator's behaviour is organised so that these rules can be verified one by one.

## Decision

Every numeric result comes from `POST /api/v1/operations/{operation}`. The frontend's only local numeric logic is text editing of the entry (digits, decimal point, sign, backspace; RF-UI-03), and the calculator itself is a pure reducer state machine with effects kept outside it.

- The reducer state is `entry`, `entryMode`, `accumulator`, `pendingOperator`, `inexact`, `status`, `error`, `request`, `history` and `nextRequestId`. Chaining is sequential: `2 + 3 × 4 =` gives 20, `5 + =` gives 10 and `2 + × 3 =` gives 6.
- Effects live in a hook, `useCalculator`. It sends one request per issued operation with an `AbortController`. AC drops and aborts the request, and a completion whose request ID is not the current one is ignored. While busy, only AC, success and failure are processed (RF-UI-04).
- The API client never throws, times out after 8 s and returns a typed outcome (RF-UI-09).
- Busy feedback is the value dimming immediately, `aria-busy` on the display region, and a spinner only after 150 ms (RF-UI-07).
- One `KEYPAD` table drives both keypad and keyboard (RF-UI-01).
- The feature is split into `frontend/src/features/calculator/model/` (pure: no React, no IO), `frontend/src/features/calculator/hooks/` (effects) and `frontend/src/features/calculator/ui/` (presentational).
- State stays local to the feature, with no global state library.

The pure layer cannot import React or perform IO, so every rule in RF-UI-04 can be exercised by calling the reducer with an action and reading the next state.

## Consequences

### Positive
- There is one arithmetic implementation, so the web app and direct API clients always agree.
- The reducer is tested exhaustively without a DOM, covering every transition and guard.
- Stale or cancelled responses can never change the display or history (RNF-REL-01).
- Keypad and keyboard parity holds by construction, since both read the same table.
- Numbers are strings end to end, with no conversion step where precision could be lost.

### Negative
- Every operation costs one network round trip. The 150 ms spinner delay softens this, so fast answers never flash a spinner.
- Nothing can be calculated without the service: offline or unreachable shows `Calculator service is unreachable` (RF-UI-08).
- Input during a pending request is ignored rather than queued.
- An explicit state machine is more code than ad hoc handlers, and it must be kept in step with its transition tests.

## Alternatives considered
- **Client-side arithmetic or optimistic results** — JavaScript numbers are imprecise, a second implementation would diverge from the service, and an optimistic value later corrected by the server is worse than a short wait.
- **A global state library** — Redux or Zustand would add a dependency and indirection for one component tree whose whole state is a single pure reducer, and that reducer is already framework-free and testable.
- **Logic spread over component handlers** — rules hidden in event handlers need a DOM to test, races between clicks and responses are hard to reason about, and keypad and keyboard would duplicate logic.
