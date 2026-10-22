# RUN-M0-1 — Spec

Members: OPS-REPO-01, API-CONTRACT-01, UI-BASE-01. Mode: solo, main checkout. Review level: single for every member.

Owner answers (step 1 batch, 2026-10-22): PRODUCT.md record confirmed as inferred from the SRS (web; primary user the anonymous visitor; secondary audience the technical reviewer of SRS §2.2; sober English copy; no invented proof); DESIGN.md creative north star «The Precision Instrument»; light-theme focus ring `#b45309`; new token `--color-display-danger` `#ff8a80` for error text on the display panel. Mid-run owner note: Codex may generate design images, raster assets and high-fidelity desktop and mobile mockups for UI work (recorded in `context/UI.md` at closure).

What exists (step 2): the code knowledge graph holds only `docs/` sections (43 files, no code symbols); git tracks `README.md` (`# FullStackCalculator`) and `docs/`. No product code, no hygiene files, no contract, no design records. Nothing to reuse and nothing that can break.

---

## OPS-REPO-01 — Repository hygiene files and licence

**Scope:** RF-OPS-01; the ADR scaffolding of RF-DOC-02 (index with the MADR-lite format note and an empty table, template).

**Missing:** everything: `.gitignore`, `.gitattributes`, `.editorconfig`, `.dockerignore`, `LICENSE`, `docs/adr/README.md`, `docs/adr/0000-template.md`.

**Decisions:**
- File contents follow the established repository bootstrap text verbatim; `README.md` stays `# FullStackCalculator` (DOC-README-01 writes it); no `docs/design/` or `docs/plans/`.
- `.gitignore` lists every pattern of RF-OPS-01: OS/editor files, `/bin/`, `backend/internal/web/dist/*` with `!backend/internal/web/dist/.gitkeep`, `*.test`, `*.out`, local fuzz corpora, `node_modules/`, `frontend/dist/`, Playwright reports (`frontend/test-results/`, `frontend/playwright-report/`, `frontend/blob-report/`), `*.tsbuildinfo`, `/coverage/`, `/docs/api/index.html`, `.env`, `.env.*`, `!.env.example`. The workflow package is already excluded through `.git/info/exclude`; `.gitignore` does not repeat it (it would name untracked tooling in a committed file).
- `.gitattributes`: LF everywhere, PNG binary, generated files marked (`schema.gen.ts`, `pnpm-lock.yaml`, `go.sum`).
- `.dockerignore`: every build uses the repository root as context; excludes `.git`, dependencies, build output (keeping the dist `.gitkeep`), coverage, `bin`, `docs`, reports, `.env*`.
- `LICENSE`: the standard MIT text, `Copyright (c) 2026 Jerik` (RF-OPS-01 names the holder «Jerik»).

**Verification:** `git check-ignore -v` proves `bin/x`, `coverage/x`, `frontend/node_modules/x`, `docs/api/index.html`, `.env` are ignored and `.env.example`, `backend/internal/web/dist/.gitkeep` are not; `git status --porcelain --ignored` shows no workflow-package path as untracked; the licence body is compared with the canonical MIT text (diff of the body against a reference copy).

**Files:** `.gitignore`, `.gitattributes`, `.editorconfig`, `.dockerignore`, `LICENSE`, `docs/adr/README.md`, `docs/adr/0000-template.md`.

---

## API-CONTRACT-01 — OpenAPI 3.1 contract and Redocly configuration

**Scope:** RF-API-01 (document, components, Redocly configuration, embedding file `backend/api/spec.go` exporting `Spec`), listing every endpoint, schema and response of RF-API-02…08 and RF-OBS-02/03, the 13 `ProblemCode` values and the `Decimal` pattern/length.

**Missing:** `backend/api/openapi.yaml`, `backend/api/spec.go`, `redocly.yaml`.

**Decisions:**
- The established contract text is committed verbatim except for one measured correction. Linting it (Redocly CLI 2.69.0, `recommended` + the RF-API-01 rules) fails `operation-4xx-response` on three operations: `getOpenAPIDocument` (`/api/v1/openapi.yaml`), `getLiveness` (`/healthz`), `getReadiness` (`/readyz`). The fix is in the YAML, never in `redocly.yaml`: each of the three gains `"405": $ref: "#/components/responses/MethodNotAllowed"`. This is true of the service: RF-API-06 makes every known path answer a wrong method with a 405 problem and an `Allow` header, and the route table registers these three paths through the `Methods` dispatcher (GET only). It also lets the contract tests of RF-API-09 validate a wrong-method probe response against the document.
- The two `no-server-example.com` warnings (localhost servers) stay: both URLs are the documented local topologies (edge `:8080`, service `:8081`). Recorded in the commit body.
- `spec.go` has no import of the module path, so the module-path adaptation does not touch it; it compiles once CALC-CORE-01 creates `backend/go.mod`. It is compiled now in a scratch module as evidence.
- `redocly.yaml` at the repository root: `extends: [recommended]`, `operation-4xx-response`, `no-unused-components`, `info-license-strict` as errors, `security-defined: off` (public unauthenticated API by design).

