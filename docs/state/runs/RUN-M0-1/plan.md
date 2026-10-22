# RUN-M0-1 — Plan

Implements the corrected spec (`spec.md`). All three members are small, fully specified record/config files: the controller writes them directly (no implementation dispatch); reviews are independent. Order: OPS-REPO-01 → API-CONTRACT-01 → UI-BASE-01, one commit each, then the closure commit.

Do not touch: `README.md` (stays `# FullStackCalculator`), `docs/spec/` except the RF-UI-14 row and change log of `srs.md` and the U5 row and change log of `roadmap.md` (Task 3a), any workflow-package path, anything under `frontend/` or `backend/` other than `backend/api/`. No `docs/design/`, `docs/plans/`. Nothing in committed files mentions material outside the repository.

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
- LICENSE body diff against the standard MIT text as shipped by a package of the local Node installation (the OSI/SPDX MIT wording), copyright lines removed from both → identical.
- `.dockerignore` sanity: a scratch `docker build` is not run here (no Dockerfile yet; OPS-IMAGE-01/OPS-EDGE-01 prove it). Recorded as their verification, not a gap: `.dockerignore` excluding `docs` and `**/dist` is safe because no image build reads `docs/` and every `dist` is produced inside the build stages.

**Commit:** `chore(repo): add hygiene files, MIT licence and ADR scaffolding` citing OPS-REPO-01, RF-OPS-01, RF-DOC-02.

---

## Task 2 — API-CONTRACT-01

**Files:** `backend/api/openapi.yaml`, `backend/api/spec.go`, `redocly.yaml`, `docs/state/runs/RUN-M0-1/evidence/{redocly-lint.txt,check_contract.py,check_contract.txt,go-embed.txt}` (committed with this task).

**Content rules:**
- `openapi.yaml`: OpenAPI 3.1.0; info (title, version 1.0.0, summary, description of strings-as-numbers and RFC 9457 errors, licence MIT with SPDX identifier); servers `http://localhost:8080` (edge) and `http://localhost:8081` (service); tags `operations`, `system`; the five operations of the spec; components `headers.XRequestID`, the ten schemas, and responses `BadRequest`, `NotFound`, `MethodNotAllowed` (with `Allow` header), `PayloadTooLarge`, `UnsupportedMediaType`, `Unprocessable`, `RateLimited`, `InternalError`, `ServiceUnavailable`. Declared status sets: `listOperations` 200/405/429/500/503; `calculate` 200/400/404/405/413/415/422/429/500/503; `getOpenAPIDocument` 200/405/429/500/503; `getLiveness` 200/405/500; `getReadiness` 200/405/500/503 (Health). Status keys in ascending numeric order.
- `spec.go`: package `api`, blank import of `embed`, `//go:embed openapi.yaml` `var Spec []byte`, package and variable doc comments.
- `redocly.yaml`: `extends: [recommended]`; rules `operation-4xx-response: error`, `no-unused-components: error`, `info-license-strict: error`, `security-defined: off` with the reason comment.

