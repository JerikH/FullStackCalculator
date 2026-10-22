# RUN-M1-5 — plan (UI-MODEL-01)

Implements `spec.md` (D1–D14). All paths below are under `frontend/src/features/calculator/model/`. Tiers per the project's testing tiers: every test listed is T0 (unit, runs in `pnpm exec vitest run src/features/calculator/model`); mutation checks and the coverage run are T1.

## Interfaces

Already written by the controller (step 5), shared by every task:
- `types.ts` — `BinaryOperation`, `UnaryOperation`, `Digit`, `AllOperationsClassified` (compile-time partition check), `EntryMode = 'typing' | 'fresh' | 'operand'`, `KeyCommand`, `Continuation`, `CalculationRequest`, `HistoryEntry`, `CalculatorError`, `CalculatorState`, `CalculatorAction`, `KeyDefinition`, `DisplayModel`; `calculationSucceeded`/`calculationFailed` carry `request: CalculationRequest` (the descriptor they answer), not a number; `MAX_ENTRY_DIGITS = 34`, `HISTORY_LIMIT = 20`, `HISTORY_STORAGE_KEY = 'calculator.history.v1'`. All fields `readonly`.
- `operations.ts` — `OPERATIONS: Readonly<Record<OperationName, { symbol; arity }>>` (frozen, contract symbols `+ − × ÷ ^ √ %`, `satisfies Record<OperationName, OperationInfo>`), `isOperationName(value: unknown)`, `isBinaryOperation(op)`, `isUnaryOperation(op)`, `isDecimal(value: unknown)` (contract pattern, ≤ `MAX_DECIMAL_LENGTH = 128`).

To be written:
```ts
// keypad.ts
export const KEYPAD: readonly KeyDefinition[];
export function commandForKey(key: string): KeyCommand | undefined;
export function actionForCommand(command: KeyCommand): CalculatorAction;
// entry.ts
export function appendDigit(entry: string, digit: Digit): string;
export function appendDecimalPoint(entry: string): string;
export function toggleSign(entry: string): string;
export function backspace(entry: string): string;
export function toOperand(entry: string): string;
export function countDigits(entry: string): number;
// reducer.ts
export function createInitialState(history?: readonly HistoryEntry[]): CalculatorState;
export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState;
// selectors.ts
export function formatEntry(entry: string): string;
export function selectDisplay(state: CalculatorState): DisplayModel;
export function historyExpression(entry: HistoryEntry): string;
// messages.ts
export const PROBLEM_MESSAGES: Readonly<Record<ProblemCode, string>>;
export const MESSAGES: { readonly unreachable: string; readonly timedOut: string; readonly generic: string }; // the three non-problem strings, frozen
export function toCalculatorError(error: Exclude<ApiError, { kind: 'aborted' }>): CalculatorError;
// history.ts
export const MAX_HISTORY_RAW_LENGTH = 65536;
export function decodeHistory(raw: string | null): readonly HistoryEntry[];
export function encodeHistory(entries: readonly HistoryEntry[]): string;
// testing.ts (imported by tests only)
export function deepFreeze<T>(value: T): T;
export function run(state: CalculatorState, ...actions: CalculatorAction[]): CalculatorState;
export function press(state: CalculatorState, keys: readonly string[]): CalculatorState; // KeyboardEvent.key values, e.g. ['9', '+', '1', '2', 'Delete', '3', '='], through commandForKey/actionForCommand; throws on an unbound value
export function succeed(state: CalculatorState, result: string, options?: { inexact?: boolean; historyId?: string }): CalculatorState; // resolves state.request (throws in the test if none) with a literal fixture; default historyId unique per call (counter)
export function fail(state: CalculatorState, error?: CalculatorError): CalculatorState;
```
Imports: production files import only `import type` from `@/shared/api/types` and relative model files. No `Number`, `parseFloat`, `parseInt`, `BigInt`, `Intl`, `eval`, `Math`, `Date`, timers, `crypto`, `window`, `document`, storage, `fetch`, React. `.length` comparisons and the request counter (`nextRequestId + 1`) are metadata, not operand arithmetic.

