package calc

import (
	"math/big"

	"github.com/cockroachdb/apd/v3"
)

// OperationInfo describes a catalog entry.
type OperationInfo struct {
	Name        string
	Symbol      string
	Description string
	Arity       int
}

type applyFunc func(c *apd.Context, d *apd.Decimal, args []*apd.Decimal) (apd.Condition, error)

type operation struct {
	info  OperationInfo
	apply applyFunc
}

var (
	one     = apd.New(1, 0)
	hundred = apd.New(100, 0)
)

// builtinOperations is the catalog in display order. Adding an operation means
// appending here and to OperationName in api/openapi.yaml (a contract test
// fails if the two diverge).
func builtinOperations() []operation {
	return []operation{
		{OperationInfo{Name: "add", Symbol: "+", Arity: 2, Description: "Sum of two numbers"}, binary((*apd.Context).Add)},
		{OperationInfo{Name: "subtract", Symbol: "−", Arity: 2, Description: "Difference of two numbers"}, binary((*apd.Context).Sub)},
		{OperationInfo{Name: "multiply", Symbol: "×", Arity: 2, Description: "Product of two numbers"}, binary((*apd.Context).Mul)},
		{OperationInfo{Name: "divide", Symbol: "÷", Arity: 2, Description: "Quotient of two numbers"}, divide},
		{OperationInfo{Name: "power", Symbol: "^", Arity: 2, Description: "First number raised to the power of the second"}, power},
		{OperationInfo{Name: "sqrt", Symbol: "√", Arity: 1, Description: "Principal square root"}, sqrt},
		{OperationInfo{Name: "percentage", Symbol: "%", Arity: 1, Description: "Value divided by one hundred"}, percentage},
	}
}

func binary(f func(*apd.Context, *apd.Decimal, *apd.Decimal, *apd.Decimal) (apd.Condition, error)) applyFunc {
	return func(c *apd.Context, d *apd.Decimal, args []*apd.Decimal) (apd.Condition, error) {
		return f(c, d, args[0], args[1])
	}
}

func divide(c *apd.Context, d *apd.Decimal, args []*apd.Decimal) (apd.Condition, error) {
	if args[1].IsZero() {
		if args[0].IsZero() {
			return 0, &detailedError{kind: ErrUndefined, detail: "zero divided by zero is undefined"}
		}
		return 0, ErrDivisionByZero
	}
	return c.Quo(d, args[0], args[1])
}

func power(c *apd.Context, d *apd.Decimal, args []*apd.Decimal) (apd.Condition, error) {
	base, exp := args[0], args[1]
	switch {
	case base.IsZero() && exp.IsZero():
		// 0^0 = 1 by the convention of Go's math.Pow and most calculators;
		// GDA would signal InvalidOperation instead.
		d.SetInt64(1)
		return 0, nil
	case base.IsZero() && exp.Negative:
		return 0, &detailedError{kind: ErrDivisionByZero, detail: "zero cannot be raised to a negative power"}
	case base.Cmp(one) == 0:
		// 1^y = 1 exactly for every y; apd flags fractional powers inexact.
		d.SetInt64(1)
		return 0, nil
	case base.Negative && !base.IsZero() && !isInteger(exp):
		return 0, &detailedError{kind: ErrUndefined, detail: "a negative number raised to a non-integer power is not a real number"}
	}
	cond, err := c.Pow(d, base, exp)
	if err != nil && cond&(apd.Overflow|apd.Underflow|apd.SystemOverflow|apd.SystemUnderflow) != 0 {
		var magnitude apd.Decimal
		magnitude.Abs(base)
		cmp := magnitude.Cmp(apd.New(1, 0))
		if (cmp > 0 && !exp.Negative) || (cmp < 0 && exp.Negative) {
			return cond, ErrOverflow
		}
		d.SetInt64(0)
		return apd.Underflow | apd.Inexact | apd.Rounded | apd.Subnormal, nil
	}
	if err == nil && !isInteger(exp) && cond.Inexact() && d.Form == apd.Finite && !d.IsZero() && isExactFractionalPower(d, base, exp) {
		cond &^= apd.Inexact | apd.Rounded
	}
	return cond, err
}

