package calc

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/cockroachdb/apd/v3"

	"github.com/google/go-cmp/cmp"
)

func TestOperationsCatalog(t *testing.T) {
	t.Parallel()
	want := []OperationInfo{
		{Name: "add", Symbol: "+", Arity: 2, Description: "Sum of two numbers"},
		{Name: "subtract", Symbol: "−", Arity: 2, Description: "Difference of two numbers"},
		{Name: "multiply", Symbol: "×", Arity: 2, Description: "Product of two numbers"},
		{Name: "divide", Symbol: "÷", Arity: 2, Description: "Quotient of two numbers"},
		{Name: "power", Symbol: "^", Arity: 2, Description: "First number raised to the power of the second"},
		{Name: "sqrt", Symbol: "√", Arity: 1, Description: "Principal square root"},
		{Name: "percentage", Symbol: "%", Arity: 1, Description: "Value divided by one hundred"},
	}
	c := New()
	if diff := cmp.Diff(want, c.Operations()); diff != "" {
		t.Fatalf("Operations() mismatch (-want +got):\n%s", diff)
	}
	c.Operations()[0].Name = "mutated"
	if c.Operations()[0].Name != "add" {
		t.Fatal("Operations() must return a defensive copy")
	}
	if !c.Has("sqrt") || c.Has("modulo") {
		t.Fatal("Has() does not reflect the catalog")
	}
}

func TestCalculateResults(t *testing.T) {
	t.Parallel()
	tests := []struct {
		op          string
		operands    []string
		want        string
		wantInexact bool
	}{
		{"add", []string{"0.1", "0.2"}, "0.3", false},
		{"subtract", []string{"0", "0"}, "0", false},
		{"divide", []string{"-0", "5"}, "0", false},
		{"power", []string{"2.0", "3"}, "8", false},
		{"power", []string{"-2", "2.0"}, "4", false},
		{"power", []string{"10", "-7"}, "1e-7", false},
		{"power", []string{"-0", "0"}, "1", false},
		{"power", []string{"0", "-0"}, "1", false},
		{"power", []string{"1", "-1e30"}, "1", false},
		{"power", []string{"-1", "1000000000000000000000000000001"}, "-1", false},
		{"power", []string{"-0", "0.5"}, "0", false},
		{"add", []string{"9.999999999999999999999999999999999e6144", "0"}, "9.999999999999999999999999999999999e+6144", false},
		{"sqrt", []string{"1e-6142"}, "1e-3071", false},
		{"divide", []string{"1e-6143", "10"}, "0", true},
		{"percentage", []string{"1e-6143"}, "0", true},
		{"multiply", []string{"1.234567e-6143", "1e-30"}, "0", true},
		{"power", []string{"10", "-6144"}, "0", true},
		{"add", []string{"1e30", "1e-10"}, "1e+30", true},
		{"add", []string{"-5", "5"}, "0", false},
		{"subtract", []string{"5", "7.5"}, "-2.5", false},
		{"subtract", []string{"0.3", "0.1"}, "0.2", false},
		{"multiply", []string{"-3", "4"}, "-12", false},
		{"multiply", []string{"0", "-5"}, "0", false},
		{"multiply", []string{"1.5", "1.5"}, "2.25", false},
		{"multiply", []string{"1e-6000", "1e-6000"}, "0", true},
		{"divide", []string{"10", "4"}, "2.5", false},
		{"divide", []string{"1", "3"}, "0.3333333333333333333333333333333333", true},
		{"divide", []string{"2", "3"}, "0.6666666666666666666666666666666667", true},
		{"divide", []string{"-1", "8"}, "-0.125", false},
		{"power", []string{"2", "10"}, "1024", false},
		{"power", []string{"2", "-2"}, "0.25", false},
		{"power", []string{"0", "0"}, "1", false},
		{"power", []string{"-2", "3"}, "-8", false},
		{"power", []string{"10", "21"}, "1e+21", false},
		{"sqrt", []string{"16"}, "4", false},
		{"sqrt", []string{"0.25"}, "0.5", false},
		{"sqrt", []string{"2"}, "1.414213562373095048801688724209698", true},
		{"sqrt", []string{"-0"}, "0", false},
		{"percentage", []string{"50"}, "0.5", false},
		{"percentage", []string{"-12.5"}, "-0.125", false},
		{"percentage", []string{"0"}, "0", false},
	}
	c := New()
	for _, tt := range tests {
		t.Run(tt.op+"/"+joinOperands(tt.operands), func(t *testing.T) {
			t.Parallel()
			got, err := c.Calculate(context.Background(), tt.op, tt.operands)
			if err != nil {
				t.Fatalf("Calculate error = %v", err)
			}
			want := Result{Value: tt.want, Inexact: tt.wantInexact}
			if got != want {
				t.Fatalf("Calculate = %+v, want %+v", got, want)
			}
		})
	}
}