## Rules and their tests

### R1 — entry editing (RF-UI-03, D7) — `entry.ts` / `entry.test.ts`
Rules: the D7 table of `spec.md`. `countDigits` counts `[0-9]` characters. `appendDigit`: unchanged when the entry has `e`/`E`; `"0"` → `d`; `"-0"` → `"-"+d`; unchanged when `countDigits(entry) >= 34`; else append. `appendDecimalPoint`: unchanged if the entry has `.`, `e` or `E`; else append `.`. `toggleSign`: `"0"` unchanged; leading `-` removed; else `"-"` + entry unless the entry already has 128 characters (unchanged). `backspace`: drop the last character; `""`, `"-"`, `"-0"` → `"0"`. `toOperand`: strip one trailing `.`.
Tests (table-driven, exact): appendDigit `"0","7"`→`"7"`, `"0","0"`→`"0"`, `"-0","7"`→`"-7"`, `"12","3"`→`"123"`, `"0.","5"`→`"0.5"`, `"-12.0","0"`→`"-12.00"`, 34 digits + d → unchanged, `"0."` + 33 digits (34 digit characters) + d → unchanged, 33 digits with `-` and `.` + d → accepted (34 digits); appendDecimalPoint `"0"`→`"0."`, `"-12"`→`"-12."`, `"1.2"`/`"1."` unchanged; toggleSign `"0"`→`"0"`, `"12"`↔`"-12"`, `"0."`→`"-0."`, `"-0"`→`"0"`, `"1e+21"`→`"-1e+21"`, `"-2.5e-10"`→`"2.5e-10"`, a 128-character Decimal unchanged, a 128-character negative → 127 characters; appendDigit/appendDecimalPoint on `"1e+21"` unchanged; backspace `"12.3"`→`"12."`, `"12."`→`"12"`, `"5"`→`"0"`, `"-5"`→`"0"`, `"-0.1"`→`"-0."`, `"-0."`→`"0"`, `"0"`→`"0"`; toOperand `"12."`→`"12"`, `"-0."`→`"-0"`, `"1e+21"`/`"1.2300"`/`"0"` unchanged. Property: for every entry reachable by typing (generated), `isDecimal(toOperand(entry))`.

### R2 — keypad table (RF-UI-01, RF-UI-02 bindings, D14) — `keypad.ts` / `keypad.test.ts`
Rules: 23 frozen definitions, row-major, ids/labels/names/variants/bindings as D14 and RF-UI-01; equals row 5 column 4 `rowSpan: 2`, every other key `rowSpan: 1`. `commandForKey` = a `Map` from every binding to its key's command (built from `KEYPAD` only). `actionForCommand`: digit→`digitPressed`, decimal→`decimalPointPressed`, sign→`signToggled`, backspace→`backspacePressed`, clearEntry→`entryCleared`, allClear→`allCleared`, binary→`binaryOperatorPressed{operator}`, unary→`unaryOperatorPressed{operator}`, equals→`equalsPressed`; exhaustive `switch`, no default.
Tests: exact table (row, column, label, ariaLabel, command, variant, rowSpan, bindings for all 23, in order); ids unique; bindings unique across keys; the 24 cells covered exactly once; the ten digits and the seven operations each present once with `binary`/`unary` per `OPERATIONS` arity; variants per RF-UI-01; the table and its entries frozen; `commandForKey` for every binding of RF-UI-02 (`0`–`9`, `.`, `,`, `+`, `-`, `*`, `/`, `^`, `%`, `r`, `n`, `Enter`, `=`, `Backspace`, `Delete`, `Escape`) and `undefined` for `' '`, `R`, `N`, `x`, `Tab`, `__proto__`, `constructor`, `toString`, `''`, `'Enter '`; `actionForCommand` for each command kind.

