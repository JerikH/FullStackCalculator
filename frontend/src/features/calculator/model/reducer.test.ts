import { describe, expect, it } from 'vitest';
import { createInitialState } from './reducer';
import { deepFreeze, fail, press, run, succeed } from './testing';
import type { CalculationRequest, CalculatorAction, CalculatorState, HistoryEntry } from './types';

const history = deepFreeze<readonly HistoryEntry[]>([
  { id: 'existing', operation: 'add', operands: ['1', '2'], result: '3', inexact: false },
]);
const initial = () => deepFreeze(createInitialState(history));
const busy = () => press(initial(), ['2', '+', '3', '=']);
const errorState = () => fail(busy(), { message: 'Something went wrong', requestId: 'req-1' });
const idleActions = deepFreeze<CalculatorAction[]>([
  { type: 'digitPressed', digit: '7' },
  { type: 'decimalPointPressed' },
  { type: 'signToggled' },
  { type: 'backspacePressed' },
  { type: 'entryCleared' },
  { type: 'binaryOperatorPressed', operator: 'multiply' },
  { type: 'unaryOperatorPressed', operator: 'sqrt' },
  { type: 'equalsPressed' },
  { type: 'historyRecalled', value: '16' },
  { type: 'historyCleared' },
]);
function requestOf(state: CalculatorState): CalculationRequest {
  if (state.request === null) throw new Error('Expected a request');
  return state.request;
}
function expectRequest(
  state: CalculatorState,
  operation: CalculationRequest['operation'],
  operands: readonly string[],
  continuation: CalculationRequest['continuation'] = { kind: 'complete' },
): void {
  expect(state.request).toEqual({ id: state.nextRequestId - 1, operation, operands, continuation });
  expect(state.status).toBe('busy');
  expect(state.error).toBeNull();
  for (const value of [state, state.request, state.request?.operands, state.request?.continuation])
    expect(Object.isFrozen(value)).toBe(true);
}
function successAction(request: CalculationRequest, historyId = 'success'): CalculatorAction {
  return deepFreeze({
    type: 'calculationSucceeded',
    request,
    result: { operation: 'add', operands: ['2', '3'], result: '5', inexact: false },
    historyId,
  });
}

describe('initial state and helpers', () => {
  it('has the exact initial fields and freezes the state and history', () => {
    const state = createInitialState();
    expect(state).toEqual({
      entry: '0',
      entryMode: 'typing',
      accumulator: null,
      pendingOperator: null,
      inexact: false,
      status: 'idle',
      error: null,
      request: null,
      history: [],
      nextRequestId: 1,
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.history)).toBe(true);
  });
  it('copies and caps supplied history without mutating it', () => {
    const supplied = deepFreeze(
      Array.from({ length: 25 }, (_, index) => ({
        ...history[0],
        id: `id-${index}`,
        operation: 'add' as const,
        operands: ['1', '2'],
        result: '3',
        inexact: false,
      })),
    );
    const state = createInitialState(supplied);
    expect(state.history).toEqual(supplied.slice(0, 20));
    expect(state.history).not.toBe(supplied);
    expect(supplied).toHaveLength(25);
  });
  it('helpers reject unbound keys or absent requests and freeze nested fixtures', () => {
    expect(() => press(initial(), ['R'])).toThrow('Unbound key: R');
    expect(() => succeed(initial(), '1')).toThrow('No current request');
    expect(() => fail(initial())).toThrow('No current request');
    const fixture = deepFreeze({ child: [null, { value: '1' }] });
    expect(Object.isFrozen(fixture.child[1])).toBe(true);
    expect(run(initial())).toEqual(initial());
  });
});

