package httpx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/iotest"
)

type target struct {
	Name     string          `json:"name"`
	M        map[string]int  `json:"m"`
	Operands json.RawMessage `json:"operands"`
	Child    struct {
		Value int `json:"value"`
	} `json:"child"`
}

const (
	detailEmpty     = "request body must not be empty"
	detailNotJSON   = "request body is not valid JSON"
	detailSingleObj = "request body must contain a single JSON object"
	detailTooLarge  = "request body must not exceed 4096 bytes"
	detailMediaType = "Content-Type must be application/json"
)

// paddedObject returns a valid JSON object of exactly size bytes.
func paddedObject(size int) string {
	const head, tail = `{"name":"x"`, `}`
	return head + strings.Repeat(" ", size-len(head)-len(tail)) + tail
}

func newJSONRequest(contentType, body string) *http.Request {
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/", strings.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	return req
}

func TestDecodeJSON(t *testing.T) {
	t.Parallel()
	const js = "application/json"
	tests := []struct {
		name        string
		contentType string
		body        string
		wantCode    Code // "" means success
		wantDetail  string
	}{
		{"ok", js, `{"name":"x"}`, "", ""},
		{"ok with charset", "application/json; charset=utf-8", `{"name":"x"}`, "", ""},
		{"ok uppercase media type", "APPLICATION/JSON", `{"name":"x"}`, "", ""},
		{"ok empty object", js, `{}`, "", ""},
		{"ok leading whitespace", js, " \n {\"name\":\"x\"}", "", ""},
		{"trailing whitespace", js, "{\"name\":\"x\"}\n  ", "", ""},
		{"exactly 4096 bytes", js, paddedObject(4096), "", ""},
		{"wrong media type", "text/plain", `{}`, CodeUnsupportedMediaType, detailMediaType},
		{"missing media type", "", `{}`, CodeUnsupportedMediaType, detailMediaType},
		{"unparsable media type", "application/json;;=", `{}`, CodeUnsupportedMediaType, detailMediaType},
		{"empty", js, ``, CodeMalformedRequest, detailEmpty},
		{"whitespace only", js, " \n\t ", CodeMalformedRequest, detailEmpty},
		{"syntax", js, `{`, CodeMalformedRequest, detailNotJSON},
		{"truncated", js, `{"name":"x"`, CodeMalformedRequest, detailNotJSON},
		{"bad token", js, `{"name":x}`, CodeMalformedRequest, detailNotJSON},
		{"unknown field", js, `{"name":"x","extra":1}`, CodeMalformedRequest, `unknown field "extra"`},
		{"hostile unknown field name", js, `{"a\"<b>\\":1}`, CodeMalformedRequest, fmt.Sprintf("unknown field %q", `a"<b>\`)},
		{"nested unknown field", js, `{"child":{"unexpected":1}}`, CodeMalformedRequest, `unknown field "unexpected"`},
		{"uppercase operands", js, `{"OPERANDS":["9"]}`, CodeMalformedRequest, `unknown field "OPERANDS"`},
		{"mixed-case duplicate key", js, `{"operands":["1"],"Operands":["2"]}`, CodeMalformedRequest, `unknown field "Operands"`},
		{"capitalised name", js, `{"Name":"x"}`, CodeMalformedRequest, `unknown field "Name"`},
		{"two objects", js, `{"name":"x"} {}`, CodeMalformedRequest, detailSingleObj},
		{"trailing garbage", js, `{"name":"x"} x`, CodeMalformedRequest, detailSingleObj},
		{"array", js, `[]`, CodeMalformedRequest, detailSingleObj},
		{"string", js, `"str"`, CodeMalformedRequest, detailSingleObj},
		{"number", js, `1`, CodeMalformedRequest, detailSingleObj},
		{"boolean", js, `true`, CodeMalformedRequest, detailSingleObj},
		{"null", js, `null`, CodeMalformedRequest, detailSingleObj},
		{"wrong field type", js, `{"name":1}`, CodeMalformedRequest, detailSingleObj},
		{"wrong type under a map key", js, `{"m":{"<evil>":"s"}}`, CodeMalformedRequest, detailSingleObj},
		{"too large", js, `{"name":"` + strings.Repeat("a", MaxBodyBytes) + `"}`, CodePayloadTooLarge, detailTooLarge},
		{"4097 bytes", js, paddedObject(4097), CodePayloadTooLarge, detailTooLarge},
		{"valid object then excess whitespace", js, `{"name":"x"}` + strings.Repeat(" ", MaxBodyBytes+1), CodePayloadTooLarge, detailTooLarge},
		{"oversize invalid JSON", js, `{x` + strings.Repeat(" ", 10000), CodePayloadTooLarge, detailTooLarge},
		{"oversize trailing garbage", js, `{"operands":[]} garbage` + strings.Repeat("x", 10000), CodePayloadTooLarge, detailTooLarge},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			var dst target
			p := DecodeJSON(httptest.NewRecorder(), newJSONRequest(tt.contentType, tt.body), &dst)
			switch {
			case tt.wantCode == "" && p != nil:
				t.Fatalf("unexpected problem %+v", *p)
			case tt.wantCode != "" && p == nil:
				t.Fatal("expected a problem")
			case tt.wantCode != "" && (p.Code != tt.wantCode || p.Detail != tt.wantDetail):
				t.Fatalf("got %s %q, want %s %q", p.Code, p.Detail, tt.wantCode, tt.wantDetail)
			}
		})
	}
}

func TestDecodeJSONDetailNeverEchoesClientMapKeys(t *testing.T) {
	t.Parallel()
	var dst target
	p := DecodeJSON(httptest.NewRecorder(), newJSONRequest("application/json", `{"m":{"<evil>":"s"}}`), &dst)
	if p == nil {
		t.Fatal("expected a problem")
	}
	if strings.Contains(p.Detail, "evil") || strings.Contains(p.Detail, "m.") {
		t.Fatalf("detail leaks client input: %q", p.Detail)
	}
}

func TestDecodeJSONRepeatedKeyKeepsLastOccurrence(t *testing.T) {
	t.Parallel()
	var dst target
	if p := DecodeJSON(httptest.NewRecorder(), newJSONRequest("application/json", `{"operands":[1],"operands":["2"]}`), &dst); p != nil {
		t.Fatalf("unexpected problem %+v", *p)
	}
	if string(dst.Operands) != `["2"]` {
		t.Fatalf("Operands = %s", dst.Operands)
	}
}

func TestDecodeJSONFillsDestination(t *testing.T) {
	t.Parallel()
	var dst target
	body := `{"name":"n","m":{"k":1},"operands":["1","2"],"child":{"value":7}}`
	if p := DecodeJSON(httptest.NewRecorder(), newJSONRequest("application/json", body), &dst); p != nil {
		t.Fatalf("unexpected problem %+v", *p)
	}
	if dst.Name != "n" || dst.M["k"] != 1 || string(dst.Operands) != `["1","2"]` || dst.Child.Value != 7 {
		t.Fatalf("dst = %+v", dst)
	}
}

func TestDecodeJSONReadErrorIsNotValidJSON(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/", iotest.ErrReader(errors.New("boom")))
	req.Header.Set("Content-Type", "application/json")
	var dst target
	p := DecodeJSON(httptest.NewRecorder(), req, &dst)
	if p == nil || p.Code != CodeMalformedRequest || p.Detail != detailNotJSON {
		t.Fatalf("got %+v", p)
	}
}

type fieldNames struct {
	Plain   string `json:"-"`
	Untaged string
	Opt     string `json:"opt,omitempty"`
	NoName  string `json:",omitempty"`
	hidden  string
}

func TestDecodeJSONTopLevelKeysFollowStructTags(t *testing.T) {
	t.Parallel()
	_ = fieldNames{}.hidden
	tests := []struct {
		name       string
		body       string
		wantDetail string // "" means success
	}{
		{"untagged uses the Go name", `{"Untaged":"a"}`, ""},
		{"untagged is case sensitive", `{"untaged":"a"}`, `unknown field "untaged"`},
		{"tag name before the comma", `{"opt":"a"}`, ""},
		{"tag options only uses the Go name", `{"NoName":"a"}`, ""},
		{"dash tag has no name", `{"Plain":"a"}`, `unknown field "Plain"`},
		{"dash literal key", `{"-":"a"}`, `unknown field "-"`},
		{"unexported field", `{"hidden":"a"}`, `unknown field "hidden"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			var dst fieldNames
			p := DecodeJSON(httptest.NewRecorder(), newJSONRequest("application/json", tt.body), &dst)
			switch {
			case tt.wantDetail == "" && p != nil:
				t.Fatalf("unexpected problem %+v", *p)
			case tt.wantDetail != "" && (p == nil || p.Code != CodeMalformedRequest || p.Detail != tt.wantDetail):
				t.Fatalf("got %+v, want detail %q", p, tt.wantDetail)
			}
		})
	}
}

func TestDecodeJSONIntoMapSkipsTheKeyCheck(t *testing.T) {
	t.Parallel()
	dst := map[string]any{}
	if p := DecodeJSON(httptest.NewRecorder(), newJSONRequest("application/json", `{"Any":1}`), &dst); p != nil {
		t.Fatalf("unexpected problem %+v", *p)
	}
	if dst["Any"] != float64(1) {
		t.Fatalf("dst = %v", dst)
	}
}

func TestDecodeJSONNonPointerDestinationIsAProblem(t *testing.T) {
	t.Parallel()
	var dst target
	p := DecodeJSON(httptest.NewRecorder(), newJSONRequest("application/json", `{}`), dst)
	if p == nil || p.Code != CodeMalformedRequest {
		t.Fatalf("got %+v", p)
	}
}