### R3 — initial state and immutability (D11, D12) — `reducer.ts` / `reducer.test.ts`
Rules: `createInitialState(history = [])` → `entry "0"`, typing, null accumulator/operator/error/request, `inexact false`, idle, `nextRequestId 1`, `history` = frozen copy of the first 20. Every state, request, operands array and history array the reducer creates is frozen.
Tests: exact initial fields; 25 supplied entries → first 20 kept in order, the input array not mutated and not the same reference; result and its history frozen; `Object.isFrozen` on the state, `state.request` and `state.request.operands` right after each issuing transition (chain, complete, unary), and on the state and `state.history` after a success, a clear history and an AC.

### R4 — guards (RF-UI-04, D3) — `reducer.test.ts`
Rules: D3 order (0) invalid recall value, (1) completion whose `request` is not `state.request` (identity), (2) busy, (3) error (C and AC = full reset like the others), (4) table.
Tests (deep-frozen fixtures, `toBe` for ignored): busy + each of digit, decimal, sign, backspace, C, binary, unary, `=`, recall, clear history → same object; busy + AC → initial with history kept, `request null`, idle, `nextRequestId 1`; success/failure carrying a different request object (also one equal by value: same id, operation, operands, continuation) → same object in idle, busy and error; success/failure with `state.request === null` → same object (no history created); invalid recall in error → same object (no reset); error + digit → reset then digit (typing, entry = digit, history kept, `nextRequestId 1`); error + decimal → `"0."` typing; error + recall → recalled value fresh; error + C and error + AC → reset with history; error + clear history → `history []`, still error with the same error; error + binary, unary, sign, backspace, `=` → same object.

### R5 — transitions (RF-UI-03, RF-UI-04, D2, D4, D6) — `reducer.test.ts`
Rules: D4 exactly; D2 bail-out (field-by-field `Object.is`) before returning; D6 recall check.
Tests: fresh + digit and operand + digit (replace, typing, clear inexact); operand + decimal → `"0."`; operand + ⌫ → same object; operand + ± → toggled, mode `fresh`; fresh + decimal → `"0."` typing, inexact false; typing digit/decimal/backspace through the entry functions; ± on fresh scientific result keeps fresh and `inexact: true`; ± on `"0"` → same object; fresh + ⌫ → same object; digit at cap → same object; second `.` → same object; C keeps operator and accumulator, clears inexact; C on a state already `"0"`/typing/no error → same object; AC on the initial state → same object; binary with none pending (accumulator = entry = `toOperand`, `"12."` → `"12"`, mode `operand`, inexact kept); binary pending + operand → operator replaced, no request; same operator again → same object; binary pending + typing → chain request; binary pending + fresh (after a unary result or a recall) → chain request; unary → replaceEntry request, pending kept; `=` with pending → complete request; `=` with no pending → same object; issue sets busy, clears error, uses `nextRequestId`, increments once, operands frozen; recall → fresh, inexact false, operator kept; recall of `"1,000"`, `" 1"`, `"1."`, `"NaN"`, 129 characters → same object (idle, error and busy); clear history on empty history → same object; C on an `operand` entry → `"0"` typing, operator kept.

### R6 — completions and history (RF-UI-04, RF-UI-10, D5) — `reducer.test.ts`
Rules: success applies the captured continuation (chain → mode `operand`); history entry = `{id: historyId, operation: request.operation, operands: request.operands, result: payload.result, inexact: payload.inexact}` prepended, capped at 20, skipped (result still applied) for an empty, over-128-character or already present `historyId`; failure per D4 (also `inexact false`).
Tests: complete, chain and replaceEntry successes each with `inexact: true` and `false`; success with a payload `operation` different from the request uses the request's continuation and operation (continuation never inferred from the last key); history entry fields exact; two equal calculations with different ids → two entries; 21 successes → 20 newest first, oldest dropped; failure of each continuation → entry `"0"`, fresh, error, accumulator/operator/request null, history unchanged (same reference); duplicate completion (same success twice) → second is the same object; invalid and duplicate `historyId` → result applied, history the same array; AC then a new request: the completion of the dropped request (id 1) arrives while the new request also has id 1 → same object (ignored), and the new request's own completion is accepted.

