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
