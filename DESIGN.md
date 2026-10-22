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
  summary:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
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
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 0.75rem"
    height: "3rem"
    width: "3rem"
  theme-segment-checked:
    backgroundColor: "{colors.key-operator}"
    textColor: "{colors.key-operator-text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "3rem"
  history-summary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.summary}"
    padding: "0.75rem 1rem"
    height: "3rem"
  history-row:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.75rem"
    height: "3rem"
  history-clear:
    backgroundColor: "{colors.key-function}"
    textColor: "{colors.key-function-text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 1rem"
    height: "3rem"
---

# Design System: FullStackCalculator

## Overview

**Creative North Star: "The Precision Instrument"**

The calculator is a measuring instrument, not a toy. A dark readout panel holds the number in both themes, the way an instrument's display stays the same whatever the room's lighting; everything around it is quiet, tonal and familiar. Colour carries intent only: blue marks an operation, a deeper blue marks the act of evaluating, amber marks where the keyboard is. Nothing decorative competes with the digits.

Density is moderate and touch-first: a 4 × 6 keypad of generous keys, a readout that never truncates a digit and steps its size down rather than cutting, and a history that is one tap away. The system uses the platform's own UI font and native controls, CSS Modules over custom-property tokens, and no UI library, icon system or runtime styling. The palette, the four key variants, the dark-override selectors and the favicon are fixed; token values change only when a measured contrast check fails.

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
- **Panel White / Panel Slate** (`surface`): the calculator card, the history panel and the theme track; the colour every focus ring and key sits on. History rows and unchecked theme segments are transparent over it.
- **Raised Panel** (`surface-raised`): the hover tint on the surface, applied only where a hover exists (history rows and unchecked theme segments).
- **Hairline** (`border`): decorative dividers and card outlines only; never the sole boundary of a control.
- **Ink** (`text`) and **Graphite** (`text-muted`): primary and secondary text on the frame.
- **Key Neutral** (`key-digit`) and **Key Muted** (`key-function`) with their label colours.

### Readout
- **Readout Black** (`display-bg`): the display panel, dark in both themes.
- **Readout White** (`display-text`): the value.
- **Readout Grey** (`display-muted`): the pending expression, the `≈` marker, the `Ref:` line and the busy spinner.
- **Readout Coral** (`display-danger`): error copy and its marker inside the display.

### State
- **Alarm Red** (`danger`) on **Alarm Wash** (`danger-bg`): errors shown on the frame surfaces. Reserved: no shipped surface uses them, because the calculator screen reports every error inside the readout.
- **Signal Amber** (`focus`): the focus ring, drawn by one global `:focus-visible` rule. Light uses a burnt amber, dark the bright amber.

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

Computed with the WCAG 2.x relative-luminance formula by the contrast check of the design baseline (every pair below plus informational pairs, in light, dark and system-dark). Minimum per theme:

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

Re-measured in the browser on the built screen (computed colours, real service), light / dark: checked theme segment label 5.72 / 4.98; operator key at rest 5.72 / 4.98, hover 6.34 / 5.51, active 7.02 / 6.11; equals key at rest 9.50 / 8.98; busy digits 6.67 / 6.88 (the static check above rounds the blend to 6.86 in dark); error copy 7.96 / 8.79; `Ref:` line 7.20 / 6.62. Axe reports zero violations.

### Named Rules
**The Intent Rule.** Accent colour appears only on things that act: operators, equals, the checked theme segment, the focus ring. Never on text, borders or decoration.

**The Readout Rule.** The display panel is dark in both themes; anything shown inside it uses the `display-*` tokens, never the frame's text or danger colours.

**The Measured Change Rule.** A token value changes only when a measured contrast check fails, and the new value is recorded with its ratio.

## Typography

**Display Font:** the system UI stack (`--font-sans`: `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`)
**Body Font:** the same stack
**Label/Mono Font:** `--font-mono` (`ui-monospace, 'SF Mono', 'Cascadia Mono', 'Roboto Mono', monospace`) is declared but reserved: no shipped surface uses it, the `Ref:` line is set in the sans label style

