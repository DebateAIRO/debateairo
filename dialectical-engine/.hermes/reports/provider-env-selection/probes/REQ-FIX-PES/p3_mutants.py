#!/usr/bin/env python3
"""Mutants for p3_checks.py — each re-introduces ONE defect into the v3 text in memory and must be
caught. v2 is the natural mutant for the findings the lens named; these cover the cases v3 ADDED
(not-hosted, roster-invalid, base-row-absent, unvetted, the seed, the layout, the integers), which
v2 never had, so a v3 PASS on them could otherwise be vacuous.

    python3 p3_mutants.py     # every line must read CAUGHT; exit 0 only then
"""
import sys

import p3_checks as checks

REAL_SPEC = checks.spec
REAL_READ = checks.read

MUTANTS = [
    # (label, slice, old, new, check)
    ("roster-invalid expects the parser's DUPLICATE code", "S01",
     "| `PES_PUBLISH_ROSTER_INVALID:vendor:a` |", "| `PROVIDER_DISCOVERY_TARGET_DUPLICATE` |",
     checks.check_b1_fixture_codes),
    ("unvetted expects a shape error", "S01",
     "| `PROVIDER_VENDOR_NOT_VETTED:vendor:a` |", "| `PES_PUBLISH_ROSTER_INVALID:vendor:a` |",
     checks.check_b1_fixture_codes),
    # Every statement of the uniqueness rule is deleted: the rule sentence AND the refusal's
    # "for a repeat" clause. (The first version of this mutant rewrote only "is unique" and left
    # "a `provider_ref` appears in two elements is refused here" standing in the same sentence, so
    # the rule survived and the MISSED it drew was an equivalent mutant; see p3-runs.txt.)
    ("the uniqueness rule is deleted from the roster gate", "S01",
     [("Each `provider_ref` is unique\nacross the array: a roster in which a `provider_ref` appears in two elements is refused here,\n"
       "before the row builder or the parser runs, so neither the builder's `CONFIGURED_PROVIDER_SET_INVALID`\n"
       "(`packages/register/src/configured-provider-set.ts:82`, reached through `:184`) nor the parser's\n"
       "`CONFIGURED_PROVIDER_DUPLICATE` (`packages/providers/src/index.ts:255`) can be reached from a\n"
       "roster that passes this gate. ", ""),
      ("`provider_ref` \u2014 the repeated ref, for a repeat \u2014 or", "`provider_ref` or")],
     None, checks.check_b1_fixture_codes),
    # The rule sentence alone is deleted; the refusal's print format ("the repeated ref, for a
    # repeat") stays. A keyword detection reads a rule into that clause and misses this; the
    # sentence detection (p3_checks.UNIQUE_RULE) must not.
    ("the uniqueness rule sentence is deleted, the repeat clause stays", "S01",
     [("Each `provider_ref` is unique\nacross the array: a roster in which a `provider_ref` appears in two elements is refused here,\n"
       "before the row builder or the parser runs, so neither the builder's `CONFIGURED_PROVIDER_SET_INVALID`\n"
       "(`packages/register/src/configured-provider-set.ts:82`, reached through `:184`) nor the parser's\n"
       "`CONFIGURED_PROVIDER_DUPLICATE` (`packages/providers/src/index.ts:255`) can be reached from a\n"
       "roster that passes this gate. ", "")],
     None, checks.check_b1_fixture_codes),
    ("targets-rejected fixture made valid again (base_url ends /v1)", "S01",
     '`base_url = "https://api.acme.example/v2"`', '`base_url = "https://api.acme.example/v1"`',
     checks.check_b1_fixture_codes),
    ("not-hosted expects the wrong mode", "S01",
     "| `PES_PUBLISH_SET_NOT_HOSTED:local` |", "| `PES_PUBLISH_SET_NOT_HOSTED:hosted` |",
     checks.check_b1_fixture_codes),
    ("the seed is imported at a version the cases do not use", "S01",
     "importHistoricalRegisterFixture(database.pool, 4,", "importHistoricalRegisterFixture(database.pool, 5,",
     checks.check_b1_base_row),
    ("the published rowCount disagrees with the seed", "S01",
     "whose `rowCount` is `32`", "whose `rowCount` is `33`",
     checks.check_b1_base_row),
    ("step 7 greps <scratch>/credential again", "S02",
     "accept.log)/custody.d\"", "accept.log)/credential\"",
     checks.check_b2_layout),
    ("R2.8 puts the credential where step 7 does not grep (<scratch>/sub/)", "S02",
     "at `<scratch>/custody.d/vendor.header`, under", "at `<scratch>/sub/vendor.header`, under",
     checks.check_b2_layout),
    ("the loopback fixture is http again", "S02",
     '"base_url":"https://127.0.0.1:4455/v1"', '"base_url":"http://127.0.0.1:4455/v1"',
     checks.check_s02_refusals_determinate),
    ("probeTimeoutMs is 1", "S02",
     "`probeTimeoutMs` `5000`", "`probeTimeoutMs` `1`",
     checks.check_n1_integers),
    ("probeFreshnessMs is dropped", "S02",
     "`probeFreshnessMs` `600000`", "`probeFreshness` unnamed",
     checks.check_n1_integers),
    ("R2.9 (i) is the substring rule again", "S02",
     "(i) the exact token `pes-s02-fake-vendor-token`",
     "(i) the credential literal or any substring of it after the scheme word, `pes-s02-fake-vendor-token`",
     checks.check_n2_stdout_rule),
]


def run():
    missed = 0
    for label, slice_code, old, new, check in MUTANTS:
        text = REAL_SPEC("v3", slice_code)
        # old is one anchor (with new its replacement) or a list of (anchor, replacement) pairs
        pairs = old if isinstance(old, list) else [(old, new)]
        absent = [anchor for anchor, _ in pairs if anchor not in text]
        if absent:
            print(f"  BROKEN  {label}: the v3 text no longer carries the anchor to mutate: {absent[0][:60]!r}")
            missed += 1
            continue
        mutated = text
        for anchor, replacement in pairs:
            mutated = mutated.replace(anchor, replacement, 1)
        checks.spec = lambda version, code, s=slice_code, m=mutated: m if code == s else REAL_SPEC(version, code)
        try:
            problems = check("v3")
        except Exception as error:  # a crash on a mutant is a catch, but say so
            problems = [f"crashed: {type(error).__name__}"]
        finally:
            checks.spec = REAL_SPEC
        if problems:
            print(f"  CAUGHT  {label} -> {problems[0][:110]}")
        else:
            print(f"  MISSED  {label}")
            missed += 1
    # N3 lives in the PLAN, not the SPEC: its mutant is the v2-era PLAN at HEAD, run by p3_checks v2.
    # The credential DIRECTLY in the scratch root is v2's own layout, caught by p3_checks v2 (B2).
    print(f"mutants: {len(MUTANTS) - missed}/{len(MUTANTS)} caught")
    return 1 if missed else 0


if __name__ == "__main__":
    sys.exit(run())
