package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
)

type operationsHandler struct {
	calc   Calculator
	logger *slog.Logger
	known  map[string]bool
}

func newOperationsHandler(c Calculator, logger *slog.Logger) *operationsHandler {
	known := make(map[string]bool)
	for _, op := range c.Operations() {
		known[op.Name] = true
	}
	return &operationsHandler{calc: c, logger: logger, known: known}
}

type operationInfo struct {
	Name        string `json:"name"`
	Symbol      string `json:"symbol"`
	Arity       int    `json:"arity"`
	Description string `json:"description"`
}

type operationCatalog struct {
	Operations []operationInfo `json:"operations"`
}

func (h *operationsHandler) list(w http.ResponseWriter, r *http.Request) {
	ops := h.calc.Operations()
	out := operationCatalog{Operations: make([]operationInfo, len(ops))}
	for i, op := range ops {
		out.Operations[i] = operationInfo{Name: op.Name, Symbol: op.Symbol, Arity: op.Arity, Description: op.Description}
	}
	httpx.WriteJSON(w, r, http.StatusOK, out)
}

// calculateRequest keeps operands raw so a wrong JSON type gets a precise,
// field-level validation message instead of a generic decoding error.
type calculateRequest struct {
	Operands json.RawMessage `json:"operands"`
}

type calculateResponse struct {
	Operation string   `json:"operation"`
	Operands  []string `json:"operands"`
	Result    string   `json:"result"`
	Inexact   bool     `json:"inexact"`
}

func (h *operationsHandler) calculate(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("operation")
	if !h.known[name] {
		httpx.WriteProblem(w, r, httpx.NewProblem(httpx.CodeUnknownOperation,
			fmt.Sprintf("operation %q is not supported; see GET /api/v1/operations", name)))
		return
	}
	var req calculateRequest
	if p := httpx.DecodeJSON(w, r, &req); p != nil {
		httpx.WriteProblem(w, r, *p)
		return
	}
	operands, violation := decodeOperands(req.Operands)
	if violation != nil {
		httpx.WriteProblem(w, r, httpx.NewProblem(httpx.CodeValidationFailed, "one or more fields are invalid", *violation))
		return
	}
	res, err := h.calc.Calculate(r.Context(), name, operands)
	if err != nil {
		p := problemFor(err, name)
		if p.Status >= http.StatusInternalServerError {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				h.logger.WarnContext(r.Context(), "calculation canceled", slog.String("operation", name))
			} else {
				h.logger.ErrorContext(r.Context(), "calculation failed", slog.String("operation", name), slog.Any("error", err))
			}
		}
		httpx.WriteProblem(w, r, p)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, calculateResponse{Operation: name, Operands: operands, Result: res.Value, Inexact: res.Inexact})
}

func decodeOperands(raw json.RawMessage) ([]string, *httpx.FieldViolation) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return nil, &httpx.FieldViolation{Field: "operands", Reason: "is required"}
	}
	wrongType := &httpx.FieldViolation{Field: "operands", Reason: `must be an array of decimal strings, e.g. ["2", "3"]`}
	var elements []json.RawMessage
	if err := json.Unmarshal(raw, &elements); err != nil {
		return nil, wrongType
	}
	operands := make([]string, len(elements))
	for i, element := range elements {
		element = bytes.TrimSpace(element)
		if len(element) == 0 || element[0] != '"' {
			return nil, wrongType
		}
		if err := json.Unmarshal(element, &operands[i]); err != nil {
			return nil, wrongType
		}
	}
	return operands, nil
}
