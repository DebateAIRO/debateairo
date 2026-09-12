# FIX-S02-p2-residue case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Disposition

The seat began at 13:44:26 EEST on `slice/tiers-s02` at `88f8a01f`, with zero dirty paths. By 14:04 EEST the five product/test paths were implemented and the twelve required repeated cluster runs had completed. Exact billed tokens are UNVERIFIED because the session exposes no billing counter.

## Finding 1 — assertion nouns and assertion shapes drifted apart

CAUSE: the single-missing refusal case asserted only its model id even though R7 names both tier and every missing member; the canonical-declaration case converted a line list into a file set and thereby stopped counting duplicates inside an allowed file; the R2 scanner required the canonical symbol inside a branch even when a local alias selected the same roster. In all three, the prose named a relationship while the executable assertion retained only one visible token from that relationship.

PRICE: five supplied mutant cells (M2b, MDUP, MDUP2, M20, M21) were run before and after the fix, plus two neighboring-negative cells. Compute time was about 30 seconds; the evidence required roughly ten tool turns and five byte/status restore checks. Token cost is UNVERIFIED.

NEAR MISS: a file-wide alias predicate would have treated any tier conditional in a file containing any roster alias as a violation. The scanner instead collects direct local identifiers initialized from `PLAN_TIER_ROSTERS` and checks only bounded branch bodies and ternary statements for those identifiers.

DEAD END: none in the implementation. The supplied product mutant runner did not contain MDUP2, so that cell could not be obtained by invoking it and had to be reconstructed from the reviewer artifact.

UPGRADE: compile each requirement noun into an explicit assertion shape: file set, occurrence count, bounded control-flow relation, or runtime value. Every shape carries one positive mutant and one neighboring negative. VERDICT: make noun-to-assertion-shape a required packet field / CONFIDENCE high / STRONGEST COUNTER: source scanners remain approximations without a stable TypeScript compiler API, but explicit bounded relationships still prevent the known literal-token regressions.

## Finding 2 — the exported boundary performed work and reflected unvalidated input

CAUSE: `evaluateAskAdmission` resolved the discovered panel before checking the tier vocabulary, then interpolated the unvalidated value into an asker-visible refusal. The strict HTTP route hid both facts, so route-only verification could not expose the exported function's cost or copy.

PRICE: one TDD run produced three expected admission failures; the promoted boundary probe changed from 7/7 recording the defects to 2 failed and 5 passed after the fix because its two old-state assertions are intentionally immutable. Implementation was two moved lines plus fixed copy and took under two minutes.

NEAR MISS: moving the tier guard before risk resolution would have widened the requested behavior. The packet requires refuse-before-panel-work, so risk resolution remains in its established position and only panel/envelope counters change to `{ panel: 0, envelope: 0 }`.

DEAD END: none.

UPGRADE: exported functions need direct boundary tests with dependency counters even when their current route validates first. VERDICT: pair strict-route tests with exported-function effect counters / CONFIDENCE high / STRONGEST COUNTER: direct callers may be discouraged, but the symbol is exported today and future callers can bypass the route.

## Finding 3 — the reachable 400 finding omitted an existing test

CAUSE: product N3 searched four S02-named files and concluded that `MALFORMED_REQUEST` was unpinned, but `tests/unit/api.test.ts` already had the R14 route case at the reviewed head: invalid `gold` and absent tiers both assert 400 plus `MALFORMED_REQUEST`. The packet nevertheless repeated the stronger claim.

PRICE: no production change was needed for the HTTP face. One dedicated S02 admission case and one schema-bypass mutant made the route property locally visible; that added one test and about two seconds of test compute.

NEAR MISS: treating the existing 400 case as a reason to do nothing would have left the synthetic 422 test mislabeled as an HTTP product face. It is now labeled as an injected exported-application boundary, and the dedicated real-route case proves the application callback is not reached.

