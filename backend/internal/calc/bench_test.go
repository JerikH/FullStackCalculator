package calc

import (
	"context"
	"testing"
)

// BenchmarkCalculate measures the standard operation cases.
func BenchmarkCalculate(b *testing.B) {
	c := New()
	ctx := context.Background()
	cases := []struct {
		name     string
		op       string
		operands []string
	}{
		{"add", "add", []string{"0.1", "0.2"}},
		{"divide_repeating", "divide", []string{"1", "3"}},
		{"sqrt_irrational", "sqrt", []string{"2"}},
		{"power_large_integer", "power", []string{"1.0000001", "123456789"}},
		{"power_fractional", "power", []string{"2", "0.5"}},
		{"power_overflow", "power", []string{"2", "1e30"}},
	}
	for _, tc := range cases {
		b.Run(tc.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_, _ = c.Calculate(ctx, tc.op, tc.operands)
			}
		})
	}
}

// BenchmarkCalculateWorstCase measures fractional powers with operands at the
// edges of the supported range, the most expensive inputs the engine accepts.
func BenchmarkCalculateWorstCase(b *testing.B) {
	const (
		maxOperand   = "9.999999999999999999999999999999999e6144"
		minOperand   = "1e-6143"
		nearOne      = "0.9999999999999999999999999999999999"
		nearMinus1   = "-0.9999999999999999999999999999999999"
		smallOperand = "1.5e-6143"
	)
	c := New()
	ctx := context.Background()
	cases := []struct {
		name     string
		operands []string
	}{
		{"max^0.5", []string{maxOperand, "0.5"}},
		{"min^0.5", []string{minOperand, "0.5"}},
		{"max^0.99…9", []string{maxOperand, nearOne}},
		{"min^0.99…9", []string{minOperand, nearOne}},
		{"max^-0.99…9", []string{maxOperand, nearMinus1}},
		{"1.5e-6143^-0.99…9", []string{smallOperand, nearMinus1}},
		{"(-1)^1e6144", []string{"-1", "1e6144"}},
	}
	for _, tc := range cases {
		b.Run(tc.name, func(b *testing.B) {
			// A case that fails validation would measure nothing.
			if _, err := c.Calculate(ctx, "power", tc.operands); err != nil {
				b.Fatalf("power %v: %v", tc.operands, err)
			}
			b.ReportAllocs()
			for b.Loop() {
				_, _ = c.Calculate(ctx, "power", tc.operands)
			}
		})
	}
}
