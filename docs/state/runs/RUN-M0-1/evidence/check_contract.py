#!/usr/bin/env python3
"""Shape check of backend/api/openapi.yaml against RF-API-01…08, RF-API-11,
RF-CALC-01, RF-OBS-02/03 and RF-OPS-04. Usage: check_contract.py <openapi.yaml>.
Prints one line per assertion and exits 1 if any fails. Needs PyYAML."""

import sys

import yaml

SCHEMAS = ["Decimal", "OperationName", "CalculationRequest", "CalculationResult", "OperationInfo",
           "OperationCatalog", "ProblemCode", "Problem", "FieldViolation", "Health"]
OPERATIONS = ["add", "subtract", "multiply", "divide", "power", "sqrt", "percentage"]
CODES = ["MALFORMED_REQUEST", "VALIDATION_FAILED", "NOT_FOUND", "UNKNOWN_OPERATION", "METHOD_NOT_ALLOWED",
         "PAYLOAD_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "DIVISION_BY_ZERO", "UNDEFINED_RESULT", "OVERFLOW",
         "RATE_LIMITED", "INTERNAL_ERROR", "SERVICE_UNAVAILABLE"]
DECIMAL = r"^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$"
REQUEST_ID = r"^[A-Za-z0-9._-]{1,128}$"
STATUSES = {
    ("/api/v1/operations", "get"): ["200", "405", "429", "500", "503"],
    ("/api/v1/operations/{operation}", "post"): ["200", "400", "404", "405", "413", "415", "422", "429", "500", "503"],
    ("/api/v1/openapi.yaml", "get"): ["200", "405", "429", "500", "503"],
    ("/healthz", "get"): ["200", "405", "500"],
    ("/readyz", "get"): ["200", "405", "500", "503"],
}
METHODS = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}


