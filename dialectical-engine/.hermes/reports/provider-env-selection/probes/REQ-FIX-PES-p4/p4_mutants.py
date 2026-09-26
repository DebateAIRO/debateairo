#!/usr/bin/env python3
"""Mutants for p4_checks.py: each re-introduces ONE defect into the NEW text in memory; every one
must be CAUGHT. `python3 p4_mutants.py` — exit 0 only when all are caught."""
import sys

import p4_checks as checks

REAL = checks.spec
E = "—"
MUTANTS = [
    ("V-10 case expects the synthesizer key", "S01",
     [("| `PES_PUBLISH_ROLE_PROVIDER_DROPPED:evaluatorRoleRef` |", "| `PES_PUBLISH_ROLE_PROVIDER_DROPPED:synthesizerRoleRef` |")], checks.check_v10),
    ("V-10 seed keeps both providers (evaluator names vendor:a)", "S01",
     [('{"kind":"EVALUATOR_ROLE_REF","providerRef":"vendor:z","provisional":true}',
       '{"kind":"EVALUATOR_ROLE_REF","providerRef":"vendor:a","provisional":true}')], checks.check_v10),
    ("V-10 role rows checked AFTER the publication", "S01",
     [("(6) the role rows, R1.14; (7) the publication, R1.4.", "(6) the publication, R1.4; (7) the role rows, R1.14.")], checks.check_v10),
    ("V-10 seeded row has a kind the shipped schema refuses", "S01",
     [('{"kind":"SYNTHESIZER_ROLE_REF","providerRef":"vendor:a","provisional":true}',
       '{"kind":"SYNTHESIZER_ROLE","providerRef":"vendor:a","provisional":true}')], checks.check_v10),
    ("V-10 seeded row carries an extra key", "S01",
     [('{"kind":"EVALUATOR_ROLE_REF","providerRef":"vendor:z","provisional":true}',
       '{"kind":"EVALUATOR_ROLE_REF","providerRef":"vendor:z","provisional":true,"note":"x"}')], checks.check_v10),
    ("V-10 no statement of the no-role-rows path", "S01",
     [("A row that is absent is not checked, so a base that holds neither row passes\nthis step:", "Then:")], checks.check_v10),
    ("V-10 both seeded rows name the dropped provider (cannot tell the rule from 'refuse on any row')", "S01",
     [('{"kind":"SYNTHESIZER_ROLE_REF","providerRef":"vendor:a","provisional":true}',
       '{"kind":"SYNTHESIZER_ROLE_REF","providerRef":"vendor:z","provisional":true}'),
      ("| `PES_PUBLISH_ROLE_PROVIDER_DROPPED:evaluatorRoleRef` |", "| `PES_PUBLISH_ROLE_PROVIDER_DROPPED:synthesizerRoleRef` |")], checks.check_v10),
    ("exit: S02 step 4 back to the tee form", "S02",
     [('`pnpm pes:accept-hosted > /tmp/pes-s02-accept.log 2>&1; echo "exit=$?"`', "`pnpm pes:accept-hosted 2>&1 | tee /tmp/pes-s02-accept.log`")], checks.check_exit_rule),
    ("exit: S02 step 4 tee form WITH an echo (the pipe reports tee's code)", "S02",
     [('`pnpm pes:accept-hosted > /tmp/pes-s02-accept.log 2>&1; echo "exit=$?"`', '`pnpm pes:accept-hosted 2>&1 | tee /tmp/pes-s02-accept.log; echo "exit=$?"`')], checks.check_exit_rule),
    ("exit: S01 step 6 drops the [ELIFECYCLE] clause", "S01",
     [("the log's last line, or the line\n   before it when the log's last line begins `[ELIFECYCLE]`.", "the log's last line.")], checks.check_exit_rule),
    ("exit: S02 UNVERIFIED exits 0", "S02",
     [("and step 4 printed `exit=1`, whatever the step.", "and step 4 printed `exit=0`, whatever the step.")], checks.check_exit_rule),
    ("exit: S01 step 3 reads 'the first line' again", "S01",
     [("3. The acceptance's first line " + E + " the log's first line, or its second when the first is pnpm's\n   `$ tsx …` echo " + E + " reads", "3. The first line reads")], checks.check_exit_rule),
    ("V-11 R3.4 drops COST_ENVELOPE_POLICY_UNRESOLVED", "S03",
     [("refuses to start with `COST_ENVELOPE_POLICY_UNRESOLVED` when that version sealed none,\nor with", "refuses to start, or with")], checks.check_v11),
    ("V-11 R3.4 cites a line that does not hold the claim", "S03",
     [("`packages/register/src/runtime-environment.ts:112-115`", "`packages/register/src/runtime-environment.ts:140-145`")], checks.check_v11),
    ("V-11 R3.4 back to the v1 sentence", "S03",
     [("call cap is the only ceiling. It states", "call cap is the only ceiling; it states what `:28-31` records as the shipped behaviour " + E + " a hosted\ndeployment refuses to start until the cost envelopes are sealed, with the code\n`COST_ENVELOPES_NOT_SEALED` the table at `:779` already carries. It states")], checks.check_v11),
]


def main():
    missed = 0
    for label, code, pairs, check in MUTANTS:
        text = REAL("new", code)
        absent = [a for a, _ in pairs if a not in text]
        if absent:
            print(f"  BROKEN  {label}: anchor missing {absent[0][:60]!r}")
            missed += 1
            continue
        for a, b in pairs:
            text = text.replace(a, b, 1)
        checks.spec = lambda v, c, s=code, m=text: m if c == s else REAL(v, c)
        try:
            problems = check("new")
        except Exception as error:
            problems = [f"crashed: {type(error).__name__}: {error}"]
        finally:
            checks.spec = REAL
        print(f"  {'CAUGHT' if problems else 'MISSED'}  {label}" + (f" -> {problems[0][:120]}" if problems else ""))
        missed += not problems
    print(f"mutants: {len(MUTANTS) - missed}/{len(MUTANTS)} caught")
    return 1 if missed else 0


if __name__ == "__main__":
    sys.exit(main())
