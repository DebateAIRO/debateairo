## r1

### Cause file

The central defect class was **live-code deletion mistaken for persisted-state deletion**.
The worker correctly enumerated and removed every live strict-and/rival code carrier, but
the forward migration relied on the source-history fact that first-party serve code never
wrote `WITHHELD`. That fact does not prove a database satisfying the old, public CHECK
domain contains no such row. `0051` then compounds the assumption by adding both narrowed
served-number constraints `NOT VALID`, while the read path types database text as the new
two-member union without runtime validation and projects every non-`EVICTED` value as
`PRESENT`.

**Price:** at least one full rework/review round, plus a high-risk upgrade-path defect that
the fresh-database integration run could never reveal. The repeated token cost came from
having to reconstruct the data path across the old migration, `0051`, the serve projection,
and frozen propagation JSON after the deletion grep itself was already clean.

### What I nearly got wrong

- I nearly accepted “nothing has ever written a WITHHELD event” after history showed only
  the initial serve implementation and this removal commit. The old database constraint
  nevertheless made that row valid, and STATIC review has no authority to assert deployed
  data is empty.
- I nearly repeated the worker's packet-anchor concern. The cited runner range is accurate:
  base line 2031 spreads `...strength` into the ledger input, which is exactly how the rival
  fields were persisted without named tokens.
- I nearly treated old architecture prose as authority for retaining the slot. The newer T8
  goal removes the propagation withholding branch and the slot's sole lawful reason, so the
  union deletion itself is defensible; the incomplete forward-state closure is the defect.

### Dead ends and token sinks

- A broad repository grep pulled historical mission/docs material and produced more than
  100k tokens of noise. The useful probe was the narrowed shipped-source search over
  `packages`, `apps`, `web`, `tools`, and `acceptance`, followed by explicit migration and
  consumer inspection.
- A shell glob for generated app directories failed under zsh because no app-level generated
  directory exists. `find ... -name generated` established the only generated contract
  surface and it carried no removed vocabulary.
- Re-reading green logs could not prove the worker packet's per-test RED requirement. The
  artifact set contains one RED log, for the architecture invariant; the changed behavior
  and migration tests appear only in green/mutant evidence.

### Upgrade the one-prompt machine

1. Every deletion packet that changes a persisted vocabulary should enumerate **state
   carriers**, not only source references: typed columns, free-form JSON/JSONB, event-domain
   members, generated contracts, and read-time casts.
2. Require an upgrade fixture that migrates only through the prior tip, seeds every formerly
   valid member, then applies the new migration and asserts the declared disposition. A
   from-empty migration run is not evidence for a destructive/narrowing migration.
3. Require migration constraint assertions to check `convalidated` or execute a rejected
   legacy-row arm; string-presence assertions cannot prove a domain was retired.
4. Make the RED manifest explicit per changed test: test name, base command, failing assertion,
   and log. This prevents a single omnibus RED from being mistaken for all packet-mandated
   behavior REDs.
5. Mutation probes should vary syntax class. P4 killed `export function product`, but the same
   regex accepts `export const product`; the companion replay test saves the property today,
   not P4 itself.

### Where the packet fought me

The review packet correctly required STATIC-only work while the reviewer contract asks for
an independent probe. I resolved that tension with read-only static discriminators and log
verification, and did not run tests or builds. The packet would be stronger if it explicitly
named an upgrade-from-0050 fixture as required evidence for the high-risk receipt migration;
without that, the supplied fresh-database green invited the exact false conclusion found here.

## r2

### Cause file

The r2 defect class was **a green rejection test that never reached the property named by
the test**. The new post-upgrade `node_strength_record` insert includes `at_seq`, but that
table has no such column. Its unconstrained `.rejects.toThrow()` therefore passes before
PostgreSQL evaluates `node_strength_record_operator_used_check`; after removing `at_seq`,
the generated `node_id` would still encounter the foreign key before the operator CHECK.
The same wrong-column error is visible in the dedicated green log and all three green DB
cluster logs.

**Price:** one last rework/review round for a test and report correction even though the
migration itself now implements the chosen fail-loud policy correctly. The evidence lesson
is the same as r1 B2 in miniature: a green count is not a discriminating assertion.

### What I nearly got wrong

- I nearly accepted `7 passed (7)` as closure without reading the PostgreSQL statements
  embedded in the green log. The named property was never exercised.
- I nearly accepted the worker's emphasized claim that rows carrying strict-and are
  “exactly” rows with no strength record. That is true of the strict-withholding case used
  by legacy shape (b), not of strict-and generally: the base scoring evidence constructs an
  all-judged strict-and parent whose returned strength records `operatorUsed: "strict-and"`.
