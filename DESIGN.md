---
name: FullStackCalculator
description: An exact decimal calculator whose answers come from the server, read like an instrument.
colors:
  bg: "#f4f5f7"
  bg-dark: "#0d1117"
  surface: "#ffffff"
  surface-dark: "#161b22"
  surface-raised: "#fafbfc"
  surface-raised-dark: "#1c222b"
  border: "#dfe2e7"
  border-dark: "#2c333d"
  text: "#15171a"
  text-dark: "#e8ebef"
  text-muted: "#5b616b"
  text-muted-dark: "#9aa4b2"
  display-bg: "#11161d"
  display-bg-dark: "#05080c"
  display-text: "#f5f7fa"
  display-text-dark: "#f5f7fa"
  display-muted: "#9aa4b2"
  display-muted-dark: "#8b95a3"
  display-danger: "#ff8a80"
  display-danger-dark: "#ff8a80"
  key-digit: "#eef0f3"
  key-digit-dark: "#232a33"
  key-digit-text: "#15171a"
  key-digit-text-dark: "#e8ebef"
  key-function: "#dde1e7"
  key-function-dark: "#2e3641"
  key-function-text: "#15171a"
  key-function-text-dark: "#e8ebef"
  key-operator: "#2f5fd0"
  key-operator-dark: "#4c7cf0"
  key-operator-text: "#ffffff"
  key-operator-text-dark: "#0b0f15"
  key-equals: "#1d3f97"
  key-equals-dark: "#8fb0ff"
  key-equals-text: "#ffffff"
  key-equals-text-dark: "#0b0f15"
  danger: "#b42318"
  danger-dark: "#ff8a80"
  danger-bg: "#fdecea"
  danger-bg-dark: "#3a1714"
  focus: "#b45309"
  focus-dark: "#f59e0b"
typography:
  display-xl:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "clamp(1.75rem, 9vw, 2.5rem)"
    fontWeight: 500
    lineHeight: 1.15
    fontFeature: "tnum"
  display-lg:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "clamp(1.25rem, 6vw, 1.75rem)"
    fontWeight: 500
    lineHeight: 1.2
    fontFeature: "tnum"
  display-md:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.35
    fontFeature: "tnum"
  display-secondary:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  display-error:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.3
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  key-label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    fontFeature: "tnum"
rounded:
  sm: "0.5rem"
  md: "0.875rem"
  lg: "1.25rem"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "6": "1.5rem"
  "8": "2rem"
components:
  key-digit:
    backgroundColor: "{colors.key-digit}"
    textColor: "{colors.key-digit-text}"
    typography: "{typography.key-label}"
    rounded: "{rounded.sm}"
    height: "3.5rem"
  key-function:
    backgroundColor: "{colors.key-function}"
    textColor: "{colors.key-function-text}"
    typography: "{typography.key-label}"
    rounded: "{rounded.sm}"
    height: "3.5rem"
  key-operator:
    backgroundColor: "{colors.key-operator}"
    textColor: "{colors.key-operator-text}"
    typography: "{typography.key-label}"
    rounded: "{rounded.sm}"
    height: "3.5rem"
  key-equals:
    backgroundColor: "{colors.key-equals}"
    textColor: "{colors.key-equals-text}"
    typography: "{typography.key-label}"
    rounded: "{rounded.sm}"
    height: "7.5rem"
  display:
    backgroundColor: "{colors.display-bg}"
    textColor: "{colors.display-text}"
    typography: "{typography.display-xl}"
    rounded: "{rounded.md}"
    padding: "1rem"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "1rem"
  theme-segment:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "3rem"
  theme-segment-checked:
    backgroundColor: "{colors.key-operator}"
    textColor: "{colors.key-operator-text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "3rem"
  history-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.75rem"
    height: "3rem"
---

# Design System: FullStackCalculator

## Overview

**Creative North Star: "The Precision Instrument"**

The calculator is a measuring instrument, not a toy. A dark readout panel holds the number in both themes, the way an instrument's display stays the same whatever the room's lighting; everything around it is quiet, tonal and familiar. Colour carries intent only: blue marks an operation, a deeper blue marks the act of evaluating, amber marks where the keyboard is. Nothing decorative competes with the digits.

