---
version: 1
slug: "frontend-src-features-calculator-ui"
primary_target: "frontend/src/features/calculator/ui"
related_targets: ["frontend/src/app","frontend/src/shared/theme"]
---

# Surface brief — calculator screen (route `/`)

Mode: Operate. An established world: DESIGN.md («The Precision Instrument») and PRODUCT.md are authoritative; this brief only records what belongs to this surface.

## Job and audience
An anonymous visitor, in short bursts on a phone or a desktop, enters a calculation by keypad, keyboard or touch, trusts the exact result the server returns, understands a failure in one fixed sentence, and reuses earlier results from the history.

## Outcome and proof
Primary task: `12 × 3 =` → `36`, `0.1 + 0.2 =` → `0.3`, `1 ÷ 3 =` → the 34-digit value with `≈` and its explanation, `1 ÷ 0 =` → `Cannot divide by zero` with `Ref: <id>`. Proof is the real browser against the real service (screenshots and measurements in the run evidence), never a mock.

## Selected direction
Visual authority: DESIGN.md as shipped (tokens, four key variants, dark readout in both themes, flat keys, one soft card shadow). Structure: header (title + native radio segmented theme control), one card holding the readout and a 4 × 6 keypad, a collapsible `<details>` history (open by default from 768 px, a second column of 18 rem beside the 22.5 rem card). Sequence of attention: value ≫ pending expression ≫ keypad ≫ history. Focal moment: the digits un-dimming into the exact answer.
Implementation consequence: CSS Modules over the existing custom properties, native controls, finite placement classes, no inline styles, no icons, no library.

## Scope and boundaries
Production screen, fully interactive. Untouched: the palette, key variants, favicon, copy of RF-UI-08/10/11. Anti-goals: gradients, shadows or motion on keys, accent colour on text, decoration, animated numbers, truncated digits, modals.

## States and ranges
Initial; typing; pending expression (accumulator up to 34 digits); busy (digits dimmed at once, ring after 150 ms); exact and inexact result (1–34 digits, scientific such as `1e+21`); error with and without `Ref` (up to 128 characters); history empty / 1–20 rows (operands up to 34 digits); light, dark, system, light under a dark OS; reduced motion.

## Interaction and layout
Mouse presses on keys and history rows never move focus (a following Enter evaluates); keyboard shortcuts mirror the keypad table; Enter/Space on buttons, the summary and radios keep native activation; Clear history returns focus to the summary. Mobile first, 320 px no horizontal scroll, every control at least 48 × 48 px.

## Constraints and open decisions
RNF-SEC-03 policy (no inline script/style), WCAG 2.2 AA, English only. Label in name (WCAG 2.5.3) holds: RF-UI-01 names AC `AC, all clear` and xʸ `xʸ, power` (U28) and the history rows are named `<visible expression>, use result` (U34); axe's `label-content-name-mismatch` rule runs in the component and browser checks and reports zero violations.
