#!/usr/bin/env python3
"""The failing fixtures of checks.py: SPEC-v3 with ONE defect re-introduced per mutant, in memory.
Every line must read CAUGHT.  `python3 mutants.py` — exit 0 only when all are caught."""
import re
import sys

import checks

REAL = checks.spec
MUTANTS = [
    ("R3.4b drops member (b), the §10 bullet", checks.check_sweep,
     [(re.compile(r"\(b\) §10's bullet.*?names no other code for that refusal\.\n", re.S), "")]),
    ("R3.4b drops member (a)'s line cite (:769)", checks.check_sweep,
     [("`` `COST_ENVELOPES_NOT_SEALED` `` (`:769`) stays", "`` `COST_ENVELOPES_NOT_SEALED` `` stays")]),
    ("R3.4b miscounts the README's lines", checks.check_sweep,
     [("the file has three such lines", "the file has two such lines")]),
    ("R3.4b claims three lines remain", checks.check_end_state,
     [("prints exactly two lines", "prints exactly three lines")]),
    ("R3.4b removes the row from the table", checks.check_end_state,
     [("stays in\nthe table", "is removed from\nthe table")]),
    ("R3.4b cites the table row one line off", checks.check_citations,
     [("(`:769`)", "(`:768`)")]),
    ("R3.4b cites a runtime line that does not hold the unreachable claim", checks.check_citations,
     [("unreachable at runtime (`:112-115`)", "unreachable at runtime (`:140-142`)")]),
    ("R3.4b points at the wrong V-packet line", checks.check_citations,
     [("row V-14 — `:27` at this pass).\n", "row V-14 — `:18` at this pass).\n")]),
    ("R3.4 itself edited", checks.check_identity,
     [("call cap is the only ceiling. It states", "call cap is not the only ceiling. It states")]),
    ("§5 acceptance edited", checks.check_identity,
     [("6. Read the cost paragraph", "6. Read the cost paragraphs")]),
]


def main():
    missed = 0
    for label, check, pairs in MUTANTS:
        text = REAL("v3")
        broken = False
        for old, new in pairs:
            if isinstance(old, re.Pattern):
                text, n = old.subn(new, text, count=1)
            else:
                n = text.count(old)
                text = text.replace(old, new, 1)
            if n == 0:
                print(f"  BROKEN  {label}: anchor missing")
                broken = True
        if broken:
            missed += 1
            continue
        checks.spec = lambda v, m=text: m if v == "v3" else REAL(v)
        try:
            problems = check("v3")
        except Exception as error:
            problems = [f"crashed: {type(error).__name__}: {error}"]
        finally:
            checks.spec = REAL
        print(f"  {'CAUGHT' if problems else 'MISSED'}  {label}" + (f" -> {problems[0][:110]}" if problems else ""))
        missed += not problems
    print(f"mutants: {len(MUTANTS) - missed}/{len(MUTANTS)} caught")
    return 1 if missed else 0


if __name__ == "__main__":
    sys.exit(main())
