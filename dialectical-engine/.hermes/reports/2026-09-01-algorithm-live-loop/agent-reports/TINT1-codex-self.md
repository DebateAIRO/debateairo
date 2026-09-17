## r1

### Case finding: the fresh-database green concealed the upgrade-path failure

CAUSE: the repair was placed inside landed migration `0052`, while the production
migrator records migration filenames and skips a name already in
`public.debateai_schema_migration`. The fresh dev-principals fixture reapplied the
edited file and reached 9/9, but a database that already recorded the original
`0052` never executes the added revoke. Existing repository precedent in `0005`
and `0009` explicitly uses a forward rework migration for this reason.

PRICE: about 12 minutes of static tracing across the migration, migrator, upgrade
fixture, privilege witness, and earlier forward-migration precedents. If missed,
it would cost at least one post-merge failure and another full repair/review round;
on a persistent database it would also leave an unintended PUBLIC capability in
place indefinitely.

UPGRADE: every integration-repair packet touching a numbered migration should say
whether that migration is already landed and quote the migrator's replay policy.
A standard mental mutant should be mandatory: “the ledger already contains this
filename; deploy the new tree; does the repair execute?”

### Packet defects and friction

CAUSE: the reviewer packet says `waiting_review`, but the cited ticket still says
`ready`. It also grants exactly two report files while the reviewer contract
requires a ticket comment. The original worker dispatch named five regressions but
the cited b7 suite also contains the FAIR-02 `CODEX_CLI_MODEL_UNRESOLVED` failure.

PRICE: roughly 5 minutes and one extra classification pass to distinguish worker
findings from orchestrator findings; the absent board authorization prevents the
reviewer from completing the role contract's board handoff directly.

UPGRADE: generate packets from the board's current YAML, include the complete
failing set with explicit in-scope/out-of-scope labels, and include the ticket path
in `allowed` when a board comment is mandatory.

### What I nearly got wrong

I nearly treated the fresh `green-5-principals.log` (9/9) as sufficient proof of
the privilege repair. The decisive counterexample was not another fresh run; it
was the migrator branch at `packages/db/src/index.ts:731-733`, which skips `0052`
by name. I also initially saw the passing FAIR-02 stale-register test near the
first b7 match; the actual omitted failure is the separate live dual-maker arm at
the end of the suite.

### Dead ends and token cost

A repository-wide migration-ledger search included historical review transcripts
and returned an enormous noisy result. Restricting immediately to
`packages/db/src/index.ts`, `tests/integration/*upgrade-migration.test.ts`, and the
first lines of known rework migrations would have produced the controlling proof
in one pass. Likewise, dumping large assertion contexts was unnecessary: a
zero-context diff filtered to changed `expect`/`assert` lines proved the
nothing-weakened source claim more cheaply.

### One-prompt-machine improvement

Have the dispatcher precompute four immutable facts in every repair packet:
`base..tip` changed assertion lines, migration-ledger semantics for every touched
migration, exact hashes of repeated failure-name sets, and the board status plus
writable ticket path. That turns the review into verification of prepared facts
instead of rediscovery, while preserving an explicit failure-direction mutant for
each claim.

## r2

### Case finding: the repair was sound; the proof protocol was the dangerous part

CAUSE: r1's product defect is closed by a forward `0054`, but the resume packet tried
to prove restoration of `0052` with a command whose success criterion was silence.
From `dialectical-engine/`, its worktree-root-relative pathspec matches nothing; both
plain `git diff` and `git diff --exit-code` then print nothing and exit 0. The same
transcript can therefore mean either “byte-identical” or “not inspected.”

PRICE: one extra static proof pass across the base tree, HEAD tree, and worktree, plus
packet adjudication. No runtime retry was needed. Had the worker's independent hashes
not caught the ambiguity, an amended landed migration could have been approved and
the upgrade exposure would have survived another round.

UPGRADE: identity claims need an existence witness and two content witnesses. Here the
base and HEAD `ls-tree` records both name blob `cedfd8f5…`; base, HEAD, and worktree
SHA-256 are all `8bac8db7…`; `cmp` and the correctly rooted diff both return 0. The
orchestrator has already converted this into F32b in `TOOLING-TRAPS`, and the r2 review
packet uses that stronger criterion.

### What I nearly got wrong

I nearly treated “the replay defect is gone” as false because the fixture still runs
the current migrations through `0052`. The discriminating premise is no longer derived
from that replay, however: `seedTheDeployedExposure` explicitly grants PUBLIC EXECUTE
afterward. If somebody amends `0052` to revoke again, the explicit grant restores the
deployed pre-upgrade state; if they remove the function, the fixture fails loudly. The
property under review is therefore independent of the current `0052` privilege bytes.

I also nearly carried r1's generic reviewer-contract complaint forward. The higher
mission instruction says seats never edit board files and the orchestrator mirrors the
marker. The current packet's exactly-two-file surface is therefore correct, not a repeat
packet defect.

### Mutants and equivalence

Mutant A kills the primary upgrade arm on the privilege value (`expected true to be
false`), even though the separate idempotence arm also reports the deliberately absent
file. Mutant C leaves arms 1–2 green and is caught only by the trigger-survival arm.
Mutant D stays green because, for this function, `REVOKE EXECUTE` and `REVOKE ALL` remove
the same available privilege from PUBLIC. Rejecting D would pin statement spelling, not
the security property.

### Dead ends and token cost

A broad log grep matched hundreds of repeated `stdout | <full test name>` lines and
truncated the useful tail. Anchoring on Vitest's summary and failure prefixes reduced
four large database logs to the discriminating lines. Likewise, reading cluster logs
for counts was inferior to hashing the one-line extracted failure sets and then opening
the sole payload frame.

### One-prompt-machine improvement

Make every static-review packet carry a machine-readable proof manifest: base/HEAD blob
IDs for claimed-restored files, independent content hashes, exact log-summary regexes,
failure-set hashes, and the command or tree mutation that produced each mutant log.
This packet had almost all the ingredients, but the logs themselves do not bind their
runtime output to the claimed temporary tree. A redacted mutation transcript beside
each log would let a static reviewer establish provenance without rerunning anything.