// TestCalculateFractionalPowerValue pins both the value and exactness.
func TestCalculateFractionalPowerValue(t *testing.T) {
	t.Parallel()
	tests := []struct {
		base, exponent, want string
		inexact              bool
	}{
		{"4", "0.5", "2", false},
		{"16", "0.25", "2", false},
		{"1", "0.5", "1", false},
		{"0.25", "0.5", "0.5", false},
		{"8", "1.5", "22.62741699796952078082701958735517", true},
		{"9", "-0.5", "0.3333333333333333333333333333333333", true},
		{"8", "0.3333333333333333333333333333333333", "2", true},
		{"1.5", "2.5", "2.755675960631075360471944584044128", true},
		{"9", "1.5", "27", false},
		{"100", "0.5", "10", false},
		{"4", "-0.5", "0.5", false},
		{"16", "-0.25", "0.5", false},
		{"4", "0.50", "2", false},
		{"4", "5e-1", "2", false},
		{"1", "0.001", "1", false},
		{"1", "1234.5", "1", false},
		{"1.000", "-0.5", "1", false},
		{"1e6144", "0.984375", "1e+6048", false},
		{"1e6144", "-0.984375", "1e-6048", false},
		{"1e-6143", "0.5", "3.162277660168379331998893544432719e-3072", true},
	}
	for _, tt := range tests {
		t.Run(tt.base+"^"+tt.exponent, func(t *testing.T) {
			t.Parallel()
			got, err := New().Calculate(context.Background(), "power", []string{tt.base, tt.exponent})
			want := Result{Value: tt.want, Inexact: tt.inexact}
			if err != nil || got != want {
				t.Fatalf("power = %+v, %v; want %+v", got, err, want)
			}
		})
	}
}

