CODEX REVIEW TINT1 r1 — CHANGES · comments read through: tint1-r1-2026-09-01

VERDICT: REWORK — 1 blocking worker finding and 3 non-blocking orchestrator/packet findings (4 total). Round r1 of 3.

The test/double repair obeys the nothing-weakened law, but the database repair
does not reach the lawful upgrade path. The PUBLIC revoke must move to a new
forward migration; amending landed `0052` is unsafe.

## FINDINGS

### B1 — Amending landed migration 0052 leaves already-migrated databases exposed

**Owner:** TINT1 worker. **Files/lines:**
`migrations/0052_t5_reviewer_measured_edges.sql:127-135` and
`packages/db/src/index.ts:725-735`.

**Failure scenario:** begin with a database that applied the original `0052` and
therefore has both (a) `0052_t5_reviewer_measured_edges.sql` in
`public.debateai_schema_migration` and (b) PUBLIC EXECUTE on
`core.reject_edge_mutation_except_measurement()`. Deploy `af58ac1` and invoke the
production migrator. The lookup at `packages/db/src/index.ts:731` finds the
filename and line 732 skips it, so the added revoke at `0052:135` never executes.
The content-provision login inherits PUBLIC's seventh executable core function;
`assertContentProvisionDatabaseRole` counts all executable core functions and
requires exactly the six signatures at `packages/db/src/index.ts:92-99,174-177,239`.
The isolation contract therefore remains weaker and the attestation still throws
`CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED` on that upgrade path.

**Evidence:** the base `7433be7` already contains `0052`; the production ledger is
name-only and skips applied names. Repository precedent says the same thing
explicitly in `migrations/0005_s04_rework.sql:1-2` and
`migrations/0009_s06_rework.sql:1-3`. The current T5 upgrade fixture itself calls
`0052` an upgrade transition and applies it from `0051`
(`tests/integration/t5-upgrade-migration.test.ts:5-11,36-39`), but there is no arm
starting with `0052` already recorded. The fresh-schema worker log is real but
non-discriminating here:

