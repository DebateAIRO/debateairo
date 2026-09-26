#!/usr/bin/env python3
"""Writes S03 SPEC-v3.md from SPEC-v2.md by exact, asserted replacements only (header, R3.4b, §6),
so the diff v2 -> v3 holds nothing else. Run once; it refuses to overwrite an existing SPEC-v3.md."""
import os
S = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S03/"
assert not os.path.exists(S + "SPEC-v3.md"), "SPEC-v3.md exists; this generator never overwrites"
t = open(S + "SPEC-v2.md", encoding="utf-8").read()
lines = t.split("\n")
assert lines[2] == "ui: no" and lines[3].startswith("SUPERSEDES `SPEC.md`")
lines[3] = ("SUPERSEDES `SPEC-v2.md` (and through it `SPEC.md`; both frozen and byte-identical) — written by REQ-FIX-PES-p5 at node REQ-FIX pass 5 on V's ruling V-14 "
 "(\"Yes, reword all three\", `docs/missions/provider-env-selection/V-DECISIONS-PACKET.md`, rulings table, row V-14 — `:27` at this pass), not on a review verdict; no REQ-REV follows. "
 "Requirements CHANGED from v2: **R3.4b** only (NEW, after R3.4: every other `deploy/vps/README.md` mention of `COST_ENVELOPES_NOT_SEALED` — §11's refusal-table row and §10's production-maker-path bullet — says what R3.4 says; the table keeps the row). "
 "Requirements UNCHANGED, byte for byte: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R3.7, R3.8, R3.9; §1, §2, §4 and §5 are unchanged. "
 "S03's C1 and C2 are ALREADY BUILT on `slice/provider-env-selection-s03` (604b15158, ec66d5e7c); R3.4 and R3.4b are one fix cluster on top of C2. §6 records V-14 as ruled. "
 "This file is the SPEC of record; every later packet names it by this file name.")
t = "\n".join(lines)
def rep(old, new):
    global t
    n = t.count(old); assert n == 1, (n, old[:80]); t = t.replace(old, new)
rep("""FROZEN at REQ-FIX-PES-p4's READY marker on t_aad48581 (2026-09-25). A change after that marker is a
V row or `SPEC-v3.md` with a supersession header, never an in-place edit.""",
"""FROZEN at REQ-FIX-PES-p5's READY marker on t_7b7c43d6 (2026-09-25). A change after that marker is a
V row or `SPEC-v4.md` with a supersession header, never an in-place edit.""")
rep("""(`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:23`, V-11).
""",
"""(`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:23`, V-11).

**R3.4b** Every other mention of `COST_ENVELOPES_NOT_SEALED` in `deploy/vps/README.md` says what
R3.4 says. Measured in the S03 lane at C2's head (`ec66d5e7c`) with
`grep -n COST_ENVELOPES_NOT_SEALED deploy/vps/README.md`, the file has three such lines: `:737`
is inside the support-chat paragraph R3.4 owns, and the other two are this requirement's (at the
base, `776359c3`, they were `:779` and `:711-713`).
(a) §11's refusal-table row whose first cell is `` `COST_ENVELOPES_NOT_SEALED` `` (`:769`) stays in
the table, because R3.5's class is every refusal code the cost-envelope surface can emit and a build
whose in-source envelope row is broken emits this one
(`packages/register/src/runtime-environment.ts:143-147`). Its Meaning cell says that the code is a
check on the integrity of the build — the envelope row this build ships was removed, emptied or
made invalid, and with the shipped source it is unreachable at runtime (`:112-115`) — and that the
refusal a hosted operator meets is `COST_ENVELOPE_POLICY_UNRESOLVED` or
`COST_ENVELOPE_POLICY_INVALID`, the table's rows at `:776-777`. The cell no longer says the
envelopes "are not published yet" or that "a hosted runner refuses to claim work until they are".
(b) §10's bullet that begins `**The production maker path is now ruled` (`:692-700`) no longer
says a hosted runner "refuses to start with `COST_ENVELOPES_NOT_SEALED`". It says that until V-28's
cost-envelope policy is sealed at the register version a hosted deployment runs, that deployment
refuses to start with `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`, and it
names no other code for that refusal.
After the edit, `grep -n COST_ENVELOPES_NOT_SEALED deploy/vps/README.md` prints exactly two lines:
one inside R3.4's support-chat paragraph and the table row of (a). The known-stale list at the top
of the README (`:14-27` at C2's head) holds no bullet about the envelopes, and none is added.
`tests/architecture/vps-deployment-baseline.test.ts:359` requires the code somewhere in the README,
which (a) keeps true. The pin of R3.5 enumerates twelve codes (`union.size` 12,
`tests/unit/v9-provider-credential-files.test.ts:423`), and `COST_ENVELOPES_NOT_SEALED` is not among
them: no anchor of that pin reads `CostEnvelopesNotSealedError`, so neither edit moves the pin's
count. V ruled this (`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md`, rulings table,
row V-14 — `:27` at this pass).
""")
rep("""V-11 is ruled ("Yes, name real codes", `docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:23`);
R3.4 is that ruling. One `V-ROW: NEW` is raised by this pass, in `DECISIONS.md` of this slice:
§11's refusal-table row for `COST_ENVELOPES_NOT_SEALED` (`deploy/vps/README.md:779`) and §10's
envelope bullet (`:711-713`) still describe that code as the runtime gate. This version does not
change them; the default binds until V rules.""",
"""V-11 is ruled ("Yes, name real codes"); R3.4 is that ruling. The pass-4 `V-ROW: NEW` on §11's
refusal-table row and §10's envelope bullet was transcribed as V-14, and V ruled "Yes, reword all
three" (`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md`, rulings table, rows V-11 and
V-14); R3.4b is that ruling. None open.""")
open(S + "SPEC-v3.md", "w", encoding="utf-8").write(t)
print("written", t.count("\n") + 1, "lines incl. final")
