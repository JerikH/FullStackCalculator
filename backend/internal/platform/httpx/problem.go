package httpx

import (
	"net/http"
	"slices"
	"strings"
)

// Code identifies a problem type. The set is part of the public contract
// (ProblemCode in api/openapi.yaml); a contract test keeps them aligned.
type Code string

// Problem codes emitted by this service. RATE_LIMITED and SERVICE_UNAVAILABLE
// exist only at the edge proxy and are therefore absent here.
const (
	CodeMalformedRequest     Code = "MALFORMED_REQUEST"
	CodeValidationFailed     Code = "VALIDATION_FAILED"
	CodeNotFound             Code = "NOT_FOUND"
	CodeUnknownOperation     Code = "UNKNOWN_OPERATION"
	CodeMethodNotAllowed     Code = "METHOD_NOT_ALLOWED"
	CodePayloadTooLarge      Code = "PAYLOAD_TOO_LARGE"
	CodeUnsupportedMediaType Code = "UNSUPPORTED_MEDIA_TYPE"
	CodeDivisionByZero       Code = "DIVISION_BY_ZERO"
	CodeUndefinedResult      Code = "UNDEFINED_RESULT"
	CodeOverflow             Code = "OVERFLOW"
	CodeInternal             Code = "INTERNAL_ERROR"
)

type problemType struct {
	status int
	title  string
}

var problemTypes = map[Code]problemType{
	CodeMalformedRequest:     {http.StatusBadRequest, "Malformed request"},
	CodeValidationFailed:     {http.StatusBadRequest, "Validation failed"},
	CodeNotFound:             {http.StatusNotFound, "Not found"},
	CodeUnknownOperation:     {http.StatusNotFound, "Unknown operation"},
	CodeMethodNotAllowed:     {http.StatusMethodNotAllowed, "Method not allowed"},
	CodePayloadTooLarge:      {http.StatusRequestEntityTooLarge, "Payload too large"},
	CodeUnsupportedMediaType: {http.StatusUnsupportedMediaType, "Unsupported media type"},
	CodeDivisionByZero:       {http.StatusUnprocessableEntity, "Division by zero"},
	CodeUndefinedResult:      {http.StatusUnprocessableEntity, "Undefined result"},
	CodeOverflow:             {http.StatusUnprocessableEntity, "Result out of range"},
	CodeInternal:             {http.StatusInternalServerError, "Internal server error"},
}

// Codes returns every code this service can emit, sorted.
func Codes() []Code {
	codes := make([]Code, 0, len(problemTypes))
	for c := range problemTypes {
		codes = append(codes, c)
	}
	slices.Sort(codes)
	return codes
}

// FieldViolation pinpoints one invalid input field.
type FieldViolation struct {
	Field  string `json:"field"`
	Reason string `json:"reason"`
}

// Problem is an RFC 9457 problem details object with calculator extensions.
// Detail and RequestID are always serialized because the API contract requires
// them; Instance and Errors are omitted when empty.
type Problem struct {
	Type      string           `json:"type"`
	Title     string           `json:"title"`
	Status    int              `json:"status"`
	Detail    string           `json:"detail"`
	Instance  string           `json:"instance,omitempty"`
	Code      Code             `json:"code"`
	RequestID string           `json:"requestId"`
	Errors    []FieldViolation `json:"errors,omitempty"`
}

// NewProblem builds a problem whose type, title and status derive from code.
// An unknown code is a programming error and degrades to INTERNAL_ERROR rather
// than emitting an undocumented response.
func NewProblem(code Code, detail string, violations ...FieldViolation) Problem {
	pt, ok := problemTypes[code]
	if !ok {
		code, pt = CodeInternal, problemTypes[CodeInternal]
	}
	return Problem{
		Type:   "urn:calculator:problem:" + strings.ToLower(strings.ReplaceAll(string(code), "_", "-")),
		Title:  pt.title,
		Status: pt.status,
		Detail: detail,
		Code:   code,
		Errors: violations,
	}
}
