# RUN-M0-1 — Plan

Implements the corrected spec (`spec.md`). All three members are small, fully specified record/config files: the controller writes them directly (no implementation dispatch); reviews are independent. Order: OPS-REPO-01 → API-CONTRACT-01 → UI-BASE-01, one commit each, then the closure commit.

Do not touch: `README.md` (stays `# FullStackCalculator`), `docs/spec/`, any workflow-package path, anything under `frontend/` or `backend/` other than `backend/api/`. No `docs/design/`, `docs/plans/`. Nothing in committed files mentions material outside the repository.

---

## Task 1 — OPS-REPO-01

**Files:** `.gitignore`, `.gitattributes`, `.editorconfig`, `.dockerignore`, `LICENSE`, `docs/adr/README.md`, `docs/adr/0000-template.md`.

**Content rules:**
- `.gitignore` sections: OS/editors (`.DS_Store`, `*.swp`, `.idea/`, `.vscode/*`, `!.vscode/extensions.json`); Go (`/bin/`, `backend/internal/web/dist/*`, `!backend/internal/web/dist/.gitkeep`, `*.test`, `*.out`, `backend/internal/calc/testdata/fuzz/**/corpus-local/`); Node/frontend (`node_modules/`, `frontend/dist/`, `frontend/test-results/`, `frontend/playwright-report/`, `frontend/blob-report/`, `*.tsbuildinfo`); reports (`/coverage/`, `/docs/api/index.html`); env (`.env`, `.env.*`, `!.env.example`).
- `.gitattributes`: `* text=auto eol=lf`, `*.png binary`, `schema.gen.ts` `linguist-generated=true`, `frontend/pnpm-lock.yaml` and `backend/go.sum` `linguist-generated=true -diff`.
- `.editorconfig`: root; utf-8, LF, final newline, trim trailing whitespace, 2-space indent; Go tabs (size 4); Makefile tabs; Markdown keeps trailing whitespace.
- `.dockerignore`: `.git`, `**/node_modules`, `**/dist`, `!backend/internal/web/dist/.gitkeep`, `coverage`, `bin`, `docs`, `frontend/test-results`, `frontend/playwright-report`, `frontend/blob-report`, `**/*.tsbuildinfo`, `.env*`.
- `LICENSE`: canonical MIT text, `Copyright (c) 2026 Jerik`.
- ADR index: title, MADR-lite format line (Context · Decision · Consequences · Alternatives considered), status values (Proposed · Accepted · Superseded by ADR-NNNN), empty table `| ADR | Title | Status |`. Template: `# ADR-NNNN: Title`, Status/Date bullets, the four sections each with one guiding sentence.

**Checks (T0, targeted):**
- `git check-ignore -v bin/x coverage/x frontend/node_modules/x docs/api/index.html .env .env.local backend/internal/web/dist/index.html frontend/dist/x frontend/playwright-report/x x.tsbuildinfo` → each ignored; `git check-ignore .env.example backend/internal/web/dist/.gitkeep` → exit 1 (not ignored).
- `git status --porcelain --untracked-files=all` lists only the run's new files (no `.workflow/`, `CLAUDE.md`, `AGENTS.md`, `.claude/`, `pre_plan/`, `PROJECT-BRIEF.md`).
- LICENSE body diff against the canonical MIT text (scratch reference copy from a package in the local Node installation, e.g. any MIT `LICENSE` under `$(npm root -g)`, normalising the copyright line) → identical apart from the copyright line.
- `.dockerignore` sanity: a scratch `docker build` is not run here (no Dockerfile yet; OPS-IMAGE-01/OPS-EDGE-01 prove it). Recorded as their verification, not a gap: `.dockerignore` excluding `docs` and `**/dist` is safe because no image build reads `docs/` and every `dist` is produced inside the build stages.

**Commit:** `chore(repo): add hygiene files, MIT licence and ADR scaffolding` citing OPS-REPO-01, RF-OPS-01, RF-DOC-02.

---

## Task 2 — API-CONTRACT-01

**Files:** `backend/api/openapi.yaml`, `backend/api/spec.go`, `redocly.yaml`.

