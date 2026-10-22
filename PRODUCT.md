# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Visitor (primary):** an anonymous person in a desktop or mobile browser who needs a calculation they can trust, including decimal values where binary floating point is visibly wrong (`0.1 + 0.2` must read `0.3`). They work with the on-screen keypad, the physical keyboard or touch, often in short bursts, and reuse earlier results. There are no accounts: this is the only interface role.
- **Technical reviewer (secondary):** a person evaluating the repository who runs the stack, uses the calculator, calls the API and reads the code, tests and decision records. They judge whether the interface is precise, accessible and consistent with the API it consumes.

## Product Purpose

FullStackCalculator is a calculator web app whose every result comes from a REST service computing with 34 significant decimal digits. The interface's job is to make entering, reading and reusing exact results effortless, and to report the cases where mathematics has no representable answer in plain language. Success means a visitor never sees a floating-point artefact, never loses a digit to truncation, and always understands what happened when a calculation fails.

## Positioning

The browser never does arithmetic. Numbers travel as decimal strings, the server is authoritative and rounds half-even to 34 significant digits, and the interface says so when a result was rounded (`≈`). A calculator that computes in JavaScript cannot truthfully make the same claim.

## Operating Context

- Input by on-screen keypad (pointer or touch) and physical keyboard; the same command table drives both.
- Same-origin web app served either behind an edge proxy or by the service itself; the API is also used directly with curl.
- Short, repeated sessions; history lives in the browser only.
- Light, dark or system theme chosen by the visitor.

## Capabilities and Constraints

- Seven operations: add, subtract, multiply, divide, power, square root, percentage. Sequential chaining (`2 + 3 × 4 =` → 20); no expression parsing.
- Up to 34 significant digits; results are formatted canonically by the service (plain for adjusted exponents −6…20, otherwise scientific such as `1e+21`).
- History: newest first, at most 20 entries, stored in the browser; storage failure never blocks a calculation.
- English only; no accounts; no localisation.
- Exact interface copy (binding):
  - Errors: `Cannot divide by zero`, `Result is undefined`, `Result is out of range`, `Invalid input`, `Too many requests, try again shortly`, `Calculator service is unreachable`, `Calculator service timed out`, `Something went wrong`, plus `Ref: <requestId>` when available. Server details and titles are never shown.
  - Rounded marker: `≈` with the explanation `Rounded to 34 significant digits`.
  - History: items such as `12 × 3 = 36`, `√16 = 4`, `50% = 0.5` (with `≈` when inexact); item name `<visible expression>, use result` (for example `12 × 3 = 36, use result`); `Clear history`; empty state `No calculations yet`.
  - Theme: radio group `Theme` with `System`, `Light`, `Dark`.
  - Page heading `Calculator`; keypad group `Keypad`.

## Evidence on Hand

None. Screenshots and measured results come only from the running system and are recorded with their source revision; no users, testimonials or metrics are claimed.

## Product Principles

1. **Exactness is visible.** Show every digit the service returns, mark rounding, never truncate.
2. **The server is the only calculator.** The interface edits strings and displays answers; it never computes one.
3. **Failure speaks plainly.** Each failure has one fixed human sentence and a reference the visitor can quote.
4. **Every input path is first-class.** Keyboard, pointer and touch reach every function with the same behaviour.
5. **Calm over clever.** A tool used in short bursts: no decoration that competes with the number.

## Accessibility & Inclusion

WCAG 2.2 AA: native buttons with explicit names, one `h1`, header and main landmarks, a polite atomic live region for the result and an alert for errors, touch targets of at least 48 × 48 px, a visible focus indicator, text contrast of at least 4.5:1 in both themes, and no motion when the visitor prefers reduced motion.