```text
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

**Required repair:** restore landed `0052` rather than amending it; add a new
`0053_*.sql` containing the signature-specific PUBLIC revoke. Add an upgrade-shaped
regression whose initial ledger already records the original `0052`, then apply the
forward migration and prove PUBLIC lacks EXECUTE and the content-provision witness
again sees exactly the ruled six functions. A fresh-from-empty principals run may
remain as complementary evidence, but cannot replace the upgrade arm.

### N1 — The original integration dispatch omitted a b7 failure

**Owner:** orchestrator packet/ticket. **File/line:**
`board/TINT1-integration-repair.md:1` (the “5 deterministic regressions” dispatch).

**Failure scenario:** a worker uses the dispatch as the complete b7 failure set and
interprets any other failure as newly caused or unreported noise. In the cited b7
suite, `acceptance/dual-maker-proof.test.ts > FAIR-02 ... round-trips one live call`
also failed with `CODEX_CLI_MODEL_UNRESOLVED`, but it was absent from the five-row
dispatch.

**Evidence:** `integration-suite-b7.log:39533-39544` contains the failure. This
review packet correctly calls it out after the fact at lines 29-30; the original
dispatch did not. Route a same-day packet ticket requiring complete failure sets
with explicit in-scope/out-of-scope labels.

### N2 — The reviewer packet's quoted ticket status is stale

**Owner:** orchestrator packet. **Files/lines:**
`packets/tint1-codex-r1.md:3-5` versus
`board/TINT1-integration-repair.md:4-8`.

**Failure scenario:** a seat validates the packet constant before review and sees
`waiting_review`, while the source ticket still says `ready`. That makes the board
and packet disagree about who owns the next transition and defeats the protocol's
“board is the state” rule.

**Evidence:** the packet says `(status waiting_review)`; the cited ticket says
`status: ready`. Route a same-day packet-generation/state-transition ticket.

### N3 — The packet forbids the board handoff required by the reviewer contract

**Owner:** orchestrator packet. **File/lines:**
`packets/tint1-codex-r1.md:4-8`.

**Failure scenario:** after reaching a verdict, the reviewer contract requires a
ticket comment, but the packet's `Writable surface: EXACTLY` grants only the two
agent-report files. Writing the board would cross contract; not writing it leaves
the mandatory handoff for the orchestrator.

**Evidence:** neither allowed path at packet lines 6-7 is the lane ticket. I did not
mutate the board. Route this report to the ticket and add the ticket-comment surface
to future reviewer packets when direct filing is required.

## NOTHING-WEAKENED AUDIT

**Panel and ceremony:** the zero-context `7433be7..af58ac1` diff filtered to
changed `expect`/`assert` lines produced no output. Only the review doubles changed.
`bearingsForRequest` emits one `null` per live-request edge by default
(`tests/support/reviewBearings.ts:45-50`), and production explicitly skips a null
bearing (`packages/graph/src/index.ts:214-225`), leaving the edge `UNKNOWN`. Thus
the landed panel and ceremony assertions are byte-unchanged and the new fixture
data cannot alter their propagation numbers.

**DELIM-01:** the change adds `edges: []`, an empty `edge_bearings` response, and
`{ name: "edges_sourced_by_this_node", content: "[]" }` to the exact expected
untrusted envelope (`acceptance/adversarial-corpus.test.ts:240-284`). It removes no
expected field and therefore strengthens, rather than relaxes, the assertion.

**Acceptance typecheck closure:** `tsconfig.json:26-33` now includes
`acceptance/**/*.ts`. The worker's pre-repair probe contains exactly one admitted
error, and it is the dispatched DELIM-01/T5 contract mismatch rather than an
unrelated baseline failure:

```text
acceptance/adversarial-corpus.test.ts(238,24): error TS2741: Property 'edges' is missing in type '{ runId: null; subjectItemId: string; callSiteKey: string; questionLine: string; authorMaker: string; statement: string; providerRef: string; contractHash: string; bound: { maxAttempts: number; tokenCeiling: number; deadlineMs: number; }; }' but required in type 'NodeReviewInput'.
```

The mental mutant closes: deleting `edges` from any typed `Judge.review` call in
`acceptance/` now enters the root compiler and conflicts with required
`NodeReviewInput.edges` at `packages/judgement/src/index.ts:213-220`.

**Fresh-schema revoke direction and nine-SCRAM witness:** the SQL uses
`REVOKE ALL ON FUNCTION ... FROM PUBLIC`, which removes the default function
capability on a fresh apply. The unchanged integration test asserts nine LOGINs,
nine distinct SCRAM hashes, ruled memberships, and the content-provision witness
(`tests/integration/dev-database-principals.test.ts:72-109,173-185`). Its worker log
is 9/9. B1 concerns reachability on upgrade, not the revoke statement's direction.

## STATIC LOG AND REPORT CHECKS

- Worker report hash under the specified `sed '2d'` scheme matched exactly:
  `e6d9e57d2b2f423d618c705fcfd7f67774c512870d2ce932c980f442ebb6df7d`.
- Solo RED counts matched the report: panel 2/2 failed; adversarial 2/11 failed;
  ceremony 1/2 failed; principals 1/9 failed. The corresponding worker logs show
  panel 2/2 passed, adversarial 10/11 passed with DB-01 only, ceremony 2/2 passed,
  and principals 9/9 passed.
- Combined runs each report `1 failed | 23 passed (24)`. The extracted failure-set
  files are set-identical; all three SHA-256 values are
  `8402430aeeddb696ca2137bd56fcec541680675c3bdb7fa6f4e2a6c832639ed8`.
- `paired-db01-before.txt` and `paired-db01-after.txt` both hash to
  `371d4fe1c246c8ea4a4fa7202b6cd10eba4316d73bce080aed7ed891d6a98b7c`;
  the independent `cmp` returned `cmp_exit=0`.

## NOT VERIFIED

Per packet law, I ran no tests, builds, typechecks, database processes, or live
provider calls. Runtime pass counts above are inspections of the existing worker
and b7 logs, not fresh reviewer executions. Whether a non-ephemeral environment
has recorded `0052` is CANNOT-ASSESS from the permitted static evidence; B1 does
not depend on that deployment fact because the repository's lawful migrator path
must handle an already-recorded landed migration.

Finding count: **4 total — B1; N1-N3.** Every N-finding requires a routed ticket;
none is an optional residual.

## PREDICTIONS

I predict another lens will approve after seeing the fresh 9/9 principals log and
miss the name-ledger upgrade mutant; a second may flag the duplicate bearings
helper or the acceptance-to-tests import but overlook the actual blocking
migration placement. I would check first whether its evidence starts from a
database whose ledger already contains the original `0052`; if it does not, its
migration verdict cannot discriminate B1. I also predict packet-focused lenses
will catch the stale status, but may miss that the exact writable list prevents
the contractually required board comment.