**Character:** the platform's own face, set with tabular numerals wherever numbers align, so the instrument feels native on every device and digits never shift as they change.

### Hierarchy
- **Display xl** (500, `clamp(1.75rem, 9vw, 2.5rem)`, 1.15, tabular): the value when it has at most 10 characters.
- **Display lg** (500, `clamp(1.25rem, 6vw, 1.75rem)`, 1.2, tabular): 11 to 16 characters.
- **Display md** (500, 1.125rem, 1.35, tabular, wraps with `overflow-wrap: anywhere`): longer values; never truncated or ellipsised.
- **Display secondary** (400, 1rem, 1.4, tabular, right-aligned, wraps with `overflow-wrap: anywhere`): the pending expression line (`12 ×`).
- **Display error** (500, 1.25rem, 1.3, wraps anywhere): the error sentence in the readout.
- **Title** (600, 1.125rem, 1.3): the single `h1` `Calculator` in the header.
- **Summary** (600, 1rem, 1.5): the `History` disclosure label.
- **Key label** (500, 1.25rem, 1, tabular): keypad glyphs.
- **Label** (500, 0.875rem, 1.4, tabular): theme segments, history rows, `Clear history`, the `Ref:` line.
- **Body** (400, 1rem, 1.5): everything else, including the empty-history sentence.

### Named Rules
**The Every-Digit Rule.** The value steps down in size and then wraps; it is never truncated, ellipsised or rounded to fit.

**The Tabular Rule.** Every number on screen uses tabular numerals.

## Layout

Mobile-first. Below 768 px one column in reading order: header, display, keypad, then the history as a collapsible `<details>` (collapsed by default) `--space-4` below the card. The column is `min(100%, 22.5rem)` and centred; the page gutter is `--space-4`. The header (`h1` left, theme control right, `--space-3` gap, `--space-6` below) shares the column width and wraps (`flex-wrap`), so at 320 px the theme control may drop under the title. The calculator card is a flex column (display, then keypad, `--space-4` apart) with `--space-4` padding and a 1 px `--color-border` hairline.

At 768 px and wider the layout becomes a grid of two fixed columns, 22.5rem (calculator) and 18rem (history, open by default), `--space-6` apart and centred, top-aligned; the header widens to the same total width (22.5rem + `--space-6` + 18rem) and the page gains `--space-6` top padding. The breakpoint is written in px (`min-width: 768px`), not rem, because the history panel reads the same query in JavaScript to decide whether it is open by default; a visitor's open or closed choice resets when the viewport crosses it. The page is `min-height: 100dvh`, scrolls vertically only, and never scrolls horizontally down to 320 px.

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

Spacing scale (`--space-*`): 1 = 0.25rem, 2 = 0.5rem, 3 = 0.75rem, 4 = 1rem, 6 = 1.5rem, 8 = 2rem (declared; no shipped surface uses it yet). Card and display padding `--space-4`; header to card `--space-6`; display line gap `--space-1`; keypad gap `--space-2`.

Size budget (tabular digits taken as about 0.6 em, verified in the browser). At 320 px the readout's text box is 222 px (320 − 32 gutter − 2 border − 32 card padding − 32 display padding): ten display xl characters (28.8 px at 9vw) take about 173 px and sixteen display lg characters (20 px floor) about 192 px, each with room for the `≈` marker (0.75 em, outside the character count). In the 22.5rem column the box is 294 px: ten xl characters at the 2.5rem cap take about 240 px and sixteen lg characters at the 1.75rem cap about 269 px (the tightest case). Measured at both widths: a 10-character xl value and a 16-character lg value, each with `≈`, sit on one line; a 34-digit value wraps at display md without losing a digit. The readout's minimum height (two paddings, one 1.4rem secondary line, one 2.875rem xl line) keeps the layout from jumping.

## Elevation & Depth

