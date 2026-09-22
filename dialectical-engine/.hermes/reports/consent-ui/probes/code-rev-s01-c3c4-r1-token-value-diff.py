"""CODE-REV-S01-C3C4 r1 — PROBE T: does every token the S01 block and the two
components reference exist, and does its DECLARED value equal the design's own
formula (`tint()` / the literal box-shadow / the radii)?

Run from the lane root:  python3 token-value-diff.py
"""
import re

css = open("apps/ui/app/globals.css", encoding="utf8").read()

def block(sel):
    i = css.index(sel); o = css.index("{", i); d = 0
    for p in range(o, len(css)):
        if css[p] == "{": d += 1
        elif css[p] == "}":
            d -= 1
            if d == 0: return css[o + 1:p]

def decls(sel):
    return dict(re.findall(r"(--[a-z0-9-]+)\s*:\s*([^;]+);", block(sel), re.I))

root, cham = decls(":root {"), decls('html[data-mode="chamber"] {')

def norm(v):
    v = re.sub(r"\s+", "", v.strip().lower())
    v = re.sub(r"(?<![0-9])\.", "0.", v)               # .55 -> 0.55
    v = re.sub(r"(0\.\d*?)0+(?![0-9])", r"\1", v)      # 0.10 -> 0.1
    return v

def tint(h, a):                                        # design-data.js:22-25
    h = h.lstrip("#")
    return "rgba(%d,%d,%d,%s)" % (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

okL, okD = "#3E7A4E", "#86B58D"
gL, gD = "#A8823E", "#C8A055"
mL, mD = "#6E675C", "#9C907A"
cases = [
    ("--ok-bg",        tint(okL, .1),  tint(okD, .14), "10b tag pill bg, Essential      (mkCat tagBg)"),
    ("--ok-border",    tint(okL, .4),  tint(okD, .5),  "10b tag pill border, Essential  (mkCat tagBorder)"),
    ("--gold-bg",      tint(gL, .1),   tint(gD, .14),  "10b tag pill bg, Model quality"),
    ("--gold-border",  tint(gL, .4),   tint(gD, .5),   "10b tag pill border, Model quality"),
    ("--muted-bg",     tint(mL, .1),   tint(mD, .14),  "10b tag pill bg, Product analytics"),
    ("--muted-border", tint(mL, .4),   tint(mD, .5),   "10b tag pill border, Product analytics"),
    ("--ok-edge",      tint(okL, .55), tint(okD, .55), "10b switch border when ON"),
    ("--ok-soft",      tint(okL, .28), tint(okD, .35), "10b LOCKED switch track"),
    ("--scrim",        "rgba(10,8,6,.42)", "rgba(10,8,6,.42)", "10c overlay / card scrim"),
    ("--shadow-thumb", "0 1px 3px rgba(0,0,0,.3)", "0 1px 3px rgba(0,0,0,.3)", "10b knob box-shadow (turn-10:121)"),
    ("--r-dot",        "50%",          "50%",          "10b knob border-radius"),
    ("--r-tab",        "0 0 5px 5px",  "0 0 5px 5px",  "the gold tab, bar and card"),
    ("--r-panel",      "16px",         "16px",         "bar bezel border-radius"),
    ("--r-pill",       "999px",        "999px",        "every pill button"),
]
bad = 0
for t, l, d, why in cases:
    gl = root.get(t); gd = cham.get(t, root.get(t))
    if gl is not None and norm(gl) == norm(l) and gd is not None and norm(gd) == norm(d):
        print("ok       %-16s = %-28s | %s" % (t, gl, gd))
    else:
        bad += 1
        print("MISMATCH %s\n    light   got=%-30r want=%r\n    chamber got=%-30r want=%r\n    %s"
              % (t, gl, l, gd, d, why))
print("\nTOKEN VALUE MISMATCHES vs the design's own formulas:", bad)
