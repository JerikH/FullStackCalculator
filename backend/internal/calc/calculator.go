package calc

import (
	"context"
	"fmt"
	"slices"

	"github.com/cockroachdb/apd/v3"
)

// Result is a formatted operation result.
type Result struct {
	Value   string
	Inexact bool // the exact result was rounded to Precision digits
}

// Calculator evaluates catalog operations. It is immutable after New and safe
// for concurrent use.
type Calculator struct {
	ops     map[string]operation
	catalog []OperationInfo
	context apd.Context
}

// New returns a Calculator with the built-in operation catalog.
func New() *Calculator {
	ops := builtinOperations()
	c := &Calculator{
		ops:     make(map[string]operation, len(ops)),
		catalog: make([]OperationInfo, 0, len(ops)),
		context: apd.Context{
			Precision:   Precision,
			MaxExponent: MaxExponent,
			MinExponent: MinExponent,
			Rounding:    apd.RoundHalfEven,
			// Underflow and Subnormal are deliberately not trapped: tiny
			// results round toward zero and are reported as inexact.
			Traps: apd.DivisionByZero | apd.DivisionUndefined | apd.DivisionImpossible |
				apd.InvalidOperation | apd.Overflow | apd.SystemOverflow | apd.SystemUnderflow,
		},
	}
	for _, op := range ops {
		c.ops[op.info.Name] = op
		c.catalog = append(c.catalog, op.info)
	}
	return c
}

// Operations returns the catalog in display order.
func (c *Calculator) Operations() []OperationInfo { return slices.Clone(c.catalog) }

// Has reports whether name is in the catalog.
func (c *Calculator) Has(name string) bool {
	_, ok := c.ops[name]
	return ok
}

// Calculate applies the named operation to operands given in wire syntax.
func (c *Calculator) Calculate(ctx context.Context, name string, operands []string) (Result, error) {
	if err := ctx.Err(); err != nil {
		return Result{}, err
	}
	op, ok := c.ops[name]
	if !ok {
		return Result{}, fmt.Errorf("%w: %q", ErrUnknownOperation, name)
	}
	if len(operands) != op.info.Arity {
		return Result{}, arityError(op.info, len(operands))
	}
	args, err := parseOperands(operands)
	if err != nil {
		return Result{}, err
	}
	decimalCtx := c.context // apd.Context is a value; a copy keeps calls independent
	var d apd.Decimal
	cond, err := op.apply(&decimalCtx, &d, args)
	if err != nil {
		return Result{}, classify(cond, err)
	}
	if d.Form != apd.Finite {
		return Result{}, ErrOverflow
	}
	if !d.IsZero() && adjustedExponent(&d) < MinExponent {
		d.SetInt64(0)
		cond |= apd.Underflow | apd.Inexact | apd.Rounded | apd.Subnormal
	}
	return Result{Value: Format(&d), Inexact: cond.Inexact()}, nil
}

func parseOperands(raw []string) ([]*apd.Decimal, error) {
	args := make([]*apd.Decimal, len(raw))
	var invalid []OperandError
	for i, s := range raw {
		d, err := Parse(s)
		if err != nil {
			invalid = append(invalid, OperandError{Index: i, Err: err})
			continue
		}
		args[i] = d
	}
	if len(invalid) > 0 {
		return nil, &InvalidOperandsError{Operands: invalid}
	}
	return args, nil
}
