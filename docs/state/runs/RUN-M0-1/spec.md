# RUN-M0-1 — Spec

Members: OPS-REPO-01, API-CONTRACT-01, UI-BASE-01. Mode: solo, main checkout. Review level: single for every member.

Owner answers (step 1 batch, 2026-10-22): PRODUCT.md record confirmed as inferred from the SRS (web; primary user the anonymous visitor; secondary audience the technical reviewer of SRS §2.2; sober English copy; no invented proof); DESIGN.md creative north star «The Precision Instrument»; light-theme focus ring `#b45309`; new token `--color-display-danger` `#ff8a80` for error text on the display panel (both recorded as owner decision U5, with an RF-UI-14 change-log row). Mid-run owner note: high-fidelity desktop and mobile mockups, design images and raster assets may be generated as comps for UI work (recorded in `context/UI.md` at closure).

What exists (step 2): the code knowledge graph holds only `docs/` sections (43 files, no code symbols); git tracks `README.md` (`# FullStackCalculator`) and `docs/`. No product code, no hygiene files, no contract, no design records. Nothing to reuse and nothing that can break.

---

## OPS-REPO-01 — Repository hygiene files and licence

**Scope:** RF-OPS-01; the ADR scaffolding of RF-DOC-02 (index with the MADR-lite format note and an empty table, template).

**Missing:** everything: `.gitignore`, `.gitattributes`, `.editorconfig`, `.dockerignore`, `LICENSE`, `docs/adr/README.md`, `docs/adr/0000-template.md`.

**Decisions:**
- `README.md` stays `# FullStackCalculator` (DOC-README-01 writes it); no `docs/design/` or `docs/plans/`.
- `.gitignore` lists every pattern of RF-OPS-01: OS/editor files, `/bin/`, `backend/internal/web/dist/*` with `!backend/internal/web/dist/.gitkeep`, `*.test`, `*.out`, local fuzz corpora, `node_modules/`, `frontend/dist/`, Playwright reports (`frontend/test-results/`, `frontend/playwright-report/`, `frontend/blob-report/`), `*.tsbuildinfo`, `/coverage/`, `/docs/api/index.html`, `.env`, `.env.*`, `!.env.example`. The workflow package is already excluded through `.git/info/exclude`; `.gitignore` does not repeat it (it would name untracked tooling in a committed file).
- `.gitattributes`: LF everywhere, PNG binary, generated files marked (`schema.gen.ts`, `pnpm-lock.yaml`, `go.sum`).
- `.dockerignore`: every build uses the repository root as context; excludes `.git`, dependencies, build output (keeping the dist `.gitkeep`), coverage, `bin`, `docs`, all three Playwright report folders, `.env*`. Excluding `docs` and `**/dist` is safe: image builds copy only `backend/` or `frontend/` sources and produce `dist` inside their build stages.
- `LICENSE`: the standard MIT text, `Copyright (c) 2026 Jerik` (RF-OPS-01 names the holder «Jerik»).

**Verification:** `git check-ignore -v` proves `bin/x`, `coverage/x`, `frontend/node_modules/x`, `docs/api/index.html`, `.env` are ignored and `.env.example`, `backend/internal/web/dist/.gitkeep` are not; `git status --porcelain --ignored` shows no workflow-package path as untracked; the licence body is compared with the canonical MIT text (diff of the body against a reference copy).

**Files:** `.gitignore`, `.gitattributes`, `.editorconfig`, `.dockerignore`, `LICENSE`, `docs/adr/README.md`, `docs/adr/0000-template.md`.

---

## API-CONTRACT-01 — OpenAPI 3.1 contract and Redocly configuration

**Scope:** RF-API-01 (document, components, Redocly configuration, embedding file `backend/api/spec.go` exporting `Spec`), listing every endpoint, schema and status code of RF-API-02…08 and RF-OBS-02/03, the 13 `ProblemCode` values and the `Decimal` pattern/length. Response headers other than `X-Request-ID` and `Allow` (RF-API-08 cache and security headers) are not declared in the document; the contract tests of API-ROUTES-01 assert them.

**Missing:** `backend/api/openapi.yaml`, `backend/api/spec.go`, `redocly.yaml`.

