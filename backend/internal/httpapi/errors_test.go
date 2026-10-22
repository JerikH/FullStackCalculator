package httpapi

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/JerikH/FullStackCalculator/backend/internal/calc"
	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
)

func TestProblemForMapsEveryDomainError(t *testing.T) {
	t.Parallel()
	_, arity := calc.New().Calculate(context.Background(), "sqrt", []string{"1", "2"})
	tests := []struct {
		err  error
		code httpx.Code
	}{
		{calc.ErrDivisionByZero, httpx.CodeDivisionByZero},
		{calc.ErrUndefined, httpx.CodeUndefinedResult},
		{calc.ErrOverflow, httpx.CodeOverflow},
		{calc.ErrUnknownOperation, httpx.CodeUnknownOperation},
		{&calc.InvalidOperandsError{Operands: []calc.OperandError{{Index: 1, Err: calc.ErrTooManyDigits}}}, httpx.CodeValidationFailed},
		{errors.New("other"), httpx.CodeInternal},
		{fmt.Errorf("wrapped: %w", arity), httpx.CodeValidationFailed},
		{context.Canceled, httpx.CodeInternal},
		{context.DeadlineExceeded, httpx.CodeInternal},
	}
	for _, tt := range tests {
		if got := problemFor(tt.err, "x"); got.Code != tt.code {
			t.Errorf("problemFor(%v).Code = %s, want %s", tt.err, got.Code, tt.code)
		}
	}
}