DEAD END: the first command used to inspect `cards.ts` and two later verification commands carried malformed working-directory strings; all were rejected before executing and cost three retries, under one minute total.

UPGRADE: finding generation should search every suite in the cluster command before claiming absence, and attach the exact grep inventory to the finding. VERDICT: absence claims require the cluster-wide search receipt / CONFIDENCE high / STRONGEST COUNTER: the older R14 case grouped four outcomes and its name did not foreground this property, which justifies a dedicated case but not the claim that no pin existed.

## Finding 4 — the half-deploy compatibility branch was silent because capability stayed inside SQL

CAUSE: the encrypted writer computed function capability only inside a SQL `CASE`, so TypeScript received only `created` and could not know whether `planTier` had been stripped. The DB layer has no logger abstraction; its measured logging shape is direct console output with a bracketed diagnostic code at `packages/db/src/index.ts:714,775`.

PRICE: the query now returns one additional capability boolean from the same statement; one unit case drives the real `RunRepository` over fake external boundaries, one deletion mutant proves the warning assertion bites, and C1 ran three times against embedded PostgreSQL. The promoted half-applied fixture took about five seconds and emitted exactly one warning in Cell A.

NEAR MISS: logging before the function call would have warned even when run creation failed. The warning is emitted only when `created === true`, capability is false, and a tier was supplied.

DEAD END: the first pre-0061 runner call outlived the tool's initial output window; the process remained healthy and was reconciled through its process id and capture log rather than restarted. One result-extraction grep also placed `-E` after an unintended `-`, producing a false count until the already-captured log was filtered correctly. The first final restore loop named its iterator `path`, which is zsh's command-search array, and named another variable `status`, which is read-only; the shell rejected the proof before any write, and the rerun used `target`/`state_line` plus absolute `/usr/bin` tools.

UPGRADE: capability-fallback branches should return the chosen capability bit alongside their outcome so observability can distinguish a successful degraded write from an ordinary success. VERDICT: make degraded-success state an explicit query result / CONFIDENCE high / STRONGEST COUNTER: console warnings are operationally weak without collection, but the packet explicitly defaults to a warning and adding a logging dependency is outside this slice.

## Packet clarity and deterministic cost

Two packet statements were not true of the promoted-probe inventory. Charge 2 says the product mutant script carries M2b, MDUP and MDUP2, but the 60-line script contains only M2b and MDUP. Charge 4 describes two shell runners, one mutant script and two TypeScript fixtures, while the actual `REV-S02-p2-*` inventory is four `.sh` files and three `.test.ts` files. The seat followed the stronger executable instruction and ran every prefixed probe; MDUP2 was reconstructed from the reviewer artifact.

The reading floor consumed the largest context block: 4,505 lines across five writable source/test files, plus packet, COMMON, seven skills, three skill references/additions, decisions, oracle, review ranges, probes and predecessor records. Full-file reads are useful for coupled effects, but deterministic pagination and checksum receipts should be performed by the launcher rather than narrated into model context.

VERDICT: generate a typed probe inventory and hashed read manifest from disk at dispatch time / CONFIDENCE high / STRONGEST COUNTER: runtime files can change after dispatch, so the seat must still re-check the manifest against its claimed HEAD.

## One-prompt machine route

Compile the ticket into one executable manifest containing: branch and immutable head; comment cursor; ordered skill files and references; paginated read hashes; commit-allowed and temporary-mutant paths; exact probe inventory; per-finding property, target mutant, neighboring negative and expected pre/post frames; restore status-before/status-after equality; cluster commands and inherited failures; typecheck path filter; report schema; allowed staging paths; and READY renderer. The launcher should reject any mismatch as `BROKEN`, preserve every full log, and extract only failure names and summary frames.

VERDICT: make the packet and runner two renderings of one typed manifest / CONFIDENCE high / STRONGEST COUNTER: mutant quality and class boundaries require human judgment, so the manifest should automate execution and evidence rather than select the property.