**Decisions:**
- Every operation declares every status the system can truthfully return for it, which also satisfies `operation-4xx-response` (Redocly CLI 2.69.0, `recommended` + the RF-API-01 rules) without touching `redocly.yaml`. Measured: a document whose three GET-only system operations declare no 4xx fails that rule on `getOpenAPIDocument`, `getLiveness` and `getReadiness`. Declared sets: `getOpenAPIDocument` (`/api/v1/openapi.yaml`, an `/api/*` location behind the edge) 200, 405, 429, 500, 503 — the same set as `listOperations`; `getLiveness` 200, 405, 500; `getReadiness` 200, 405, 500, 503 (Health). 405: RF-API-06 makes every known path answer a wrong method with a 405 problem and an `Allow` header (the three paths are GET-only). 500: RF-API-11 (`Recover` wraps every route, RF-API-12). 429/503 problems: the edge rate-limits and intercepts upstream failures on API locations only (RF-OPS-04); probes pass through untouched, so they declare neither. Status keys in ascending numeric order.
- The two `no-server-example.com` warnings (localhost servers) stay: both URLs are the documented local topologies (edge `:8080`, service `:8081`). Recorded in the commit body.
- `spec.go` has no import of the module path, so the module-path adaptation does not touch it; it compiles once CALC-CORE-01 creates `backend/go.mod`. It is compiled now in a scratch module as evidence.
- `redocly.yaml` at the repository root: `extends: [recommended]`, `operation-4xx-response`, `no-unused-components`, `info-license-strict` as errors, `security-defined: off` (public unauthenticated API by design).

**Verification:** `pnpm --package=@redocly/cli@2.69.0 dlx redocly lint backend/api/openapi.yaml` → 0 errors, 2 localhost warnings; a schema check script asserts: the 10 component schema names of RF-API-01; `OperationName` enum = the RF-CALC-01 catalog in order; `ProblemCode` enum = the 13 codes of RF-API-05; `Decimal` pattern equals the SRS regex and `maxLength: 128`; the 5 paths/methods of RF-API-02/03, RF-API-01 and RF-OBS-02/03; `Health.status` enum `ok|ready|draining`; every operation has a 4xx response. A mutation (remove one `ProblemCode`) makes the check fail. `go vet` of `spec.go` in a scratch module with the real module path compiles and `len(api.Spec) > 0`.

**Files:** `backend/api/openapi.yaml`, `backend/api/spec.go`, `redocly.yaml`.

**Consumers:** API-HTTPX-01, API-ROUTES-01 (contract tests), UI-SCAF-01 (generated types), UI-CLIENT-01. `context/API.md` records the declared status sets of the system operations and how wrong-method responses are validated (see the API-ROUTES-01 follow-up).

---

## UI-BASE-01 — Design baseline: PRODUCT.md, DESIGN.md, measured contrast

**Scope:** RF-UI-14; the visual rules of RF-UI-01, RF-UI-06, RF-UI-12, RF-UI-13 as design records; the exact copy of RF-UI-08, RF-UI-10, RF-UI-11 in PRODUCT.md. Records only, no UI built.

**Missing:** `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` (Impeccable sidecar), the contrast measurement and its evidence; `docs/state/context/UI.md` additions.

**Impeccable (shape of this member):** `impeccable context` reported no PRODUCT.md and no visual implementation. `init` interview done in the step 1 batch (product record confirmed). The visual world is pinned by RF-UI-14 (palette, font stack, variants, dark-override selectors, favicon, no UI library), so DESIGN.md records that pinned world with full tokens rather than a seed: there is nothing to invent, only to record and measure. North star: «The Precision Instrument». The calculator screen itself is shaped in UI-SCREEN-01.

