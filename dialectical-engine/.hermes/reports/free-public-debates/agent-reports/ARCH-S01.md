# ARCH-S01 self-report — mission `free-public-debates`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat ARCH-S01 · grok-4.6 · 2026-09-20 · session `01a0bff4-9e4c-73d1-a083-fcec78f440bf` · ticket `t_eff46252`. Lane stayed 0 dirty. Mission-home writes only.

## The body

The slice is one vertical backend change: bind new Free runs, publish them without a grant, refuse unpublish after a live grant, let the creator delete while public. The HOW is not mysterious. Four facts already decide it, and they were in the packet:

1. `core.transition_run_publication` returns NULL unless a live session, grant and binding match (`0040_account_erasure.sql:4014-4022`). There is no system input to present.
2. ADR-0024: `CREATE OR REPLACE`, signature unchanged, never `DROP` — a DROP discards `GRANT EXECUTE … TO debateai_runtime`.
3. `serve.publication_key_provision_intent.session_id` is `NOT NULL REFERENCES identity.session`. A fabricated session is R-20.4.
4. The owner function consumes the grant at `:4088` *before* writing visibility. A 409 that calls that function fails R-14.

Everything else is placement: a boolean on `core.run`, a new function, an HTTP branch, a carve-out in `prepare_private_run_erasure`.

## Cause, not symptom — what burned tokens

### 1. Required reading that could not change the plan (price: ~8–12k tokens, ~4 min)

**CAUSE:** the packet's inputs line names `docs/architecture/01-decisions/README.md` *and* "the ADRs the charges name". The charge names ADR-0024. The README is a 400-line history of DR-105/117 language-stack reversal. None of it moves S01.

**Upgrade:** inputs line = ADR-0024 + "ls the directory for the next free number". README is for a DISPUTE, like the spine.

**Tokens saved if adopted:** one full document, every ARCH seat of every mission that only needs one ADR.

### 2. Tooling-traps *index* with no named headings (price: ~3k tokens, ~2 min)

**CAUSE:** COMMON 3.8 says read the heading index plus bullets under headings the packet names. This packet named no trap heading. Charge 4 implies "Embedded postgres with a superuser pool is privilege-blind". The index is 131 headings. I grepped, then opened three.

**Upgrade:** packet charge lists heading titles, 1–3 of them. The index grep stays as the discovery command for anything else.

### 3. The V-row range was written three ways (price: ~2k tokens, one re-read loop)

**CAUSE:** `INSTRUCTIONS.md:12,44` and `SPEC-v2.md:8` say V-1…V-5. Packet charge 1 repeats V-1…V-5. DECISIONS §10 N1-p2, which charge 0 says to read *first*, says the binding set is V-1…V-6. Correct, and it costs a contradiction-resolution pass on a frozen spec the seat must not edit.

**Upgrade:** the packet's charge 1 must quote §10 ("V-1…V-6"), not the stale SPEC pointer. REQ-FIX already lost this once; the packet re-introduced it.

### 4. Duplicate compass (price: ~2k tokens)

INSTRUCTIONS, COMMON, intake, V-packet, SPEC preamble, and the packet all restate I-1…I-4 and "backend only". Pointers-not-content is the law; the copies still exist.

**Upgrade:** packet inputs = INSTRUCTIONS (100 lines) + SPEC-v2 + DECISIONS §10 + named code spans. Intake and V-packet are cited by INSTRUCTIONS; do not list them again unless a charge needs a table the SPEC does not carry (here: baseline counts — those belong in COMMON §6, which already cites intake).

### 5. Skills that do not fit a fleet seat (price: ~6k tokens)

`superpowers:brainstorming` is a human-approval dialogue. `superpowers:writing-plans` wants `docs/superpowers/plans/` and an execution-choice prompt. Heartbeat wins; both still had to be loaded in full because the packet named them and SKILLS LOADED is audited against the transcript body.

**Upgrade:** a 30-line `brainstorming-fleet.md` that says: classify, write rejected directions into DECISIONS, do not wait. A 40-line `writing-plans-heartbeat.md` that says: fill PLAN.md, stranger test, no execution prompt. Load those instead of the interactive originals when the packet is a graph seat.

## What we must upgrade (ranked by tokens saved)

1. **Stop shipping ADR-README as floor reading.** Highest save per seat. The next-free-number command is `ls`, already required.
2. **Name trap headings in the packet.** Cheap. Prevents 131-line index absorption.
3. **One V-row range in the packet.** Charge 0 already has the correction; charge 1 must not revert it.
4. **Fleet-sized Superpowers shims** for brainstorming and writing-plans. Pays back every ARCH/REQ seat, not just this one.
5. **Pre-extract the other SQL gate.** The packet extracted `:4014-4022` (grant lookup). The delete gate at `:4536-4538` (RETURN PUBLISHED) and the grant consume at `:4088-4090` are the same class of fact and were re-derived from a 210-line read. Put both extracts in the packet.
6. **Capability-probe pattern as a named copy-paste.** `planTierColumnIsApplied` + `LIKE '%''planTier''%'` is the exact shape for `freePublicRule`. A 15-line "when you add a column to `create_encrypted_run`" note in ADR-0024 would have saved a hunt through `packages/db/src/index.ts:1164-1328`.

