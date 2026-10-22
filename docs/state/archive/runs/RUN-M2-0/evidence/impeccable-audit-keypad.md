# Impeccable audit — keypad and history rows (UI-FIX-01), 2026-10-22

Scope: the two accessible names of the keypad (RF-UI-01, U28), the history row names (RF-UI-10, U34) and the test helper that runs axe's label-in-name rule. No CSS, token, layout or visible text changed (`git diff` touches no `.css` file), so only the dimensions the change can move are scored; the others are «unchanged».

| # | Dimension | Score | Evidence |
|---|---|---|---|
| 1 | Accessibility | 4 | WCAG 2.5.3 now holds: axe `label-content-name-mismatch` is part of every scan and reports zero violations (initial, populated-history and error states, Light and Dark, Chromium and Pixel 7: `browser-pieces.txt`, axe 5 passed per project). 13 targets pass (AC, xʸ, ten digits, the history row), the 11 single-symbol keys are «incomplete» without an error (not applicable under axe's own rule). Before the change the same scan reported `AC`, `xʸ` and the history row. The component tests execute the rule for real (canvas stub, failure on a skipped rule: `frontend/src/test/axe.ts`), killed by three mutations that revert one name each (`mutations-names.txt`). |
| 2 | Performance | unchanged | no render path, style or bundle change |
| 3 | Theming | unchanged | no token or CSS change; Light/Dark scans pass |
| 4 | Responsive | 4 | layout piece (24 tests per project: 320/393/768/1280 px, `scrollWidth <= clientWidth`, key boxes ≥ 48 px, focus ring, reduced motion) passes on Chromium desktop and Pixel 7; touch piece passes with the new names |
| 5 | Implementation integrity | 4 | `impeccable detect` on the source (27 files) and on the running page (`--json`): `[]`; names come from the single `KEYPAD` table and from `historyExpression`, no duplicated strings in production code |

Findings of the audit: none open. Two observations recorded as run findings: the 11 single-symbol keys are «not applicable» to the axe rule by axe's own definition, and the long names read `AC, all clear` / `xʸ, power` aloud as «A C, all clear» / «x y, power» in screen readers (the visible label leads, as WCAG 2.5.3 asks).
