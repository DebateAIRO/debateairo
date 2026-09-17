# BUILD-S01-C1 case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding 1 — the step boundary could not satisfy its own intermediate gate

CAUSE: S01-3 creates `plan-tiers.ts`, but its done condition requires the barrel-importing R11 case to pass before S01-4 re-exports that module (`docs/missions/debate-tiers/slices/S01/PLAN.md:226-236`). S01-4 also requires `index.ts` to gain only two physical lines, although `PlanTierSchema` needs both a local import binding and a public re-export. The resulting standards-compliant but unusual compromise is two statements on `packages/contract/src/index.ts:3`.

PRICE: about four minutes of constraint reconciliation, one corrective edit after checking the diff statistic, and several thousand reasoning tokens by estimate; exact token telemetry is unavailable to this seat. No suite retry was hidden.

NEAR MISS: I nearly added a conventional third import line and silently violated the packet's explicit `2 insertions, 0 deletions` gate. DEAD END: expecting `export * from "./plan-tiers.js"` to create a local JavaScript binding; it does not.

UPGRADE: represent each step as an executable snapshot with its expected import surface, and validate TypeScript bindings rather than physical line counts. VERDICT: adopt / CONFIDENCE: high / STRONGEST COUNTER: snapshot execution makes architecture packets more expensive to author.

## Finding 2 — response-body equality was underspecified

CAUSE: S01-6 writes the malformed body as `{ error: "MALFORMED_REQUEST" }` (`docs/missions/debate-tiers/slices/S01/PLAN.md:242-251`) without saying exact object or subset. The real response also carries a diagnostic `message`; an initial exact assertion failed before the intended optional-schema mutant. The corrected assertions at `tests/unit/api.test.ts:279-286` use subset matching.

PRICE: one unintended RED, one diagnosis/edit/rerun, about one minute, and one test-tool round trip. Token count is UNMEASURED.

NEAR MISS: I nearly recorded the diagnostic-field mismatch as the required S01-6 RED. DEAD END: exact-object equality for a requirement that names only one response member.

UPGRADE: packets should label JSON examples `EXACT` or `CONTAINS`, mechanically. VERDICT: adopt / CONFIDENCE: high / STRONGEST COUNTER: exactness is sometimes obvious from the surrounding API convention, but it was not here.

## Finding 3 — the thirteen-member count changes before S01-8

CAUSE: the dispatch fact is correctly 13 pre-existing `steering_annotations` markers, but S01-2 and S01-6 add two tierless validation templates before S01-8 (`tests/unit/contract.test.ts:99-120`, `tests/unit/api.test.ts:250-287`). Therefore the mandated `/usr/bin/grep` script measures 15 at S01-8 even though the migration set remains exactly the original 13.

PRICE: one scratch counter, one member-by-member line audit, about three minutes, zero product retries. Token count is UNMEASURED.

NEAR MISS: I nearly treated all 15 markers as migration members, which would have destroyed the two omission tests. DEAD END: using a raw mutable line count as both a base fact and a later membership oracle.

UPGRADE: give every migration member a stable case id in a machine-readable list, and state which newly added negative fixtures are excluded. VERDICT: adopt / CONFIDENCE: high / STRONGEST COUNTER: ids add small maintenance overhead when tests move.

## Finding 4 — the inherited S7 source-region check is vacuous under reversed markers

CAUSE: `tests/architecture/s7-authorization-contract.test.ts:180-183` calls `slice(start, end)` without proving `end > start`. Reversing `AskRequestSchema` and `AskRequest` left that suite at the identical inherited `5 passed / 1 failed` pair, so the negative field assertions still passed on an empty string. This cluster now pins marker existence, uniqueness, and order at `tests/architecture/tier01-roster.test.ts:54-61`; the original unsafe region helper remains out of this seat's write contract.

PRICE: one inversion mutant, two suite runs, about two minutes. Token count is UNMEASURED. The class sweep beyond the packet-authorized lines is UNVERIFIED.

NEAR MISS: I nearly accepted the unchanged 5/1 pair as proof of S01-11. DEAD END: a baseline pair cannot establish that the particular source region remains non-empty.

UPGRADE: every source-region helper should fail on missing, duplicate, or reversed markers before content assertions run. VERDICT: adopt and ticket the class sweep / CONFIDENCE: high / STRONGEST COUNTER: source-text guards remain brittle even after their bounds are defended.

## Finding 5 — mutation duties need a generated evidence ledger

CAUSE: the worker contract says “per assertion” (`.claude/skills/heartbeat-worker/SKILL.md:29-33`), while the seat packet asks for at least one mutant per GREEN step (`.hermes/planning/debate-tiers/packets/BUILD-S01-C1.md:29`). The seat followed the packet's step-level instruction and manually tracked eight caught mutants, neighboring non-catches, restores, and status prints.

PRICE: roughly twenty targeted test invocations plus restore checks, about eight minutes. The exact token cost is unavailable; repeated command/output ingestion was the largest visible token consumer.

NEAR MISS: I nearly treated one optional-schema mutant as evidence for every schema assertion without naming the narrower properties. DEAD END: reconstructing the mutation ledger from terminal history at handoff time.

UPGRADE: the packet generator should emit a property/mutant/target-suite matrix and a receipt script that records RED, restore, GREEN, neighboring result, and status per row. VERDICT: adopt / CONFIDENCE: high / STRONGEST COUNTER: automated mutants can encourage mechanical checks that miss semantic neighbors.

## One-prompt machine recommendation

Ship the seat packet as both Markdown and a checked manifest containing: exact read ranges, exhaustive write paths, ordered TDD actions, stable fixture ids, expected RED signatures, exact-versus-subset response semantics, mutation pairs, runner text, and the eight-line handoff schema. A preflight should reject impossible intermediate gates and unbound identifiers before dispatch. A single receipt process should execute the manifest, stop on the first wrong frame, preserve verbatim output, build the three-run table, validate the staged path set, and draft the report/handoff without posting status mutations.

VERDICT: build the manifest/receipt layer / CONFIDENCE: high / STRONGEST COUNTER: the manifest becomes another source of truth unless generated from the frozen plan and verified against it.
