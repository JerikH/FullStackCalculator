import type { CalculationResult, OperationName } from '@/shared/api/types';

export type BinaryOperation = Extract<OperationName, 'add' | 'subtract' | 'multiply' | 'divide' | 'power'>;
export type UnaryOperation = Extract<OperationName, 'sqrt' | 'percentage'>;
export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

// Compile-time guard: a contract operation that is neither binary nor unary fails this alias.
type Unclassified = Exclude<OperationName, BinaryOperation | UnaryOperation>;
type MustBeTrue<T extends true> = T;
export type AllOperationsClassified = MustBeTrue<[Unclassified] extends [never] ? true : false>;

/** What a key or a keyboard binding asks the calculator to do. */
export type KeyCommand =
  | { readonly kind: 'digit'; readonly digit: Digit }
  | { readonly kind: 'decimal' }
  | { readonly kind: 'sign' }
  | { readonly kind: 'backspace' }
  | { readonly kind: 'clearEntry' }
  | { readonly kind: 'allClear' }
  | { readonly kind: 'binary'; readonly operation: BinaryOperation }
  | { readonly kind: 'unary'; readonly operation: UnaryOperation }
  | { readonly kind: 'equals' };

/** What a successful response does to the state; captured when the request is issued. */
export type Continuation =
  | { readonly kind: 'complete' }
  | { readonly kind: 'chain'; readonly operator: BinaryOperation }
  | { readonly kind: 'replaceEntry' };

/** Effect descriptor for the request layer; not the contract's request body. */
export interface CalculationRequest {
  readonly id: number;
  readonly operation: OperationName;
  readonly operands: readonly string[];
  readonly continuation: Continuation;
}

export interface HistoryEntry {
  readonly id: string;
  readonly operation: OperationName;
  readonly operands: readonly string[];
  readonly result: string;
  readonly inexact: boolean;
}

/** User-facing error: fixed copy plus the request reference when one is available. */
export interface CalculatorError {
  readonly message: string;
  readonly requestId?: string;
}

export type EntryMode = 'typing' | 'fresh' | 'operand';

export interface CalculatorState {
  readonly entry: string;
  /**
   * typing: being edited; fresh: a finished value (result, recall) that the next digit replaces;
   * operand: the stored left operand, shown right after a binary operator or a chained result,
   * whose pending operator another binary operator replaces.
   */
  readonly entryMode: EntryMode;
  readonly accumulator: string | null;
  readonly pendingOperator: BinaryOperation | null;
  readonly inexact: boolean;
  readonly status: 'idle' | 'busy' | 'error';
  readonly error: CalculatorError | null;
  readonly request: CalculationRequest | null;
  readonly history: readonly HistoryEntry[];
  readonly nextRequestId: number;
}

export type CalculatorAction =
  | { readonly type: 'digitPressed'; readonly digit: Digit }
  | { readonly type: 'decimalPointPressed' }
  | { readonly type: 'signToggled' }
  | { readonly type: 'backspacePressed' }
  | { readonly type: 'entryCleared' }
  | { readonly type: 'allCleared' }
  | { readonly type: 'binaryOperatorPressed'; readonly operator: BinaryOperation }
  | { readonly type: 'unaryOperatorPressed'; readonly operator: UnaryOperation }
  | { readonly type: 'equalsPressed' }
  | { readonly type: 'historyRecalled'; readonly value: string }
  | { readonly type: 'historyCleared' }
  // Completions carry the request they answer; only the very object in `state.request` is accepted.
  | {
      readonly type: 'calculationSucceeded';
      readonly request: CalculationRequest;
      readonly result: CalculationResult;
      readonly historyId: string;
    }
  | { readonly type: 'calculationFailed'; readonly request: CalculationRequest; readonly error: CalculatorError };

export interface KeyDefinition {
  readonly id: string;
  readonly label: string;
  readonly ariaLabel: string;
  readonly command: KeyCommand;
  readonly variant: 'digit' | 'function' | 'operator' | 'equals';
  readonly row: number;
  readonly column: number;
  readonly rowSpan: 1 | 2;
  readonly bindings: readonly string[];
}

export interface DisplayModel {
  /** Formatted text; never used as a wire operand. */
  readonly value: string;
  /** Empty when no binary operation is pending. */
  readonly expression: string;
  readonly size: 'xl' | 'lg' | 'md';
  readonly inexact: boolean;
  readonly busy: boolean;
  readonly error: CalculatorError | null;
}

export const MAX_ENTRY_DIGITS = 34;
export const HISTORY_LIMIT = 20;
export const MAX_HISTORY_ID_LENGTH = 128;
export const HISTORY_STORAGE_KEY = 'calculator.history.v1';