func TestCalculateErrors(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		op         string
		operands   []string
		wantErr    error
		wantDetail string
	}{
		{"negative zero divisor", "divide", []string{"1", "-0"}, ErrDivisionByZero, "the divisor must not be zero"},
		{"negative zero power", "power", []string{"-0", "-1"}, ErrDivisionByZero, "zero cannot be raised to a negative power"},
		{"negative fractional", "power", []string{"-8", "1.5"}, ErrUndefined, "a negative number raised to a non-integer power is not a real number"},
		{"negative small sqrt", "sqrt", []string{"-0.0001"}, ErrUndefined, "square root of a negative number is not a real number"},
		{"add overflow", "add", []string{"9.999999999999999999999999999999999e6144", "9.999999999999999999999999999999999e6144"}, ErrOverflow, "the result is outside the supported range (1e-6143 … 1e6144)"},
		{"divide overflow", "divide", []string{"1e6144", "1e-6143"}, ErrOverflow, "the result is outside the supported range (1e-6143 … 1e6144)"},
		{"percentage arity", "percentage", []string{"1", "2"}, ErrArity, "percentage takes exactly 1 operand, got 2"},
		{"divide arity", "divide", []string{"1", "2", "3"}, ErrArity, "divide takes exactly 2 operands, got 3"},
		{"add empty", "add", nil, ErrArity, "add takes exactly 2 operands, got 0"},
		{"arity before validity", "add", []string{"abc"}, ErrArity, "add takes exactly 2 operands, got 1"},
		{"divide by zero", "divide", []string{"1", "0"}, ErrDivisionByZero, "the divisor must not be zero"},
		{"zero over zero", "divide", []string{"0", "0"}, ErrUndefined, "zero divided by zero is undefined"},
		{"zero to negative power", "power", []string{"0", "-1"}, ErrDivisionByZero, "zero cannot be raised to a negative power"},
		{"sqrt of negative", "sqrt", []string{"-4"}, ErrUndefined, "square root of a negative number is not a real number"},
		{"negative base fractional exponent", "power", []string{"-8", "0.5"}, ErrUndefined, "a negative number raised to a non-integer power is not a real number"},
		{"power overflow", "power", []string{"10", "6145"}, ErrOverflow, "the result is outside the supported range (1e-6143 … 1e6144)"},
		{"huge exponent overflow", "power", []string{"2", "1e30"}, ErrOverflow, "the result is outside the supported range (1e-6143 … 1e6144)"},
		{"multiply overflow", "multiply", []string{"1e6144", "10"}, ErrOverflow, "the result is outside the supported range (1e-6143 … 1e6144)"},
		{"unknown operation", "modulo", []string{"1", "2"}, ErrUnknownOperation, `unknown operation: "modulo"`},
		{"too few operands", "add", []string{"1"}, ErrArity, "add takes exactly 2 operands, got 1"},
		{"too many operands", "sqrt", []string{"1", "2"}, ErrArity, "sqrt takes exactly 1 operand, got 2"},
	}
	c := New()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			_, err := c.Calculate(context.Background(), tt.op, tt.operands)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want %v", err, tt.wantErr)
			}
			if err.Error() != tt.wantDetail {
				t.Fatalf("error text = %q, want %q", err.Error(), tt.wantDetail)
			}
		})
	}
}

func TestCalculateCollectsEveryInvalidOperand(t *testing.T) {
	t.Parallel()
	_, err := New().Calculate(context.Background(), "add", []string{"abc", "1e99999"})
	var invalid *InvalidOperandsError
	if !errors.As(err, &invalid) {
		t.Fatalf("error = %v, want *InvalidOperandsError", err)
	}
	want := []OperandError{{Index: 0, Err: ErrInvalidNumber}, {Index: 1, Err: ErrOutOfRange}}
	if diff := cmp.Diff(want, invalid.Operands, cmp.Comparer(errors.Is)); diff != "" {
		t.Fatalf("operands mismatch (-want +got):\n%s", diff)
	}
	if !errors.Is(err, ErrOutOfRange) {
		t.Fatal("InvalidOperandsError must unwrap to each operand error")
	}
}

func TestCalculateHonoursCanceledContext(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := New().Calculate(ctx, "add", []string{"1", "2"}); !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
}

func joinOperands(ops []string) string {
	out := ""
	for i, o := range ops {
		if i > 0 {
			out += ","
		}
		out += o
	}
	return out
}

func TestCalculatePowerQuadrants(t *testing.T) {
	t.Parallel()
	for _, base := range []string{"2", "0.1", "-2", "-0.1"} {
		for _, exponent := range []string{"1e30", "-1e30"} {
			t.Run(base+"^"+exponent, func(t *testing.T) {
				t.Parallel()
				got, err := New().Calculate(context.Background(), "power", []string{base, exponent})
				overflow := (base == "2" || base == "-2") == (exponent == "1e30")
				if overflow {
					if !errors.Is(err, ErrOverflow) || err.Error() != "the result is outside the supported range (1e-6143 … 1e6144)" {
						t.Fatalf("error = %v", err)
					}
				} else if err != nil || got != (Result{Value: "0", Inexact: true}) {
					t.Fatalf("result = %+v, %v", got, err)
				}
			})
		}
	}
}

func TestCalculateContextAndValidationOrder(t *testing.T) {
	t.Parallel()
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	deadline, stop := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer stop()
	for _, tt := range []struct {
		ctx  context.Context
		want error
	}{{canceled, context.Canceled}, {deadline, context.DeadlineExceeded}} {
		if _, err := New().Calculate(tt.ctx, "unknown", nil); !errors.Is(err, tt.want) {
			t.Fatalf("error = %v, want %v", err, tt.want)
		}
	}
	if _, err := New().Calculate(context.Background(), "unknown", []string{"abc"}); !errors.Is(err, ErrUnknownOperation) {
		t.Fatalf("error = %v", err)
	}
}