describe('guards and error recovery', () => {
  it.each(idleActions)('busy ignores $type by identity', (action) => {
    const state = busy();
    expect(run(state, action)).toBe(state);
    expect(state.request?.operands).toEqual(['2', '3']);
  });
  it('AC drops a busy request and resets the counter while retaining history', () => {
    const state = busy();
    const next = press(state, ['Escape']);
    expect(next).toEqual(createInitialState(history));
    expect(next.history).toBe(state.history);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.history)).toBe(true);
  });
  it.each(['idle', 'busy', 'error'] as const)(
    'rejects different and equal-by-value request descriptors in %s',
    (status) => {
      const state = status === 'idle' ? initial() : status === 'busy' ? busy() : errorState();
      const actual = requestOf(busy());
      const equalCopy = deepFreeze({ ...(state.request ?? actual) });
      for (const request of [actual, equalCopy]) {
        expect(run(state, successAction(request))).toBe(state);
        expect(run(state, { type: 'calculationFailed', request, error: { message: 'ignored' } })).toBe(state);
      }
    },
  );
  it.each(['1,000', ' 1', '1.', 'NaN', '1'.repeat(129)])('rejects invalid recall %s in every status', (value) => {
    for (const state of [initial(), busy(), errorState()])
      expect(run(state, { type: 'historyRecalled', value })).toBe(state);
  });
  it.each<[CalculatorAction, string, CalculatorState['entryMode']]>([
    [{ type: 'digitPressed', digit: '5' }, '5', 'typing'],
    [{ type: 'decimalPointPressed' }, '0.', 'typing'],
    [{ type: 'historyRecalled', value: '16' }, '16', 'fresh'],
    [{ type: 'entryCleared' }, '0', 'typing'],
    [{ type: 'allCleared' }, '0', 'typing'],
  ])('recovers from error with %j', (action, entry, entryMode) => {
    const state = errorState();
    const next = run(state, action);
    expect(next).toEqual({ ...createInitialState(), entry, entryMode, history: state.history });
    expect(next.history).toBe(state.history);
  });
  it('clear history preserves the error and clearing an empty list is unchanged', () => {
    const state = errorState();
    const next = run(state, { type: 'historyCleared' });
    expect(next).toEqual({ ...state, history: [] });
    expect(next.error).toBe(state.error);
    expect(Object.isFrozen(next.history)).toBe(true);
    expect(run(next, { type: 'historyCleared' })).toBe(next);
  });
  it.each(
    idleActions.filter((action) =>
      ['binaryOperatorPressed', 'unaryOperatorPressed', 'signToggled', 'backspacePressed', 'equalsPressed'].includes(
        action.type,
      ),
    ),
  )('error ignores $type', (action) => {
    const state = errorState();
    expect(run(state, action)).toBe(state);
  });
});

