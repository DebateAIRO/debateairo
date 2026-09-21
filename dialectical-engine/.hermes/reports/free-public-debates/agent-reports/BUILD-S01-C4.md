# BUILD-S01-C4 case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Verdict

The node stopped before a product edit because its read contract omits the source material required to create all three outputs. The packet limits inputs to the mission documents (`BUILD-S01-C4.md:11`), declares only three new lane files allowed (`:16`), and forbids every other lane file (`:18`). Yet the plan requires a unit harness “like `s10-erasure-http.test.ts`” (`PLAN.md:744`), an embedded-Postgres integration harness (`:748-759`), and a full `CREATE OR REPLACE` definition derived from the existing function and branches at `0040_account_erasure.sql:4524-4554` / `:4096-4103` (`:765-789`). None of those implementation sources is readable under the packet.

VERDICT: packet defect; implementation cannot begin without crossing the exhaustive contract. CONFIDENCE: high. STRONGEST COUNTER: a worker could guess imports, fixtures, schema, and the omitted function body, but that would replace repository evidence with invention and would violate the worker contract’s reproduce-first rule.

## Cause and price

Cause: packet generation treated the write surface as a sufficient read surface even though every output is new. It did not include the existing implementation and test exemplars that the plan itself cites.

Price paid in this seat: about 10 minutes, one base-suite capture, one CLAIM comment, and roughly 8–10k tokens loading the mandatory floor and proving the scope conflict. Price if absorbed instead of stopped: likely several BROKEN Vitest attempts, guessed SQL that could change erasure semantics, and a review pass spent discovering that the tests mirror invented fixtures rather than repository behavior.

Repeated token cost: the packet quotes many behavioral requirements but withholds the concrete harness and function definition. A worker must either re-derive repository conventions from failures or stop. Both are more expensive than authorizing narrow read-only ranges.

## What I nearly got wrong

I nearly opened `tests/unit/s10-erasure-http.test.ts` and `migrations/0040_account_erasure.sql` because the plan points directly at them. The packet’s `inputs (read these and nothing else)` plus `forbidden: everything else` makes that unlawful. I also considered a dynamic migration that rewrites `pg_get_functiondef` or renames the old function behind a wrapper. That is a dead end: it evades the required `CREATE OR REPLACE` design, adds unplanned database objects or brittle text surgery, and cannot be justified without reading the original function.

## Ranked upgrades by tokens saved

1. Add a packet-check rule for every new output: if a step says “like”, “equivalent of”, or cites an implementation line, require that exact dependency and narrow range in the read inputs. Estimated saving: 8–20k tokens and one failed pass per affected BUILD node.
2. Separate `readable` and `writable` manifests. Keep the three-file write surface, but authorize read-only ranges for `migrations/0040_account_erasure.sql` covering the full function and referenced unpublish branch, the full `tests/unit/s10-erasure-http.test.ts`, and one named embedded-Postgres erasure/publication integration exemplar. Estimated saving: 5–12k tokens on this node.
3. Have packet-check fail when all writable code/test files are new and no implementation or harness exemplar is readable. This is mechanically detectable. Estimated saving: the entire blocked launch: one model seat, one base capture, and one board round trip.
4. Replace stale architectural prose before dispatch. `PLAN.md:719` still says C4 is parallel with C2, while the packet charge correctly says C2 is already required. The contradiction was resolved, but every seat still spends tokens reconciling it. Estimated saving: 0.5–1k tokens per downstream seat.

## Exact unblock

Issue a corrected packet that preserves the current write surface and adds narrow read-only inputs for: (a) the complete current definition of `core.prepare_private_run_erasure`; (b) the referenced owner-unpublish visibility/cleanup insert; (c) `tests/unit/s10-erasure-http.test.ts` in full; and (d) one named embedded-Postgres integration test whose setup covers migration, roles, grants, publication snapshots, and erasure grants. Then resume this same Codex session so the already-measured base frame remains attributable.

## Resume rulings and measured G3 correction

The orchestrator supplied the missing read-only spans, closing the first blocker. C4-S1 then produced a new measured contradiction before any migration edit: the plan requires the extra-key guard to return body EXACT `{"error":"MALFORMED_REQUEST"}` (`PLAN.md:733`), but the real handler returned that key plus a Zod diagnostic `message` (`probes/BUILD-S01-C4/c4-s1-unit-attempt-1.log`; assertion at `tests/unit/fpd-s01-c4-erasure-http.test.ts:154`). The run was a valid RED: 7/8 passed, with only the exact-body assertion failing.

Cause: the plan promoted the typed error discriminator into an exact whole-body contract without measuring the repository's shared parse-error envelope. The only product path that can remove the extra key is the shared API handler/error machinery; `apps/api/src/index.ts` is both outside C4's three-file write surface and explicitly owned by the concurrent C3 seat.

