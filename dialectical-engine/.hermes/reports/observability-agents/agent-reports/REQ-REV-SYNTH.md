# REQ-REV-SYNTH case file — observability-agents

Ticket: `t_64ba297a` · seat: REQ-REV-SYNTH · role: independent read-only reviewer · model: Grok 4.6 · 2026-09-02.

SKILLS LOADED: using-superpowers, heartbeat-protocol, grok-heartbeat-adapter, heartbeat-reviewer, heartbeat-requirements, verification-before-completion, systematic-debugging, receiving-code-review

## Scope

Independent review of REQ-SYNTH outputs only. No authored-source edits, no product code, no packets, no other reviews, no git writes.

## Cause findings and price

1. **Synthesis review is a 30-SPEC × 3-product matrix, not a three-file skim.** The packet tells the author to redo field-by-field, contested-row, writer-safety, predecessor, and first-V-test work. A reviewer who trusts the author's tables pays the same later as a skipped contradiction: architecture implements one product's file contract and collides with another. Price if this seat had rubber-stamped: one false PASS, then a merge-order incident on `apps/api/src/index.ts` or `package.json`. Defence used: mechanical `wc`/`python` uniqueness probes plus per-SPEC header extraction of absorbs/depends/first V test, then targeted reads of every cited `path:line`. Wall-clock: ~the full seat. Tokens: dominated by SPEC dumps; a combined dump truncates (author already recorded this). Bounded per-file reads are cheaper than one giant dump.

2. **Line-number citations are the cheapest lie and the cheapest catch.** COMMON's routing sentence is line 12, not a remembered "§0". FIX C3 language lives at IF-5/IF-9 inside a wider 205-212 range. Catching a wrong line costs one `nl`/`python` print; missing it costs a controller ticket that points at a heading. This seat printed every cited bound against `wc -l` before trusting X-01…X-06.

3. **Predecessor ticket ids that SPECs mark "not in the D12 log" are not free to invent.** FIX-12/FIX-15/FIX-06/FIX-16 fill ids from the predecessor H6 map. Verifying them against `docs/missions/2026-08-21-observability-loop/planning/H6-selfaudit.md` is one grep. If they had been wrong, that would have been Blocking. They matched. Price of the grep: seconds. Price of skipping it: a board that absorbs the wrong predecessor tickets.

## What we must upgrade

- Give REQ-SYNTH (and its reviewer) a machine-generated cross-product file-surface table as a mandatory probe, not a prose reminder. The author said this; it is still true. The collisions that matter were exact files (`apps/api/src/index.ts`, root `package.json`), not directories.
- Distinguish dispatch depends-on from acceptance-only gates in the S3 schema itself (two columns). The author documented the rule in the self-report; the table still has one `Depends-on` column. Orchestrators will over-read it.
- Do not send a synthesis reviewer through 30 full SPEC bodies as one context load. Route by `wc -l`, then headers + file-surface + first numbered V step.

## What repeatedly cost tokens

- Full SPEC extraction scripts that print every `FILE`/`ACC` line. The useful residue is eight fields per slice. A header-only probe (lines 1–8 + `## 7`/`Parallel-safety` + first `1.`) is enough for S3, with full reads only on collision candidates.
- Re-reading H0 roster history vs COMMON §0. The live route is COMMON line 12; H0's 2026-09-02 Fable roster is historical. One-prompt runs should pin "active route = COMMON §0" in the packet so seats stop re-deriving it.

## How to make coding (here: synthesis) a one-prompt machine

The next REQ-SYNTH packet should require three mechanical attachments, produced before prose:

1. slice-code set equality vs `slices/` directories (count, unique, prefix split).
2. exact-file writer inventory across all 30 SPECs (collision keys only).
3. predecessor `Sxx → t_…` map diffed against `H6-selfaudit.md` §1.

Prose then only explains DIFF rows. That is the one-prompt shape: the model cannot "forget" a collision if the inventory is the artifact.

## Nearly wrong

- I nearly treated Support's kill switch as satisfying C3 because the compass Done sentence uses H0's process-level words. X-02 is still true: SUP-01 mounts an API module. The compass states the Done bar, not a claim that Support already meets it.
- I nearly filed OBS-05/06/07 `depends-on OBS-02` as over-serialization against Q7 "parallel-safe with OBS-02". Each SPEC's closing dispatch note says "OBS-01 and OBS-02 merged". That is explicit dispatch dependency. Filing it would have been a false Important.
- I nearly treated FIX-12's filled ticket ids as fabrication because the SPEC says they are not in the D12 log. They are in the H6 self-audit map. Verify before accusing.

## Dead ends

- Explore children for SPEC extraction: launched two read-only agents; this parent did not wait on them and did not copy child claims into the verdict. Direct probes were faster than reconciling a truncated child dump. Receipt: search-only, writes nothing, unused as evidence.
- `tee /dev/stderr` probes (author's dead end) were not repeated.
- No board call on `t_a273e880` or `t_63e08f55`. User/packet for this seat named `t_64ba297a` and the on-disk V packet. The on-disk packet still has options, not V choices.

## Where this packet was unclear

- There is no on-disk `REQ-REV-SYNTH` packet; the user prompt is the launch contract. It is complete enough (scope, latest PASS names, S1/S2/S3 charges, write-only review paths). The author's packet still names `t_a273e880` comments; the author recorded a controller override and did not call the board. This seat treated the on-disk `V-DECISIONS-PACKET.md` as the V artifact and listed the skipped ticket as a residual, not a worker defect.
- "Do not defer problems to architecture" binds the reviewer: contradictions must be findings with tickets, not ARCH-will-sort-it. The author already ticket-seeded X-01…X-06. No deferral to hide.

## Closing

Verdict on the work: **PASS** (see `docs/missions/observability-agents/reviews/REQ-REV-SYNTH.md`). Tree at CLAIM: `HEAD=2b670d30`, dirty=69, preserved. No TOOLING-TRAPS append (nothing new that is not already in that file).