Density is moderate and touch-first: a 4 × 6 keypad of generous keys, a readout that never truncates a digit and steps its size down rather than cutting, and a history that is one tap away. The system uses the platform's own UI font and native controls, CSS Modules over custom-property tokens, and no UI library, icon system or runtime styling. The palette, the four key variants, the dark-override selectors and the favicon are fixed; token values change only when a measured contrast check fails, and every value below has been measured.

**Key Characteristics:**
- A dark readout in both themes, with tabular numerals and every digit visible.
- Four tonal key variants: digit (neutral), function (muted), operator (accent), equals (strong accent).
- Colour as intent, never as decoration; state is never conveyed by hue alone.
- Native controls and the system font; no imagery, no icons beyond typographic glyphs.
- Measured contrast: text ≥ 4.5:1 and indicators ≥ 3:1 in light, dark and system-dark.

## Colors

A cool neutral frame around a near-black readout, with one blue accent family and an amber focus mark.

Every colour token is a CSS custom property `--color-<name>` in `frontend/src/shared/styles/tokens.css`. The light value lives on `:root`; the dark value is declared twice with identical values, under `:root[data-theme="dark"]` (explicit choice) and under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` (system preference). In the frontmatter, `<name>` is the light value and `<name>-dark` the dark one.

### Primary
- **Instrument Blue** (`key-operator`): the binary operator keys and the checked theme segment. Light uses a saturated mid blue so white labels hold; dark lifts it so dark labels hold.
- **Evaluate Blue** (`key-equals`): the equals key only. Deeper than the operator blue in light, paler in dark; either way the strongest accent on the screen.

### Neutral
- **Bench Grey** (`bg`): the page behind the instrument.
- **Panel White / Panel Slate** (`surface`): the calculator card, the history panel and the theme track; the colour every focus ring and key sits on.
- **Raised Panel** (`surface-raised`): hover and grouping tints on the surface (history rows on hover).
- **Hairline** (`border`): decorative dividers and card outlines only; never the sole boundary of a control.
- **Ink** (`text`) and **Graphite** (`text-muted`): primary and secondary text on the frame.
- **Key Neutral** (`key-digit`) and **Key Muted** (`key-function`) with their label colours.

### Readout
- **Readout Black** (`display-bg`): the display panel, dark in both themes.
- **Readout White** (`display-text`): the value.
- **Readout Grey** (`display-muted`): the pending expression, the `≈` marker, the `Ref:` line and the busy spinner.
- **Readout Coral** (`display-danger`): error copy and its marker inside the display.

### State
- **Alarm Red** (`danger`) on **Alarm Wash** (`danger-bg`): errors shown on the frame surfaces (reserved; the calculator screen reports errors in the readout).
- **Signal Amber** (`focus`): the focus ring. Light uses a burnt amber, dark the bright amber.

### Token table

| CSS custom property | Light | Dark (explicit and system) | Role |
|---|---|---|---|
| `--color-bg` | `#f4f5f7` | `#0d1117` | Page |
| `--color-surface` | `#ffffff` | `#161b22` | Card, history, theme track |
| `--color-surface-raised` | `#fafbfc` | `#1c222b` | Hover tint on surface |
| `--color-border` | `#dfe2e7` | `#2c333d` | Decorative hairlines |
| `--color-text` | `#15171a` | `#e8ebef` | Text |
| `--color-text-muted` | `#5b616b` | `#9aa4b2` | Secondary text |
| `--color-display-bg` | `#11161d` | `#05080c` | Readout panel |
| `--color-display-text` | `#f5f7fa` | `#f5f7fa` | Readout value |
| `--color-display-muted` | `#9aa4b2` | `#8b95a3` | Expression, `≈`, `Ref:`, spinner |
| `--color-display-danger` | `#ff8a80` | `#ff8a80` | Error copy in the readout |
| `--color-key-digit` / `-text` | `#eef0f3` / `#15171a` | `#232a33` / `#e8ebef` | Digit and `.` keys |
| `--color-key-function` / `-text` | `#dde1e7` / `#15171a` | `#2e3641` / `#e8ebef` | AC, C, ⌫, ±, √, % |
| `--color-key-operator` / `-text` | `#2f5fd0` / `#ffffff` | `#4c7cf0` / `#0b0f15` | ÷ × − + xʸ; checked theme segment |
| `--color-key-equals` / `-text` | `#1d3f97` / `#ffffff` | `#8fb0ff` / `#0b0f15` | = |
| `--color-danger` | `#b42318` | `#ff8a80` | Errors on frame surfaces |
| `--color-danger-bg` | `#fdecea` | `#3a1714` | Error wash on frame surfaces |
| `--color-focus` | `#b45309` | `#f59e0b` | Focus ring |

