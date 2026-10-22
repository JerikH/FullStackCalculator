package calc

import (
	"context"
	"testing"
)

// FuzzParse checks that every accepted operand survives a Format→Parse round
// trip unchanged and that Format always emits valid wire syntax.
func FuzzParse(f *testing.F) {
	for _, seed := range []string{"0", "-0", "1.50", "1e21", "1e-7", "-2.5e-10", "1e6144", "abc", "01", "0e9999999999"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, s string) {
		d, err := Parse(s)
		if err != nil {
			return
		}
		out := Format(d)
		if !numberSyntax.MatchString(out) {
			t.Fatalf("Format(%q) = %q is not valid wire syntax", s, out)
		}
		again, err := Parse(out)
		if err != nil {
			t.Fatalf("Parse(Format(%q)) = Parse(%q) error = %v", s, out, err)
		}
		if again.Cmp(d) != 0 {
			t.Fatalf("round trip changed the value: %q -> %q", s, out)
		}
	})
}

// FuzzCalculate asserts that no input can produce an unclassified (internal)
// error, that results are always valid wire syntax and that add/multiply are
// commutative.
func FuzzCalculate(f *testing.F) {
	seeds := [][3]string{
		{"add", "0.1", "0.2"},
		{"divide", "1", "0"},
		{"power", "-8", "0.5"},
		{"power", "2", "1e30"},
		{"multiply", "1e6144", "10"},
		{"sqrt", "2", ""},
		{"power", "0", "-1"},
		{"percentage", "-0", ""},
	}
	for _, s := range seeds {
		f.Add(s[0], s[1], s[2])
	}
	c := New()
	f.Fuzz(func(t *testing.T, op, a, b string) {
		operands := []string{a, b}
		if c.Has(op) && c.ops[op].info.Arity == 1 {
			operands = operands[:1]
		}
		ctx := context.Background()
		res, err := c.Calculate(ctx, op, operands)
		if err != nil {
			if Outcome(err) == "internal" {
				t.Fatalf("%s(%q) produced an unclassified error: %v", op, operands, err)
			}
			return
		}
		if !numberSyntax.MatchString(res.Value) {
			t.Fatalf("%s(%q) = %q is not valid wire syntax", op, operands, res.Value)
		}
		if op == "add" || op == "multiply" {
			swapped, err := c.Calculate(ctx, op, []string{b, a})
			if err != nil || swapped.Value != res.Value {
				t.Fatalf("%s is not commutative for %q,%q: %q vs %q (%v)", op, a, b, res.Value, swapped.Value, err)
			}
		}
	})
}