**Decisions:**
- **Token names = the CSS custom properties UI-SCAF-01 writes in `frontend/src/shared/styles/tokens.css`**: fonts (`--font-sans`, `--font-mono`), spacing (`--space-1/2/3/4/6/8`), radius (`--radius-sm/md/lg`), `--key-size`, `--transition-fast`, colours `--color-*` (bg, surface, surface-raised, border, text, text-muted, display-bg, display-text, display-muted, display-danger, key-digit(+text), key-function(+text), key-operator(+text), key-equals(+text), danger, danger-bg, focus), `--shadow-card`. DESIGN.md frontmatter keys map 1:1: colour `<name>` ↔ light `--color-<name>`, `<name>-dark` ↔ dark value (same value in `:root[data-theme="dark"]` and in `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`).
- **Measured failures and the only value changes:** (1) light focus ring `#f59e0b` measured 2.15:1 on surface and 1.97:1 on bg (< 3:1) → light `--color-focus` = `#b45309`; dark stays `#f59e0b` and must be declared explicitly in both dark blocks (otherwise the dark themes inherit `#b45309`, which still passes 3:1 at 3.44:1 on the dark surface, so only a declaration check catches it). (2) Error copy is rendered inside the display panel, which is dark in both themes; light `--color-danger` `#b42318` on `#11161d` measured 2.76:1 (< 4.5:1) → new token `--color-display-danger` `#ff8a80` in both themes, used only for error text and the error marker on the display. Every other value is the RF-UI-14 / bootstrap palette unchanged.
- **Focus ring geometry:** 3px solid outline, 2px offset, on `:focus-visible` only, for every focusable control (keys, theme radios, history `<summary>`, history rows, `Clear history`). With the offset, the pixels that change on focus were the surface the control sits on (`bg` for the header theme control, `surface`/`surface-raised` for the card and history), so the WCAG 2.2 non-text measure is ring vs those three colours (both themes ≥ 3:1 after the change). Ring vs key fill is also measured and reported as information (it is not adjacent).
- **Touch targets (RF-UI-13):** every interactive control is at least 48 × 48 CSS px: keys (`--key-size` 3.5rem), theme segments, history `<summary>`, history rows and `Clear history` (min-height 3rem).
- **Key states:** hover = the variant fill mixed 8% toward `--color-text` (`color-mix(in srgb, <fill>, var(--color-text) 8%)`), active 16%; the label colour stays. Hover/active text contrast is measured for every variant in both themes. `--transition-fast` for background; removed under reduced motion.
- **Theme control (RF-UI-11):** native radio segmented control; the checked segment uses the operator fill and text plus weight 600, and its fill must contrast ≥ 3:1 with the unchecked track (state is not conveyed by hue alone); measured.
- **Display hierarchy (RF-UI-06):** secondary expression line `--color-display-muted`; primary value in `--color-display-text`, tabular numerals; size steps xl (≤ 10 chars) / lg (≤ 16) / md (wrapping, `overflow-wrap: anywhere`), with fluid values sized so a 10-character xl value and a 16-character lg value, each with the `≈` marker (0.75 em, outside the character count), fit both the 320 px viewport and the 22.5rem column (component values, not tokens): xl `clamp(1.75rem, 9vw, 2.5rem)`, lg `clamp(1.25rem, 6vw, 1.75rem)`, md `1.125rem`; error copy `1.25rem` in `--color-display-danger`; `Ref:` line `0.875rem` in `--color-display-muted`; busy value at opacity 0.6 (measured as a text pair); spinner in `--color-display-muted` (non-text ≥ 3:1).
- **Layout (RF-UI-12):** mobile-first single column (display, keypad, `<details>` history collapsed below 768 px), page gutter `--space-4`; ≥ 768 px two centred columns 22.5rem + 18rem, gap `--space-6`; `min-height: 100dvh`; no horizontal scroll at 320 px. Width budget at 320 px: 320 − 2 × 16 gutter − 2 × 16 card padding − 2 × 1 card border = 254 px for the keypad; 4 keys + 3 gaps of `--space-2` need ≥ 4 × 56 + 24 = 248 px, so keys are 57.5 px wide. Rule: the keypad's containers add at most 20 px of horizontal padding plus border per side (card padding `--space-4`, no keypad padding); a larger padding overflows at 320 px.
- **Keypad (RF-UI-01):** 4 × 6 grid, row-major order of RF-UI-01, `=` spanning rows 5–6, four variants digit/function/operator/equals; placement by finite CSS classes (no inline style attributes, RNF-SEC-03).
- **Favicon:** 32 × 32 rounded square in the light operator colour `#2f5fd0` with a white `=` of two rectangles (white on `#2f5fd0` measured 5.72:1).
- **No UI library, icon system or runtime styling;** CSS Modules + tokens; system UI font stack; reduced motion disables transitions and spinner rotation.
- **Evidence script:** `docs/state/runs/RUN-M0-1/evidence/contrast.py` computes WCAG 2.x relative-luminance contrast for every used pair from the DESIGN.md frontmatter (light, dark, system-dark = the dark set), applies the colour-mix states, and exits non-zero on any failure; with `--css <tokens.css>` it also parses the three token blocks, asserts each colour equals DESIGN.md and that the explicit-dark and system-dark blocks are identical — the check UI-SCAF-01 re-runs (registered follow-up). Output saved as `evidence/contrast.txt`.
- **PRODUCT.md** (Impeccable product schema 1): Platform web; Users (visitor; technical reviewer); Product Purpose; Positioning (server-authoritative decimal arithmetic, 34 digits, strings on the wire); Operating Context (keyboard/pointer/touch, same-origin, two delivery topologies); Capabilities and Constraints (seven operations, history in the browser, no accounts, English only, the exact copy of RF-UI-06/08/10/11); Evidence on Hand (none; screenshots and measurements come only from the running system); Product Principles; Accessibility & Inclusion (WCAG 2.2 AA, RF-UI-13). Never mentions work material outside the repository.
- **Spec change:** RF-UI-14 text updated to the measured values (light focus `#b45309`, dark `#f59e0b`; `display-danger` `#ff8a80` for error copy on the display panel) with a change-log row citing U5.