Other tokens: `--shadow-card` light `0 1px 2px rgb(16 24 40 / 0.06), 0 8px 24px rgb(16 24 40 / 0.08)`, dark `0 1px 2px rgb(0 0 0 / 0.4), 0 12px 32px rgb(0 0 0 / 0.35)`.

Two values differ from the original palette because a measurement failed: the light focus ring (`#f59e0b` measured 2.15:1 on the surface and 1.97:1 on the page; now `#b45309`, 5.02:1 and 4.60:1), and error copy in the readout, which now has its own token (the light `danger` `#b42318` measured 2.76:1 on the readout; `display-danger` `#ff8a80` measures 7.96:1 in light and 8.79:1 in dark).

### Measured contrast

Computed with the WCAG 2.x relative-luminance formula; the full table (light, dark and system-dark, every pair below plus informational pairs) is produced by the contrast check of the design baseline. Minimum per theme:

| Pair group | Light | Dark / system-dark | Minimum |
|---|---|---|---|
| Text and muted text on bg, surface, surface-raised | 5.72:1 | 6.34:1 | 4.5:1 |
| Readout value, muted and danger on readout | 7.20:1 | 6.62:1 | 4.5:1 |
| Busy (dimmed) value on readout | 6.67:1 | 6.86:1 | 4.5:1 |
| Key labels on their fill (rest) | 5.72:1 | 4.98:1 | 4.5:1 |
| Key labels on hover (8%) and active (16%) fills | 6.34:1 | 5.51:1 | 4.5:1 |
| `danger` on surface and on `danger-bg` | 5.75:1 | 7.01:1 | 4.5:1 |
| Checked theme segment label on its fill | 5.72:1 | 4.98:1 | 4.5:1 |
| Focus ring vs bg, surface, surface-raised | 4.60:1 | 7.45:1 | 3:1 |
| Checked segment fill vs track | 5.72:1 | 4.49:1 | 3:1 |
| Spinner vs readout | 7.20:1 | 6.62:1 | 3:1 |

### Named Rules
**The Intent Rule.** Accent colour appears only on things that act: operators, equals, the checked theme segment, the focus ring. Never on text, borders or decoration.

**The Readout Rule.** The display panel is dark in both themes; anything shown inside it uses the `display-*` tokens, never the frame's text or danger colours.

**The Measured Change Rule.** A token value changes only when a measured contrast check fails, and the new value is recorded with its ratio.

## Typography

**Display Font:** the system UI stack (`--font-sans`: `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`)
**Body Font:** the same stack
**Label/Mono Font:** `--font-mono` (`ui-monospace, 'SF Mono', 'Cascadia Mono', 'Roboto Mono', monospace`), reserved for the request reference if it needs fixed width

**Character:** the platform's own face, set with tabular numerals wherever numbers align, so the instrument feels native on every device and digits never shift as they change.

### Hierarchy
- **Display xl** (500, `clamp(1.75rem, 9vw, 2.5rem)`, 1.15, tabular): the value when it has at most 10 characters.
- **Display lg** (500, `clamp(1.25rem, 6vw, 1.75rem)`, 1.2, tabular): 11 to 16 characters.
- **Display md** (500, 1.125rem, 1.35, tabular, wraps with `overflow-wrap: anywhere`): longer values; never truncated or ellipsised.
- **Display secondary** (400, 1rem, 1.4, tabular): the pending expression line (`12 ×`).
- **Display error** (500, 1.25rem, 1.3): the error sentence in the readout.
- **Title** (600, 1.125rem, 1.3): the single `h1` `Calculator` in the header.
- **Key label** (500, 1.25rem, 1): keypad glyphs.
- **Label** (500, 0.875rem, 1.4, tabular): theme segments, history rows, the `Ref:` line.
- **Body** (400, 1rem, 1.5): everything else, including the empty-history sentence.