**Checks (T0, targeted):**
- Lint: `pnpm --package=@redocly/cli@2.69.0 dlx redocly lint backend/api/openapi.yaml` → «0 errors», 2 warnings (`no-server-example.com` on both localhost servers). Output to `evidence/redocly-lint.txt`.
- Mutation: a scratch copy where `getLiveness` declares only 200/500 → lint reports `operation-4xx-response` again (proves the rule is active and enforced).
- Contract shape check `evidence/check_contract.py` (stdlib + PyYAML if present, otherwise `node -e` with a YAML parser from `pnpm dlx`; prefer Python with `yaml`): asserts the 10 schema names; `OperationName` enum = `[add, subtract, multiply, divide, power, sqrt, percentage]`; `ProblemCode` enum = the 13 RF-API-05 codes in the SRS order; `Decimal.pattern` = the SRS regex and `maxLength: 128`; paths/methods `GET /api/v1/operations`, `POST /api/v1/operations/{operation}`, `GET /api/v1/openapi.yaml`, `GET /healthz`, `GET /readyz`; `/readyz` has 200 and 503 Health; `Health.status` enum `[ok, ready, draining]`; `CalculationRequest` `additionalProperties: false`, `required: [operands]`; `Problem.required` ⊇ `type,title,status,code` (detail and requestId stay optional in the schema: the client reads them as optional, RF-UI-09; their presence on every service problem is asserted by the transport and contract tests); every operation has a 4xx response; the declared status set of each operation equals the list above; `MethodNotAllowed` declares `Allow`; `X-Request-ID` header pattern = RF-API-07. Mutation: a scratch copy with one `ProblemCode` removed → the check fails. Output `evidence/check_contract.txt`.
- Go embed: scratch module `github.com/JerikH/FullStackCalculator/backend` with `api/spec.go` + `openapi.yaml` copied and a tiny `main` printing `len(api.Spec)`; `go vet ./... && go run .` → length equals the file size. Output in `evidence/go-embed.txt`.

**Commit:** `feat(api): add OpenAPI 3.1 contract and Redocly configuration` (contract files + Task 2 evidence) citing API-CONTRACT-01, RF-API-01; body records why the system operations declare 405/500 (and 429/503 on the `/api/*` one) and the two localhost-server warnings.

---

## Task 3a — spec records for UI-BASE-01 (owner decision U5)

**Files:** `docs/spec/srs.md` (RF-UI-14 text: light focus `#b45309`, dark `#f59e0b`, `--color-display-danger` `#ff8a80` for error copy on the display panel; change-log row citing U5), `docs/spec/roadmap.md` (U5 row under «Decided by the owner»: the two measured token changes and the PRODUCT.md/DESIGN.md answers; change-log row).

**Commit:** `docs(spec): record measured design-token changes (U5)` citing RF-UI-14, UI-BASE-01 — before Task 3.

## Task 3 — UI-BASE-01

