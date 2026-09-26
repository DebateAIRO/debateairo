#!/usr/bin/env python3
"""The failing fixtures of checks.py: SPEC-v5 with ONE defect re-introduced per mutant, in memory.
Every line must read CAUGHT.  `python3 mutants.py`: exit 0 only when all are caught."""
import sys

import checks

REAL = checks.spec
MUTANTS = [
    ("seed keeps the builder's role rows out but drops the 'except' clause (builder rows unanchored)", checks.check_seed_accepted,
     [("except that function's own `synthesizerRoleRef` and `evaluatorRoleRef` rows", "including that function's own role rows")]),
    ("the 15 builder rows removed: back to the two-row seed d2 refuses", checks.check_seed_accepted,
     [("shipped `export function buildAlgorithmRegisterRows(input:", "shipped `export function buildRoleRowsOnly(input:")]),
    ("row count stated as sixteen", checks.check_seed_accepted,
     [("That makes seventeen rows", "That makes sixteen rows")]),
    ("evaluator role row changed to vendor:a", checks.check_seed_accepted,
     [('`{"kind":"EVALUATOR_ROLE_REF","providerRef":"vendor:z","provisional":true}`',
       '`{"kind":"EVALUATOR_ROLE_REF","providerRef":"vendor:a","provisional":true}`')]),
    ("scratch-only confinement dropped", checks.check_seed_accepted,
     [("in this throwaway scratch database only", "in the database")]),
    ("builder input: another family ref", checks.check_builder_input,
     [('familyRef: "acme"', 'familyRef: "vendor-a"')]),
    ("builder input: evaluator vendor:a", checks.check_builder_input,
     [('"vendor:a", evaluatorRoleRef: "vendor:z", providerFamilies', '"vendor:a", evaluatorRoleRef: "vendor:a", providerFamilies')]),
    ("signature misquoted (return type)", checks.check_builder_input,
     [("readonly AlgorithmRegisterRow[]`", "AlgorithmRegisterRow[]`")]),
    ("migration cite one block off", checks.check_citations,
     [("`migrations/0061_algorithm_publication_profiles.sql:17-28`", "`migrations/0061_algorithm_publication_profiles.sql:1-9`")]),
    ("V-15 cited by line number instead of row id", checks.check_citations,
     [("`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md`, rulings table, row\nV-15)",
       "`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:30`)")]),
    ("header does not name V-15", checks.check_supersession_and_identity,
     [("on V's ruling V-15 (", "on V's ruling (")]),
    ("R1.14 edited", checks.check_supersession_and_identity,
     [("A row that is absent is not checked", "A row that is absent is checked")]),
    ("§5 acceptance edited", checks.check_supersession_and_identity,
     [("`PES-S01 SCRATCH-DB STOPPED`", "`PES-S01 SCRATCH-DB DONE`")]),
]


def main():
    missed = 0
    for label, check, pairs in MUTANTS:
        text = REAL("v5")
        broken = False
        for old, new in pairs:
            if text.count(old) == 0:
                print(f"  BROKEN  {label}: anchor missing")
                broken = True
            text = text.replace(old, new, 1)
        if broken:
            missed += 1
            continue
        checks.spec = lambda v, m=text: m if v == "v5" else REAL(v)
        try:
            problems = check("v5")
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
