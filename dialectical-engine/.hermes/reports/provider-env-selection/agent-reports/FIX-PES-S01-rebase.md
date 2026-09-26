# FIX-PES-S01-rebase — case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat FIX-PES-S01-rebase, FIX(S01), pass 1, ticket t_f55704e5. Session `01a0d870-9285-7002-ac49-7815cf8d4d98`; rollout `/Users/vladmihaimiron/.codex/sessions/2026/09/25/rollout-2026-09-25T15-00-51-01a0d870-9285-7002-ac49-7815cf8d4d98.jsonl`. Measured start 2026-09-26 09:46:52 EEST; final verification 2026-09-26 10:13:59 EEST: 27m07s elapsed. Actual token billing is UNVERIFIED.

## Cause, evidence and disposition

Both branches appended a different hosted-publication entry at the same point in the production-principal manifest and its audit. They were concurrent additions, not conflicting principal policies. Dev's hosted-register-publish entry uses PRODUCTION_REGISTER_PUBLICATION; S01's hosted-provider-set-publish entry uses HOSTED_PROVIDER_SET_PUBLICATION. Both declare MIGRATION_DATABASE_URL under migration-admin with binding WIRED, and each names its own package script.

The actual rebase reproduced one stop at `c90177f6ccf6d83d0ba9473f02035f93855a9b3e`: one hunk in the manifest and two in the audit. Before any resolution I saved the stopped commit, porcelain status, combined diff, complete marker files and all three index stages (`conflict-1.json`, `conflict-1-hunks.diff`, `conflict-1-file-*-stage-*.txt` in this seat's probe directory).

The resolution inserts S01's object and expectations before dev's hosted entry. Removing only those additions reproduces each entire dev file byte for byte. Diffs from a6d6382ba are exactly manifest 8 additions/0 deletions and audit 11/0. Unique executable pairs measure 19 on dev, 20 in the union, with S01's pair the addition. No binding, purpose, condition, privilege or migration change was needed. The package auto-merged; all dev content remains, with exactly the two S01 scripts added.

I resolved the audit first and ran the missing-S01-object mutant: both p3 cases failed (0/2). Restoring the union passed 2/2. A harmless neighbour changed only the S01 JSON member order: 2/2, then restoration 2/2. Porcelain snapshots were saved after both restores; UU remained in the index until the explicit per-file git add, as expected during a paused rebase.

Final head is `17d68955f7aba06fd1694016ff13f85c0e760088` on slice/provider-env-selection-s01, based on `a6d6382bae10a7dc5d84cf407f576169b001c0e8`, clean. All four commits replayed; no follow-up commit. The backup remains `172ee164099c9cab4dde66d80be8e9e782afc899`. All ten slice-added files are byte-identical to the old slice head; no pinned-line adjustment was required. Exactly 15 slice paths differ from dev.

## Verification and its price

Every C1–C4 command ran three times. All 12 markers are CLUSTER_GREEN; the worst is GREEN. Architecture is 746 passed/751 total, with exactly the five names in the supplied dev frame in every run. This is dev's 742 passed/747 total plus S01's four boundary cases. The completed old slice had 723 passed/729 total. Every other pair is unchanged.

The one-off pnpm acceptance exited 0 and ended PES-S01-ACCEPT: PASS; its scratch listener closed, its output has no Bearer text, and the live database listener metadata before/after was identical. Typecheck exited 0 with no diagnostics. R1.6 ran through the boundary suite three times; R1.13's explicit greps passed. All 109 recorded scratch ports are above 4400, outside NO-TOUCH and closed at final cleanup.

The architecture durations alone sum to 591.72 seconds across the 12 required scans. That is about 9m52s of test runtime, separate from the longer database regression and the other suites. The logs, not a reconstructed terminal transcript, retain every result.

## Upgrades ranked by expected savings

1. **Let a future rebase packet consolidate identical whole-tree gates.** On one immutable rebased head, all four cluster commands rerun the same architecture directory. Three consolidated scans instead of twelve would save nine scans: an extrapolated 443.79 seconds at this run's measured average. This packet explicitly required twelve, and all twelve were run. VERDICT: consider one declared whole-slice command ×3 for rebase-only nodes / CONFIDENCE: medium / STRONGEST COUNTER: separate cluster commands preserve the existing verification interface and isolate suite-level drift.

2. **Carry the target SHA, failure-name set and pair delta as machine-readable packet data.** The packet did supply the new dev frame, which prevented blindly reusing 723/6 or PLAN's older C1/C2 719/6. Price here: one extraction and one final automated comparison across 12 logs; no wasted test rerun. VERDICT: generate these fields from the same baseline artifact / CONFIDENCE: high / STRONGEST COUNTER: that schema itself needs a version and source provenance.

3. **Use a byte-preserving union proof for closed registries.** Removing the slice additions and comparing with dev proves preservation more directly than visually inspecting every existing principal. Price: one conflict-record pass and one union proof; zero corrective iterations. VERDICT: retain stage snapshots and the subtraction proof as standard conflict evidence / CONFIDENCE: high / STRONGEST COUNTER: list order may be semantic, so the real consumer audit must still pass.

## Nearly wrong, dead ends and packet clarity

I nearly appended S01 after dev’s last object, which would change dev’s closing separator. Inserting S01 before that object preserves every dev byte and keeps the declaration order aligned in the manifest and audit. A blanket “take ours/theirs” resolution would also discard one of the registered commands.

There were no speculative fixes, unexpected failing runs or retry-to-green loops. The initial rebase exit 1 and mutant CLUSTER_RED were intentional evidence. I used lsof batches of 50, avoiding the 100-address limit encountered in the previous C3 seat.

No blocking packet defect was found. COMMON still describes the original 776359c3 base; FIX-S01-rebase.md:9 and :17 explicitly supersede it with a6d6382ba and its new pairs. The named packet scope was sufficient. No new V-ROW was needed; V-20's default and V-21's instruction were preserved.

No fetch, push, merge, stash, backup mutation, real key, live database connection, install or desktop action. Independent REV and V's acceptance remain outside this seat's claim.