- I nearly carried the worker's F-T8-2/F-T8-3 statuses forward. D16 already adopts the
  type-producer gate and J11 already rules the completion class symmetric.

### Dead ends and token sinks

- A report-tree-wide log grep crossed unrelated lane logs and produced heavily truncated
  noise. Restricting the search to `logs/t08/green-t8-upgrade.log` and the three named C4b
  logs exposed the repeated wrong-column error immediately.
- No runtime rerun was lawful in this STATIC packet. The filed PostgreSQL error, migration
  schema, base scoring expectation, and exact r1-to-r2 diff were sufficient to trace both
  issues without running a test or build.

### Upgrade the one-prompt machine

1. Every database rejection assertion should match the intended SQLSTATE, constraint name,
   or domain marker; bare `.rejects.toThrow()` is not an oracle when multiple constraints
   and schema errors can fire first.
2. A negative insert fixture must first satisfy every unrelated prerequisite: use only real
   columns and seed referenced rows, then vary the single prohibited value.
3. RED/green reports should enumerate every passing test as well as every failure. Here the
   third RED pass was described as a fixture-validity arm even though it was the same false
   positive.
4. Claims using “exactly” should be challenged with the complementary population. The
   correct migration argument is existential: a strict-withheld receipt **can** have no
   strength row, so the strength CHECK cannot replace a direct JSONB scan.
5. Rework reports should reconcile their findings table against the current decisions tail
   before marking anything open.

### Where the packet fought me

It did not. The packet explicitly isolated the worker's largest arm-(b) inference for
adversarial checking and prohibited runtime work while pointing to sufficient filed logs.
That combination led directly to both the overbroad “exactly” statement and the false-green
door assertion.

## r3

### Cause file

The r3 implementation and M14 discrimination are correct. The remaining defect class is
**manual evidence accounting that describes a filter without defining it, then reports the
filtered result as the raw log**. The worker's stray-error paragraph says each C4b log
contains four database errors, all from `graph-database.test.ts`, and that the standalone
T8 log contributes zero. Direct `ERROR:` enumeration finds sixteen per C4b log: four named,
expected T8 rejections and twelve graph-database negative-path rejections. The standalone
T8 log contains the same four T8 errors. The defensible conclusion is “zero unexpected
errors after an explicit allowlist,” not the counts filed.

A second manual ledger drift appears in the residue section: “three” open items precedes
four bullets. F-T8-6 and F-T8-7 now map to board F23 and F24, while F-T8-4/F-T8-5 remain
called open without board rows. At the three-round cap, that is routing state, not another
worker round.

**Price:** no round 4 is lawful. The product/test change is not reopened, but two
non-blocking report/process findings must enter V's decisions packet. The repeated cost is
one final review cycle spent reconciling prose counters that could have been derived
mechanically.

### What I nearly got wrong

- I nearly accepted `22 passed (22)` plus the worker's “stray-error audit” without counting
  the raw PostgreSQL errors. That would have repeated the exact green-log mistake r3 was
  written to cure.
- I nearly treated “three non-blocking items” as a harmless typo. Router §2.2 makes the
  number operational: every item needs a ticket and disposition.
- I nearly reported F-T8-7 as unticketed because the worker table still says `NEW`. The
  board is newer than the report and now contains F24; the actual unrouted entries are
  F-T8-4 and F-T8-5.

### Dead ends and token sinks

- Dumping the full PostgreSQL logs obscured the evidence with database bootstrap output.
  A scoped `rg -n 'ERROR:'` over the four named files produced the decisive source/count
  split immediately.
- Searching only the worker report could not establish routing. The board—not the report—
  showed that F23 and F24 exist and that no corresponding F-T8-4/F-T8-5 rows do.

### Upgrade the one-prompt machine

1. Define an expected-error manifest per negative-path test and compute `total`, `expected`,
   and `unexpected` counts from the logs. Never use “contains” for an unstated filtered set.
2. Generate residue counts from the findings rows rather than typing them independently.
3. Before the final marker, reconcile every open finding against the live board and print a
   machine-checkable `finding -> ticket/decision` map.
4. At round 3, automatically emit missing routes as V-packet rows; do not leave the reviewer
   to infer whether an item is a finding, a disclosure, or a withdrawn observation.

### Where the packet fought me

The packet was excellent on the technical convergence points: it named the same-mutant
comparison, both newly exposed fixture domains, the visible N2 correction, and the exact
r2-to-r3 scope. Its N3 check was too narrow: it asked for D16/J11/F23 but not complete
residue reconciliation, even though F24 existed before the packet and F-T8-4/F-T8-5 were
still labeled open. That omission is what allowed the final count/routing inconsistency
through dispatch.