### R7 — use-case sequences (UC-UI-01, UC-UI-02, UC-UI-03) — `reducer.test.ts`
Through `press`/`succeed` with literal fixtures (no arithmetic in helpers), asserting each outgoing request before its fixture: `12 × 3 =` → multiply `["12","3"]`, `36`, expression cleared; `√` with `16` → sqrt `["16"]`; `2 + 3 =` → add `["2","3"]` → `5`; `0.1 + 0.2 =` → add `["0.1","0.2"]` → `0.3` inexact false; `12. + 3. =` → add `["12","3"]`; `2 + 3 ×` → add, chain multiply, entry and accumulator `5`; then `4 =` → multiply `["5","4"]` → `20`; `2 + × 3 =` → no request on `×`, multiply `["2","3"]` → `6`; `5 + =` → add `["5","5"]`; `0 + =` → add `["0","0"]`; `=` alone → same object; `9 + 16 √ =` → sqrt `["16"]` replaceEntry, then add `["9","4"]`; `9 + 16 √ × 2 =` → sqrt, then add `["9","4"]` chain multiply (fixture `13`), then multiply `["13","2"]`; `9 +` recall `36` `× 2 =` → add `["9","36"]` chain, then multiply `["45","2"]`; `50 %` → percentage `["50"]` → `0.5`; `2 xʸ 10 =` → power `["2","10"]` → `1024`; `9 + 12 C 3 =` → add `["9","3"]`; `9 +` recall `16` `=` → add `["9","16"]`; result then `7` → `7`; result then `.` → `0.`; `1 ÷ 3 =` inexact success → entry is the 34-digit fixture with `inexact` true, then ± keeps `inexact`, then a digit clears it (UC-UI-01 E8); unary success with pending binary keeps accumulator/operator; error then `5` → fresh start; `2 + 3 × +` → after the chain result `+` replaces `×` (no request).

### R8 — generated sequences (D3 invariants) — `reducer.sequences.test.ts`
A seeded deterministic generator (a small linear congruential generator in the test, fixed seeds, 300 sequences × 60 actions) drawing every action kind, valid/invalid recall values, completions for the current, a stale and a missing request, with successes and failures. After every step: no throw; the result is frozen; `request !== null` ⇔ busy; `error !== null` ⇔ error status; mode `operand` ⇒ pending operator set and `entry === accumulator`; history IDs unique; `history.length <= 20`; `isDecimal(toOperand(entry))`; every issued request's operands satisfy `isDecimal` and its arity matches `OPERATIONS`; a state returned for an action that changed nothing is the input object (checked by comparing fields).

### R9 — display (RF-UI-06, D8) — `selectors.ts` / `selectors.test.ts`
Tests: formatEntry `"0"`→`"0"`, `"-12.5"`→`"−12.5"`, `"1234567.8900"`→`"1,234,567.8900"`, `"-1234."`→`"−1,234."`, `"0.000001"` unchanged, `"1e+21"` unchanged, `"-2.5e-10"`→`"−2.5e-10"`, `"1234E+5"` unchanged, `"123"`, `"1234"`, `"-0"`→`"−0"`, `"-0."`→`"−0."`, a 34-digit integer grouped; output never contains ASCII `-` before the first digit. selectDisplay: `12 ×` pending (typing `3` shows value `3`); no expression without operator; negative accumulator `−5 +`; scientific accumulator; size boundaries on the formatted value: 10 characters `xl` (`"1234567.89"` → `1,234,567.89` is 12 → `lg`; pick fixtures by formatted length: `"12345678"` → `12,345,678` (10) `xl`, `"123456789"` → `123,456,789` (11) `lg`, `"1234567890123"` → `1,234,567,890,123` (17) `md`, a 16-character formatted value `lg`); `inexact`, `busy`, `error` copied; `≈` never in `value`. historyExpression: every operation (`12 × 3 = 36`, `5 − 2 = 3`, `2 + 2 = 4`, `8 ÷ 2 = 4`, `2 ^ 10 = 1,024`, `√16 = 4`, `50% = 0.5`), inexact `1 ÷ 3 ≈ 0.3333333333333333333333333333333333`, negatives with `−`, grouping, long scientific strings.

