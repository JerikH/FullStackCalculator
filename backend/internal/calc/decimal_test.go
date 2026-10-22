package calc

import (
	"errors"
	"strings"
	"testing"

	"github.com/cockroachdb/apd/v3"
)

func mustDecimal(t *testing.T, s string) *apd.Decimal {
	t.Helper()
	d, _, err := apd.NewFromString(s)
	if err != nil {
		t.Fatalf("apd.NewFromString(%q): %v", s, err)
	}
	return d
}

func TestParseAcceptsValidNumbers(t *testing.T) {
	t.Parallel()
	valid := []string{
		"0", "-0", "42", "-12.5", "0.1", "1e-3", "1E+5", "2.50",
		"1234567890123456789012345678901234",        // exactly 34 digits
		"1.000000000000000000000000000000000000000", // trailing zeros do not count
		"1e6144", "1e-6143", "9.999999999999999999999999999999999e6144",
		"0e99999", "0e9999999999", "-0e9999999999", "0.000e-99999999999",
		"0." + strings.Repeat("0", 125) + "1", "1" + strings.Repeat("0", 34),
	}
	for _, s := range valid {
		t.Run(s, func(t *testing.T) {
			t.Parallel()
			d, err := Parse(s)
			if err != nil {
				t.Fatalf("Parse(%q) error = %v", s, err)
			}
			want, _, parseErr := apd.NewFromString(s)
			if parseErr != nil {
				want = apd.New(0, 0)
			}
			if d.Cmp(want) != 0 {
				t.Fatalf("Parse(%q) = %s, value changed", s, d)
			}
		})
	}
}

func TestParseRejectsInvalidNumbers(t *testing.T) {
	t.Parallel()
	tests := []struct {
		in   string
		want error
	}{
		{"", ErrInvalidNumber},
		{"1e+", ErrInvalidNumber},
		{"-", ErrInvalidNumber},
		{"--1", ErrInvalidNumber},
		{"1.5.5", ErrInvalidNumber},
		{"١", ErrInvalidNumber},
		{strings.Repeat("١", 100), ErrInvalidNumber},
		{strings.Repeat("é", 100), ErrInvalidNumber},
		{strings.Repeat("١", 129), ErrOperandTooLong},
		{strings.Repeat("x", 129), ErrOperandTooLong},
		{"12345678901234567890123456789012345e9999999999", ErrTooManyDigits},
		{"12345678901234567890123456789012345e9999", ErrTooManyDigits},
		{"-1e-6144", ErrOutOfRange},
		{"-1e-9999999999", ErrOutOfRange},
		{"abc", ErrInvalidNumber},
		{"1.", ErrInvalidNumber},
		{".5", ErrInvalidNumber},
		{"01", ErrInvalidNumber},
		{"+1", ErrInvalidNumber},
		{"1e", ErrInvalidNumber},
		{"NaN", ErrInvalidNumber},
		{"Infinity", ErrInvalidNumber},
		{" 1", ErrInvalidNumber},
		{"1,5", ErrInvalidNumber},
		{"0x10", ErrInvalidNumber},
		{strings.Repeat("1", 129), ErrOperandTooLong},
		{"12345678901234567890123456789012345", ErrTooManyDigits},
		{"1e6145", ErrOutOfRange},
		{"10e6144", ErrOutOfRange},
		{"1e-6144", ErrOutOfRange},
		{"1e9999999999", ErrOutOfRange},
	}
	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			t.Parallel()
			_, err := Parse(tt.in)
			if !errors.Is(err, tt.want) {
				t.Fatalf("Parse(%q) error = %v, want %v", tt.in, err, tt.want)
			}
		})
	}
}

func TestFormat(t *testing.T) {
	t.Parallel()
	tests := []struct{ in, want string }{
		{"0", "0"},
		{"1e-6", "0.000001"},
		{"-1e21", "-1e+21"},
		{"1.23e-7", "1.23e-7"},
		{"99999999999999999999", "99999999999999999999"},
		{"1.5e20", "150000000000000000000"},
		{"1e-6143", "1e-6143"},
		{"-0.000", "0"},
		{"123e18", "123000000000000000000"},
		{"-0", "0"},
		{"0.000", "0"},
		{"1.50", "1.5"},
		{"100", "100"},
		{"1e2", "100"},
		{"123.456", "123.456"},
		{"-42", "-42"},
		{"0.000001", "0.000001"},
		{"0.0000001", "1e-7"},
		{"1e-7", "1e-7"},
		{"1e20", "100000000000000000000"},
		{"1e21", "1e+21"},
		{"1.5e25", "1.5e+25"},
		{"-2.5e-10", "-2.5e-10"},
		{"12345678901234567890.5", "12345678901234567890.5"},
		{"0.3333333333333333333333333333333333", "0.3333333333333333333333333333333333"},
		{"1e6144", "1e+6144"},
	}
	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			t.Parallel()
			if got := Format(mustDecimal(t, tt.in)); got != tt.want {
				t.Fatalf("Format(%s) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestOperandErrorTexts(t *testing.T) {
	t.Parallel()
	tests := []struct {
		err  error
		want string
	}{
		{ErrOperandTooLong, "must be at most 128 characters"},
		{ErrInvalidNumber, `must be a decimal number in JSON number syntax, e.g. "-12.5" or "1e-3"`},
		{ErrTooManyDigits, "must have at most 34 significant digits"},
		{ErrOutOfRange, "magnitude is outside the supported range (1e-6143 … 1e6144)"},
	}
	for _, tt := range tests {
		if tt.err.Error() != tt.want {
			t.Errorf("error = %q, want %q", tt.err, tt.want)
		}
	}
}

func TestParseReturnsTheReducedValue(t *testing.T) {
	t.Parallel()
	for _, tt := range []struct {
		in    string
		coeff int64
		exp   int32
	}{{"2.50", 25, -1}, {"-1200", 12, 2}, {"9" + strings.Repeat("0", 120) + "e6000", 9, 6120}} {
		d, err := Parse(tt.in)
		if err != nil || d.Coeff.Int64() != tt.coeff || d.Exponent != tt.exp {
			t.Fatalf("Parse(%q) = coefficient %v exponent %d, %v; want %d, %d", tt.in, &d.Coeff, d.Exponent, err, tt.coeff, tt.exp)
		}
	}
}

func TestParseNormalizesSignedZero(t *testing.T) {
	t.Parallel()
	for _, s := range []string{"0e9999999999", "-0e9999999999", "0.000e-99999999999"} {
		d, err := Parse(s)
		if err != nil || !d.IsZero() || d.Exponent != 0 || d.Negative != strings.HasPrefix(s, "-") {
			t.Fatalf("Parse(%q) = %v, %v", s, d, err)
		}
	}
}
