package httpx

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"reflect"
	"strings"
)

// MaxBodyBytes caps request bodies; a calculation request is a few dozen bytes.
const MaxBodyBytes = 4 << 10

// The only MALFORMED_REQUEST details DecodeJSON emits (besides the quoted
// unknown-field form). None of them embeds client input except the field name
// of an unknown top-level or nested property, quoted with %q.
const (
	msgEmptyBody    = "request body must not be empty"
	msgNotJSON      = "request body is not valid JSON"
	msgSingleObject = "request body must contain a single JSON object"
)

// DecodeJSON strictly decodes exactly one JSON object from the request body
// into dst. It returns nil on success or the problem to send to the client.
//
// The order is fixed: media type (415), body size (413, whatever the content),
// then syntax and shape (400).
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) *Problem {
	if !isJSON(r.Header.Get("Content-Type")) {
		return ptr(NewProblem(CodeUnsupportedMediaType, "Content-Type must be application/json"))
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, MaxBodyBytes))
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return ptr(NewProblem(CodePayloadTooLarge, fmt.Sprintf("request body must not exceed %d bytes", MaxBodyBytes)))
		}
		return ptr(NewProblem(CodeMalformedRequest, msgNotJSON))
	}

	dec := json.NewDecoder(bytes.NewReader(body))
	var raw json.RawMessage
	if err := dec.Decode(&raw); err != nil {
		if errors.Is(err, io.EOF) {
			return ptr(NewProblem(CodeMalformedRequest, msgEmptyBody))
		}
		return ptr(NewProblem(CodeMalformedRequest, msgNotJSON))
	}
	var extra json.RawMessage
	if err := dec.Decode(&extra); !errors.Is(err, io.EOF) {
		return ptr(NewProblem(CodeMalformedRequest, msgSingleObject))
	}
	// null would otherwise decode silently into a zero dst.
	if len(raw) == 0 || raw[0] != '{' {
		return ptr(NewProblem(CodeMalformedRequest, msgSingleObject))
	}
	if p := checkTopLevelKeys(raw, dst); p != nil {
		return p
	}
	return strictDecode(raw, dst)
}

// checkTopLevelKeys enforces exact (case-sensitive) top-level property names
// when dst points to a struct. encoding/json matches keys case-insensitively,
// but the API contract forbids additional properties.
func checkTopLevelKeys(raw json.RawMessage, dst any) *Problem {
	rv := reflect.ValueOf(dst)
	if rv.Kind() != reflect.Pointer || rv.IsNil() || rv.Elem().Kind() != reflect.Struct {
		return nil
	}
	names := jsonNames(rv.Elem().Type())
	dec := json.NewDecoder(bytes.NewReader(raw))
	if _, err := dec.Token(); err != nil { // the opening brace
		return ptr(NewProblem(CodeMalformedRequest, msgNotJSON))
	}
	for dec.More() {
		tok, err := dec.Token()
		key, ok := tok.(string)
		if err != nil || !ok {
			return ptr(NewProblem(CodeMalformedRequest, msgNotJSON))
		}
		if !names[key] {
			return ptr(NewProblem(CodeMalformedRequest, fmt.Sprintf("unknown field %q", key)))
		}
		var skip json.RawMessage
		if err := dec.Decode(&skip); err != nil {
			return ptr(NewProblem(CodeMalformedRequest, msgNotJSON))
		}
	}
	return nil
}

// jsonNames returns the JSON property names of the exported fields of t.
func jsonNames(t reflect.Type) map[string]bool {
	names := make(map[string]bool, t.NumField())
	for f := range t.Fields() {
		if !f.IsExported() {
			continue
		}
		tag := f.Tag.Get("json")
		if tag == "-" {
			continue
		}
		name, _, _ := strings.Cut(tag, ",")
		if name == "" {
			name = f.Name
		}
		names[name] = true
	}
	return names
}

// strictDecode decodes the already validated object into dst, rejecting
// unknown fields at every depth.
func strictDecode(raw json.RawMessage, dst any) *Problem {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	err := dec.Decode(dst)
	if err == nil {
		return nil
	}
	var typeErr *json.UnmarshalTypeError
	switch {
	case strings.HasPrefix(err.Error(), "json: unknown field "):
		// encoding/json exposes no typed error for unknown fields.
		return ptr(NewProblem(CodeMalformedRequest, strings.TrimPrefix(err.Error(), "json: ")))
	case errors.As(err, &typeErr):
		// typeErr.Field holds map keys taken from the input; never echo it.
		return ptr(NewProblem(CodeMalformedRequest, msgSingleObject))
	default:
		return ptr(NewProblem(CodeMalformedRequest, msgNotJSON))
	}
}

func isJSON(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	return err == nil && mediaType == "application/json"
}

func ptr[T any](v T) *T { return &v }
