package calc

import "testing"

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
