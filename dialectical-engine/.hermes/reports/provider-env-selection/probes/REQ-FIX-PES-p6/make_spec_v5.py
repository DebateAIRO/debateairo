#!/usr/bin/env python3
"""REQ-FIX-PES-p6: build S01 SPEC-v5.md from SPEC-v4.md by asserted replacements (V-15).
Each replacement must match exactly once, and an existing SPEC-v5 is never overwritten."""
import os
import sys

S01 = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S01"
SRC, DST = f"{S01}/SPEC-v4.md", f"{S01}/SPEC-v5.md"

HEADER_OLD_START = "SUPERSEDES `SPEC-v3.md` (and through it `SPEC-v2.md` and `SPEC.md`; all three frozen and byte-identical)"
HEADER_NEW = (
    "SUPERSEDES `SPEC-v4.md` (and through it `SPEC-v3.md`, `SPEC-v2.md` and `SPEC.md`; all four frozen and "
    "byte-identical) — written by REQ-FIX-PES-p6 at node REQ-FIX pass 6 on V's ruling V-15 (\"Yes, seed all 17\", "
    "`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md`, rulings table, row V-15 — cite it by row id, as "
    "that file's `## Pointer note` says), not on a review verdict; no REQ-REV follows. Requirements CHANGED from v4: "
    "**R1.12** only (the role seed's publication also carries the register's 15 other required algorithm rows, "
    "built by the shipped `buildAlgorithmRegisterRows`, in the throwaway scratch database only; the two role rows, "
    "their source ref, the `PES-S01 ROLE-SEED version=<v>` line and the `role-provider-dropped` case are unchanged). "
    "Requirements UNCHANGED, byte for byte: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7, R1.8, R1.9, R1.10, R1.11, "
    "R1.13, R1.14; §1, §2, §4, §5 and §6 are unchanged, and §3 changes only inside R1.12. S01-C1 is ALREADY BUILT on "
    "`slice/provider-env-selection-s01` (`5b12b2e15`). This file is the SPEC of record; every later packet names it "
    "by this file name.\n"
)
FROZEN_OLD = (
    "FROZEN at REQ-FIX-PES-p4's READY marker on t_aad48581 (2026-09-25). This pass applies V's rulings;\n"
    "a change after that marker is a V row, never an in-place edit.\n"
)
FROZEN_NEW = (
    "FROZEN at REQ-FIX-PES-p6's READY marker on t_78d5d748 (2026-09-25). This pass applies V's ruling V-15;\n"
    "a change after that marker is a V row or `SPEC-v6.md` with a supersession header, never an in-place edit.\n"
)
CALL_OLD = "[the two rows], \"provider-env-selection/S01#acceptance-role-rows\")`\n"
CALL_NEW = "[the seventeen rows below], \"provider-env-selection/S01#acceptance-role-rows\")`\n"
SEED_OLD = (
    "each with the source ref `provider-env-selection/S01#acceptance-role-rows`. It then prints\n"
)
SEED_NEW = (
    "each with the source ref `provider-env-selection/S01#acceptance-role-rows`. The same call also\n"
    "carries the register's 15 other required algorithm rows, in this throwaway scratch database only\n"
    "(V's ruling V-15, `docs/missions/provider-env-selection/V-DECISIONS-PACKET.md`, rulings table, row\n"
    "V-15): every row the shipped `export function buildAlgorithmRegisterRows(input:\n"
    "AlgorithmRegisterRowsInput): readonly AlgorithmRegisterRow[]`\n"
    "(`packages/register/src/algorithm-policy.ts:233-235`) returns for exactly the input\n"
    "`{ deploymentSourceRef: \"provider-env-selection/S01#acceptance-role-rows\", synthesizerRoleRef:\n"
    "\"vendor:a\", evaluatorRoleRef: \"vendor:z\", providerFamilies: [{ familyRef: \"acme\", providerRefs:\n"
    "[\"vendor:a\"] }] }`, except that function's own `synthesizerRoleRef` and `evaluatorRoleRef` rows,\n"
    "each with the value and the source ref the function gives it. That makes seventeen rows, one per\n"
    "key of `ALGORITHM_REGISTER_ROW_KEYS` (17 keys, the set `register.required_row` holds): a\n"
    "publication that holds any required row must hold all of them\n"
    "(`migrations/0061_algorithm_publication_profiles.sql:17-28`), and the two role rows alone are\n"
    "refused with `REGISTER_REQUIRED_ROW_MISSING:envelope:envelopeFormulaInputs` (probe\n"
    "`.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p2/` d2; with the seventeen rows,\n"
    "d4 and d1). It then prints\n"
)


def main():
    if os.path.exists(DST):
        sys.exit(f"refusing: {DST} exists")
    text = open(SRC, encoding="utf-8").read()
    lines = text.split("\n")
    assert lines[3].startswith(HEADER_OLD_START), "line 4 is not v4's supersession line"
    lines[3] = HEADER_NEW.rstrip("\n")
    text = "\n".join(lines)
    for old, new in [(FROZEN_OLD, FROZEN_NEW), (CALL_OLD, CALL_NEW), (SEED_OLD, SEED_NEW)]:
        n = text.count(old)
        assert n == 1, f"anchor matched {n} times: {old[:60]!r}"
        text = text.replace(old, new)
    with open(DST, "x", encoding="utf-8") as handle:
        handle.write(text)
    print(f"wrote {DST}")


if __name__ == "__main__":
    main()
