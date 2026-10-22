"""Checks one edge-built problem body (OPS-EDGE-01, R12).

Usage: problem-check.py <openapi.yaml> <body-file> <CODE> <X-Request-ID header>
Prints nothing when the body is exactly the edge's constant problem for CODE
with requestId equal to the header and validates against the contract's
Problem schema; otherwise prints what is wrong.
"""
import json
import sys

import jsonschema
import yaml

EXPECTED = {
    "RATE_LIMITED": ("rate-limited", "Too many requests", 429, "slow down and retry shortly"),
    "SERVICE_UNAVAILABLE": ("service-unavailable", "Service unavailable", 503,
                            "the calculator service is temporarily unavailable"),
    "PAYLOAD_TOO_LARGE": ("payload-too-large", "Payload too large", 413,
                          "request body must not exceed 4096 bytes"),
}


def main() -> None:
    contract, body_file, code, header_id = sys.argv[1:5]
    with open(contract, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    with open(body_file, encoding="utf-8") as f:
        raw = f.read()
    errors = []
    try:
        body = json.loads(raw)
    except ValueError as exc:
        print(f"not JSON ({exc}): {raw[:120]!r}")
        return
    kebab, title, status, detail = EXPECTED[code]
    want = {"type": f"urn:calculator:problem:{kebab}", "title": title, "status": status,
            "detail": detail, "code": code, "requestId": header_id}
    if body != want:
        errors.append(f"body {body} != {want}")
    if not header_id:
        errors.append("no X-Request-ID header")
    schema = {"$ref": "#/components/schemas/Problem", "components": doc["components"]}
    validator = jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())
    errors += [f"schema: {e.message}" for e in validator.iter_errors(body)]
    if code not in doc["components"]["schemas"]["ProblemCode"]["enum"]:
        errors.append(f"{code} not in ProblemCode")
    print("; ".join(errors), end="")


if __name__ == "__main__":
    main()