**Content rules:**
- `openapi.yaml`: OpenAPI 3.1.0; info (title, version 1.0.0, summary, description of strings-as-numbers and RFC 9457 errors, licence MIT with SPDX identifier); servers `http://localhost:8080` (edge) and `http://localhost:8081` (service); tags `operations`, `system`; the five operations of the spec; components `headers.XRequestID`, the ten schemas, and responses `BadRequest`, `NotFound`, `MethodNotAllowed` (with `Allow` header), `PayloadTooLarge`, `UnsupportedMediaType`, `Unprocessable`, `RateLimited`, `InternalError`, `ServiceUnavailable`. Declared status sets: `listOperations` 200/405/429/500/503; `calculate` 200/400/404/405/413/415/422/429/500/503; `getOpenAPIDocument` 200/405/429/500/503; `getLiveness` 200/405/500; `getReadiness` 200/405/500/503 (Health). Status keys in ascending numeric order.
- `spec.go`: package `api`, blank import of `embed`, `//go:embed openapi.yaml` `var Spec []byte`, package and variable doc comments.
- `redocly.yaml`: `extends: [recommended]`; rules `operation-4xx-response: error`, `no-unused-components: error`, `info-license-strict: error`, `security-defined: off` with the reason comment.

**Checks (T0, targeted):**
- Lint: `pnpm --package=@redocly/cli@2.69.0 dlx redocly lint backend/api/openapi.yaml` → «0 errors», 2 warnings (`no-server-example.com` on both localhost servers). Output to `evidence/redocly-lint.txt`.
- Mutation: a scratch copy where `getLiveness` declares only 200/500 → lint reports `operation-4xx-response` again (proves the rule is active and enforced).
- Contract shape check `evidence/check_contract.py` (stdlib + PyYAML if present, otherwise `node -e` with a YAML parser from `pnpm dlx`; prefer Python with `yaml`): asserts the 10 schema names; `OperationName` enum = `[add, subtract, multiply, divide, power, sqrt, percentage]`; `ProblemCode` enum = the 13 RF-API-05 codes in the SRS order; `Decimal.pattern` = the SRS regex and `maxLength: 128`; paths/methods `GET /api/v1/operations`, `POST /api/v1/operations/{operation}`, `GET /api/v1/openapi.yaml`, `GET /healthz`, `GET /readyz`; `/readyz` has 200 and 503 Health; `Health.status` enum `[ok, ready, draining]`; `CalculationRequest` `additionalProperties: false`, `required: [operands]`; `Problem.required` ⊇ `type,title,status,code`; every operation has a 4xx response; the declared status set of each operation equals the list above; `MethodNotAllowed` declares `Allow`; `X-Request-ID` header pattern = RF-API-07. Mutation: a scratch copy with one `ProblemCode` removed → the check fails. Output `evidence/check_contract.txt`.
- Go embed: scratch module `github.com/JerikH/FullStackCalculator/backend` with `api/spec.go` + `openapi.yaml` copied and a tiny `main` printing `len(api.Spec)`; `go vet ./... && go run .` → length equals the file size. Output in `evidence/go-embed.txt`.

**Commit:** `feat(api): add OpenAPI 3.1 contract and Redocly configuration` citing API-CONTRACT-01, RF-API-01; body records why the system operations declare 405/500 (and 429/503 on the `/api/*` one) and the two localhost-server warnings.

---

## Task 3 — UI-BASE-01

