# Traceability matrix

Per requirement and use case: is it covered, by which commits, and with what evidence. Rows are never deleted.

**Status:** ✅ complete chain verified · 🟡 exists with a gap (in Notes) · ⬜ no evidence · 🔴 blocked. **Verified:** Live (date) · Targeted tests (list) · Integrated (wave, tier 2) · Code (file:line only).

## Summary

| | ✅ | 🟡 | ⬜ | 🔴 | Total |
|---|---|---|---|---|---|
| **UC** | 0 | 1 | 10 | 0 | 11 |
| **RF** | 1 | 6 | 56 | 0 | 63 |

## OPS — Repository, environments and delivery

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| UC-OPS-01 | 🟡 | 8e0ed90, d9c7685, 02a52d4 | Targeted tests: check-env.sh (85), check-tiers.sh (133), 8 mutations, real-repository tier runs (2026-10-22) | Steps 1–6 and E1–E6 proven; acceptance «a Vite dev server and a Go service of each identity side by side» waits for both servers (UI-SCREEN-01, Findings of OPS-ENV-01 (b)) |
| RF-OPS-02 | 🟡 | 8e0ed90, d9c7685 | Targeted tests: check-env.sh, listeners on all four ports of two identities (2026-10-22) | Ports, project names and PATH done; real dev servers side by side in UI-SCREEN-01 |
| RF-OPS-03 | 🟡 | 02a52d4 | Targeted tests: check-tiers.sh (133), 4 mutations, real-repository t0/t1/t2/t3 (2026-10-22) | Tiers built on package commands; Makefile targets wired by OPS-STACK-01; frontend stage first exercised by UI-SCAF-01 |
| UC-OPS-02 / RF-OPS-04, RF-OPS-05, RF-OPS-06, RF-OPS-08 | ⬜ | — | — | OPS-EDGE-01, OPS-IMAGE-01, OPS-STACK-01 |
| UC-OPS-03 / RF-OPS-07 | ⬜ | — | — | OPS-IMAGE-01 (handler), OPS-STACK-01 |
| RF-OPS-01 | ✅ | f2b9693 | Targeted tests: git check-ignore (15 ignored, 2 kept), licence text diff (2026-10-22) | — |
| RF-OPS-09 | ⬜ | — | — | OPS-STACK-01 |
| RF-OPS-10 | ⬜ | — | — | OPS-E2E-01 |
| RF-OPS-11 | 🟡 | 02a52d4 | Targeted tests: actionlint, YAML parse, action SHAs, the contract job's commands run locally (2026-10-22) | contract job only (Redocly lint, actionlint, shellcheck); type drift, docs-api and the other five jobs are OPS-CI-02 |
| RF-OPS-12 | ⬜ | — | — | OPS-CI-02 |
| RF-OPS-13 | ⬜ | — | — | OPS-CI-02 |
| RF-OPS-14 | ⬜ | — | — | CALC-CORE-01, CALC-OPS-01 (tests), OPS-STACK-01 (targets) |

## API — HTTP API and contract

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| UC-API-01 / RF-API-01, RF-API-02, RF-API-07, RF-API-08, RF-CALC-01 | ⬜ | — | — | API-CONTRACT-01, API-HTTPX-01, API-ROUTES-01 |
| UC-API-02 / RF-API-03, RF-API-04, RF-API-05, RF-API-06, RF-API-11, RF-API-12, RF-CALC-02…RF-CALC-10 | ⬜ | — | — | API-HTTPX-01, API-ROUTES-01, OBS-RUNTIME-01, CALC-* |
| RF-API-01 | 🟡 | 5d1969f, f2db811 | Targeted tests: Redocly lint 2.69.0, contract shape check with mutations, Go embed (2026-10-22) | Document, components, Redocly configuration and api.Spec done; serving it at GET /api/v1/openapi.yaml with no-store is API-ROUTES-01 |
| RF-API-09 | ⬜ | — | — | API-ROUTES-01 |
| RF-API-10 | ⬜ | — | — | UI-SCAF-01 |