func TestCalculateIsSafeForConcurrentUse(t *testing.T) {
	t.Parallel()
	c := New()
	cases := []struct {
		op   string
		args []string
	}{{"add", []string{"0.1", "0.2"}}, {"sqrt", []string{"2"}}, {"power", []string{"4", "0.5"}}, {"divide", []string{"1", "3"}}, {"multiply", []string{"1e-6000", "1e-6000"}}, {"subtract", []string{"1", "2"}}, {"percentage", []string{"50"}}}
	wants := make([]Result, len(cases))
	for i, tt := range cases {
		got, err := c.Calculate(context.Background(), tt.op, tt.args)
		if err != nil {
			t.Fatal(err)
		}
		wants[i] = got
	}
	var wg sync.WaitGroup
	for range 8 {
		wg.Go(func() {
			for range 10 {
				for i, tt := range cases {
					got, err := c.Calculate(context.Background(), tt.op, tt.args)
					if err != nil || got != wants[i] {
						t.Errorf("%s = %+v, %v; want %+v", tt.op, got, err, wants[i])
					}
				}
			}
		})
	}
	wg.Wait()
}

func TestCalculateRejectsNonFiniteResults(t *testing.T) {
	t.Parallel()
	for _, form := range []apd.Form{apd.Infinite, apd.NaN} {
		c := New()
		c.ops["broken"] = operation{
			info: OperationInfo{Name: "broken", Arity: 1},
			apply: func(_ *apd.Context, d *apd.Decimal, _ []*apd.Decimal) (apd.Condition, error) {
				d.Form = form
				return 0, nil
			},
		}
		if _, err := c.Calculate(context.Background(), "broken", []string{"1"}); !errors.Is(err, ErrOverflow) {
			t.Fatalf("form %v: error = %v, want ErrOverflow", form, err)
		}
	}
}

func TestIsExactSquareRoot(t *testing.T) {
	t.Parallel()
	if !isExactSquareRoot(mustDecimal(t, "2"), mustDecimal(t, "4")) {
		t.Fatal("2 squared must equal 4")
	}
	if isExactSquareRoot(mustDecimal(t, "1.414213562373095048801688724209698"), mustDecimal(t, "2")) {
		t.Fatal("rounded square root must not be exact")
	}
}

func TestIsExactFractionalPower(t *testing.T) {
	t.Parallel()
	for _, tt := range []struct {
		result, base, exponent string
		want                   bool
	}{
		{"2", "4", "0.5", true},
		{"0.5", "4", "-0.5", true},
		{"1e6048", "1e6144", "0.984375", true},
		{"1e-6048", "1e6144", "-0.984375", true},
		{"27", "9", "1.5", true},
		{"28", "9", "1.5", false},
		{"20", "400", "0.5", true},
		{"2", "400", "0.5", false},
		{"2", "4", "0.3", false},
		{"2", "8", "0.3333333", false},
		{"2", "4", "2", false},
	} {
		if got := isExactFractionalPower(mustDecimal(t, tt.result), mustDecimal(t, tt.base), mustDecimal(t, tt.exponent)); got != tt.want {
			t.Errorf("isExactFractionalPower(%s, %s, %s) = %v, want %v", tt.result, tt.base, tt.exponent, got, tt.want)
		}
	}
}

func TestCalculatorContext(t *testing.T) {
	t.Parallel()
	want := apd.Context{Precision: Precision, MaxExponent: MaxExponent, MinExponent: MinExponent, Rounding: apd.RoundHalfEven, Traps: apd.DivisionByZero | apd.DivisionUndefined | apd.DivisionImpossible | apd.InvalidOperation | apd.Overflow | apd.SystemOverflow | apd.SystemUnderflow}
	if got := New().context; got != want {
		t.Fatalf("context = %+v, want %+v", got, want)
	}
}
