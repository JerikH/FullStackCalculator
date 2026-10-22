# Closure of RUN-M1-5 — 2026-10-22

Written by the agent that executed the run; applied to the shared state by the integrator, exactly as written. Every item names its target file.

## Commits
| Member | Commit(s) on wf/RUN-M1-5 | Summary |
|---|---|---|
| UI-MODEL-01 | 330fc39, 010fd61, ccdbf7a (records), b338c03 (code + evidence), closure commit (this file and findings.md) | Pure calculator model: keypad table, entry editing, reducer, display selectors, error copy, history codec |

## Per member

### UI-MODEL-01
- **current.md:** check `UI-MODEL-01`; add 🔎 findings: «Findings of UI-MODEL-01» (a)–(f); run group `RUN-M1-5` → `done`.
- **tasks/UI.md — DONE paragraph** (replaces «Open.» of UI-MODEL-01):
  `- [x] **DONE 2026-10-22 (run RUN-M1-5, commit b338c03; 🔎 findings: «Findings of UI-MODEL-01» (a)–(f)).** Built frontend/src/features/calculator/model/ (types, operations, keypad, entry, reducer, selectors, messages, history, a test-only testing helper): OPERATIONS with the contract symbols and a compile-time binary/unary partition; the 23-key KEYPAD table driving commandForKey/actionForCommand; string-only entry editing (34-digit cap, scientific entries kept, ± bounded at 128 characters); calculatorReducer with the recall check, the request-identity stale guard (a late completion after AC is ignored even with a reused request number), busy and error guards, the typing/fresh/operand entry modes (a binary operator after a unary result or a recall chains, owner answer of 2026-10-22), unchanged → same object, frozen outputs, history entries from the captured request capped at 20 with invalid or duplicate IDs skipped, non-Decimal results reported as failures; formatEntry/selectDisplay/historyExpression (U+2212, linear grouping, size xl/lg/md); toCalculatorError with the RF-UI-08 copy for all 13 codes and request IDs only when they match the request-ID pattern (an empty one is unavailable); the defensive versioned codec decodeHistory/encodeHistory. Verified: 860 tests in 9 files (keypad table and bindings, the entry-editing table, every transition and guard with deep-frozen fixtures and identity checks, the sequences of UC-UI-01/02/03 with literal service fixtures, 300 seeded generated sequences × 60 actions checking the invariants, display boundaries 10/11/16/17, every error kind and code, every malformed history input, a source-scanning boundaries test proving no React/DOM/IO/arithmetic primitive); coverage of the directory 100 % statements/branches/functions/lines; 18 of 18 mutations killed (among them a busy state accepting a digit and an ID-based stale guard); typecheck, ESLint and Prettier clean; t0.sh --base main and t1.sh green. Reviews: spec (Claude), plan (Codex), second independent reader of the code (Codex), security and edge cases (Claude, crafted storage and a 2,000-run fuzz): no P0/P1 left open. Evidence in docs/state/archive/runs/RUN-M1-5/evidence/ (mutations.txt, coverage.txt).`
- **traceability.md rows** (UI table; replace the two ⬜ rows and extend the UC-UI-01 row):
  - `| UC-UI-01 / RF-UI-01, RF-UI-02, RF-UI-04, RF-UI-05, RF-UI-06, RF-UI-07, RF-UI-08, RF-UI-09, RF-UI-12, RF-UI-13 | 🟡 | 24131a9, fbb1984 (merge ce02a75); b338c03 (merge <merge sha>) | Targeted tests: src/shared/api (84 tests), 11 mutations (2026-10-22); src/features/calculator/model (860 tests, 100 % coverage, 18 mutations, 2026-10-22); Integrated (W1, T2, 2026-10-22) | RF-UI-09 client and the model (RF-UI-01 table, RF-UI-04 reducer, RF-UI-05 boundaries test, RF-UI-06 formatting, RF-UI-08 copy) done; hooks, screen and the real-browser flow pending (UI-HOOKS-01, UI-SCREEN-01) |`
  - `| UC-UI-02 / RF-UI-03, RF-UI-04 | 🟡 | b338c03 (merge <merge sha>) | Targeted tests: entry.test.ts, reducer.test.ts, reducer.sequences.test.ts (2026-10-22) | Editing table and every transition with frozen state done; C vs AC and the digit cap in the real browser pending (UI-SCREEN-01) |`
  - `| UC-UI-03 / RF-UI-10 | 🟡 | b338c03 (merge <merge sha>) | Targeted tests: history.test.ts (every malformed input, round trip), reducer.test.ts (cap 20, recall as right operand, error/busy recall) (2026-10-22) | Codec and recall done; storage hooks and the history panel pending (UI-HOOKS-01, UI-SCREEN-01) |`