**Verification:** `pnpm --package=@redocly/cli@<pinned> dlx redocly lint backend/api/openapi.yaml` → 0 errors, 2 localhost warnings; a schema check script asserts: the 10 component schema names of RF-API-01; `OperationName` enum = the RF-CALC-01 catalog in order; `ProblemCode` enum = the 13 codes of RF-API-05; `Decimal` pattern equals the SRS regex and `maxLength: 128`; the 5 paths/methods of RF-API-02/03, RF-API-01 and RF-OBS-02/03; `Health.status` enum `ok|ready|draining`; every operation has a 4xx response. A mutation (remove one `ProblemCode`) makes the check fail. `go vet` of `spec.go` in a scratch module with the real module path compiles and `len(api.Spec) > 0`.

**Files:** `backend/api/openapi.yaml`, `backend/api/spec.go`, `redocly.yaml`.

**Consumers:** API-HTTPX-01, API-ROUTES-01 (contract tests), UI-SCAF-01 (generated types), UI-CLIENT-01. The 405 additions are recorded in `context/API.md`.

---

## UI-BASE-01 — Design baseline: PRODUCT.md, DESIGN.md, measured contrast

**Scope:** RF-UI-14; the visual rules of RF-UI-01, RF-UI-06, RF-UI-12, RF-UI-13 as design records; the exact copy of RF-UI-08, RF-UI-10, RF-UI-11 in PRODUCT.md. Records only, no UI built.

**Missing:** `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` (Impeccable sidecar), the contrast measurement and its evidence; `docs/state/context/UI.md` additions.

**Impeccable (shape of this member):** `impeccable context` reported no PRODUCT.md and no visual implementation. `init` interview done in the step 1 batch (product record confirmed). The visual world is pinned by RF-UI-14 (palette, font stack, variants, dark-override selectors, favicon, no UI library) — Impeccable's «the brief wins» rule applies, so DESIGN.md records the pinned world with full tokens (not a seed): there is nothing to invent, only to record and measure. North star: «The Precision Instrument». No surface brief is written here: the calculator screen is shaped in UI-SCREEN-01.