**Verification:** `contrast.py DESIGN.md` exits 0 with every text pair ≥ 4.5:1 and every non-text pair ≥ 3:1 in light, dark and system-dark, output in evidence; `--css` mode requires every colour token to be declared in each of the three blocks and is proven on a scratch `tokens.css` built from DESIGN.md (pass) and on mutated copies (fail: light focus `#f59e0b`; `--color-focus` missing from the dark blocks; one diverging colour in the media block); `impeccable detect` reports nothing to scan (no UI files); DESIGN.md token names listed against the tokens.css names (`contrast.py` asserts the set); DESIGN.md frontmatter parses as YAML; sidecar parses as JSON.

**Files:** `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `docs/state/runs/RUN-M0-1/evidence/*`, `docs/spec/srs.md` (RF-UI-14 + change log), `docs/spec/roadmap.md` (U5); at closure `docs/state/context/UI.md`.

---

## Follow-ups to register at closure
- UI-SCAF-01: write `tokens.css` from DESIGN.md (focus light `#b45309` and `--color-focus: #f59e0b` declared in both dark blocks; new `--color-display-danger` in all three blocks) and run `contrast.py DESIGN.md --css frontend/src/shared/styles/tokens.css`.
- UI-SCREEN-01: use `--color-display-danger` for error copy on the display, the focus geometry, key hover/active mixes and checked-segment rule of DESIGN.md; re-run Impeccable `document` in scan mode once the screen exists.
- API-ROUTES-01: response validation looks operations up by the request's method, so a wrong-method request (no operation for that method) cannot be validated as a response of the document; the contract tests validate every 405 body against `#/components/schemas/Problem` and assert the `Allow` header instead, including wrong-method requests on `/healthz`, `/readyz` and `/api/v1/openapi.yaml`.

## Review log

Step 4 — independent read-only Claude reviewer (ran Redocly 2.69.0 and libopenapi-validator v0.16.1 / libopenapi v0.41.6 in scratch). Triage:
- P1 accepted: response validation looks operations up by request method, so a wrong-method response cannot be validated against a 405 declared under `get` (reviewer's run: `POST Path '/healthz' not found`). The contract-test justification was removed; the API-ROUTES-01 follow-up now validates 405 bodies against the Problem schema and asserts `Allow`.
- P3 accepted: `getOpenAPIDocument` declares 405/429/500/503 like `listOperations`; the probes declare 405 and 500 (no edge problems on pass-through probes, RF-OPS-04); keys in numeric order.
- P3 accepted: scope wording «status codes», with headers asserted by contract tests.
- P2 accepted: dark blocks must declare `--color-focus`; `contrast.py --css` requires every token in every block (already so in the draft; proven by a mutation).
- P3 accepted: focus ring and 48 px targets cover theme segments, summary, history rows and Clear history.
- P3 accepted: 320 px budget includes card padding and border (254 px, keys 57.5 px) with a padding limit rule; xl max lowered to 2.5rem so 10 characters plus `≈` fit the 22.5rem column.
- P2 accepted: committed records describe the files as they are, without references to material outside the repository or to agent tooling.
- P3 accepted: RF-UI-14 updated with a change-log row (U5).
- P3 accepted: PRODUCT.md «Evidence on Hand: none».
- P3 accepted: `.dockerignore` adds `frontend/blob-report`.
- No finding: lint rules other than `operation-4xx-response`; every contrast number; `.gitignore` coverage of RF-OPS-01; `.dockerignore` excluding `docs` and `**/dist`.
