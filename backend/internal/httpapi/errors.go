package httpapi

import (
	"errors"
	"fmt"

	"github.com/JerikH/FullStackCalculator/backend/internal/calc"
	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
)

// problemFor translates a domain error into the public problem vocabulary.
// Domain error messages are written to be client-safe; anything unrecognized
// becomes an opaque INTERNAL_ERROR.
func problemFor(err error, operation string) httpx.Problem {
	var invalid *calc.InvalidOperandsError
	switch {
	case errors.As(err, &invalid):
		violations := make([]httpx.FieldViolation, len(invalid.Operands))
		for i, op := range invalid.Operands {
			violations[i] = httpx.FieldViolation{Field: fmt.Sprintf("operands[%d]", op.Index), Reason: op.Err.Error()}
		}
		return httpx.NewProblem(httpx.CodeValidationFailed, "one or more operands are invalid", violations...)
	case errors.Is(err, calc.ErrArity):
		return httpx.NewProblem(httpx.CodeValidationFailed, err.Error(), httpx.FieldViolation{Field: "operands", Reason: err.Error()})
	case errors.Is(err, calc.ErrUnknownOperation):
		return httpx.NewProblem(httpx.CodeUnknownOperation, fmt.Sprintf("operation %q is not supported; see GET /api/v1/operations", operation))
	case errors.Is(err, calc.ErrDivisionByZero):
		return httpx.NewProblem(httpx.CodeDivisionByZero, err.Error())
	case errors.Is(err, calc.ErrUndefined):
		return httpx.NewProblem(httpx.CodeUndefinedResult, err.Error())
	case errors.Is(err, calc.ErrOverflow):
		return httpx.NewProblem(httpx.CodeOverflow, err.Error())
	default:
		return httpx.NewProblem(httpx.CodeInternal, "an unexpected error occurred")
	}
}