## CALC — Calculation engine

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| RF-CALC-01 | ⬜ | — | — | CALC-OPS-01 (via UC-API-01) |
| RF-CALC-02, RF-CALC-03, RF-CALC-04 | ⬜ | — | — | CALC-CORE-01 (via UC-API-02) |
| RF-CALC-05…RF-CALC-10 | ⬜ | — | — | CALC-OPS-01 (via UC-API-02) |

## OBS — Service runtime and observability

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| UC-OBS-01 / RF-OBS-01…RF-OBS-09 | ⬜ | — | — | OBS-METRICS-01, API-ROUTES-01 (probes), OBS-RUNTIME-01 |

## UI — Calculator web app

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| UC-UI-01 / RF-UI-01, RF-UI-02, RF-UI-04, RF-UI-05, RF-UI-06, RF-UI-07, RF-UI-08, RF-UI-09, RF-UI-12, RF-UI-13 | ⬜ | — | — | UI-CLIENT-01, UI-MODEL-01, UI-HOOKS-01, UI-SCREEN-01 |
| UC-UI-02 / RF-UI-03, RF-UI-04 | ⬜ | — | — | UI-MODEL-01, UI-SCREEN-01 |
| UC-UI-03 / RF-UI-10 | ⬜ | — | — | UI-MODEL-01, UI-HOOKS-01, UI-SCREEN-01 |
| UC-UI-04 / RF-UI-11 | ⬜ | — | — | UI-SCAF-01, UI-HOOKS-01, UI-SCREEN-01 |
| RF-UI-14 | 🟡 | e90d084, 235cc53 | Targeted tests: contrast.py (light, dark, system-dark), record consistency check (2026-10-22) | Design records and measured palette done; tokens.css, global.css and favicon are UI-SCAF-01 |

## DOC — Documentation

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| UC-DOC-01 / RF-DOC-01, RF-DOC-02, RF-DOC-03, RF-DOC-04 | ⬜ | — | — | DOC-ADR-01, OPS-STACK-01 (`docs-api`), DOC-README-01 |
| RF-DOC-02 | 🟡 | f2b9693 | Code: docs/adr/README.md, docs/adr/0000-template.md | Index and template only; ADRs 0001–0008 are DOC-ADR-01 |

## Non-functional

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| RNF-SEC-01, RNF-SEC-02 | ⬜ | — | — | API-HTTPX-01, API-ROUTES-01, OBS-METRICS-01, OPS-EDGE-01 |
| RNF-SEC-03 | ⬜ | — | — | OPS-EDGE-01, OPS-IMAGE-01, UI-SCAF-01, OPS-E2E-01 |
| RNF-SEC-04 | ⬜ | — | — | OPS-IMAGE-01, OPS-EDGE-01, OPS-STACK-01 |
| RNF-SEC-05, RNF-SEC-06 | ⬜ | — | — | OPS-CI-02 |
| RNF-PERF-01 | ⬜ | — | — | CALC-OPS-01, OPS-STACK-01 |
| RNF-QUAL-01 | ⬜ | — | — | UI-SCAF-01, OPS-STACK-01 |
| RNF-QUAL-02 | ⬜ | — | — | CALC-CORE-01, UI-SCAF-01 |
| RNF-A11Y-01 | ⬜ | — | — | UI-SCREEN-01, OPS-E2E-01 |
| RNF-REL-01 | ⬜ | — | — | CALC-OPS-01, UI-HOOKS-01, OBS-RUNTIME-01, API-ROUTES-01 |
| RNF-OPS-01 | ⬜ | — | — | OPS-STACK-01 |
| RNF-OPS-02 | 🟡 | 02a52d4 | Measured: t0 4.0 s over the run, t3 --job contract 6.6 s (2026-10-22) | Tiers 0–1 for sessions in place; durations of the Go and frontend stages measured when they exist |