Mostly flat and tonal. The calculator card and the history panel sit on the page with one soft shadow (`--shadow-card`); keys are flat fills that change tone on hover and press rather than lifting. The readout is depth by contrast, not by shadow: a dark inset panel inside a light or slate card.

### Shadow Vocabulary
- **Card** (`--shadow-card`): calculator card and history panel only.

### Named Rules
**The Flat Key Rule.** Keys never cast shadows or move; feedback is a tone change only.

## Shapes

Softly rounded rectangles in three steps: keys, the theme track, history rows and `Clear history` `--radius-sm` (0.5rem); the readout `--radius-md` (0.875rem); cards and the history panel `--radius-lg` (1.25rem). Inner shapes subtract the 1 px hairline so they follow their container: theme segments `calc(--radius-sm − 1px)`, the history summary `calc(--radius-lg − 1px)` (its focus ring follows the panel corners). No pills or irregular silhouettes; the only circle is the 1rem busy spinner ring. The favicon repeats the form: a 32 × 32 rounded square in Instrument Blue (`#2f5fd0`) with a white `=` of two rectangles (white on that blue measures 5.72:1).

## Components

### Keys
Tactile and confident.
- **Shape:** gently rounded (`--radius-sm`), min height `--key-size`, filling its grid cell (`width: 100%`, `min-width: 0`), key-label style, centred, no border.
- **Variants:** digit (`0`–`9`, `.`) Key Neutral; function (AC, C, ⌫, ±, √, %) Key Muted; operator (÷, ×, −, +, xʸ) Instrument Blue; equals (=) Evaluate Blue, two rows tall (7.5rem: two keys plus one gap).
- **Hover:** fill mixed 8% toward `--color-text` (`color-mix(in srgb, <fill>, var(--color-text) 8%)`), declared inside `@media (hover: hover)` so a touch device never keeps a sticky hover tone. **Active:** 16%, always. Labels keep their colour; every hover and active fill was measured (≥ 5.51:1).
- **Touch:** `-webkit-tap-highlight-color: transparent` on buttons, summaries and labels, so the browser's tap overlay never covers the active tone.
- **Transition:** background only, `--transition-fast` (120 ms ease-out); under `prefers-reduced-motion: reduce` a global rule shrinks every transition and animation to 0.01 ms.
- **Focus:** see Focus ring. A mouse press never moves focus (the key prevents default on mousedown), so a following Enter evaluates instead of pressing the key again.
- **Names:** native `<button type="button">` with the accessible names of the keypad table (`all clear`, `clear entry`, `backspace`, `divide`, `square root`, `power`, `percentage`, `multiply`, `subtract`, `add`, `equals`, `toggle sign`, `decimal point`, digits); the keypad is a `role="group"` named `Keypad`.

### Focus ring
- One global `:focus-visible` rule for every control: 3px solid `--color-focus`, `outline-offset: 2px`, so the ring always sits on the surface around the control, leaving a 2px band of surface between ring and key. Measured ≥ 4.60:1 light, ≥ 7.45:1 dark.
- The native theme radios are visually hidden, so the ring is drawn on the visible segment through `input:focus-visible + span`.

