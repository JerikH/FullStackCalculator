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