- **context/UI.md additions** (section «Architecture as built»): `- frontend/src/features/calculator/model/ (RUN-M1-5, Findings of UI-MODEL-01 (a)): pure model — OPERATIONS, KEYPAD + commandForKey/actionForCommand, entry editing, calculatorReducer/createInitialState, selectDisplay/formatEntry/historyExpression, toCalculatorError, decodeHistory/encodeHistory, HISTORY_STORAGE_KEY; testing.ts is a test-only helper. boundaries.test.ts fails on any non-model import, value import of the contract types or React/DOM/IO/arithmetic identifier in the production files.` and replace «Planned: `frontend/src/features/calculator/{model,hooks,ui}`» by «Planned: `frontend/src/features/calculator/{hooks,ui}`». Section «Invariants every task inherits», add: `- Completions carry the captured request object; the reducer accepts only the very object in state.request (request IDs restart at 1 after AC). A binary operator after a unary result or a recall chains; only the stored operand (entryMode 'operand') has its pending operator replaced (Findings of UI-MODEL-01 (b), (d)).`
- **context/test-environment.md additions:** in the traps list or a note under «Tier commands»: `- Coverage of one directory at 100 %: pnpm -C frontend exec vitest run --coverage --coverage.include='src/<dir>/**' --coverage.thresholds.100 --coverage.reportsDirectory="$WF_SCRATCH/coverage" src/<dir> after eval "$(.workflow/bin/wf env --export)" (heavy lease); Codex review sandboxes cannot start Vitest (Findings of UI-MODEL-01 (e)).`
- **methodology.md:** none (the UI epic stays open).
- **Spec changes:** `docs/spec/srs.md` RF-UI-04 — replace «one pressed while fresh replaces the pending operator;» by «one pressed right after a binary operator or a chained result (the entry is the stored left operand) replaces the pending operator, while one pressed after a unary result or a history recall issues the pending operation and chains (`9 + 16 √ × 2 =` → (9 + 4) × 2);» and the state field list `entryMode` by `entryMode` (`typing`, `fresh`, `operand`) if the RF names its values. Record the owner answer of 2026-10-22 (asked in RUN-M1-5, Findings of UI-MODEL-01 (d)) as the next owner decision `U<n>` in the owner-decision list of `docs/spec/roadmap.md` and add a change-log row to `docs/spec/srs.md`: `| 2026-10-22 | RF-UI-04 | Binary operator after a unary result or a recall chains; replacement only for the stored left operand | U<n> |`. `docs/spec/use-cases.md` UC-UI-01 E2 already reads «an operator pressed right after another» — unchanged.
- **findings/UI.md:** in «Findings of UI-CLIENT-01» (b) replace `[target: UI-MODEL-01]` with `[resolved: UI-MODEL-01]` (the error copy treats an empty `requestId` as unavailable, `messages.test.ts` «is treated as unavailable when empty: no key at all», mutation M12). Append the block of `findings.md` of this run.