**Decisions:**
- **Token names = the CSS custom properties UI-SCAF-01 writes in `frontend/src/shared/styles/tokens.css`**: fonts (`--font-sans`, `--font-mono`), spacing (`--space-1/2/3/4/6/8`), radius (`--radius-sm/md/lg`), `--key-size`, `--transition-fast`, colours `--color-*` (bg, surface, surface-raised, border, text, text-muted, display-bg, display-text, display-muted, display-danger, key-digit(+text), key-function(+text), key-operator(+text), key-equals(+text), danger, danger-bg, focus), `--shadow-card`. DESIGN.md frontmatter keys map 1:1: colour `<name>` ↔ light `--color-<name>`, `<name>-dark` ↔ dark value (same value in `:root[data-theme="dark"]` and in `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`).
- **Measured failures and the only value changes:** (1) light focus ring `#f59e0b` measured 2.15:1 on surface and 1.97:1 on bg (< 3:1) → light `--color-focus` = `#b45309`; dark stays `#f59e0b`. (2) Error copy is rendered inside the display panel, which is dark in both themes; light `--color-danger` `#b42318` on `#11161d` measured 2.76:1 (< 4.5:1) → new token `--color-display-danger` `#ff8a80` in both themes, used only for error text and the error marker on the display. Every other value is the RF-UI-14 / bootstrap palette unchanged.
- **Focus ring geometry:** 3px solid outline, 2px offset, on `:focus-visible` only. With the offset, the pixels that change on focus were the surface the control sits on, so the WCAG 2.2 non-text measure for every key variant is ring vs the keypad surface (both themes ≥ 3:1 after the change). Ring vs key fill is also measured and reported as information (it is not adjacent).
- **Key states:** hover = the variant fill mixed 8% toward `--color-text` (`color-mix(in srgb, <fill>, var(--color-text) 8%)`), active 16%; the label colour stays. Hover/active text contrast is measured for every variant in both themes. `--transition-fast` for background; removed under reduced motion.
- **Theme control (RF-UI-11):** native radio segmented control; the checked segment uses the operator fill and text plus weight 600, and its fill must contrast ≥ 3:1 with the unchecked track (state is not conveyed by hue alone); measured.
- **Display hierarchy (RF-UI-06):** secondary expression line `--color-display-muted`; primary value in `--color-display-text`, tabular numerals; size steps xl (≤ 10 chars) / lg (≤ 16) / md (wrapping, `overflow-wrap: anywhere`), with fluid values sized so a 10-character xl value and a 16-character lg value fit the 320 px viewport (component values, not tokens): xl `clamp(1.75rem, 9vw, 2.75rem)`, lg `clamp(1.25rem, 6vw, 1.75rem)`, md `1.125rem`; error copy `1.25rem` in `--color-display-danger`; `Ref:` line `0.875rem` in `--color-display-muted`; spinner in `--color-display-muted` (non-text ≥ 3:1).
- **Layout (RF-UI-12):** mobile-first single column (display, keypad, `<details>` history collapsed below 768 px), page gutter `--space-4`; ≥ 768 px two centred columns 22.5rem + 18rem, gap `--space-6`; `min-height: 100dvh`; no horizontal scroll at 320 px (keypad 4 × `minmax(0, 1fr)`, keys min `--key-size` 3.5rem = 56 px ≥ 48 px, 4 keys + 3 gaps of `--space-2` = 248 px < 288 px available).
- **Keypad (RF-UI-01):** 4 × 6 grid, row-major order of RF-UI-01, `=` spanning rows 5–6, four variants digit/function/operator/equals; placement by finite CSS classes (no inline style attributes, RNF-SEC-03).
- **Favicon:** 32 × 32 rounded square in the light operator colour `#2f5fd0` with a white `=` of two rectangles (white on `#2f5fd0` measured 5.72:1).
- **No UI library, icon system or runtime styling;** CSS Modules + tokens; system UI font stack; reduced motion disables transitions and spinner rotation.
- **Evidence script:** `docs/state/runs/RUN-M0-1/evidence/contrast.py` computes WCAG 2.x relative-luminance contrast for every used pair from the DESIGN.md frontmatter (light, dark, system-dark = the dark set), applies the colour-mix states, and exits non-zero on any failure; with `--css <tokens.css>` it also parses the three token blocks, asserts each colour equals DESIGN.md and that the explicit-dark and system-dark blocks are identical — the check UI-SCAF-01 re-runs (registered follow-up). Output saved as `evidence/contrast.txt`.
- **PRODUCT.md** (Impeccable product schema 1): Platform web; Users (visitor; technical reviewer); Product Purpose; Positioning (server-authoritative decimal arithmetic, 34 digits, strings on the wire); Operating Context (keyboard/pointer/touch, same-origin, two delivery topologies); Capabilities and Constraints (seven operations, history in the browser, no accounts, English only, the exact copy of RF-UI-08/10/11); Evidence on Hand (none yet; never fabricate); Product Principles; Accessibility & Inclusion (WCAG 2.2 AA, RF-UI-13). Never mentions work material outside the repository.

**Verification:** `contrast.py DESIGN.md` exits 0 with every text pair ≥ 4.5:1 and every non-text pair ≥ 3:1 in light, dark and system-dark, output in evidence; `--css` mode proven on a scratch `tokens.css` built from DESIGN.md (pass) and on a mutated copy (fail: one changed colour, one diverging dark block); `impeccable detect` reports nothing to scan (no UI files); DESIGN.md token names listed against the tokens.css names (`contrast.py` asserts the set); DESIGN.md frontmatter parses as YAML; sidecar parses as JSON.

**Files:** `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `docs/state/runs/RUN-M0-1/evidence/*`; at closure `docs/state/context/UI.md`.

---

## Follow-ups to register at closure
- UI-SCAF-01: write `tokens.css` from DESIGN.md (focus light `#b45309`, new `--color-display-danger`) and run `contrast.py DESIGN.md --css frontend/src/shared/styles/tokens.css`.
- UI-SCREEN-01: use `--color-display-danger` for error copy on the display, the focus geometry, key hover/active mixes and checked-segment rule of DESIGN.md; re-run Impeccable `document` in scan mode once the screen exists.
- API-ROUTES-01: the contract test table includes a wrong-method request on `/healthz`, `/readyz` and `/api/v1/openapi.yaml` validated against the new 405 responses.

## Review log
(step 4)
