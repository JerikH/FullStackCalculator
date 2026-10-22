#!/usr/bin/env python3
"""WCAG 2.x contrast check for the design tokens.

Usage: contrast.py DESIGN.md [--css tokens.css]

Reads the colour tokens from the DESIGN.md frontmatter (`<name>` = light value,
`<name>-dark` = dark value, shared by the explicit dark theme and the
system-dark media block) and measures every text and non-text pair the
interface uses. With --css it also parses the three token blocks of
tokens.css, requires each colour to equal DESIGN.md, requires the explicit
dark and system-dark blocks to be identical, and measures the parsed values.
Exits 1 on any failure.
"""

import os
import re
import sys

TEXT, NON_TEXT, INFO = 4.5, 3.0, None
BUSY_OPACITY = 0.6  # the dimmed value while a request is pending

NAMES = [
    "bg", "surface", "surface-raised", "border", "text", "text-muted",
    "display-bg", "display-text", "display-muted", "display-danger",
    "key-digit", "key-digit-text", "key-function", "key-function-text",
    "key-operator", "key-operator-text", "key-equals", "key-equals-text",
    "danger", "danger-bg", "focus",
]
VARIANTS = ["digit", "function", "operator", "equals"]
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def rgb(hex_value):
    h = hex_value.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def to_hex(channels):
    return "#" + "".join(f"{c:02x}" for c in channels)