describe('editing and pending operations', () => {
  it.each(['=', 'Backspace', 'n', 'Delete', 'Escape'])('preserves identity for unchanged initial key %s', (key) => {
    const state = createInitialState();
    expect(press(state, [key])).toBe(state);
  });
  it('preserves identity for a capped digit, second point, repeated operator and empty history', () => {
    const capped = press(initial(), '1'.repeat(34).split(''));
    expect(press(capped, ['2'])).toBe(capped);
    const decimal = press(initial(), ['.']);
    expect(press(decimal, ['.'])).toBe(decimal);
    const operand = press(initial(), ['2', '+']);
    expect(press(operand, ['+'])).toBe(operand);
    const empty = createInitialState();
    expect(run(empty, { type: 'historyCleared' })).toBe(empty);
  });
  it.each(['7', '.'])('replaces operand and fresh values with %s and clears inexact', (key) => {
    const operand = succeed(press(initial(), ['2', '+', '3', '*']), '5', { inexact: true });
    const fresh = succeed(busy(), '5', { inexact: true });
    for (const state of [operand, fresh])
      expect(press(state, [key])).toMatchObject({
        entry: key === '.' ? '0.' : '7',
        entryMode: 'typing',
        inexact: false,
      });
  });
  it('backspace ignores operand and fresh entries; sign makes an operand fresh', () => {
    const operand = press(initial(), ['2', '+']);
    const fresh = succeed(busy(), '1e+21', { inexact: true });
    for (const state of [operand, fresh]) expect(press(state, ['Backspace'])).toBe(state);
    expect(press(operand, ['n'])).toMatchObject({
      entry: '-2',
      entryMode: 'fresh',
      accumulator: '2',
      pendingOperator: 'add',
    });
    expect(press(fresh, ['n'])).toMatchObject({ entry: '-1e+21', entryMode: 'fresh', inexact: true });
  });
  it('edits typing entries and normalizes trailing points for the left operand', () => {
    const state = press(initial(), ['1', '2', '.', '3', 'Backspace', '+']);
    expect(state).toMatchObject({ entry: '12', accumulator: '12', pendingOperator: 'add', entryMode: 'operand' });
    expect(state.request).toBeNull();
  });
  it('replaces the pending operator only for the stored operand', () => {
    const state = press(initial(), ['2', '+']);
    expect(press(state, ['*'])).toMatchObject({
      entry: '2',
      entryMode: 'operand',
      pendingOperator: 'multiply',
      request: null,
    });
  });
  it('C keeps pending operands and clears approximation', () => {
    const state = succeed(press(initial(), ['9', '+', '1', '6', 'r']), '4', { inexact: true });
    expect(press(state, ['Delete'])).toMatchObject({
      entry: '0',
      entryMode: 'typing',
      inexact: false,
      accumulator: '9',
      pendingOperator: 'add',
    });
    expect(press(press(initial(), ['9', '+']), ['Delete'])).toMatchObject({
      entry: '0',
      entryMode: 'typing',
      accumulator: '9',
      pendingOperator: 'add',
    });
  });
  it('keeps approximation when storing a left operand and clears it on recall', () => {
    const state = succeed(busy(), '5', { inexact: true });
    expect(press(state, ['+'])).toMatchObject({ entry: '5', entryMode: 'operand', inexact: true });
    expect(run(press(state, ['+']), { type: 'historyRecalled', value: '16' })).toMatchObject({
      entry: '16',
      entryMode: 'fresh',
      accumulator: '5',
      pendingOperator: 'add',
      inexact: false,
    });
  });
  it('clears idle history and preserves other fields', () => {
    const state = initial();
    const next = run(state, { type: 'historyCleared' });
    expect(next).toEqual({ ...state, history: [] });
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.history)).toBe(true);
  });
});

