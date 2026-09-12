# BUILD-S02-C3 case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding 1 — the case-3 predicate has two incompatible readings

**CAUSE.** `docs/missions/debate-tiers/slices/S02/PLAN.md:423-425` says one matching line contains `free`, `premium`, and `===` or `case `, while its example at `PLAN.md:426` and the packet mutant at `.hermes/planning/debate-tiers/packets/BUILD-S02-C3.md:36` contain only `if (tier === "free")`. A file-wide interpretation swept 17 legitimate comparison lines in `/new`, db, and evaluator code; the line-local interpretation matched the packet's measured zero-hit baseline.

**PRICE.** One wrong RED, two extra diagnostic runs, and 90 seconds from the first broad-scan log to the restored-green log. Token use is not exposed by this harness; the measurable transcript cost was one full failure frame listing 18 hits plus one hypothesis run.

**NEAR MISS.** I nearly converted the 17 legitimate hits into an allow-list. That would have hidden the predicate error and violated the PLAN's cards-only allow-list rule.

**DEAD END.** “The file contains both tier strings and any comparator line” is not the specified guard; it conflates UI tier decisions with model selection.

**UPGRADE.** Put executable predicate pseudocode in the packet and make the mutant line satisfy it literally, for example one line containing both tier names and the comparator. VERDICT: encode the scan predicate and the exact positive/negative fixtures in generated packets / CONFIDENCE: high / STRONGEST COUNTER: a semantic AST guard could express “selects models” more precisely, but it costs more code than this architecture test warrants.

## Finding 2 — repeated process text dominates the reading floor

**CAUSE.** The six required skill bodies, two required references, packet, and COMMON total 1,385 lines before the mission ranges and trap sections. Several laws recur in the packet, COMMON, heartbeat router, and worker contract.

**PRICE.** Ten mandatory file reads and 1,385 lines. Token use is not exposed; line count and ten read calls are the available proxies. The repetition did prevent an accidental cross-seat stage, so the cost is not zero-value.

**UPGRADE.** Keep each skill body mandatory, but generate packets with a compact, hash-stamped capability manifest and avoid restating laws already inherited from COMMON unless the packet overrides them. VERDICT: deduplicate inherited prose at packet generation / CONFIDENCE: medium / STRONGEST COUNTER: local repetition is useful when a seat loses context after compaction.

## Finding 3 — refutation evidence is mechanically repetitive

**CAUSE.** Each assertion requires a mutant, RED, restore, GREEN, neighboring mutant, cleanup, unique log, and status proof, but every seat assembles this shell choreography by hand.

**PRICE.** Four assertion cycles produced 14 targeted Vitest invocations; case 3 accounted for five because of Finding 1. Compute time was under one second per targeted run, while the tool-turn and transcript overhead was much larger. Tokens are unmeasured.

**UPGRADE.** Ship a packet-generated mutation runner that accepts create/apply/restore callbacks, writes unique capture-first logs, executes cleanup through a trap, and prints the refutation matrix plus post-restore status. VERDICT: automate evidence choreography without weakening the mutant requirement / CONFIDENCE: high / STRONGEST COUNTER: product-file mutants still need human judgment about the property boundary.

## Finding 4 — the concurrent-lane warning worked

**CAUSE.** BUILD-S02-C4's `apps/api/src/index.ts` and `tests/unit/tiers-s02-wire.test.ts` appeared and disappeared during this seat. The packet named both paths and the expected one-line effect.

**PRICE.** Several additional status reads, but zero cross-seat edits and zero foreign staged paths. Token use is unmeasured.

**UPGRADE.** Have the claim preflight snapshot sibling-owned paths and have the commit wrapper reject every staged path outside the seat allow-list. VERDICT: turn the packet's concurrency prose into an enforced staging gate / CONFIDENCE: high / STRONGEST COUNTER: path-limited commits already reduce the practical risk when used correctly.

## One-prompt-machine proposal

A single seat bootstrap command should: verify ticket/branch/base; read and checksum mandatory skills; fetch comments and post CLAIM with the session id; materialize the allow-list and sibling deny-list; generate capture-first test/refutation runners; reject foreign staged paths; assemble the three-run table; and draft the eight-line READY body from immutable logs. Human judgment remains at property definition, mutant choice, unexpected-hit classification, and findings.

VERDICT: automate deterministic protocol mechanics and reserve model context for code/property reasoning / CONFIDENCE: high / STRONGEST COUNTER: an over-centralized bootstrap can become another silent gate, so it must be pressure-tested on known-good, known-bad, missing-file, inherited-red, and concurrent-dirty fixtures.