def luminance(hex_value):
    def linear(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (linear(c) for c in rgb(hex_value))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def mix(a, b, weight_b):
    """color-mix(in srgb, a, b <weight_b>) on 8-bit sRGB channels."""
    return to_hex(round(x * (1 - weight_b) + y * weight_b) for x, y in zip(rgb(a), rgb(b)))


def pairs(t):
    """(label, foreground, background, minimum) for one theme's tokens."""
    out = []
    for fg in ("text", "text-muted"):
        for bg in ("bg", "surface", "surface-raised"):
            out.append((f"{fg} on {bg}", t[fg], t[bg], TEXT))
    for fg in ("display-text", "display-muted", "display-danger"):
        out.append((f"{fg} on display-bg", t[fg], t["display-bg"], TEXT))
    busy = mix(t["display-bg"], t["display-text"], BUSY_OPACITY)
    out.append((f"busy value (display-text at {BUSY_OPACITY:g} opacity) on display-bg", busy, t["display-bg"], TEXT))
    for v in VARIANTS:
        fill, label = t[f"key-{v}"], t[f"key-{v}-text"]
        out.append((f"key-{v}-text on key-{v}", label, fill, TEXT))
        out.append((f"key-{v}-text on hover (8%)", label, mix(fill, t["text"], 0.08), TEXT))
        out.append((f"key-{v}-text on active (16%)", label, mix(fill, t["text"], 0.16), TEXT))
    out.append(("danger on surface", t["danger"], t["surface"], TEXT))
    out.append(("danger on danger-bg", t["danger"], t["danger-bg"], TEXT))
    out.append(("checked segment text on key-operator", t["key-operator-text"], t["key-operator"], TEXT))
    out.append(("favicon '=' (#ffffff) on favicon fill (light key-operator)", "#ffffff", t["favicon-fill"], NON_TEXT))
    for bg in ("bg", "surface", "surface-raised"):
        out.append((f"focus ring vs {bg}", t["focus"], t[bg], NON_TEXT))
    out.append(("checked segment fill vs track (surface)", t["key-operator"], t["surface"], NON_TEXT))
    out.append(("spinner (display-muted) vs display-bg", t["display-muted"], t["display-bg"], NON_TEXT))
    for v in VARIANTS:
        out.append((f"focus ring vs key-{v} fill (not adjacent)", t["focus"], t[f"key-{v}"], INFO))
        out.append((f"key-{v} fill vs surface", t[f"key-{v}"], t["surface"], INFO))
    return out


def parse_design(path):
    text = open(path, encoding="utf-8").read()
    parts = text.split("\n---\n", 1)
    if not text.startswith("---\n") or len(parts) < 2:
        sys.exit(f"{path}: no YAML frontmatter")
    front = parts[0][4:]
    block = re.search(r"^colors:\n((?:[ \t]+.*\n)+)", front + "\n", re.M)
    if not block:
        sys.exit(f"{path}: no colors mapping in the frontmatter")
    colors = dict(re.findall(r'^\s+([\w-]+):\s*"?(#[0-9a-fA-F]{6})"?\s*$', block.group(1), re.M))
    extra = sorted(set(colors) - set(NAMES) - {f"{n}-dark" for n in NAMES})
    if extra:
        sys.exit(f"{path}: unexpected colour keys {', '.join(extra)}")
    light = {n: colors.get(n) for n in NAMES}
    dark = {n: colors.get(f"{n}-dark") for n in NAMES}
    return light, dark


def blocks(css):
    """Top-level rules of a stylesheet as (prelude, body) pairs, braces matched."""
    out, depth, start, prelude_start = [], 0, 0, 0
    for i, ch in enumerate(css):
        if ch == "{":
            if depth == 0:
                prelude, start = css[prelude_start:i].strip(), i + 1
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                out.append((prelude, css[start:i]))
                prelude_start = i + 1
            elif depth < 0:
                sys.exit("unbalanced braces in the stylesheet")
    if depth:
        sys.exit("unbalanced braces in the stylesheet")
    return out


def declarations(body):
    """--color-* declarations of a block body; the last one may omit its semicolon."""
    found = []
    for part in body.split(";"):
        m = re.fullmatch(r"\s*--color-([\w-]+)\s*:\s*(.+?)\s*", part, re.S)
        if m:
            found.append((m.group(1), m.group(2)))
        elif "--color-" in part:
            sys.exit(f"unparsed colour declaration: {part.strip()!r}")
    return found


LIGHT_SEL = re.compile(r"^:root$")
DARK_SEL = re.compile(r"""^:root\[data-theme=(['"])dark\1\]$""")
SYSTEM_MEDIA = re.compile(r"^@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)$")
SYSTEM_SEL = re.compile(r"""^:root:not\(\[data-theme=(['"])light\1\]\)$""")


def parse_css(path, errors):
    """Light, dark and system-dark colour maps. Blocks of the same kind merge in
    order (a later declaration overrides an earlier one, as in the cascade); a
    --color-* declaration anywhere else is an error."""
    css = re.sub(r"/\*.*?\*/", "", open(path, encoding="utf-8").read(), flags=re.S)
    light, dark, system = {}, {}, {}
    for prelude, body in blocks(css):
        selector = " ".join(prelude.split())
        if LIGHT_SEL.match(selector):
            light.update(declarations(body))
        elif DARK_SEL.match(selector):
            dark.update(declarations(body))
        elif SYSTEM_MEDIA.match(selector):
            for inner_prelude, inner_body in blocks(body):
                inner = " ".join(inner_prelude.split())
                if SYSTEM_SEL.match(inner):
                    system.update(declarations(inner_body))
                elif declarations(inner_body):
                    errors.append(f"tokens.css: --color-* declared under '{selector} {{ {inner} }}'")
        elif declarations(body) or re.search(r"--color-", body):
            errors.append(f"tokens.css: --color-* declared under '{selector}'")
    return light, dark, system


def check_tokens(label, tokens, errors):
    for n in NAMES:
        value = tokens.get(n) if tokens else None
        if value is None or not HEX.match(value.strip()):
            errors.append(f"{label}: --color-{n} missing or not #rrggbb")
    for n in sorted(set(tokens or {}) - set(NAMES)):
        errors.append(f"{label}: unexpected colour token {n}")


def main(argv):
    if not argv or argv[0].startswith("-"):
        sys.exit(__doc__)
    design = argv[0]
    css_path = argv[argv.index("--css") + 1] if "--css" in argv else None
    light, dark = parse_design(design)
    errors = []
    check_tokens("DESIGN.md light", light, errors)
    check_tokens("DESIGN.md dark", dark, errors)
    themes = [("light", light), ("dark", dark), ("system-dark", dark)]
    source = design
    favicon_fill = light.get("key-operator")
    if css_path and not errors:
        c_light, c_dark, c_system = parse_css(css_path, errors)
        c_light, c_dark, c_system = ({k: v.strip() for k, v in b.items()} for b in (c_light, c_dark, c_system))
        for label, block in (("light", c_light), ("dark", c_dark), ("system-dark", c_system)):
            check_tokens(f"tokens.css {label}", block, errors)
        if not errors:
            for label, block, expected in (("light", c_light, light), ("dark", c_dark, dark), ("system-dark", c_system, dark)):
                for n in NAMES:
                    if block[n].lower() != expected[n].lower():
                        errors.append(f"tokens.css {label}: --color-{n} {block[n]} != DESIGN.md {expected[n]}")
            for n in NAMES:
                if c_dark[n].lower() != c_system[n].lower():
                    errors.append(f"tokens.css: dark blocks differ for --color-{n} ({c_dark[n]} vs {c_system[n]})")
            themes = [("light", c_light), ("dark", c_dark), ("system-dark", c_system)]
            source = os.path.basename(css_path)
    if errors:
        print("\n".join(f"ERROR {e}" for e in errors))
        return 1
    print(f"Source: {os.path.basename(source)}")
    print("| Theme | Pair | Foreground | Background | Ratio | Minimum | Result |")
    print("|---|---|---|---|---|---|---|")
    failures = 0
    for theme, tokens in themes:
        for label, fg, bg, minimum in pairs({**tokens, "favicon-fill": favicon_fill}):
            r = ratio(fg, bg)
            if minimum is None:
                result, shown = "info", "—"
            else:
                ok = r >= minimum
                failures += not ok
                result, shown = ("pass" if ok else "FAIL"), f"{minimum:g}:1"
            print(f"| {theme} | {label} | {fg} | {bg} | {r:.2f}:1 | {shown} | {result} |")
    print(f"\n{failures} failing pair(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
