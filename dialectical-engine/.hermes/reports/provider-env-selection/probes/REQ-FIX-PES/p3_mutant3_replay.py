# Replays the MISSED mutant of the first p3_mutants run (pass 3, 2026-09-24) to show which half of the
# diagnosis is which: the first mutant left the rule standing (equivalent), and the first detection was a
# keyword the print-format clause alone satisfied. Run: python3 p3_mutant3_replay.py
import re, sys
sys.path.insert(0, "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/REQ-FIX-PES")
import p3_checks as checks
REAL_SPEC, REAL_GATE = checks.spec, checks.states_unique_gate
text = REAL_SPEC("v3", "S01")
OLD_MUTANT = [("Each `provider_ref` is unique\nacross the array", "Each element is checked\nacross the array")]
NEW_MUTANT = [("Each `provider_ref` is unique\nacross the array: a roster in which a `provider_ref` appears in two elements is refused here,\n"
               "before the row builder or the parser runs, so neither the builder's `CONFIGURED_PROVIDER_SET_INVALID`\n"
               "(`packages/register/src/configured-provider-set.ts:82`, reached through `:184`) nor the parser's\n"
               "`CONFIGURED_PROVIDER_DUPLICATE` (`packages/providers/src/index.ts:255`) can be reached from a\n"
               "roster that passes this gate. ", ""),
              ("`provider_ref` — the repeated ref, for a repeat — or", "`provider_ref` or")]
OLD_GATE = lambda r12: bool(re.search(r"`provider_ref`[^.]{0,80}(repeated|twice|unique|appears more than once)", r12))
def run(label, pairs, gate):
    mutated = text
    for a, b in pairs:
        assert a in mutated
        mutated = mutated.replace(a, b, 1)
    checks.spec = lambda v, c: mutated if c == "S01" else REAL_SPEC(v, c)
    checks.states_unique_gate = gate
    try:
        problems = checks.check_b1_fixture_codes("v3")
    finally:
        checks.spec, checks.states_unique_gate = REAL_SPEC, REAL_GATE
    print(f"  {'CAUGHT' if problems else 'MISSED'}  {label}" + (f" -> {problems[0][:100]}" if problems else ""))
run("first mutant (only 'is unique' rewritten), first detection (keyword)", OLD_MUTANT, OLD_GATE)
run("first mutant, sentence detection  [rule still stated: an EQUIVALENT mutant]", OLD_MUTANT, REAL_GATE)
run("full mutant (rule sentence + repeat clause deleted), first detection", NEW_MUTANT, OLD_GATE)
run("full mutant, sentence detection", NEW_MUTANT, REAL_GATE)
run("rule sentence deleted, repeat clause KEPT, first detection", NEW_MUTANT[:1], OLD_GATE)
run("rule sentence deleted, repeat clause KEPT, sentence detection", NEW_MUTANT[:1], REAL_GATE)
