package httpapi

import (
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/pb33f/libopenapi"
	validator "github.com/pb33f/libopenapi-validator"
	"github.com/pb33f/libopenapi-validator/schema_validation"
	"go.yaml.in/yaml/v3"

	"github.com/JerikH/FullStackCalculator/backend/internal/buildinfo"

	"github.com/JerikH/FullStackCalculator/backend/api"
	"github.com/JerikH/FullStackCalculator/backend/internal/calc"
	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
)

func newValidator(t *testing.T) validator.Validator {
	t.Helper()
	doc, err := libopenapi.NewDocument(api.Spec)
	if err != nil {
		t.Fatalf("parse spec: %v", err)
	}
	v, errs := validator.NewValidator(doc)
	if len(errs) > 0 {
		t.Fatalf("build validator: %v", errs)
	}
	return v
}

// TestResponsesConformToContract exercises every documented status and checks
// the actual response against openapi.yaml. Requests that are intentionally
// invalid skip request validation.
func TestResponsesConformToContract(t *testing.T) {
	t.Parallel()
	v := newValidator(t)
	h, _ := newTestServer(t, calc.New(), nil)
	cases := []struct {
		method, path, ct, body string
		validRequest           bool
		status                 int
	}{
		{"GET", "/api/v1/operations", "", "", true, 200},
		{"POST", "/api/v1/operations/add", "application/json", `{"operands":["0.1","0.2"]}`, true, 200},
		{"POST", "/api/v1/operations/divide", "application/json", `{"operands":["1","3"]}`, true, 200},
		{"POST", "/api/v1/operations/sqrt", "application/json", `{"operands":["2"]}`, true, 200},
		{"POST", "/api/v1/operations/power", "application/json", `{"operands":["10","21"]}`, true, 200},
		{"POST", "/api/v1/operations/divide", "application/json", `{"operands":["1","0"]}`, true, 422},
		{"POST", "/api/v1/operations/sqrt", "application/json", `{"operands":["-1"]}`, true, 422},
		{"POST", "/api/v1/operations/power", "application/json", `{"operands":["10","6145"]}`, true, 422},
		{"POST", "/api/v1/operations/add", "application/json", `{"operands":["x","1"]}`, false, 400},
		{"POST", "/api/v1/operations/add", "application/json", `{}`, false, 400},
		{"POST", "/api/v1/operations/add", "text/plain", `{}`, false, 415},
		{"POST", "/api/v1/operations/add", "application/json", `{"operands":["` + strings.Repeat("1", 5000) + `"]}`, false, 413},
		{"POST", "/api/v1/operations/modulo", "application/json", `{"operands":["1","2"]}`, false, 404},

		{"POST", "/api/v1/operations/add", "application/json", `{`, false, 400},
		{"GET", "/api/v1/openapi.yaml", "", "", true, 200},
		{"GET", "/healthz", "", "", true, 200},
		{"GET", "/readyz", "", "", true, 200},
	}
	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path+" "+tc.body, func(t *testing.T) {
			t.Parallel()
			newReq := func() *http.Request {
				req := httptest.NewRequestWithContext(t.Context(), tc.method, "http://localhost:8081"+tc.path, strings.NewReader(tc.body))
				if tc.ct != "" {
					req.Header.Set("Content-Type", tc.ct)
				}
				return req
			}
			if tc.validRequest {
				if ok, errs := v.ValidateHttpRequest(newReq()); !ok {
					t.Fatalf("request does not match contract: %v", errs)
				}
			}
			req := newReq()
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tc.status {
				t.Fatalf("status = %d, want %d: %s", rec.Code, tc.status, rec.Body.String())
			}
			result := rec.Result()
			defer result.Body.Close()
			if ok, errs := v.ValidateHttpResponse(newReq(), result); !ok {
				t.Fatalf("response %d does not match contract: %v\n%s", rec.Code, errs, rec.Body.String())
			}
		})
	}
}

type specEnums struct {
	Components struct {
		Schemas map[string]struct {
			Enum []string `yaml:"enum"`
		} `yaml:"schemas"`
	} `yaml:"components"`
}

