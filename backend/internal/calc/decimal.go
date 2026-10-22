package calc

import (
	"errors"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/cockroachdb/apd/v3"
)

// Numeric limits of the service. They mirror IEEE 754 decimal128 and are part
// of the public API contract.
const (
	Precision        = 34
	MaxExponent      = 6144
	MinExponent      = -6143
	MaxOperandLength = 128
)

// Operand validation errors. Their messages are user facing: the HTTP layer
// returns them verbatim as field-violation reasons.
var (
	ErrOperandTooLong = errors.New("must be at most 128 characters")
	ErrInvalidNumber  = errors.New(`must be a decimal number in JSON number syntax, e.g. "-12.5" or "1e-3"`)
	ErrTooManyDigits  = errors.New("must have at most 34 significant digits")
	ErrOutOfRange     = errors.New("magnitude is outside the supported range (1e-6143 … 1e6144)")
)

// numberSyntax is the JSON number grammar (RFC 8259 §6). Rejecting everything
// else up front also keeps apd's NaN/Infinity literals out of the domain.
var numberSyntax = regexp.MustCompile(`^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$`)

// Parse converts s into a decimal, enforcing the API's syntax and range limits.
func Parse(s string) (*apd.Decimal, error) {
	if utf8.RuneCountInString(s) > MaxOperandLength {
		return nil, ErrOperandTooLong
	}
	if !numberSyntax.MatchString(s) {
		return nil, ErrInvalidNumber
	}
	coefficient, _, _ := strings.Cut(strings.ToLower(s), "e")
	digits := strings.Trim(strings.ReplaceAll(strings.TrimPrefix(coefficient, "-"), ".", ""), "0")
	if digits == "" {
		d := apd.New(0, 0)
		d.Negative = strings.HasPrefix(s, "-")
		return d, nil
	}
	if len(digits) > Precision {
		return nil, ErrTooManyDigits
	}
	d, _, err := apd.NewFromString(s)
	if err != nil {
		// Syntax and significant digits are valid; the exponent is out of range.
		return nil, ErrOutOfRange
	}
	// The reduced form has the same value and keeps trailing zeros of the
	// operand text from inflating the cost of the arithmetic.
	d.Reduce(d)
	if adj := adjustedExponent(d); adj > MaxExponent || adj < MinExponent {
		return nil, ErrOutOfRange
	}
	return d, nil
}

// Format renders d in the API's canonical form: trailing zeros removed, -0 as
// "0", plain notation for adjusted exponents in [-6, 20] and lowercase
// scientific notation otherwise — the same thresholds as JavaScript's
// Number#toString, so results look familiar to web clients.
func Format(d *apd.Decimal) string {
	if d.IsZero() {
		return "0"
	}
	var r apd.Decimal
	r.Reduce(d)
	digits := r.Coeff.Text(10)
	exp := int(r.Exponent)
	adj := exp + len(digits) - 1

	var b strings.Builder
	if r.Negative {
		b.WriteByte('-')
	}
	switch {
	case adj < -6 || adj > 20:
		b.WriteString(digits[:1])
		if len(digits) > 1 {
			b.WriteByte('.')
			b.WriteString(digits[1:])
		}
		b.WriteByte('e')
		if adj >= 0 {
			b.WriteByte('+')
		}
		b.WriteString(strconv.Itoa(adj))
	case exp >= 0:
		b.WriteString(digits)
		b.WriteString(strings.Repeat("0", exp))
	case adj >= 0:
		point := len(digits) + exp
		b.WriteString(digits[:point])
		b.WriteByte('.')
		b.WriteString(digits[point:])
	default:
		b.WriteString("0.")
		b.WriteString(strings.Repeat("0", -adj-1))
		b.WriteString(digits)
	}
	return b.String()
}

// adjustedExponent is the exponent of d's most significant digit
// (GDA "adjusted exponent").
func adjustedExponent(d *apd.Decimal) int64 {
	return int64(d.Exponent) + d.NumDigits() - 1
}