### R10 — error copy (RF-UI-08, D9, F1) — `messages.ts` / `messages.test.ts`
Tests: each of the 13 codes → its exact copy (a literal expected table in the test, not derived from `PROBLEM_MESSAGES`); `PROBLEM_MESSAGES` has exactly the 13 keys of `PROBLEM_CODES` (imported from `@/shared/api` in the test only); network, timeout, unexpected with and without status; problem `requestId` `"req-42"` kept; `""` → no `requestId` key (and the object has only `message`); 129 characters, `"a b"`, `"a‮b"`, `"a\nb"` → no `requestId`; `title`/`detail` text never appears in the result.

### R11 — history codec (RF-UI-10, D10) — `history.ts` / `history.test.ts`
Tests: round trip of all seven operations with inexact, negative and scientific values; `decodeHistory(encodeHistory(x))` equals the expected capped list; encode deterministic and exact for one fixture (literal JSON string); 25 entries → 20; encode skips invalid and duplicate-ID entries; malformed → `[]`: `null`, `""`, `"   "`, `"{"`, `"null"`, `"1"`, `"\"x\""`, `"[]"`, `{}`, version `2`/`"1"`/`1.5`/missing, `entries` missing/object/string, entry `null`/array/number, each field missing or of the wrong type, empty id, 129-character id, unknown operation, `"__proto__"` operation, wrong arity both ways, operands not an array, operand/result invalid (`"1,000"`, `" 1"`, `"1."`, `".5"`, `"01"`, `"+1"`, `"NaN"`, `"Infinity"`, `"−1"`, `"<b>1</b>"`, number `1`, 129 characters), duplicate ids, one bad entry among good ones, raw input of 65,537 characters (but valid JSON), a `__proto__` own key providing a field; extra properties on entries and envelope ignored (decoded entries have exactly five keys); a syntactically valid tiny exponent result (`"1e-9999"`) accepted; decode never throws (generated garbage strings) and does not mutate; decoded list and entries frozen.

### R12 — boundaries (RF-UI-05, D13) — `boundaries.test.ts`, `operations.test.ts`
Tests: for every production file of the directory (raw source via `import.meta.glob<string>(['./*.ts', '!./*.test.ts', '!./testing.ts'], { query: '?raw', import: 'default', eager: true })`): comments stripped; every `import … from`, `export … from` and dynamic `import(` source is either `@/shared/api/types` through `import type` or a relative `./<model file>` other than `./testing`; none of the forbidden identifiers of D13 appears as a whole word; the glob found exactly the expected eight production files (so the test cannot pass vacuously). The checker is a function in the test file, itself tested on synthetic sources: a value import from `@/shared/api/types`, `import x from 'react'`, `export { x } from 'lodash'`, `export * from '../hooks'`, `import('./reducer')`, `import { deepFreeze } from './testing'`, `Number(x)`, `Math.max`, `window.x`, `new Date()` each fail; `evaluate`, `documented`, a forbidden word inside a comment, and `import type { A } from '@/shared/api/types'` pass. `operations.test.ts`: `OPERATIONS` keys equal the contract `OperationName` list (`'add'…'percentage'`), symbols and arities exact, frozen; `isOperationName`, `isBinaryOperation`, `isUnaryOperation`; `isDecimal` accepts/rejects the contract cases and 128/129 characters.