**Files:** `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `docs/state/runs/RUN-M0-1/evidence/contrast.py`, `evidence/contrast.txt`, `evidence/contrast-css.txt`, `docs/spec/srs.md` (RF-UI-14 text + change-log row), `docs/spec/roadmap.md` (U5 row).

### DESIGN.md data shape
Frontmatter (YAML, Impeccable/Stitch schema — only `name`, `description`, `colors`, `typography`, `rounded`, `spacing`, `components`):
- `colors`: for each colour token `<n>` of the list below, key `<n>` = light value, `<n>-dark` = dark value (the same set serves the explicit dark theme and the system-dark media block). Names: `bg`, `surface`, `surface-raised`, `border`, `text`, `text-muted`, `display-bg`, `display-text`, `display-muted`, `display-danger`, `key-digit`, `key-digit-text`, `key-function`, `key-function-text`, `key-operator`, `key-operator-text`, `key-equals`, `key-equals-text`, `danger`, `danger-bg`, `focus`. Key `<n>` ↔ CSS `--color-<n>`.
- `typography`: `display-xl`, `display-lg`, `display-md`, `display-secondary`, `title` (h1), `body`, `key-label`, `label` (theme segments, history rows, Ref line) — fontFamily from the system stack, sizes as in the spec, `fontFeature: "tnum"` on display and history roles.
- `rounded`: `sm` 0.5rem, `md` 0.875rem, `lg` 1.25rem. `spacing`: `1` 0.25rem, `2` 0.5rem, `3` 0.75rem, `4` 1rem, `6` 1.5rem, `8` 2rem.
- `components`: `key-digit`, `key-function`, `key-operator`, `key-equals` (backgroundColor/textColor/rounded/height `3.5rem`), `display` (display-bg/display-text/rounded md/padding), `card` (surface), `theme-segment`, `theme-segment-checked`, `history-row`.
Touch targets: keys `--key-size`; theme segments, history summary, rows and `Clear history` at least 48 × 48 px (3rem). Layout records the 320 px width budget including the 1 px card border and «The Keypad Budget Rule» (≤ 20 px padding plus border per side); the display size budget is marked as an estimate the screen verifies; busy dims only the value digits (the `≈` marker and expression line stay at full opacity). Body: canonical sections Overview (north star «The Precision Instrument»), Colors (Primary = operator/equals blues; Neutral; display panel; state colours; a token table with CSS name, light, dark; Named Rules), Typography, Layout, Elevation & Depth, Shapes, Components (keypad and four variants with hover/active mixes, display hierarchy and states, focus ring geometry, theme control, history panel, favicon), Do's and Don'ts; plus a measured contrast summary table under Colors, written by hand from the `contrast.py` output (minimum per pair group and theme) and cross-checked against it.

### PRODUCT.md
Impeccable product schema 1 sections per spec; exact copy lists of RF-UI-08 (eight error messages + `Ref: <requestId>`), RF-UI-10 (`No calculations yet`, `Clear history`, `Use result <formatted result>`, item formats), RF-UI-11 (`Theme`, `System`, `Light`, `Dark`) and RF-UI-06 (`Rounded to 34 significant digits`).

### contrast.py (interface)
`python3 contrast.py <DESIGN.md> [--css <tokens.css>]` → prints a table `theme | pair | ratio | min | pass`, exits 1 if any pair fails or (with `--css`) any token is missing/different or the two dark blocks differ.
- Parsing DESIGN.md: the frontmatter between the first two `---` lines; only the `colors:` mapping is needed (simple `key: "#rrggbb"` lines; no YAML dependency).
- Parsing tokens.css: comments stripped, top-level rules tokenised with matched braces. Every unconditional `:root` block merges in order = light (a later block overrides, as in the cascade); every `:root[data-theme='dark'|"dark"]` block = dark; `:root:not([data-theme='light'|"light"])` inside `@media (prefers-color-scheme: dark)` = system-dark. A `--color-*` declaration anywhere else is an error. Colour declarations `--color-<n>: #rrggbb;`. Each block's colour-token set must equal the DESIGN.md set (missing or extra token = error). Printed source paths are basenames only.
- Pairs (text ≥ 4.5): text on bg/surface/surface-raised; text-muted on bg/surface/surface-raised; display-text, display-muted, display-danger on display-bg; the busy value (display-text mixed 60% over display-bg) on display-bg; each key text on its fill and on its hover (8%) and active (16%) mixes toward `text`; danger on surface and on danger-bg; checked segment text (key-operator-text) on key-operator; favicon white on light key-operator. Non-text (≥ 3.0): focus on bg/surface/surface-raised (the colours under every focusable control: header theme control on bg, card and history on surface/surface-raised); checked segment fill (key-operator) vs track (surface); spinner (display-muted) vs display-bg; favicon white `=` on the light key-operator fill. Informational (no threshold): focus vs each key fill; each key fill vs surface.
- `color-mix(in srgb, A, B p%)` = per-channel `round(A·(1−p) + B·p)` on 8-bit sRGB values.
- Themes reported: `light`, `dark`, `system-dark` (DESIGN.md mode: system-dark = the `-dark` set; CSS mode: parsed separately).