func loadEnums(t *testing.T) specEnums {
	t.Helper()
	var s specEnums
	if err := yaml.Unmarshal(api.Spec, &s); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestCatalogMatchesOperationNameEnum(t *testing.T) {
	t.Parallel()
	ops := calc.New().Operations()
	names := make([]string, 0, len(ops))
	for _, op := range ops {
		names = append(names, op.Name)
	}
	if enum := loadEnums(t).Components.Schemas["OperationName"].Enum; !slices.Equal(names, enum) {
		t.Fatalf("catalog %v != OperationName enum %v (order matters)", names, enum)
	}
}

func TestProblemCodesMatchContract(t *testing.T) {
	t.Parallel()
	enum := loadEnums(t).Components.Schemas["ProblemCode"].Enum

	codes := httpx.Codes()
	service := make([]string, 0, len(codes))
	for _, code := range codes {
		service = append(service, string(code))
		if !slices.Contains(enum, string(code)) {
			t.Errorf("code %s missing from contract", code)
		}
	}
	for _, code := range []string{"RATE_LIMITED", "SERVICE_UNAVAILABLE"} {
		if !slices.Contains(enum, code) || slices.Contains(service, code) {
			t.Errorf("edge code %s must exist only in contract", code)
		}
	}
}

func TestFailureAndDrainingResponsesConformToContract(t *testing.T) {
	t.Parallel()
	v := newValidator(t)
	failing, _ := newTestServer(t, failingCalculator{calc.New()}, nil)
	readiness := &Readiness{}
	readiness.Drain()
	draining := httpx.Chain(NewRouter(Deps{Calculator: calc.New(), Logger: discardLogger(), Readiness: readiness, Build: buildinfo.Info{Version: "1.0.0", Commit: "abc"}}), httpx.RequestContext)
	for _, tc := range []struct {
		name, method, path, body string
		status                   int
		handler                  http.Handler
	}{
		{"failure", "POST", "/api/v1/operations/add", `{"operands":["1","2"]}`, 500, failing},
		{"draining", "GET", "/readyz", "", 503, draining},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			newReq := func() *http.Request {
				req := httptest.NewRequestWithContext(t.Context(), tc.method, "http://localhost:8081"+tc.path, strings.NewReader(tc.body))
				if tc.body != "" {
					req.Header.Set("Content-Type", "application/json")
				}
				return req
			}
			if ok, errs := v.ValidateHttpRequest(newReq()); !ok {
				t.Fatalf("request: %v", errs)
			}
			rec := httptest.NewRecorder()
			tc.handler.ServeHTTP(rec, newReq())
			result := rec.Result()
			defer result.Body.Close()
			if rec.Code != tc.status {
				t.Fatalf("status %d, want %d", rec.Code, tc.status)
			}
			if ok, errs := v.ValidateHttpResponse(newReq(), result); !ok {
				t.Fatalf("response: %v", errs)
			}
		})
	}
}

func TestUnmatchedResponsesConformToProblemSchema(t *testing.T) {
	t.Parallel()
	h, _ := newTestServer(t, calc.New(), nil)
	for _, tc := range []struct {
		method, path, allow string
		status              int
	}{
		{"GET", "/api/v1/operations/add", "POST", 405},
		{"POST", "/api/v1/operations", "GET", 405},
		{"POST", "/api/v1/openapi.yaml", "GET", 405},
		{"POST", "/healthz", "GET", 405},
		{"POST", "/readyz", "GET", 405},
		{"GET", "/api/nope", "", 404},
		{"GET", "/", "", 404},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			t.Parallel()
			// Schema rendering mutates the model, so each parallel case owns one.
			doc, err := libopenapi.NewDocument(api.Spec)
			if err != nil {
				t.Fatal(err)
			}
			model, err := doc.BuildV3Model()
			if err != nil {
				t.Fatal(err)
			}
			schema := model.Model.Components.Schemas.GetOrZero("Problem").Schema()
			if schema == nil {
				t.Fatal("missing Problem schema")
			}
			r := do(t, h, tc.method, tc.path, "", "")
			if r.status != tc.status || r.header.Get("Allow") != tc.allow {
				t.Fatalf("got %d Allow %q, want %d %q", r.status, r.header.Get("Allow"), tc.status, tc.allow)
			}
			if ok, errs := schema_validation.NewSchemaValidator().ValidateSchemaString(schema, r.raw); !ok {
				t.Fatalf("Problem schema: %v", errs)
			}
		})
	}
}
