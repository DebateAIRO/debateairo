S = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S03/"
t = open(S + "SPEC.md", encoding="utf-8").read()
def rep(old, new):
    global t
    n = t.count(old); assert n == 1, (n, old[:80]); t = t.replace(old, new)
rep("""# S03 — The VPS kit's §11 says what the shipped code does, and a pin keeps it saying it
ui: no

FROZEN at REQ-PES's READY marker on t_c677f87a (2026-09-24). A change after that marker is
`SPEC-v2.md` with a supersession header, never an in-place edit.""",
"""# S03 — The VPS kit's §11 says what the shipped code does, and a pin keeps it saying it

ui: no
SUPERSEDES `SPEC.md` (frozen and byte-identical) — written by REQ-FIX-PES-p4 at node REQ-FIX pass 4 on V's ruling `docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:23` (V-11: "Yes, name real codes"), not on a review verdict. Requirements CHANGED from v1: **R3.4** only (§11's support-chat sentence names `COST_ENVELOPE_POLICY_UNRESOLVED` / `COST_ENVELOPE_POLICY_INVALID` as the refusal a hosted operator meets, and calls `COST_ENVELOPES_NOT_SEALED` a check on the integrity of the build). Requirements UNCHANGED, byte for byte: R3.1, R3.2, R3.3, R3.5, R3.6, R3.7, R3.8, R3.9; §1, §2, §4 and §5 are unchanged. S03's clusters C1 and C2 are ALREADY BUILT on `slice/provider-env-selection-s03` against `SPEC.md` (commits 604b15158 and ec66d5e7c); this version moves only the sentence R3.4 governs. The header moves `ui: no` to line 3 and adds this line; §6 records V-11 as ruled and names one new `V-ROW: NEW`. This file is the SPEC of record; every later packet names it by this file name.

FROZEN at REQ-FIX-PES-p4's READY marker on t_aad48581 (2026-09-25). A change after that marker is a
V row or `SPEC-v3.md` with a supersession header, never an in-place edit.""")
rep("""**R3.4** The §11 support-chat sentence at `deploy/vps/README.md:747-751` no longer says the daily
call cap is the only ceiling; it states what `:28-31` records as the shipped behaviour — a hosted
deployment refuses to start until the cost envelopes are sealed, with the code
`COST_ENVELOPES_NOT_SEALED` the table at `:779` already carries.""",
"""**R3.4** The §11 support-chat sentence at `deploy/vps/README.md:747-751` no longer says the daily
call cap is the only ceiling. It states the shipped behaviour in two parts. First, what a hosted
operator meets: a hosted deployment reads the `costEnvelopePolicy` row in force at its own register
version and refuses to start with `COST_ENVELOPE_POLICY_UNRESOLVED` when that version sealed none,
or with `COST_ENVELOPE_POLICY_INVALID` when it sealed one that is malformed
(`packages/register/src/cost-envelope-policy.ts:163-166`, `:131-134`; both service roots read it in
hosted mode, `apps/api/src/main.ts:241-242` and `apps/runner/src/main.ts:111`). Second,
`COST_ENVELOPES_NOT_SEALED` is named as what it is — a check on the integrity of the build, which
fires only when the build's in-source envelope row was removed, emptied or made invalid, and which
the shipped source never reaches at runtime (`packages/register/src/runtime-environment.ts:112-115`,
the live gate named at `:118-124`). V ruled this wording
(`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:23`, V-11).""")
rep("""Whether a hosted probe-freshness FLOOR should exist at all is `V-ROW: NEW` in
`../S01/DECISIONS.md`. R3.6 writes the exposure down either way, so this slice does not wait on it.""",
"""Whether a hosted probe-freshness FLOOR should exist at all is `V-ROW: NEW` in
`../S01/DECISIONS.md`. R3.6 writes the exposure down either way, so this slice does not wait on it.

V-11 is ruled ("Yes, name real codes", `docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:23`);
R3.4 is that ruling. One `V-ROW: NEW` is raised by this pass, in `DECISIONS.md` of this slice:
§11's refusal-table row for `COST_ENVELOPES_NOT_SEALED` (`deploy/vps/README.md:779`) and §10's
envelope bullet (`:711-713`) still describe that code as the runtime gate. This version does not
change them; the default binds until V rules.""")
open(S + "SPEC-v2.md", "w", encoding="utf-8").write(t)
print("written", len(t.split("\n")))
