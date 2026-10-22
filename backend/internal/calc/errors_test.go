package calc

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/cockroachdb/apd/v3"
)

func TestOutcome(t *testing.T) {
	t.Parallel()
	tests := []struct {
		err  error
		want string
	}{
		{nil, "ok"},
		{fmt.Errorf("%w: %q", ErrUnknownOperation, "x"), "unknown_operation"},
		{&detailedError{kind: ErrArity, detail: "d"}, "invalid_input"},
		{&InvalidOperandsError{Operands: []OperandError{{Index: 0, Err: ErrInvalidNumber}}}, "invalid_input"},
		{ErrDivisionByZero, "division_by_zero"},
		{ErrUndefined, "undefined_result"},
		{ErrOverflow, "overflow"},
		{context.Canceled, "canceled"},
		{context.DeadlineExceeded, "canceled"},
		{errors.New("boom"), "internal"},
	}
	for _, tt := range tests {
		if got := Outcome(tt.err); got != tt.want {
			t.Errorf("Outcome(%v) = %q, want %q", tt.err, got, tt.want)
		}
	}
}

func TestInvalidOperandsErrorMessage(t *testing.T) {
	t.Parallel()
	err := &InvalidOperandsError{Operands: []OperandError{{Index: 0, Err: ErrInvalidNumber}, {Index: 1, Err: ErrTooManyDigits}}}
	want := `invalid operands: operand 0: must be a decimal number in JSON number syntax, e.g. "-12.5" or "1e-3"; operand 1: must have at most 34 significant digits`
	if err.Error() != want {
		t.Fatalf("Error() = %q, want %q", err.Error(), want)
	}
}

func TestClassify(t *testing.T) {
	t.Parallel()
	failure := errors.New("arithmetic failed")
	for _, tt := range []struct {
		condition apd.Condition
		want      error
	}{
		{apd.DivisionByZero, ErrDivisionByZero},
		{apd.DivisionUndefined, ErrDivisionByZero},
		{apd.Overflow, ErrOverflow},
		{apd.SystemOverflow, ErrOverflow},
		{apd.SystemUnderflow, ErrOverflow},
		{apd.InvalidOperation, ErrUndefined},
		{apd.DivisionImpossible, ErrUndefined},
	} {
		if got := classify(tt.condition, failure); !errors.Is(got, tt.want) {
			t.Errorf("classify(%v) = %v, want %v", tt.condition, got, tt.want)
		}
	}
	for _, sentinel := range []error{ErrDivisionByZero, ErrUndefined, ErrOverflow} {
		wrapped := fmt.Errorf("wrapped: %w", sentinel)
		if got := classify(0, wrapped); !errors.Is(got, wrapped) || got.Error() != wrapped.Error() {
			t.Errorf("classify changed pre-check error: %v", got)
		}
	}
	got := classify(0, failure)
	if !errors.Is(got, failure) || Outcome(got) != "internal" || got.Error() != "calc: unexpected arithmetic condition : arithmetic failed" {
		t.Fatalf("classify fallback = %v", got)
	}
}
