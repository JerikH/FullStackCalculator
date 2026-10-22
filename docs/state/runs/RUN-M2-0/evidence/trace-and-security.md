# Cross-layer trace (step 9) and security / edge-case checklist (step 10) — RUN-M2-0

## UC-UI-01 trace, UI → API → domain (read in code, then proven in the browser)

| Link | Evidence |
|---|---|
| key press → command | `KeyButton.tsx` `onClick → execute(definition.command)`; the command comes from the single `KEYPAD` table (`model/keypad.ts`); the keyboard reads the same table |
| command → state → request | `Calculator.tsx` (`useCalculator` is called once there; graph `trace_path` callers: `Calculator`) → `calculatorReducer` sets `state.request` |
| request → client | `useCalculator.ts` effect → `api.calculate(operation, operands, { signal })` with the hook's own `AbortController`; `api` is the `CalculatorApiProvider` instance (an interface/context edge, so the graph shows no static call edge to `createCalculatorApi`: confirmed by reading) |
| client → route | `calculatorApi.ts` `client.POST('/api/v1/operations/{operation}', …)` (the signal now comes from `combineSignals`) |
| route → handler → domain | `httpapi` router pattern `/api/v1/operations/{operation}` → `newOperationsHandler` → `calculate` (`operations.go:62-93`) → `calc` |
| reachable from the real navigation | the keypad is the screen (`/`); there is no other route, no role guard (one anonymous role) |
| proven | Playwright against the real Go service + Vite (`browser-pieces.txt`): `flows` records operation, operands, status and request id for every operation (27 passed on both projects), `abort` shows `0.1 + 0.2 =` → `0.3` with `AbortSignal.any`, `AbortSignal.timeout` and both removed before any page script, AC aborting a pending request and the 8 s timeout message (9 passed on both projects) |

## Security and edge cases (step 10)

| # | Question | Answer |
|---|---|---|
| 1 | Authorization | none in the product (one anonymous role); nothing added |
| 2 | Input validation | no new input surface. OBS-LOG-02 bounds the one client-controlled log field that was not bounded: a 300-character method token → 256 characters logged (live check, `obs-log-02.txt`). The 405 problem still reflects the method (see findings: RNF-SEC-02 wording) |
| 3 | Injection | the new aria-labels are React attributes built from `historyExpression(entry)` (validated decimal strings and fixed symbols); no HTML string, no `title`, no `dangerouslySetInnerHTML`; the canvas stub exists only in tests |
| 4 | Races | client: caller abort vs timeout, re-entrant abort listeners, abort after settle — `calculatorApi.test.ts` (103 tests) and 9 mutations killed (`mutations-client.txt`); independent read found no P0–P2 |
| 5 | Dependency failure | an engine without `AbortSignal.any`/`timeout`, or without `AbortController`, returns a result (never a rejection, never a busy display) — unit tests and the browser `abort` piece |
| 6 | Rate limiting / abuse | unchanged (edge); the client sends one request per calculation as before |
| 7 | Secrets / personal data | none involved; no new log field; the access line shrinks (bounded method) |
| 8 | Supply chain (UI-DEPS-01) | `pnpm audit --prod --audit-level high` exit 0; lockfile frozen install after each change; pins exact; image base pinned by tag + digest |