### Named Rules
**The Every-Digit Rule.** The value steps down in size and then wraps; it is never truncated, ellipsised or rounded to fit.

**The Tabular Rule.** Every number on screen uses tabular numerals.

## Layout

Mobile-first. Below 768 px one column in reading order: display, keypad, then the history as a collapsible `<details>` (collapsed by default). The calculator column is fluid up to 22.5rem and centred; the page gutter is `--space-4`; cards have a 1 px `--color-border` hairline. At 768 px and wider, two centred columns of 22.5rem (calculator) and 18rem (history, open by default) with a `--space-6` gap. The page uses `min-height: 100dvh` and scrolls vertically; it never scrolls horizontally, down to 320 px.

The keypad is a 4 × 6 grid (`repeat(4, minmax(0, 1fr))`, gap `--space-2`), row-major:

```
AC   C    ⌫    ÷
√    xʸ   %    ×
7    8    9    −
4    5    6    +
1    2    3    =
±    0    .    =
```

`=` spans rows 5 and 6. Placement uses a finite set of row, column and span classes; no inline style attributes. Keys are at least `--key-size` (3.5rem, 56 px) high and, at 320 px, (320 − 2 × 16 gutter − 2 × 16 card padding − 2 × 1 card border − 3 × 8 gap) / 4 = 57.5 px wide.

**The Keypad Budget Rule.** The containers around the keypad add at most 20 px of horizontal padding plus border per side (card padding `--space-4` plus a 1 px hairline; the keypad itself has no padding). More than that pushes four 56 px keys past a 320 px viewport.

Spacing scale (`--space-*`): 1 = 0.25rem, 2 = 0.5rem, 3 = 0.75rem, 4 = 1rem, 6 = 1.5rem, 8 = 2rem. Card and display padding `--space-4`; header to card `--space-6`.

Size budget (an estimate: tabular digits taken as about 0.6 em; the calculator screen verifies it in the browser at 320 px and at the 22.5rem column). At 320 px the readout's text box is 320 − 32 gutter − 2 border − 32 card padding − 32 display padding = 222 px. Display xl at that width is 28.8 px (9vw), so ten characters take about 173 px; display lg is 20 px (its 1.25rem floor is above 6vw = 19.2 px) and sixteen characters take about 192 px; the `≈` marker (0.75 em, outside the character count) fits in the remainder. At the 22.5rem column the box is 294 px: ten xl characters at the 2.5rem cap take about 240 px plus the marker, and sixteen lg characters at the 1.75rem cap about 269 px plus the marker (about 4 px to spare, the tightest case).

## Elevation & Depth

Mostly flat and tonal. The calculator card and the history panel sit on the page with one soft shadow (`--shadow-card`); keys are flat fills that change tone on hover and press rather than lifting. The readout is depth by contrast, not by shadow: a dark inset panel inside a light or slate card.

### Shadow Vocabulary
- **Card** (`--shadow-card`): calculator card and history panel only.

### Named Rules
**The Flat Key Rule.** Keys never cast shadows or move; feedback is a tone change only.

## Shapes

Softly rounded rectangles in three steps: keys, segments and history rows `--radius-sm` (0.5rem); the readout `--radius-md` (0.875rem); cards `--radius-lg` (1.25rem). No circles, pills or irregular silhouettes. The favicon repeats the form: a 32 × 32 rounded square in Instrument Blue (`#2f5fd0`) with a white `=` of two rectangles (white on that blue measures 5.72:1).

## Components

