package calc

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/cockroachdb/apd/v3"
)

// Request-shape errors.
var (
	ErrUnknownOperation = errors.New("unknown operation")
	ErrArity            = errors.New("wrong number of operands")
)

// Mathematical errors. Messages are the default user-facing details.
var (
	ErrDivisionByZero = errors.New("the divisor must not be zero")
	ErrUndefined      = errors.New("the result is not a real number")
	ErrOverflow       = errors.New("the result is outside the supported range (1e-6143 … 1e6144)")
)

// detailedError refines a sentinel with a more specific message while staying
// matchable with errors.Is.
type detailedError struct {
	kind   error
	detail string
}

func (e *detailedError) Error() string { return e.detail }
func (e *detailedError) Unwrap() error { return e.kind }

// OperandError reports why the operand at Index was rejected.
type OperandError struct {
	Index int
	Err   error
}

func (e *OperandError) Error() string { return fmt.Sprintf("operand %d: %v", e.Index, e.Err) }
func (e *OperandError) Unwrap() error { return e.Err }

// InvalidOperandsError lists every rejected operand so clients can fix all of
// them in one round trip.
type InvalidOperandsError struct {
	Operands []OperandError
}

func (e *InvalidOperandsError) Error() string {
	parts := make([]string, len(e.Operands))
	for i := range e.Operands {
		parts[i] = e.Operands[i].Error()
	}
	return "invalid operands: " + strings.Join(parts, "; ")
}

func (e *InvalidOperandsError) Unwrap() []error {
	errs := make([]error, len(e.Operands))
	for i := range e.Operands {
		errs[i] = &e.Operands[i]
	}
	return errs
}

func arityError(info OperationInfo, got int) error {
	noun := "operands"
	if info.Arity == 1 {
		noun = "operand"
	}
	return &detailedError{
		kind:   ErrArity,
		detail: fmt.Sprintf("%s takes exactly %d %s, got %d", info.Name, info.Arity, noun, got),
	}
}

// classify maps an apd failure to a domain error. Errors raised by our own
// pre-checks are already domain errors and pass through untouched.
func classify(cond apd.Condition, err error) error {
	if errors.Is(err, ErrDivisionByZero) || errors.Is(err, ErrUndefined) || errors.Is(err, ErrOverflow) {
		return err
	}
	switch {
	case cond.DivisionByZero(), cond.DivisionUndefined():
		return ErrDivisionByZero
	case cond.Overflow(), cond.SystemOverflow(), cond.SystemUnderflow():
		return ErrOverflow
	case cond.InvalidOperation(), cond.DivisionImpossible():
		return ErrUndefined
	default:
		return fmt.Errorf("calc: unexpected arithmetic condition %v: %w", cond, err)
	}
}

// Outcome is a bounded, low-cardinality label describing err, for metrics.
func Outcome(err error) string {
	var invalid *InvalidOperandsError
	switch {
	case err == nil:
		return "ok"
	case errors.Is(err, ErrUnknownOperation):
		return "unknown_operation"
	case errors.Is(err, ErrArity), errors.As(err, &invalid):
		return "invalid_input"
	case errors.Is(err, ErrDivisionByZero):
		return "division_by_zero"
	case errors.Is(err, ErrUndefined):
		return "undefined_result"
	case errors.Is(err, ErrOverflow):
		return "overflow"
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return "canceled"
	default:
		return "internal"
	}
}