def main(path):
    doc = yaml.safe_load(open(path, encoding="utf-8"))
    schemas = doc["components"]["schemas"]
    responses = doc["components"]["responses"]
    results = []

    def check(label, ok):
        results.append(ok)
        print(f"{'ok  ' if ok else 'FAIL'} {label}")

    check("openapi 3.1.x", str(doc.get("openapi", "")).startswith("3.1."))
    check("licence MIT with SPDX identifier", doc["info"].get("license") == {"name": "MIT", "identifier": "MIT"})
    check(f"schemas = {', '.join(SCHEMAS)}", sorted(schemas) == sorted(SCHEMAS))
    check("OperationName enum = catalog order (RF-CALC-01)", schemas["OperationName"].get("enum") == OPERATIONS)
    check("ProblemCode enum = the 13 codes (RF-API-05)", schemas["ProblemCode"].get("enum") == CODES)
    check("Decimal pattern = SRS regex", schemas["Decimal"].get("pattern") == DECIMAL)
    check("Decimal maxLength 128", schemas["Decimal"].get("maxLength") == 128)
    req = schemas["CalculationRequest"]
    check("CalculationRequest strict, operands required, 1..2 Decimal items",
          req.get("additionalProperties") is False and req.get("required") == ["operands"]
          and req["properties"]["operands"].get("minItems") == 1 and req["properties"]["operands"].get("maxItems") == 2
          and req["properties"]["operands"]["items"] == {"$ref": "#/components/schemas/Decimal"})
    check("CalculationResult requires operation, operands, result, inexact",
          sorted(schemas["CalculationResult"].get("required", [])) == sorted(["operation", "operands", "result", "inexact"]))
    check("OperationInfo arity enum [1, 2]", schemas["OperationInfo"]["properties"]["arity"].get("enum") == [1, 2])
    problem = schemas["Problem"]
    check("Problem requires type, title, status, detail, code, requestId (RF-API-05; instance optional for edge problems)",
          sorted(problem.get("required", [])) == sorted(["type", "title", "status", "detail", "code", "requestId"]))
    check("Decimal is a string (numbers travel as strings)", schemas["Decimal"].get("type") == "string")
    res = schemas["CalculationResult"]["properties"]
    check("CalculationResult: operation OperationName, operands Decimal[], result Decimal, inexact boolean",
          res["operation"] == {"$ref": "#/components/schemas/OperationName"}
          and res["operands"] == {"type": "array", "items": {"$ref": "#/components/schemas/Decimal"}}
          and res["result"] == {"$ref": "#/components/schemas/Decimal"} and res["inexact"].get("type") == "boolean")
    info = schemas["OperationInfo"]["properties"]
    check("OperationInfo: name OperationName, symbol and description strings",
          info["name"] == {"$ref": "#/components/schemas/OperationName"}
          and info["symbol"].get("type") == "string" and info["description"].get("type") == "string")
    check("OperationCatalog.operations is OperationInfo[]",
          schemas["OperationCatalog"]["properties"]["operations"] == {"type": "array", "items": {"$ref": "#/components/schemas/OperationInfo"}})
    check("Problem field types (status integer 400-599, strings elsewhere)",
          problem["properties"]["status"] == {"type": "integer", "minimum": 400, "maximum": 599}
          and all(problem["properties"][f].get("type") == "string" for f in ("type", "title", "detail", "instance", "requestId")))
    check("FieldViolation requires string field and reason", schemas["FieldViolation"].get("required") == ["field", "reason"]
          and all(schemas["FieldViolation"]["properties"][f].get("type") == "string" for f in ("field", "reason")))
    check("Problem has detail, instance, requestId, errors[FieldViolation]",
          {"detail", "instance", "requestId", "errors"} <= set(problem["properties"])
          and problem["properties"]["errors"]["items"] == {"$ref": "#/components/schemas/FieldViolation"})
    check("Problem.code refers to ProblemCode", problem["properties"]["code"] == {"$ref": "#/components/schemas/ProblemCode"})
    check("Health.status enum ok|ready|draining", schemas["Health"]["properties"]["status"].get("enum") == ["ok", "ready", "draining"])
    check("X-Request-ID header pattern (RF-API-07)", doc["components"]["headers"]["XRequestID"]["schema"].get("pattern") == REQUEST_ID)
    check("MethodNotAllowed declares Allow", "Allow" in responses["MethodNotAllowed"].get("headers", {}))
    for name, response in responses.items():
        check(f"response {name} is application/problem+json Problem",
              response["content"].get("application/problem+json", {}).get("schema") == {"$ref": "#/components/schemas/Problem"})
    mapping = {"400": "BadRequest", "404": "NotFound", "405": "MethodNotAllowed", "413": "PayloadTooLarge",
               "415": "UnsupportedMediaType", "422": "Unprocessable", "429": "RateLimited", "500": "InternalError",
               "503": "ServiceUnavailable"}
    success = {("/api/v1/operations", "get"): "OperationCatalog", ("/api/v1/operations/{operation}", "post"): "CalculationResult",
               ("/healthz", "get"): "Health", ("/readyz", "get"): "Health"}
    for (p, m), name in success.items():
        body = doc["paths"][p][m]["responses"]["200"]["content"]["application/json"]["schema"]
        check(f"{m.upper()} {p} 200 is {name}", body == {"$ref": f"#/components/schemas/{name}"})
    calc = doc["paths"]["/api/v1/operations/{operation}"]["post"]
    check("calculate path parameter is OperationName",
          calc["parameters"][0]["schema"] == {"$ref": "#/components/schemas/OperationName"})
    check("calculate request body is a required CalculationRequest",
          calc["requestBody"].get("required") is True
          and calc["requestBody"]["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/CalculationRequest"})
    for (p, m) in STATUSES:
        for code, response in doc["paths"][p][m]["responses"].items():
            if code in mapping and "$ref" in response:
                check(f"{m.upper()} {p} {code} -> {mapping[code]}", response == {"$ref": f"#/components/responses/{mapping[code]}"})
            elif code in mapping:
                check(f"{m.upper()} {p} {code} is Health JSON (readiness draining)", (p, code) == ("/readyz", "503"))
    found = {(p, m) for p, item in doc["paths"].items() for m in item if m in METHODS}
    check("paths and methods = RF-API-01/02/03, RF-OBS-02/03", found == set(STATUSES))
    for (p, m), expected in STATUSES.items():
        keys = list(doc["paths"][p][m]["responses"])
        check(f"{m.upper()} {p} statuses {'/'.join(expected)} in ascending order", keys == expected)
        check(f"{m.upper()} {p} has a 4xx response", any(k.startswith("4") for k in keys))
    ready = doc["paths"]["/readyz"]["get"]["responses"]
    check("readyz 200 and 503 are Health JSON",
          all(ready[c]["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/Health"} for c in ("200", "503")))
    spec_doc = doc["paths"]["/api/v1/openapi.yaml"]["get"]["responses"]["200"]["content"]
    check("openapi.yaml served as application/yaml", list(spec_doc) == ["application/yaml"])
    failures = results.count(False)
    print(f"\n{len(results)} assertion(s), {failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