### Display (readout)
- **Container:** Readout Black, `--radius-md` (0.875rem), padding `--space-4`, a flex column bottom-aligned with `--space-1` between lines, `aria-busy` while a request is pending; tabular numerals throughout.
- **Top row:** the expression line (Readout Grey, display secondary, right-aligned, wraps) with the busy spinner at its left, `--space-2` apart.
- **Alert region:** a `role="alert"` container that is always in the document and empty until an error arrives, so the error is announced when it is inserted. It holds the error sentence and the `Ref: <requestId>` line, both right-aligned.
- **Value:** below, an `<output aria-live="polite" aria-atomic="true" aria-label="Result">` (Readout White, size by length, right-aligned, tabular, wraps). Negatives use `−` (U+2212); the integer part is grouped with `,`; scientific values are ungrouped. The output is empty while an error shows.
- **Rounded:** inside the output, before the digits, a `≈` marker (Readout Grey, 0.75 em, `--space-1` after it) with the title `Rounded to 34 significant digits`. The glyph is hidden from assistive technology; a visually hidden copy of the explanation precedes the value.
- **Busy:** only the value digits dim, to opacity 0.6, immediately (measured 6.67:1 light, 6.88:1 dark); the `≈` marker and the expression line stay at full opacity (Readout Grey dimmed to 0.6 would fall to 3.37:1 light and 3.01:1 dark). After 150 ms a 1rem spinner ring appears: a 2px Readout Grey border with a transparent top segment, rotating once per 800 ms linear, hidden from assistive technology and paired with a visually hidden `Calculating`. Under reduced motion it is a static full ring.
- **Error:** the error sentence (display error style, Readout Coral, 7.96:1 light, 8.79:1 dark) replaces the value, with the `Ref:` line in the label style (Readout Grey) when a reference exists. No icon.

### Theme control
- Native radio group named `Theme` (`System`, `Light`, `Dark`; a `<fieldset role="radiogroup">` with a visually hidden legend) at the right of the header, drawn as a segmented control: a track of `--color-surface` with a `--color-border` hairline and `--radius-sm`, no inner padding; each segment is a label at least 3rem (48 px) high and 48 px wide with a `--space-3` horizontal padding, its label in the label style, unchecked in Graphite on a transparent fill.
- **Hover:** an unchecked segment takes the `--color-surface-raised` tint, inside `@media (hover: hover)`.
- **Checked:** the Instrument Blue fill with its label colour and weight 600 (5.72:1 light, 4.98:1 dark). The fill contrasts with the track (5.72:1 light, 4.49:1 dark), so the state is carried by fill and weight together and never by hue alone.
- **Focus:** the native radio stays focusable but clipped; the segment shows the ring.

### History panel
- Card surface (`--radius-lg`, 1 px hairline, `--shadow-card`); a `<details>` that is open by default from 768 px and collapsed below it. Its `<summary>` reads `History` in the summary style, at least 48 px tall, padded `--space-3` by `--space-4`.
- **Body:** padding `0 --space-4 --space-4`. An ordered list newest first, `--space-1` between rows; each row a full-width native button on a transparent fill in the label style (`12 × 3 = 36`, `√16 = 4`, `50% = 0.5`, `≈` when inexact), wrapping anywhere, at least 48 px tall, named `Use result <formatted result>`. Hover tint `--color-surface-raised` inside `@media (hover: hover)`, with the 120 ms background transition.
- **Clear history:** function-key styling (Key Muted fill, label style, at least 48 px tall, `--space-4` side padding, `--space-3` above); hover 8% inside `@media (hover: hover)`, active 16%. A mouse press on a row or on it never moves focus; activating it returns focus to the summary.
- **Empty:** `No calculations yet` in Graphite body text.

## Do's and Don'ts

### Do:
- **Do** take every colour from a `--color-*` token, and inside the readout only from `--color-display-*`.
- **Do** keep keys at least `--key-size` (3.5rem) tall, every other control at least 48 × 48 px, and the page free of horizontal scroll at 320 px.
- **Do** use tabular numerals for every number and let long values wrap rather than shrink below display md.
- **Do** mark the checked theme segment with fill and weight, not hue alone.
- **Do** disable transitions and spinner rotation under `prefers-reduced-motion: reduce`.
- **Do** declare hover tones inside `@media (hover: hover)` and keep the active tone unconditional.
- **Do** re-measure contrast with the design-baseline check whenever a colour token changes.

### Don't:
- **Don't** truncate, ellipsise or round a value to fit the display.
- **Don't** use a UI component library, an icon system, runtime styling or inline style attributes.
- **Don't** use `--color-danger` inside the readout (2.76:1 on the light readout).
- **Don't** put accent colour on text, borders or decoration.
- **Don't** add shadows or motion to keys beyond the tone change.
