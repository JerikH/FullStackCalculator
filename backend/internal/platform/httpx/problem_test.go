package httpx

import (
	"encoding/json"
	"net/http"
	"slices"
	"testing"

	"github.com/google/go-cmp/cmp"
)

func TestNewProblemDerivesTypeTitleAndStatus(t *testing.T) {
	t.Parallel()
	p := NewProblem(CodeDivisionByZero, "the divisor must not be zero")
	want := Problem{
		Type:   "urn:calculator:problem:division-by-zero",
		Title:  "Division by zero",
		Status: http.StatusUnprocessableEntity,
		Detail: "the divisor must not be zero",
		Code:   CodeDivisionByZero,
	}
	if diff := cmp.Diff(want, p); diff != "" {
		t.Fatalf("mismatch (-want +got):\n%s", diff)
	}
}

func TestProblemCatalog(t *testing.T) {
	t.Parallel()
	tests := []struct {
		code   Code
		status int
		title  string
		typ    string
	}{
		{CodeMalformedRequest, 400, "Malformed request", "urn:calculator:problem:malformed-request"},
		{CodeValidationFailed, 400, "Validation failed", "urn:calculator:problem:validation-failed"},
		{CodeNotFound, 404, "Not found", "urn:calculator:problem:not-found"},
		{CodeUnknownOperation, 404, "Unknown operation", "urn:calculator:problem:unknown-operation"},
		{CodeMethodNotAllowed, 405, "Method not allowed", "urn:calculator:problem:method-not-allowed"},
		{CodePayloadTooLarge, 413, "Payload too large", "urn:calculator:problem:payload-too-large"},
		{CodeUnsupportedMediaType, 415, "Unsupported media type", "urn:calculator:problem:unsupported-media-type"},
		{CodeDivisionByZero, 422, "Division by zero", "urn:calculator:problem:division-by-zero"},
		{CodeUndefinedResult, 422, "Undefined result", "urn:calculator:problem:undefined-result"},
		{CodeOverflow, 422, "Result out of range", "urn:calculator:problem:overflow"},
		{CodeInternal, 500, "Internal server error", "urn:calculator:problem:internal-error"},
	}
	for _, tt := range tests {
		t.Run(string(tt.code), func(t *testing.T) {
			t.Parallel()
			p := NewProblem(tt.code, "d")
			if p.Status != tt.status || p.Title != tt.title || p.Type != tt.typ || p.Code != tt.code || p.Detail != "d" {
				t.Fatalf("got %+v", p)
			}
		})
	}
}

func TestCodesIsSortedAndComplete(t *testing.T) {
	t.Parallel()
	want := []Code{
		"DIVISION_BY_ZERO", "INTERNAL_ERROR", "MALFORMED_REQUEST", "METHOD_NOT_ALLOWED",
		"NOT_FOUND", "OVERFLOW", "PAYLOAD_TOO_LARGE", "UNDEFINED_RESULT",
		"UNKNOWN_OPERATION", "UNSUPPORTED_MEDIA_TYPE", "VALIDATION_FAILED",
	}
	got := Codes()
	if !slices.IsSorted(got) {
		t.Fatalf("Codes() is not sorted: %v", got)
	}
	if diff := cmp.Diff(want, got); diff != "" {
		t.Fatalf("mismatch (-want +got):\n%s", diff)
	}
}

func TestUnknownCodeFallsBackToInternal(t *testing.T) {
	t.Parallel()
	p := NewProblem(Code("NOPE"), "x")
	if p.Code != CodeInternal || p.Status != 500 || p.Type != "urn:calculator:problem:internal-error" {
		t.Fatalf("got %+v", p)
	}
}

func TestProblemJSONAlwaysCarriesDetailAndRequestID(t *testing.T) {
	t.Parallel()
	b, err := json.Marshal(NewProblem(CodeNotFound, ""))
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	if err := json.Unmarshal(b, &body); err != nil {
		t.Fatal(err)
	}
	if v, ok := body["detail"]; !ok || v != "" {
		t.Errorf("detail = %v (present %t)", v, ok)
	}
	if v, ok := body["requestId"]; !ok || v != "" {
		t.Errorf("requestId = %v (present %t)", v, ok)
	}
	for _, k := range []string{"errors", "instance"} {
		if _, ok := body[k]; ok {
			t.Errorf("%s must be omitted when empty", k)
		}
	}
}

func TestProblemJSONCarriesViolations(t *testing.T) {
	t.Parallel()
	b, err := json.Marshal(NewProblem(CodeValidationFailed, "bad", FieldViolation{Field: "operands[0]", Reason: "r"}))
	if err != nil {
		t.Fatal(err)
	}
	var body struct {
		Errors []FieldViolation `json:"errors"`
	}
	if err := json.Unmarshal(b, &body); err != nil {
		t.Fatal(err)
	}
	if diff := cmp.Diff([]FieldViolation{{Field: "operands[0]", Reason: "r"}}, body.Errors); diff != "" {
		t.Fatalf("mismatch (-want +got):\n%s", diff)
	}
}