const requestCases = deepFreeze([
  { keys: ['2', '+', '3', '='], continuation: { kind: 'complete' } as const },
  { keys: ['2', '+', '3', '*'], continuation: { kind: 'chain', operator: 'multiply' } as const },
  { keys: ['9', '+', '1', '6', 'r'], continuation: { kind: 'replaceEntry' } as const },
]);
describe('completions and history', () => {
  it.each(requestCases.flatMap((test) => [false, true].map((inexact) => ({ ...test, inexact }))))(
    'applies $continuation.kind success, inexact $inexact',
    ({ keys, continuation, inexact }) => {
      const state = press(initial(), keys);
      const request = requestOf(state);
      expectRequest(
        state,
        continuation.kind === 'replaceEntry' ? 'sqrt' : 'add',
        continuation.kind === 'replaceEntry' ? ['16'] : ['2', '3'],
        continuation,
      );
      expect(request.id).toBe(1);
      expect(state.nextRequestId).toBe(2);
      expect(state.history).toEqual(history);
      const next = succeed(state, '5', { inexact, historyId: 'new' });
      expect(next).toMatchObject({
        entry: '5',
        inexact,
        status: 'idle',
        request: null,
        error: null,
        entryMode: continuation.kind === 'chain' ? 'operand' : 'fresh',
        accumulator: continuation.kind === 'chain' ? '5' : continuation.kind === 'replaceEntry' ? '9' : null,
        pendingOperator:
          continuation.kind === 'chain' ? 'multiply' : continuation.kind === 'replaceEntry' ? 'add' : null,
      });
      expect(next.history).toEqual([
        { id: 'new', operation: request.operation, operands: request.operands, result: '5', inexact },
        ...history,
      ]);
      for (const value of [next, next.history, next.history[0], next.history[0]?.operands])
        expect(Object.isFrozen(value)).toBe(true);
      expect(state.request).toBe(request);
      expect(state.history).toEqual(history);
      expect(request.operands).toEqual(continuation.kind === 'replaceEntry' ? ['16'] : ['2', '3']);
    },
  );
  it.each(requestCases)('failure of $continuation.kind clears pending state without history', ({ keys }) => {
    const state = deepFreeze({ ...press(initial(), keys), inexact: true });
    const error = deepFreeze({ message: 'Something went wrong' });
    const next = fail(state, error);
    expect(next.error).toBe(error);
    expect(next).toEqual({
      ...state,
      entry: '0',
      entryMode: 'fresh',
      accumulator: null,
      pendingOperator: null,
      inexact: false,
      status: 'error',
      error: { message: 'Something went wrong' },
      request: null,
    });
    expect(next.history).toBe(state.history);
  });
  it('uses captured operation and continuation despite different response metadata', () => {
    const state = press(initial(), ['2', '+', '3', '*']);
    const next = run(state, {
      type: 'calculationSucceeded',
      request: requestOf(state),
      result: { operation: 'sqrt', operands: ['25'], result: '5', inexact: false },
      historyId: 'captured',
    });
    expect(next).toMatchObject({ entry: '5', accumulator: '5', pendingOperator: 'multiply', entryMode: 'operand' });
    expect(next.history[0]).toMatchObject({ operation: 'add', operands: ['2', '3'] });
  });
  it('ignores duplicate completion and stale completion with a reused id after AC', () => {
    const old = busy();
    const action = successAction(requestOf(old));
    const completed = run(old, action);
    expect(run(completed, action)).toBe(completed);
    const current = press(old, ['Escape', '4', '+', '5', '=']);
    expect(current.request?.id).toBe(old.request?.id);
    expect(run(current, action)).toBe(current);
    expect(run(current, { type: 'calculationFailed', request: requestOf(old), error: { message: 'stale' } })).toBe(
      current,
    );
    expect(succeed(current, '9').entry).toBe('9');
  });
  it.each(['<img>', '', '1.', '1,000', '1'.repeat(129)])('reports a non-Decimal result %j as a failure', (result) => {
    const state = press(initial(), ['9', '+', '3', '*']);
    const next = succeed(state, result, { historyId: 'bad-result' });
    expect(next).toEqual({
      ...state,
      entry: '0',
      entryMode: 'fresh',
      accumulator: null,
      pendingOperator: null,
      inexact: false,
      status: 'error',
      error: { message: 'Something went wrong' },
      request: null,
    });
    expect(next.history).toBe(state.history);
  });
  it.each(['', 'x'.repeat(129), 'existing'])(
    'applies result but skips invalid or duplicate history id %s',
    (historyId) => {
      const state = busy();
      const next = succeed(state, '5', { historyId });
      expect(next.entry).toBe('5');
      expect(next.history).toBe(state.history);
    },
  );
  it('retains equal calculations separately and caps the newest 20 after 21 successes', () => {
    let state = createInitialState();
    for (let index = 0; index < 21; index++) {
      state = press(state, ['2', '+', '3', '=']);
      expectRequest(state, 'add', ['2', '3']);
      state = succeed(state, '5', { historyId: `item-${index}` });
    }
    expect(state.history).toHaveLength(20);
    expect(state.history.map((entry) => entry.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `item-${20 - index}`),
    );
    expect(state.history.every((entry) => entry.result === '5')).toBe(true);
    expect(press(state, ['Escape']).history).toBe(state.history);
  });
});