### Keys
Tactile and confident, like an instrument's buttons.
- **Shape:** gently rounded (`--radius-sm`), min height `--key-size`, label in the key-label style, centred.
- **Variants:** digit (`0`–`9`, `.`) Key Neutral; function (AC, C, ⌫, ±, √, %) Key Muted; operator (÷, ×, −, +, xʸ) Instrument Blue; equals (=) Evaluate Blue, two rows tall.
- **Hover:** fill mixed 8% toward `--color-text` (`color-mix(in srgb, var(--color-key-<variant>), var(--color-text) 8%)`); **Active:** 16%. Labels keep their colour; every hover and active fill was measured (≥ 5.51:1).
- **Transition:** background only, `--transition-fast` (120 ms ease-out); removed under `prefers-reduced-motion: reduce`.
- **Focus:** see Focus ring. A mouse press never moves focus (the key prevents default on mousedown).
- **Names:** native `<button type="button">` with the accessible names of the keypad table (`all clear`, `clear entry`, `backspace`, `divide`, `square root`, `power`, `percentage`, `multiply`, `subtract`, `add`, `equals`, `toggle sign`, `decimal point`, digits by their digit); the keypad is a `role="group"` named `Keypad`.

### Focus ring
- `:focus-visible` only: 3px solid `--color-focus`, `outline-offset: 2px`, so the ring always sits on the surface around the control, separated from the key by a 2px band of surface. Measured against the surfaces it sits on (≥ 4.60:1 light, ≥ 7.45:1 dark).

### Display (readout)
- **Container:** Readout Black, `--radius-md` (0.875rem), padding `--space-4`, enough minimum height for the expression line plus one xl line so the layout does not jump.
- **Lines:** secondary expression line (Readout Grey, display secondary), then the value in an `<output aria-live="polite" aria-atomic="true">` (Readout White, size by length, right-aligned, tabular). Negatives use `−` (U+2212); the integer part is grouped with `,`; scientific values are ungrouped.
- **Rounded:** a `≈` marker (Readout Grey, 0.75 em) before an inexact value, with the title and accessible explanation `Rounded to 34 significant digits`.
- **Busy:** the value digits dim immediately to opacity 0.6 (measured 6.67:1 light, 6.86:1 dark); the `≈` marker and the expression line stay at full opacity (Readout Grey dimmed to 0.6 would fall to 3.37:1 light and 3.01:1 dark). The display region carries `aria-busy`; a 1rem spinner ring in Readout Grey appears after 150 ms, is hidden from assistive technology, and does not rotate under reduced motion.
- **Error:** the value is replaced by the error sentence (display error style, Readout Coral) in a `role="alert"` region, with a `Ref: <requestId>` line in the label style (Readout Grey) when available. No icon.

### Theme control
- Native radio group named `Theme` (`System`, `Light`, `Dark`) in the header, drawn as a segmented control: track `--color-surface` with a `--color-border` hairline and `--radius-sm`; segments at least 3rem (48 px) high and 48 px wide; unchecked labels Graphite; the checked segment takes the Instrument Blue fill with its label colour and weight 600. The checked fill contrasts with the track (5.72:1 light, 4.49:1 dark), so the state does not depend on hue. Focus ring as above on the focused radio's segment.

### History panel
- Card surface with `--shadow-card`; a `<details>` whose `<summary>` reads `History` (at least 48 px tall); an ordered list newest first; each row a full-width native button in the label style (`12 × 3 = 36`, `√16 = 4`, `50% = 0.5`, `≈` when inexact) named `Use result <formatted result>`, at least 48 px tall, hover tint `--color-surface-raised`; a `Clear history` button (function-key styling, at least 48 px tall); the empty state `No calculations yet` in Graphite body text.

## Do's and Don'ts

### Do:
- **Do** take every colour from a `--color-*` token, and inside the readout only from `--color-display-*`.
- **Do** keep keys at least `--key-size` (3.5rem) tall, every other control at least 48 × 48 px, and the page free of horizontal scroll at 320 px.
- **Do** use tabular numerals for every number and let long values wrap rather than shrink below display md.
- **Do** mark the checked theme segment with fill and weight, not hue alone.
- **Do** disable transitions and spinner rotation under `prefers-reduced-motion: reduce`.
- **Do** re-measure contrast with the design-baseline check whenever a colour token changes.

### Don't:
- **Don't** truncate, ellipsise or round a value to fit the display.
- **Don't** use a UI component library, an icon system, runtime styling or inline style attributes.
- **Don't** use `--color-danger` inside the readout (2.76:1 on the light readout).
- **Don't** put accent colour on text, borders or decoration.
- **Don't** add shadows or motion to keys beyond the tone change.