**Files:** `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `docs/state/runs/RUN-M0-1/evidence/contrast.py`, `evidence/contrast.txt`, `evidence/contrast-css.txt`, `docs/spec/srs.md` (RF-UI-14 text + change-log row), `docs/spec/roadmap.md` (U5 row).

### DESIGN.md data shape
Frontmatter (YAML, Impeccable/Stitch schema — only `name`, `description`, `colors`, `typography`, `rounded`, `spacing`, `components`):
- `colors`: for each colour token `<n>` of the list below, key `<n>` = light value, `<n>-dark` = dark value (the same set serves the explicit dark theme and the system-dark media block). Names: `bg`, `surface`, `surface-raised`, `border`, `text`, `text-muted`, `display-bg`, `display-text`, `display-muted`, `display-danger`, `key-digit`, `key-digit-text`, `key-function`, `key-function-text`, `key-operator`, `key-operator-text`, `key-equals`, `key-equals-text`, `danger`, `danger-bg`, `focus`. Key `<n>` ↔ CSS `--color-<n>`.
- `typography`: `display-xl`, `display-lg`, `display-md`, `display-secondary`, `title` (h1), `body`, `key-label`, `label` (theme segments, history rows, Ref line) — fontFamily from the system stack, sizes as in the spec, `fontFeature: "tnum"` on display and history roles.
- `rounded`: `sm` 0.5rem, `md` 0.875rem, `lg` 1.25rem. `spacing`: `1` 0.25rem, `2` 0.5rem, `3` 0.75rem, `4` 1rem, `6` 1.5rem, `8` 2rem.
- `components`: `key-digit`, `key-function`, `key-operator`, `key-equals` (backgroundColor/textColor/rounded/height `3.5rem`), `display` (display-bg/display-text/rounded lg/padding), `card` (surface), `theme-segment`, `theme-segment-checked`, `history-row`.
Touch targets: keys `--key-size`; theme segments, history summary, rows and `Clear history` min-height 3rem (48 px). Body: canonical sections Overview (north star «The Precision Instrument»), Colors (Primary = operator/equals blues; Neutral; display panel; state colours; a token table with CSS name, light, dark; Named Rules), Typography, Layout, Elevation & Depth, Shapes, Components (keypad and four variants with hover/active mixes, display hierarchy and states, focus ring geometry, theme control, history panel, favicon), Do's and Don'ts; plus the measured contrast summary table (generated by `contrast.py`, pasted) under Colors.

### PRODUCT.md
Impeccable product schema 1 sections per spec; exact copy lists of RF-UI-08 (nine error messages + `Ref: <requestId>`), RF-UI-10 (`No calculations yet`, `Clear history`, `Use result <formatted result>`, item formats), RF-UI-11 (`Theme`, `System`, `Light`, `Dark`) and RF-UI-06 (`Rounded to 34 significant digits`).

### contrast.py (interface)
`python3 contrast.py <DESIGN.md> [--css <tokens.css>]` → prints a table `theme | pair | ratio | min | pass`, exits 1 if any pair fails or (with `--css`) any token is missing/different or the two dark blocks differ.
- Parsing DESIGN.md: the frontmatter between the first two `---` lines; only the `colors:` mapping is needed (simple `key: "#rrggbb"` lines; no YAML dependency).
- Parsing tokens.css: `:root { … }` (first block) = light; `:root[data-theme='dark'|"dark"] { … }` = dark; the block nested in `@media (prefers-color-scheme: dark)` under `:root:not([data-theme='light'|"light"])` = system-dark. Colour declarations `--color-<n>: #hex;`.
- Pairs (text ≥ 4.5): text on bg/surface/surface-raised; text-muted on bg/surface/surface-raised; display-text, display-muted, display-danger on display-bg; the busy value (display-text mixed 60% over display-bg) on display-bg; each key text on its fill and on its hover (8%) and active (16%) mixes toward `text`; danger on surface and on danger-bg; checked segment text (key-operator-text) on key-operator; favicon white on light key-operator. Non-text (≥ 3.0): focus on bg/surface/surface-raised; checked segment fill (key-operator) vs track (surface); spinner (display-muted) vs display-bg. Informational (no threshold): focus vs each key fill; each key fill vs surface.
- `color-mix(in srgb, A, B p%)` = per-channel `round(A·(1−p) + B·p)` on 8-bit sRGB values.
- Themes reported: `light`, `dark`, `system-dark` (DESIGN.md mode: system-dark = the `-dark` set; CSS mode: parsed separately).

**Checks (T0/T1, targeted):**
- `python3 evidence/contrast.py DESIGN.md > evidence/contrast.txt` → exit 0.
- CSS mode: a scratch `tokens.css` written from DESIGN.md (three blocks) → exit 0 (`evidence/contrast-css.txt`); mutation 1: light focus `#f59e0b` → exit 1 (mismatch with DESIGN.md; with DESIGN.md also reverted, the focus pairs FAIL); mutation 2: `--color-focus` absent from both dark blocks → exit 1 «missing»; mutation 3: one colour different in the media block only → exit 1 «dark blocks differ». Mutation outputs appended to the evidence file.
- Frontmatter YAML parses (`python3 -c 'import yaml…'` or node) and keys ⊆ schema; `.impeccable/design.json` parses as JSON with `schemaVersion: 2`.
- `impeccable detect` on the repository: nothing to scan (no UI files) — output recorded.
- Copy check: every RF-UI-08/10/11 string grep-found verbatim in PRODUCT.md.

**Commit:** `docs(design): add product and design baseline with measured contrast` citing UI-BASE-01, RF-UI-14 (plus RF-UI-01/06/12/13 visual rules).

---

## Closure (step 12)
`closure.md`, `findings.md`, apply to `current.md`, `tasks/OPS.md`, `tasks/API.md`, `tasks/UI.md` (DONE paragraphs + registered follow-ups for UI-SCAF-01, UI-SCREEN-01, API-ROUTES-01), `traceability.md` (RF-OPS-01, RF-DOC-02 partial row, RF-API-01, RF-UI-14), `context/OPS.md`, `context/API.md`, `context/UI.md` (design records as built; desktop and mobile mockups/assets may be generated as comps), `docs/spec/roadmap.md` U5 and `docs/spec/srs.md` RF-UI-14 are committed with UI-BASE-01, `findings/<EPIC>.md`, `reindex.py`, `history.md`, `git mv` run folder to archive; commit `docs(state): close RUN-M0-1`; `wf backup`.

## Review log
(step 6)
