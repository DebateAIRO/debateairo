# BUILD-PES-S01-C3 — case file, completed after packet correction

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat BUILD-PES-S01-C3, BUILD(S01-C3), pass 1, ticket t_b2472fe7. Session `01a0d870-9285-7002-ac49-7815cf8d4d98`; rollout `/Users/vladmihaimiron/.codex/sessions/2026/09/25/rollout-2026-09-25T15-00-51-01a0d870-9285-7002-ac49-7815cf8d4d98.jsonl`. Original START: 2026-09-25 15:01:56 EEST, HEAD `3e6f438b5ef3ce0eff97f4990ca68249db55d292`, clean. Resume START: 20:34:13 EEST, same HEAD, four retained C3 files. Completed 2026-09-25 20:57:11 EEST with commit `c90177f6ccf6d83d0ba9473f02035f93855a9b3e`, six allowed lane paths, clean status. The corrected cluster command passed three times; worst verdict CLUSTER_GREEN.

## Cause and resolution

C3-F1 was a missing dependency in the packet: S01-18 introduced a database connection entry, but the permitted surface omitted the closed inventory registering connection entries. The original production-principal audit at `tests/architecture/p3-production-database-principals.test.ts:600` found 19 source connection pairs versus 18 declarations. The extra pair was exactly `apps/runner/src/hosted-provider-set-publish-cli.ts::MIGRATION_DATABASE_URL`. The original packet could not satisfy its architecture gate without crossing its allowed list.

The first exit log, `S01-20-GREEN-attempt-1.log`, actually ends CLUSTER_RED: architecture 722/729, seven failures. Its filename records intent, not verdict. The six START failures were unchanged; C3-F1 was caused by this working diff. I reported BLOCKED and made no commit.

ARCH-FIX S01 p3 added S01-27, and the orchestrator regenerated the packet. On resume I preserved S01-16..19, reread all six comments and the corrected instructions, and measured the full frame before editing: p3 1/2 and architecture 722/729. Adding the two exact audit rows produced p3 0/2 and architecture 721/729. Only then did I add the manifest object under migration-admin, reaching p3 2/2. The three final runs each reached architecture 723/729 with exactly the six original failure names.

The manifest records the existing JIT migration-owner connection, binding WIRED and condition `package script hosted:publish-provider-set`. It adds no role, grant or migration. The manifest diff is 8 additions/0 deletions; the audit diff is 11/0. Removing this one object leaves the manifest semantically identical to base. M23 (DEVELOPMENT_ONLY binding) and M24 (missing object) failed; restoration passed. JSON member reordering passed as a harmless neighbour.

VERDICT: C3-F1 closed by the authorized S01-27 change / CONFIDENCE: high / STRONGEST COUNTER: a publish-only principal would narrow privileges, but it requires changes outside this slice; V-20's recorded default binds here.

## Upgrades, ranked by expected tokens saved

1. **Check closed inventories before freezing a new entry's write surface.** Price: approximately 30 active minutes before the initial blocker handoff, then a separate architecture correction and resume. The interval from the BLOCKED comment to PACKET CORRECTED was 4h52m16s; that is elapsed routing time, not claimed active compute. Exact token billing is UNVERIFIED. VERDICT: include registry impact in architectural checks / CONFIDENCE: high / STRONGEST COUNTER: discovery costs planning time, but the existing full-directory gate already found this inventory.

2. **Run the architecture directory when the product entry first exists.** I ran 22 useful targeted mutants before the first product-complete directory gate. Their measured interval was about 7m26s. Earlier scanning would have surfaced C3-F1 before that work. VERDICT: move that scan earlier / CONFIDENCE: high / STRONGEST COUNTER: it adds roughly one 48-second scan when the packet is correct.

3. **Summarize logs before requesting bodies.** On the initial turn, two oversized reads exposed about 95k and 27k original tokens to tool truncation. On resume I again combined some floor reads beyond the output budget and had to reread smaller ranges. Price: duplicate reads and avoidable context use; exact billed-token delta UNVERIFIED. VERDICT: extract named frames or bounded ranges and set the orchestration output budget explicitly / CONFIDENCE: high / STRONGEST COUNTER: floor documents still must be read in full where required.

4. **Classify collection failure separately from test RED.** C3-F2 was reported against `.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh:18-23`: a `Tests no tests` summary became 0/0 CLUSTER_RED. My initial use of unsupported `describe.sequential` caused one invalid 847ms run; ordinary `describe` then produced the valid 0/16 RED before product code. This runner finding remains outside my write surface, already ticketed in comment 4. VERDICT: mark nonnumeric/no-tests summaries BROKEN / CONFIDENCE: high / STRONGEST COUNTER: exact required pairs prevented false acceptance here.

5. **Project fixture rows to the port's exact keys.** My first START role probe retained an extra `value` property and correctly received REGISTER_PUBLICATION_INPUT_INVALID. The second used only rowKey/valueJsonText/sourceRef and measured I15 counts 3→3 and I16 rows 49→49. Price: one scratch-database retry. This was my probe error, not a packet defect. VERDICT: project the three publication keys explicitly / CONFIDENCE: high / STRONGEST COUNTER: a typed helper adds a little setup, but would prevent the same spread error.

## Nearly wrong; dead ends; evidence

I nearly treated the 20 new green cases as sufficient progress toward the exit gate. The directory gate prevented that commit. I also checked the S01-27 reference diff before editing: its two explanatory comment lines account for the mandated audit numstat 11/0.

Cleanup retry: my first final probe supplied all 208 ports to one lsof invocation, exceeding its 100-address limit. Batches of 50 completed the check. Price: one failed probe and retry; no product change or repeated suite. This is recorded in cleanup attempts 1 and 2.

Dead ends retained: START-role-counts-attempt-1 and S01-16-RED-attempt-1, excluded from valid product RED evidence. All 24 product mutants were caught and restored. N01 passed 20/20; N02 passed 2/2; both restorations passed. Each restore has a saved porcelain status.

Final pairs in all three runs: integration 16/16, boundary 4/4, principal audit 2/2, architecture 723/729 (six inherited failures), deployment regression 15/15, text bytes 3/3. Typecheck retains only answerExport.ts TS2835. Protected-path diffs are empty with positive pathspec matches. All 208 recorded scratch ports are outside NO-TOUCH and have no listener at cleanup. No real key, live database, desktop action, install, push, merge or stash. The report and READY handoff retain links to all logs. C4 acceptance, cross-mission merge reconciliation and real-provider testing remain outside this seat's claim.