Price: about 5 additional minutes, one captured unit run, and roughly 2–3k tokens. I nearly weakened `toEqual` to `toMatchObject`, which would make the suite green by ceasing to test the word EXACT. That is the dead end: it conceals the contract mismatch instead of resolving it.

VERDICT: second plan defect, resolved by the orchestrator before a BLOCKED handoff. DECISIONS §22 rules that C4 G3 is status 400 plus body CONTAINS `{"error":"MALFORMED_REQUEST"}` and that the shared response envelope is unchanged. CONFIDENCE: high. STRONGEST COUNTER: the literal PLAN row still says EXACT, but the later explicit ruling is the corrected authority and records the class sweep across C3 and C4.

Resolution: amend only the G3 assertion to CONTAINS, preserve exact bodies for the other guards, and continue from the captured 7/8 RED. No migration code existed when the ruling arrived.

## Third finding: C2's trigger blocks C4's required PRIVATE event

After the §22 ruling, the test harness reached a clean pre-implementation frame: unit 8/8; integration 4/10, with six named behavioral failures. Premium owner-publish, pre-rule owner-publish, signature/grant preservation, and non-owner opacity already pass. The required bound carve-out, PRIVATE latest state, runtime success, system-intent contention, expired-orphan success, and other-snapshot contention fail against the old function (`probes/BUILD-S01-C4/c4-s3-red-attempt-3.log`).

Before writing 0068, the real PostgreSQL fixture proved that C2's trigger rejects a PRIVATE visibility insert without an unconsumed `identity.publication_event_binding`: `migrations/0067_system_run_publication.sql:50-69`. C4-S4 nevertheless orders `prepare_private_run_erasure` to insert PRIVATE (`PLAN.md:771-784`) using a `DELETE_PRIVATE_DEBATE` grant and explicitly says not to consume an `UNPUBLISH` grant (`PLAN.md:791`). The plan supplies no lawful publication-binding shape for this event and says the change lives inside the erasure function.

VERDICT: blocking predecessor-interface conflict. CONFIDENCE: high. STRONGEST COUNTER: 0068 could also replace `core.enforce_publication_v2_ref_binding` with a narrow private-erasure exception, or synthesize a publication binding inside the erasure function; neither change is in C4-S4, and inventing either authorization shape in a high-risk erasure path would exceed the settled architecture.

Price: roughly 12 additional minutes, three integration captures, and 6–8k tokens. The first two captures removed fixture-only failures (duplicate session tokens and an invalid direct publication insert); the third is the genuine RED. I nearly wrote a version-1 PRIVATE event copied from older visibility semantics, but the measured trigger rejects it with SQLSTATE 55000. I also rejected fabricating an `UNPUBLISH` publication binding backed by a DELETE grant: it would make the trigger green by lying about authorization provenance.

Exact unblock: add a DECISIONS ruling that specifies the actor token, actor_ref_version, and verifiable binding source for the erasure-created PRIVATE visibility event. If the remedy is a trigger exception, authorize replacing `core.enforce_publication_v2_ref_binding` in 0068 and state the exact predicate that distinguishes this SECURITY DEFINER erasure path from arbitrary inserts. Resume at C4-S4; both new tests exist and no migration file exists.

## Final verdict after RULING 2

DECISIONS §§23–24 supplied the missing authorization shape and PLAN Revision 4 authorized replacing the trigger in 0068. Commit `db4758da` now completes C4: the trigger admits only actor `…f2`, ref version 2, `PRIVATE`, `COPIES_MAY_PERSIST_V1`, a bound run, and a pending cleanup row; erasure gates live system-publication intents, writes cleanup before visibility, preserves the existing signature/grant, and excludes only the newly scheduled public ref from snapshot contention. It mints no publication binding, consumes no UNPUBLISH grant, and writes no unpublished audit.

Evidence: the revised RED frame was HTTP 8/0 and integration 7/7. Refutations killed missing actor admission (8/6), wrong warning shape (8/6), missing trigger bound predicate (13/1), missing cleanup proof (13/1), missing system-intent gate (13/1), missing snapshot exclusion (9/5), and broadened erasure eligibility (12/2). After every restore, status contained only the three authorized files. Final cluster results were identical on three fresh runs: C4 HTTP 8/0, C4 PostgreSQL 14/0, inherited s10 HTTP 8/0, `CLUSTER_GREEN`. Typecheck remains the ruled baseline: rc=1 with 70 inherited diagnostics and no C4 path.

Total price was two architectural round trips, approximately 30–40 minutes, and repeated fixture/probe work. The highest-value one-prompt upgrade is to have packet generation include narrow read exemplars and mechanically compare every planned insert against active triggers before dispatch. A second upgrade is to require high-risk cross-slice authorization capabilities to be named in DECISIONS before BUILD begins. No live database, listener, sibling path, push, or merge was touched.