## Registered follow-ups for other tasks
- `tasks/UI.md` → entry `UI-HOOKS-01`: `- Registered follow-up (from UI-MODEL-01): dispatch completions with the exact captured state.request object (never by request number), nothing for aborted, failures through toCalculatorError, unique historyId ≤ 128 characters, createInitialState(decodeHistory(raw)) and encodeHistory under HISTORY_STORAGE_KEY through safeStorage, keys through commandForKey + actionForCommand. 🔎 findings: «Findings of UI-MODEL-01» (b)`
- `tasks/UI.md` → entry `UI-SCREEN-01`: `- Registered follow-up (from UI-MODEL-01): render DisplayModel value/expression and history text as text, add ≈ with its title from inexact, Ref only when requestId is present, Use result ${formatEntry(result)} recalling the raw result, key placement from KEYPAD row/column/rowSpan via CSS classes; history IDs only as React keys. 🔎 findings: «Findings of UI-MODEL-01» (c)`

## Needs from other tasks (blockers discovered)
- none.

## Rule → code → test (UI-MODEL-01; paths under frontend/src/features/calculator/model/)
| Rule | Code | Tests |
|---|---|---|
| RF-UI-01 table, RF-UI-02 bindings | keypad.ts:30–95, :71, :74 | keypad.test.ts (exact table, cells, bindings literal list, unbound keys, exhaustive actions) |
| RF-UI-03 editing (D7) | entry.ts:5–28 | entry.test.ts (table, generated typing entries stay operands) |
| RF-UI-04 recall check, identity stale guard, busy, error (D3, D6) | reducer.ts:163–190 | reducer.test.ts «guards and error recovery», «ignores … stale completion with a reused id after AC»; M1–M5 |
| RF-UI-04 transitions, chaining (D4, owner answer) | reducer.ts:46–140 | reducer.test.ts «editing and pending operations», «calculator sequences…»; M4, M6, M7 |
| History entry, cap, IDs, non-Decimal result (D5) | reducer.ts:114–140 | reducer.test.ts «completions and history»; M8, M15, M17 |
| Unchanged → same object, frozen outputs (D2, D12) | reducer.ts:192; reducer.ts issue/success freezes | identity tests, reducer.sequences.test.ts; M9 |
| RF-UI-05 purity (D13) | — | boundaries.test.ts (file set, imports, forbidden words, checker fixtures); M18 |
| RF-UI-06 formatting, display (D8) | selectors.ts:12–60 | selectors.test.ts (grouping, signs, size 10/11/16/17, expression, history text); M13 |
| RF-UI-08 copy, request reference (D9, F1) | messages.ts | messages.test.ts (13 codes literal, kinds, request IDs, no title/detail); M12 |
| RF-UI-10 codec (D10) | history.ts:20–90 | history.test.ts (round trip, every malformed input, limits, holes, freezing); M10, M11, M16 |

## Targeted checks (the integrator re-runs these after merging)
```
pnpm -C frontend exec vitest run src/features/calculator/model
pnpm -C frontend run typecheck
pnpm -C frontend exec eslint src/features/calculator/model --max-warnings=0
pnpm -C frontend exec prettier --check src/features/calculator/model
# heavy lease, after eval "$(.workflow/bin/wf env --export)":
pnpm -C frontend exec vitest run --coverage --coverage.include='src/features/calculator/model/**' --coverage.thresholds.100 --coverage.reportsDirectory="$WF_SCRATCH/coverage" src/features/calculator/model
scripts/ci/t1.sh frontend/src/features/calculator/model/reducer.test.ts frontend/src/features/calculator/model/history.test.ts frontend/src/features/calculator/model/boundaries.test.ts
```

## Tests and CI changes
- New test files inside the existing frontend package (picked up by `src/**/*.test.{ts,tsx}` and the existing frontend stage of `scripts/ci/lib.sh`); no new suite, script, workflow or dependency. `frontend/package.json` and the lockfile unchanged (U13).

## Notes for the integrator
- Integration order 1 of W2: one new directory, no shared files touched, no dependency changes; `wf own check --diff` clean.
- Consumers are in W3 (RUN-M1-8: UI-HOOKS-01, UI-SCREEN-01), not in this wave, so no contract message was sent; the completion actions carry `request: CalculationRequest` (not a numeric `requestId`) and `entryMode` has three values — the follow-ups above carry that to them.
- Package-wide coverage thresholds (90/90/90/85) should still pass with the model at 100 %; check them in T2.
