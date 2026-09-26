# FIX-PES-S03-p1 — case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

FIX(S03), after REV pass 1, ticket t_14d88692. Same session as C1: 01a0d74f-5c40-7633-8250-bd70f263fbec. Start 2026-09-25 14:37:46 EEST; committed by 14:48:45 EEST. Base 98264a5ea837676c869725ede592ca5abcaaf5cb; commit 60993d2dbfab7b009854f165ee4d77f5abfcc0ce. Only tests/unit/v9-provider-credential-files.test.ts changed, +43/-4. Exact token usage was not measured; estimates below are identified as estimates.

## Cause

My C1 pin substituted occurrence in all of §11 for membership in its refusal table. The guard sentence and other prose kept the price codes present after their rows were deleted. The same broad search also imposed no upper bound on table membership, so a V-8 run-time row could be added unnoticed. The plan's executable case carried that mistake; copying its case and killing a missing-code mutant did not prove the stronger property R3.3 required. I own that missed distinction in C1.

The class sweep found two refusal-code loops with this weakness: base lines 437 and 466. Both now read only contiguous data rows after the refusal-table header and separator. An independent exact first-column check covers all 17 documented top-level codes, normalizes the colon-bearing forms and retains duplicates so they fail. The 12-code source-derived inventory remains source-derived; four of those codes are nested reasons in Meaning cells, so it cannot itself be the first-column expected set.

## Evidence and price

Before the edit, three price-row deletions and the DAILY_COST_ENVELOPE_REACHED insertion each left v9 at 31/31. The detector correctly failed on this surviving-mutant fixture. After the edit each yields 30/31, then restoration gives 31/31. The support-row control still fails. The expanded 27-mutant sweep covers all 17 row deletions, all four V-8 additions, duplicate rows, codes moved to Meaning/prose, a second code in one cell and credential reasons moved outside the table. Each specifically fails the widened pin. A separate log checker was first run on the pre-fix results and failed, then confirmed all 27 revised failures.

The ten original correctness mutations were replayed using the original Python mutation body. Nine now fail; the source-inventory retype still passes, as the review already reported. That is outside F1: a literal replacement equal to the source at this snapshot cannot be distinguished by this document check. The shipped code still reads the source. A neighbour combining row reordering, a wrapped sentence and a V-8 code mentioned in prose outside the table passes. Every mutation has cmp and path-specific before/after porcelain receipts. Three final runs each passed 31/31 plus 31/31. Typecheck retains only apps/ui/lib/v3/answerExport.ts(2,38) TS2835.

This FIX took about eleven minutes through commit, plus reporting. The original miss cost a review finding and this entire rework pass. Probe execution accounted for roughly a minute and a half; most remaining time was reading, constructing reviewable mutation evidence and reporting. No product implementation retry was needed.

## Upgrades ranked by estimated token savings

1. **Make relocation and forbidden addition mandatory for a table-membership pin.** A deletion alone is weak when the same token appears in prose. The counterexample set should include leaving the token somewhere lawful but outside its required structure, and adding a forbidden token inside that structure. VERDICT adopt for structural document checks / CONFIDENCE high / STRONGEST COUNTER: more mutants cost seconds, but this pair would have prevented the entire F1 pass. Estimated savings: one review/rework cycle, thousands of tokens; exact count unmeasured.

2. **Separate source vocabulary, row membership and prose semantics in packets.** They are three distinct oracles. The old plan mixed source vocabulary with row membership; twelve source codes were never seventeen top-level rows. VERDICT name the three properties separately / CONFIDENCE high / STRONGEST COUNTER: a longer packet can duplicate the same facts unless each oracle owns one source. Estimated savings: 1-2k interpretation and handoff tokens per similar task.

3. **Make reviewer probes relocatable and path-partitioned by construction.** The scripts hardcoded detached review lanes and their original evidence directories; the correctness restore also required whole-tree porcelain zero. I preserved its Python mutation body, supplied this lane and new outputs, and applied the packet's cmp/per-path restore rule. Security's DAILY insertion arrived as a recorded operation without a script in its directory, so that operation was reconstructed explicitly. VERDICT pass lane/output/expected result as arguments / CONFIDENCE high / STRONGEST COUNTER: mutation meaning must still be inspected, even with standard transport. Price here: one adapter and restore harness, estimated 1-2k tokens, no lost evidence.

4. **Budget tool output before batching long reads.** I again combined two large reads over the tool response limit. This time the outputs were retained in memory and the missing portion was displayed without rerunning filesystem reads. VERDICT cap each displayed chunk / CONFIDENCE high / STRONGEST COUNTER: independent tool calls can still run together; only their displayed output needs limits. Price: one clipped response and two display recoveries, hundreds of repeated tokens.

## Nearly wrong, dead ends and packet clarity

I nearly used the 12-code union as the first-column set. That would reject correct nested credential reasons and omit nine existing top-level rows. A regex selecting every pipe-prefixed line in the refusal span would also accept a row copied into a fenced prose example below the real table; the helper therefore stops at the first non-table line.

Rejected dead ends: patching README (it is already correct), adding a separate case just to increase the count, changing C3's exact prose checks, and adding source-self-inspection to reject an equivalent retyped test. No new cases were needed: 31 remains 31, and the other 29 cases are byte-identical.

Packet clarity: charge 2 locates the pin at base :453, which is the older resolver extractor; the assigned failing containment is :437. The union report identifies it correctly, and the full-file sweep exposed the older :466 containment too. The blanket README prohibition is read with the packet's explicit, temporary mutation exception; README is byte-identical to the starting head after every restore and at commit. No apps/ or packages/ mutation, live database, real key, install, push, merge, UI, or service beyond the suite's ephemeral fixture was used.
