# PACKET ARCH-S02-HYGIENE — four documentation edits to a PASSED plan (mission `consent-ui`, slice S02) — docs only, beside the running coding fleet

You are a short architecture seat (fresh session). `slices/S02/PLAN.md` PASSED blind review round 3 at 22:22 and the coding fleet is reading it; you make exactly the non-semantic edits the PASS verdict left as non-blocking residue (N11, N13, N14, N15 of `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/reviews/ARCH-REV-S02-r3.md`, lines 182–241), and nothing else. Read, in this order: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/consent-ui/packets/COMMON.md` §10.9–10.11 and §10.22–10.27 · those verdict sections · the PLAN lines they cite.

Skills (Skill tool, THIS session): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-architecture` · `superpowers:verification-before-completion`. The architecture floor (`brainstorming`, `writing-plans`) still binds (COMMON §10.25): load them or declare the shortfall in §10.9's form — nothing here is designed.

- **board:** `consent-ui` · **ticket:** `t_3f776526` · slice `t_9ccf3598` · read both before CLAIM.
- **allowed (main tree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`):** `docs/missions/consent-ui/slices/S02/PLAN.md` (the edits below) · `docs/missions/consent-ui/slices/S02/DECISIONS.md` (append ONE correction entry for N14 — never edit an existing line) · `.hermes/reports/consent-ui/agent-reports/ARCH-S02-HYGIENE.md` (self-report, short) · scratch `/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/arch-s02-hygiene-r1/`. **Forbidden:** every other file; the lanes; any step text beyond the lines named.
- **snapshots (COMMON §10.26):** `.hermes/reports/consent-ui/snapshots/S02-PLAN.md.passed-r3` and `S02-DECISIONS.md.passed-r3` are the byte-exact pre-edit copies; your handoff pastes `diff <snapshot> <file>` for both in full — they must show ONLY these edits.

## The edits
1. **N13:** `PLAN.md:2068` (C1's forbidden column) names S01's ADR as `ADR-0019-consent-storage-contract.md` → `ADR-0021-consent-storage-contract.md` (COMMON §10.23). Sweep: `grep -n 'ADR-0019' PLAN.md` before/after, pasted; the surviving mention at `:291` is prose about reservations — rewrite that sentence to the measured facts (translation reserves ADR-0019 only: 23 occurrences in 12 files; ADR-0020: 0) with the command beside it.
2. **N14:** the ADR correction entry in DECISIONS says "8 occurrences" (measured 9) and "37 and 14 references" (measured 23 and 0) — append ONE correction entry with both counts and their commands (`grep -c 'ADR-0022-shared-modal-semantics.md' PLAN.md`; `grep -rho 'ADR-0019' docs/missions/translation | wc -l`).
3. **N15:** `PLAN.md:126-127` still says "exactly two such controls (`S02-S28`, `S02-S32`)"; `S02-S28` is RED-before since its move to C7. Delete `S02-S28` from the parenthetical and give the sentence its command (`grep -c 'GREEN before and after' PLAN.md` with the counting rule — the reviewer measured 4 hits, three of which call themselves constraint/guard), or drop the count and keep the rule.
4. **N11:** no PLAN edit — it is a handoff-wording finding; your own handoff simply follows §10.9's honest form.

## Handoff
Post `FULLY DONE` on `t_3f776526` opening with `SKILLS LOADED:`, then both full diffs against the snapshots, then the before/after greps, then `comments read through`. Self-report first (a few lines: cost, anything unclear in this packet).