describe('calculator sequences with literal service fixtures', () => {
  it.each([
    { keys: ['1', '2', '*', '3', '='], op: 'multiply' as const, operands: ['12', '3'], result: '36' },
    { keys: ['1', '6', 'r'], op: 'sqrt' as const, operands: ['16'], result: '4' },
    { keys: ['2', '+', '3', '='], op: 'add' as const, operands: ['2', '3'], result: '5' },
    { keys: ['0', '.', '1', '+', '0', '.', '2', '='], op: 'add' as const, operands: ['0.1', '0.2'], result: '0.3' },
    { keys: ['1', '2', '.', '+', '3', '.', '='], op: 'add' as const, operands: ['12', '3'], result: '15' },
    { keys: ['2', '+', '*', '3', '='], op: 'multiply' as const, operands: ['2', '3'], result: '6' },
    { keys: ['5', '+', '='], op: 'add' as const, operands: ['5', '5'], result: '10' },
    { keys: ['0', '+', '='], op: 'add' as const, operands: ['0', '0'], result: '0' },
    { keys: ['5', '0', '%'], op: 'percentage' as const, operands: ['50'], result: '0.5' },
    { keys: ['2', '^', '1', '0', '='], op: 'power' as const, operands: ['2', '10'], result: '1024' },
    { keys: ['9', '+', '1', '2', 'Delete', '3', '='], op: 'add' as const, operands: ['9', '3'], result: '12' },
  ])('$keys requests $op with exact strings', ({ keys, op, operands, result }) => {
    const state = press(initial(), keys);
    expectRequest(
      state,
      op,
      operands,
      op === 'sqrt' || op === 'percentage' ? { kind: 'replaceEntry' } : { kind: 'complete' },
    );
    const next = succeed(state, result);
    expect(next).toMatchObject({
      entry: result,
      entryMode: 'fresh',
      inexact: false,
      pendingOperator: null,
      accumulator: null,
    });
    expect(press(next, ['='])).toBe(next);
  });
  it('chains sequentially, then replaces a stored pending operator', () => {
    const first = press(initial(), ['2', '+', '3', '*']);
    expectRequest(first, 'add', ['2', '3'], { kind: 'chain', operator: 'multiply' });
    const chained = succeed(first, '5');
    expect(chained).toMatchObject({ entry: '5', accumulator: '5', pendingOperator: 'multiply', entryMode: 'operand' });
    const replaced = press(chained, ['+']);
    expect(replaced).toMatchObject({ pendingOperator: 'add', request: null });
    const second = press(chained, ['4', '=']);
    expectRequest(second, 'multiply', ['5', '4']);
    expect(second.request?.id).toBe(2);
    expect(succeed(second, '20').entry).toBe('20');
  });
  it.each(['=', '*'])('uses a unary result as the right operand before %s', (key) => {
    const unary = press(initial(), ['9', '+', '1', '6', 'r']);
    expectRequest(unary, 'sqrt', ['16'], { kind: 'replaceEntry' });
    const result = succeed(unary, '4');
    expect(result).toMatchObject({ accumulator: '9', pendingOperator: 'add', entryMode: 'fresh' });
    const addition = press(result, [key]);
    expectRequest(
      addition,
      'add',
      ['9', '4'],
      key === '=' ? { kind: 'complete' } : { kind: 'chain', operator: 'multiply' },
    );
    if (key === '*') {
      const multiplied = press(succeed(addition, '13'), ['2', '=']);
      expectRequest(multiplied, 'multiply', ['13', '2']);
      expect(succeed(multiplied, '26').entry).toBe('26');
    } else expect(succeed(addition, '13').entry).toBe('13');
  });
  it.each(['=', '*'])('uses recall as the right operand before %s', (key) => {
    const recalled = run(press(initial(), ['9', '+']), { type: 'historyRecalled', value: key === '=' ? '16' : '36' });
    const addition = press(recalled, [key]);
    expectRequest(
      addition,
      'add',
      ['9', key === '=' ? '16' : '36'],
      key === '=' ? { kind: 'complete' } : { kind: 'chain', operator: 'multiply' },
    );
    if (key === '*') {
      const multiplied = press(succeed(addition, '45'), ['2', '=']);
      expectRequest(multiplied, 'multiply', ['45', '2']);
      expect(succeed(multiplied, '90').entry).toBe('90');
    } else expect(succeed(addition, '25').entry).toBe('25');
  });
  it('keeps the approximation marker through sign changes and clears it on a new digit', () => {
    const state = press(initial(), ['1', '/', '3', '=']);
    expectRequest(state, 'divide', ['1', '3']);
    const result = succeed(state, '0.3333333333333333333333333333333333', { inexact: true });
    expect(result.entry).toBe('0.3333333333333333333333333333333333');
    expect(press(result, ['n'])).toMatchObject({ entry: '-0.3333333333333333333333333333333333', inexact: true });
    expect(press(result, ['7'])).toMatchObject({ entry: '7', inexact: false });
    expect(press(result, ['.'])).toMatchObject({ entry: '0.', inexact: false });
  });
});
