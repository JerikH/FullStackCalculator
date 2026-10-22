#!/usr/bin/env python3
"""Consistency checks of PRODUCT.md, DESIGN.md and .impeccable/design.json.
Usage: check_design_records.py (from the repository root). Exits 1 on any failure."""

import json
import os
import re
import subprocess
import sys

import yaml

results = []


def check(label, ok, detail=""):
    results.append(ok)
    print(f"{'ok  ' if ok else 'FAIL'} {label}{(' — ' + detail) if detail and not ok else ''}")


design = open("DESIGN.md", encoding="utf-8").read()
front_text, body = design[4:].split("\n---\n", 1)
front = yaml.safe_load(front_text)
check("frontmatter top-level keys within the DESIGN.md schema",
      set(front) <= {"name", "description", "colors", "typography", "rounded", "spacing", "components"})
props = {"backgroundColor", "textColor", "typography", "rounded", "padding", "size", "height", "width"}
check("component sub-properties within the 8 allowed", all(set(c) <= props for c in front["components"].values()))
refs = re.findall(r"\{(\w+)\.([\w-]+)\}", front_text)
check("every {group.token} reference resolves", all(t in front[g] for g, t in refs), str([r for r in refs if r[1] not in front[r[0]]]))
sections = re.findall(r"^## (.+)$", body, re.M)
canon = ["Overview", "Colors", "Typography", "Layout", "Elevation & Depth", "Shapes", "Components", "Do's and Don'ts"]
check("canonical sections in order", sections == canon, str(sections))

rows = re.findall(r"^\| `--color-([\w-]+)`(?: / `-text`)? \| `(#\w+)`(?: / `(#\w+)`)? \| `(#\w+)`(?: / `(#\w+)`)? \|", body, re.M)
table = {}
for name, light, light_text, dark, dark_text in rows:
    table[name] = (light, dark)
    if light_text:
        table[f"{name}-text"] = (light_text, dark_text)
colors = front["colors"]
expected = {k: (v, colors[f"{k}-dark"]) for k, v in colors.items() if not k.endswith("-dark")}
check("token table equals the frontmatter colours", table == expected,
      str({k: (table.get(k), expected.get(k)) for k in set(table) | set(expected) if table.get(k) != expected.get(k)}))
check("42 colour values: 21 tokens × 2 themes", len(colors) == 42)

proc = subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "contrast.py"), "DESIGN.md"],
                      capture_output=True, text=True)
out = proc.stdout
check("contrast check passes (every text pair >= 4.5:1, every indicator >= 3:1)", proc.returncode == 0, out.strip().splitlines()[-1] if out.strip() else proc.stderr)
measured = [(r[0].strip(), r[1].strip(), float(r[4].split(":")[0])) for r in
            (line.split("|")[1:-1] for line in out.splitlines() if line.startswith("| ") and "Theme" not in line)]
groups = {
    "Text and muted text on bg, surface, surface-raised": lambda p: re.match(r"(text|text-muted) on ", p),
    "Readout value, muted and danger on readout": lambda p: re.match(r"display-(text|muted|danger) on display-bg", p),
    "Busy (dimmed) value on readout": lambda p: p.startswith("busy value"),
    "Key labels on their fill (rest)": lambda p: re.match(r"key-\w+-text on key-\w+$", p),
    "Key labels on hover (8%) and active (16%) fills": lambda p: "hover" in p or "active" in p,
    "`danger` on surface and on `danger-bg`": lambda p: p.startswith("danger on"),
    "Checked theme segment label on its fill": lambda p: p.startswith("checked segment text"),
    "Focus ring vs bg, surface, surface-raised": lambda p: re.match(r"focus ring vs (bg|surface|surface-raised)$", p),
    "Checked segment fill vs track": lambda p: p.startswith("checked segment fill"),
    "Spinner vs readout": lambda p: p.startswith("spinner"),
}
for group, match in groups.items():
    row = re.search(rf"^\| {re.escape(group)} \| ([\d.]+):1 \| ([\d.]+):1 \|", body, re.M)
    mins = [min(v for t, p, v in measured if t == theme and match(p)) for theme in ("light", "dark")]
    ok = bool(row) and [float(row.group(1)), float(row.group(2))] == mins
    check(f"summary row '{group}' matches the script minimum", ok, f"table {row.groups() if row else None} vs measured {mins}")

product = open("PRODUCT.md", encoding="utf-8").read()
copy = ["Cannot divide by zero", "Result is undefined", "Result is out of range", "Invalid input",
        "Too many requests, try again shortly", "Calculator service is unreachable", "Calculator service timed out",
        "Something went wrong", "Ref: <requestId>", "Rounded to 34 significant digits", "No calculations yet",
        "Clear history", "Use result <formatted result>", "12 × 3 = 36", "√16 = 4", "50% = 0.5",
        "`Theme`", "`System`", "`Light`", "`Dark`", "`Calculator`", "`Keypad`"]
missing = [c for c in copy if c not in product]
check(f"PRODUCT.md holds the {len(copy)} exact copy strings of RF-UI-06/08/10/11/13", not missing, str(missing))
check("PRODUCT.md carries the product schema marker and Platform web",
      "<!-- impeccable:product-schema 1 -->" in product and re.search(r"^## Platform\n\nweb$", product, re.M) is not None)

sidecar = json.load(open(".impeccable/design.json", encoding="utf-8"))
check("design.json schemaVersion 2 with north star", sidecar.get("schemaVersion") == 2
      and sidecar["narrative"]["northStar"] == "The Precision Instrument")
check("design.json colorMeta keys are frontmatter colours", set(sidecar["extensions"]["colorMeta"]) <= set(colors))
check("design.json components refer to frontmatter components",
      all(c["refersTo"] in front["components"] for c in sidecar["components"]))

def bullet_list(text):
    return [line[2:].strip() for line in text.strip().splitlines()]


key_chars = re.search(r"^\*\*Key Characteristics:\*\*\n((?:- .*\n)+)", body, re.M).group(1)
check("design.json keyCharacteristics equal the DESIGN.md list", sidecar["narrative"]["keyCharacteristics"] == bullet_list(key_chars))
for head, field in (("Do", "dos"), ("Don't", "donts")):
    block = re.search(rf"^### {head}:\n((?:- .*\n)+)", body, re.M).group(1)
    check(f"design.json {field} equal the DESIGN.md list", sidecar["narrative"][field] == bullet_list(block))
keypad = re.search(r"^```\n(AC .*?)```", body, re.M | re.S).group(1).split()
check("DESIGN.md keypad grid is the RF-UI-01 order",
      keypad == "AC C ⌫ ÷ √ xʸ % × 7 8 9 − 4 5 6 + 1 2 3 = ± 0 . =".split())

print(f"\n{len(results)} check(s), {results.count(False)} failure(s)")
sys.exit(1 if False in results else 0)
