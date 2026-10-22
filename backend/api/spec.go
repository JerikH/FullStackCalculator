// Package api embeds the OpenAPI contract so that the service can serve it and
// tests can validate handlers against the exact document clients see.
package api

import _ "embed"

// Spec is the OpenAPI 3.1 document describing the public HTTP API.
//
//go:embed openapi.yaml
var Spec []byte