func sqrt(c *apd.Context, d *apd.Decimal, args []*apd.Decimal) (apd.Condition, error) {
	x := args[0]
	if x.Negative && !x.IsZero() {
		return 0, &detailedError{kind: ErrUndefined, detail: "square root of a negative number is not a real number"}
	}
	cond, err := c.Sqrt(d, x)
	if err != nil {
		return cond, err
	}
	if cond.Inexact() && isExactSquareRoot(d, x) {
		cond &^= apd.Inexact | apd.Rounded
	}
	return cond, nil
}

func percentage(c *apd.Context, d *apd.Decimal, args []*apd.Decimal) (apd.Condition, error) {
	return c.Quo(d, args[0], hundred)
}

func isInteger(d *apd.Decimal) bool {
	var r apd.Decimal
	r.Reduce(d)
	return r.Exponent >= 0
}

// isExactSquareRoot reports whether root² == x. Squaring a 34-digit number
// needs at most 68 digits, so a 70-digit context never rounds.
func isExactSquareRoot(root, x *apd.Decimal) bool {
	var sq apd.Decimal
	if _, err := apd.BaseContext.WithPrecision(2*Precision+2).Mul(&sq, root, root); err != nil {
		return false
	}
	return sq.Cmp(x) == 0
}

// isExactFractionalPower reports whether result^q == base^p exactly, where
// p/q is exponent in lowest terms (bounded: q <= 64, |p| <= 64). Reduced
// decimals c×10^e (c not divisible by 10) have a unique representation, and so
// do their integer powers, so the check compares the integer coefficients and
// the exponents separately — no decimal context, no exponent range to overflow.
func isExactFractionalPower(result, base, exponent *apd.Decimal) bool {
	var reduced apd.Decimal
	reduced.Reduce(exponent)
	// A reduced decimal with more than six fractional places cannot have a
	// denominator at most 64: the denominator contains only factors 2 and 5.
	if reduced.Exponent < -6 || reduced.Exponent >= 0 {
		return false
	}
	denominator := new(big.Int).Exp(big.NewInt(10), big.NewInt(-int64(reduced.Exponent)), nil)
	numerator := new(big.Int).Set(reduced.Coeff.MathBigInt())
	gcd := new(big.Int).GCD(nil, nil, numerator, denominator)
	numerator.Quo(numerator, gcd)
	denominator.Quo(denominator, gcd)
	if !numerator.IsInt64() || numerator.Int64() > 64 || denominator.Int64() > 64 {
		return false
	}
	p, q := numerator.Int64(), denominator.Int64()
	var r, b apd.Decimal
	r.Reduce(result)
	b.Reduce(base)
	if r.Negative || b.Negative {
		return false
	}
	left := new(big.Int).Exp(r.Coeff.MathBigInt(), big.NewInt(q), nil)
	right := new(big.Int).Exp(b.Coeff.MathBigInt(), big.NewInt(p), nil)
	leftExp, rightExp := int64(r.Exponent)*q, int64(b.Exponent)*p
	if exponent.Negative {
		// result^q × base^p == 1: the product of the coefficients must be a
		// power of ten that the exponents cancel (0.5² × 4 = 25 × 4 × 10^-2).
		product := new(big.Int).Mul(left, right)
		ten, rem := big.NewInt(10), new(big.Int)
		shift := int64(0)
		for {
			quo, mod := new(big.Int).QuoRem(product, ten, rem)
			if mod.Sign() != 0 {
				break
			}
			product, shift = quo, shift+1
		}
		return product.IsInt64() && product.Int64() == 1 && leftExp+rightExp+shift == 0
	}
	return left.Cmp(right) == 0 && leftExp == rightExp
}