**Checks (T0/T1, targeted):**
- `python3 evidence/contrast.py DESIGN.md > evidence/contrast.txt` → exit 0.
- DESIGN.md mode mutation: a copy with light `focus: "#f59e0b"` → exit 1 with the three light focus pairs FAIL.
- CSS mode: a scratch fixture `tokens.css` (the expected three-block stylesheet) → exit 0 (`evidence/contrast-css.txt`); mutations, each → exit 1: (1) light focus `#f59e0b`; (2) `--color-focus` absent from both dark blocks; (3) one colour different in the media block only; (4) a later `:root { --color-focus: #f59e0b; }` override; (5) the system-dark block moved outside its media query, followed by another `@media` rule; (6) an extra `--color-*` token. Outputs appended to the evidence file.
- Frontmatter YAML parses (`python3 -c 'import yaml…'` or node) and keys ⊆ schema; `.impeccable/design.json` parses as JSON with `schemaVersion: 2`.
- `impeccable detect` on the repository: nothing to scan (no UI files) — output recorded.
- Copy check: every RF-UI-06 (`Rounded to 34 significant digits`), RF-UI-08, RF-UI-10, RF-UI-11 and RF-UI-13 (`Calculator`, `Keypad`) string grep-found verbatim in PRODUCT.md.

**Commit:** `docs(design): add product and design baseline with measured contrast` citing UI-BASE-01, RF-UI-14 (plus RF-UI-01/06/12/13 visual rules).

---

## Closure (step 12)
`closure.md`, `findings.md`, apply to `current.md`, `tasks/OPS.md`, `tasks/API.md`, `tasks/UI.md` (DONE paragraphs + registered follow-ups for UI-SCAF-01 — run `python3 docs/state/archive/runs/RUN-M0-1/evidence/contrast.py DESIGN.md --css frontend/src/shared/styles/tokens.css`, the archived path — UI-SCREEN-01, API-ROUTES-01), `traceability.md` (RF-OPS-01, RF-DOC-02 partial row, RF-API-01, RF-UI-14), `context/OPS.md`, `context/API.md`, `context/UI.md` (design records as built; desktop and mobile mockups/assets may be generated as comps), `docs/spec/roadmap.md` U5 and `docs/spec/srs.md` RF-UI-14 are committed with UI-BASE-01, `findings/<EPIC>.md`, `reindex.py`, `history.md`, `git mv` run folder to archive; commit `docs(state): close RUN-M0-1`; `wf backup`.

## Review log

Step 6 — independent read-only Claude reviewer (reproduced the script's false passes in scratch). Triage:
- P1 accepted: theme segments were 2.75rem (44 px) → 3rem; summary, rows and Clear history ≥ 48 px stated.
- P2 accepted: `docs/spec/` edits scoped (Task 3a, own `docs(spec)` commit, roadmap change-log row); Task 2 evidence committed with Task 2; printed paths are basenames; CSS parsing tokenised with merged `:root` blocks and errors for colour tokens outside the three blocks (mutations 4 and 5 added and failing as expected); busy dimming applies to the value digits only (`≈` dimmed would measure 3.37:1 / 3.01:1).
- P2 rejected: «tooling in committed files» for the Impeccable records — the project's record rules track PRODUCT.md, DESIGN.md and `.impeccable/` as design records, and the committed `context/UI.md` already names them; the schema marker stays.
- P3 accepted: favicon pair measured; colour-token set equality; width budgets include the 1 px card border and the padding rule is in DESIGN.md; display radius md in both places; eight error messages; copy check covers RF-UI-06/13; summary table described as hand-written and cross-checked; archived path in the UI-SCAF-01 follow-up; clean CSS fixture; LICENSE reference described as the OSI/SPDX MIT wording.
- P3 partly accepted: `Problem.required` stays `type,title,status,code` (client reads `detail`/`requestId` as optional, RF-UI-09; presence is asserted by transport/contract tests) — the spec wording now says so; response headers: the spec wording states which headers the document declares and that RF-API-07/08 headers are asserted by tests; the edge's 1 MiB transport 413 is declared where bodies are accepted (`calculate`), and the spec wording no longer claims «every status the system can return».
- No finding: spec-to-plan coverage otherwise complete; ignore files; status sets; frontmatter schema and references; token table vs frontmatter vs RF-UI-14 + U5; PRODUCT.md copy; colour-mix rounding margin (5.51 vs 4.5).
