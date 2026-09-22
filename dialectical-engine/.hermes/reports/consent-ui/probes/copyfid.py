#!/usr/bin/env python3
"""REQ-REV-01 probe 2: mechanical copy-fidelity check.

Extracts every visible string from the design extracts and asserts it appears
VERBATIM (exact substring, after normalising the extracts' \\uXXXX escapes) in
the SPEC that owns it.  No fuzzy matching: a paraphrase is a miss.
"""
import json
import re
import sys
import unicodedata

D = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/design/"
S = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/slices/"

dd = open(D + "design-data.js", encoding="utf-8").read()
t10 = open(D + "turn-10-cookie-consent.html", encoding="utf-8").read()
t8g = open(D + "turn-8a-checkbox-group.html", encoding="utf-8").read()
s01 = open(S + "S01/SPEC.md", encoding="utf-8").read()
s02 = open(S + "S02/SPEC.md", encoding="utf-8").read()

ESC = re.compile(r"\\u([0-9a-fA-F]{4})")


def deesc(s):
    return ESC.sub(lambda m: chr(int(m.group(1), 16)), s)


# ---------------------------------------------------------------- extraction
def js_strings_in(block):
    """Every single-quoted JS string literal in a block, de-escaped."""
    out = []
    for m in re.finditer(r"'((?:[^'\\]|\\.)*)'", block):
        raw = m.group(1)
        out.append(deesc(raw.replace("\\'", "'")))
    return out


# --- cookieCats (3 x name/tag/desc/detail = 12 strings)
cc_block = dd[dd.index("const cookieCats"):]
cats = []
for m in re.finditer(r"mkCat\((.*?)\, (true|false)\, (true|false)\)", cc_block, re.S):
    args = js_strings_in(m.group(1))
    # mkCat(name, tag, tagC, desc, detail, on, locked) -> tagC is an identifier, not a string
    cats.append(args)

# --- policyJump (8)
pj_line = re.search(r"const policyJump = \[(.*?)\];", dd, re.S).group(1)
jump = js_strings_in(pj_line)

# --- policySections (11 titles, 11 bodies, 12 items)
ps_block = dd[dd.index("const policySections"):dd.index("const cookieCats")]
secs = []
for m in re.finditer(r"mkSec\(", ps_block):
    # balanced-paren scan
    i = m.end() - 1
    depth = 0
    j = i
    while j < len(ps_block):
        if ps_block[j] == "(":
            depth += 1
        elif ps_block[j] == ")":
            depth -= 1
            if depth == 0:
                break
        j += 1
    body = ps_block[i + 1:j]
    # split top-level: items list is in [...]
    lst = re.search(r"\[(.*)\]", body, re.S)
    items = js_strings_in(lst.group(1)) if lst else []
    head = body[:lst.start()] if lst else body
    heads = js_strings_in(head)
    secs.append({"strings": heads, "items": items})

# --- 10a / 10b / 10c visible text from the html (between > and <)
def visible(html, lo, hi):
    seg = "\n".join(html.splitlines()[lo - 1:hi])
    txt = re.findall(r">([^<>{}]+)<", seg)
    return [t.strip() for t in txt if t.strip() and not t.strip().startswith("{{")]


ten_a = visible(t10, 26, 42)      # the bar
ten_b = visible(t10, 103, 132)    # the preferences card
ten_c = visible(t10, 48, 96)      # the policy modal
eight = visible(t8g, 1, 10)       # the checkbox group

CHECKS = []  # (owner_spec_name, label, string)


def add(owner, label, s):
    s = s.strip()
    if not s or s in ("×", "✓"):
        return
    CHECKS.append((owner, label, s))


# S01 owns 10a + 10b + the categories
for s in ten_a:
    add("S01", "10a", s)
for s in ten_b:
    add("S01", "10b", s)
for i, c in enumerate(cats):
    for k, s in zip(("name", "tag", "desc", "detail"), c):
        add("S01", "cookieCats[%d].%s" % (i, k), s)

# S02 owns 8a + 10c + policyJump + policySections
for s in eight:
    add("S02", "8a", s)
for s in ten_c:
    add("S02", "10c", s)
for s in jump:
    add("S02", "policyJump", s)
for i, sec in enumerate(secs):
    for k, s in enumerate(sec["strings"]):
        add("S02", "policySections[%d].str%d" % (i, k), s)
    for k, s in enumerate(sec["items"]):
        add("S02", "policySections[%d].item%d" % (i, k), s)

DOC = {"S01": s01, "S02": s02}
FILE = {"S01": S + "S01/SPEC.md", "S02": S + "S02/SPEC.md"}


def linenos(doc, needle):
    out = []
    for n, line in enumerate(doc.splitlines(), 1):
        if needle in line:
            out.append(n)
    return out


miss = []
hits = 0
print("STRINGS EXTRACTED: %d  (S01 %d / S02 %d)" % (
    len(CHECKS), sum(1 for c in CHECKS if c[0] == "S01"),
    sum(1 for c in CHECKS if c[0] == "S02")))
print()
for owner, label, s in CHECKS:
    doc = DOC[owner]
    if s in doc:
        hits += 1
        continue
    # second chance: the SPEC may have wrapped the line -- collapse whitespace
    flat_doc = re.sub(r"\s+", " ", doc)
    flat_s = re.sub(r"\s+", " ", s)
    if flat_s in flat_doc:
        hits += 1
        continue
    miss.append((owner, label, s))

print("VERBATIM HITS : %d" % hits)
print("MISSES        : %d" % len(miss))
print()
for owner, label, s in miss:
    print("MISS [%s] %s" % (owner, label))
    print("   design: %r" % s)
    # nearest neighbour report: longest common prefix with any SPEC line
    best, bestn, bl = 0, None, None
    for n, line in enumerate(DOC[owner].splitlines(), 1):
        L = re.sub(r"\s+", " ", line)
        common = 0
        fs = re.sub(r"\s+", " ", s)
        for a, b in zip(fs, L.strip()):
            if a == b:
                common += 1
            else:
                break
        # also try substring-anchored
        if common > best:
            best, bestn, bl = common, n, line
    if bestn:
        print("   nearest %s:%d (%d chars agree): %r" % (FILE[owner], bestn, best, bl.strip()[:200]))
    print()

sys.exit(1 if miss else 0)