## What repeatedly costs tokens (this seat and the class)

- **Line-anchored code reads that are the right size.** `publications.ts:140-440` and `index.ts` slices were worth it. Do more of this; do less of README-scale files.
- **Re-stating the baseline table.** Intake has it; SPEC §3 cites it; COMMON §6 cites it; I still opened intake to copy 30/31. The cluster command only needs the pair. Packet should say "C3 base = `:30:1` on `s7-authorization`, named test T" and stop.
- **Skill bodies vs skill names.** SKILLS LOADED is verified against transcript body. That is correct (a path is not evidence). The cost is reading 250-line skills to use 20 lines. Shims, above.

## How to make the coding more efficient

The BUILD seats will waste time on three things this plan already pinned, if the packet to them does not repeat them as a 10-line "do not":

- Do not `DROP FUNCTION core.transition_run_publication`.
- Do not put the 409 after `unpublish()`.
- Do not add a route to make the reconciler reachable.

A BUILD packet that leads with those three, then the cluster's file map, then the RED test names, is the one-prompt machine for coding. The PLAN is long because ARCH is the last seat that may still choose. BUILD should receive a cluster packet, not the whole PLAN (heartbeat already says this: a BUILD node reads its cluster's steps). **Enforce it in the BUILD packet's inputs line.** If BUILD is given PLAN.md entire, they will re-read C4 while coding C1.

## One-prompt machine

This packet was close. What is still not one prompt:

| gap | fix |
|---|---|
| Charge 1 vs §10 on V-rows | one range |
| ADR README on the inputs line | delete it |
| unnamed trap headings | name them |
| interactive Superpowers as floor | fleet shims |
| delete-gate SQL not extracted | extract `:4536-4538` and `:4088-4090` next to the grant lookup |
| PLAN length vs BUILD reading floor | BUILD packet lists C1-S1…C1-S14, not §1–§9 |

What already worked and must be kept: the grant-lookup extract; "SPEC-v2 is the SPEC of record"; "omit test paths a step creates from the base run"; `run-suites.sh` as the only runner; lane vs mission-home split; 0-dirty lane as a hard check.

## What I nearly got wrong

- **Widening `transition_run_publication` with NULL grant.** One function, one GRANT, looks simpler. It is an authorization change of the owner path and a signature change ADR-0024 forbids. Caught by the DROP-grant paragraph, not by taste.
- **Reusing `publication_key_provision_intent` with a dummy session.** The table definition is 15 lines above the function I was already in. Easy to skip. R-20.4 is the catch.
- **Putting 409 inside SQL after consume.** The consume is 50 lines before the visibility write. A "refuse in the database" instinct fails R-14.
- **Including new test paths in the ARCH base command.** Runner would print BROKEN (single path) or silently drop (multi-path). Packet already warned; the consent-ui trap heading is the same class.
- **`bound := plan_tier='free'` with no column.** Fails I-2 the moment an existing Free row is read.

## Dead ends (do not re-derive)

- PostgreSQL overload of `transition_run_publication` — two GRANTs, one name, one wrong `DROP FUNCTION` arity.
- Third `state` value `PENDING` — R-11.1 and the R-22 back-compat class.
- New HTTP route for the reconciler — moves the s7 50/52 pair (R-23).
- Auto-publish only in `apps/runner` — surface no R-n names.
- `NOT NULL DEFAULT true` on `free_public_rule` — binds every existing row.

## Where THIS packet was unclear, exactly

- **Charge 1 vs charge 0 on V-5 vs V-6** — `packets/ARCH-S01.md:29` says "rows V-1…V-5 bind you"; `packets/ARCH-S01.md:27` charge 0 points at DECISIONS §10 which says V-1…V-6. I followed §10.
- **`packets/ARCH-S01.md:10` inputs** include ADR README; **`packets/ARCH-S01.md:16`** says "the ADRs the charges name". Two different sets. I read README (required by the inputs line) and ADR-0024 (charge 4). Cost in finding 1.
- **`packets/ARCH-S01.md:10` "the tooling-traps index"** with no heading list. COMMON 3.8 forbids absorbing the bullet list; I still had to guess charge 4's heading.
- **`packets/ARCH-S01.md:3` skills** name `heartbeat-protocol` without saying `.grok` thin loader vs `.claude` v4.0.0. COMMON §1 says `.claude/skills`. I loaded both. The eight-line shape lives only in the v4 file §5.
- **Handoff shape collision:** protocol §5 is eight numbered lines; architecture skill §5 lists SPEC↔PLAN / clusters / verification / boundaries / refutation / Screens / DECISIONS as the contents of that handoff. I put those in lines 4–5 rather than writing a second format.

## Wall-clock

CLAIM 17:56Z. Artifacts on disk, four base probes `CLUSTER_GREEN`, lane 0 dirty. Probes were cheap (unit + already-warm integration). The expensive part was the reading floor, not the design.

## Verdict on the machine

The graph already knows HOW to packet an ARCH seat. This packet over-included (README, unnamed traps, stale V-range) and under-extracted (delete gate, grant consume). Fix those two directions and the next ARCH seat is a one-prompt fill of PLAN.md.