## Tasks (ordered; owned files disjoint)

1. **T-A — Codex (background, one job):** `keypad.ts`, `entry.ts`, `reducer.ts`, `testing.ts`, `keypad.test.ts`, `entry.test.ts`, `reducer.test.ts`, `reducer.sequences.test.ts` (R1–R8).
2. **T-B — Claude subagent (Sonnet, high), in parallel:** `selectors.ts`, `messages.ts`, `history.ts`, `selectors.test.ts`, `messages.test.ts`, `history.test.ts`, `operations.test.ts`, `boundaries.test.ts` (R9–R12). `boundaries.test.ts` expects the eight production files; until T-A lands it is run last.
3. **Controller:** review both diffs (rule → code → test table), run the checks, mutation checks, second independent reader (double review), coverage under `heavy`, commit.

Neither implementer runs git or edits `types.ts`/`operations.ts`; a needed change there is reported back to the controller.

## Targeted checks

From `frontend/`: `pnpm exec vitest run src/features/calculator/model`; `pnpm typecheck`; `pnpm exec eslint src/features/calculator/model --max-warnings=0`; `pnpm exec prettier --check src/features/calculator/model`; `pnpm exec vitest run --coverage --coverage.include='src/features/calculator/model/**' --coverage.thresholds.100 src/features/calculator/model` (under `heavy`); from the root `scripts/ci/t0.sh --base main`.

## Mutation checks (T1, controller; each recorded in `evidence/mutations.txt` with the failing test name, then restored and the suite re-run green)

| # | Mutation | Must fail |
|---|---|---|
| M1 | busy guard lets `digitPressed` through | R4 busy + digit → same object |
| M2 | stale guard compares `request.id` instead of identity | R6 AC then reused id 1 → ignored |
| M3 | stale guard removed | R4 completion with a different request object |
| M4 | binary after a fresh (unary/recall) entry replaces instead of chaining | R7 `9 + 16 √ × 2 =` |
| M5 | error recovery keeps the old state's accumulator (no reset) | R4 error + digit |
| M6 | `=` without a pending operator issues a request | R7 `=` alone → same object |
| M7 | success always applies `complete` | R6 chain success / R7 `2 + 3 × 4 =` |
| M8 | history cap 21 | R6 21 successes → 20 |
| M9 | D2 bail-out removed | R5 a same-object test (e.g. ± on `"0"`) |
| M10 | codec accepts a duplicate id | R11 duplicate ids → `[]` |
| M11 | codec accepts `version: "1"` | R11 version `"1"` → `[]` |
| M12 | an empty `requestId` is carried | R10 `""` → no `requestId` |
| M13 | grouping applied to scientific values | R9 `1234E+5` unchanged |
| M14 | `toggleSign` without the 128-character limit | R1 128-character Decimal unchanged |
| M15 | invalid `historyId` added to history | R6 invalid id → history the same array |

## Not touched

`frontend/src/shared/**`, `frontend/package.json`, the lockfile, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `scripts/ci/**`, `.github/**`, every `docs/` record outside the run folder.

## Review log

Step 6 — independent read-only review of the plan (Codex): 0 P0, 0 P1, 5 P2, 1 P3; all confirmed and applied: R12 now carries D13's export-from/dynamic-import checks, forbids production imports of `./testing` and tests the checker on synthetic sources; the coverage command carries `--coverage.thresholds.100`; the mutation checks are an explicit table with the test each must fail; `press` takes `KeyboardEvent.key` values (C is `Delete`, uppercase letters are unbound) and throws on an unbound one; R3 asserts freezing of issued requests, operands and produced histories; `MESSAGES` members are typed `readonly … : string` (an implicit-any member fails TS7008 under this configuration). Literal values, ownership, ordering and the state machine under the owner's chaining answer: nothing found.
(The plan had been revised before this review for the step-4 spec fixes: identity guard, `operand` mode, D5, D7 table.)
