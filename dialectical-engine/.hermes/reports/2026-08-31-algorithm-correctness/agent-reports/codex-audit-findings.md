READY FOR PEER REVIEW — codex-audit r1 · comments read through: packet-v2-2026-09-01
# CODEX AUDIT — dev@1c9578a
## VERDICTS

### C1 — FALSE
EVIDENCE: `apps/ui/app/new/page.tsx:74-81` requires `depth >= 1 && depth <= 5`, and `apps/ui/app/new/page.tsx:189-196` renders only `[1, 2, 3, 4, 5]`. The runner independently rejects anything outside 1–5 at `apps/runner/src/index.ts:986-995`. Blame/history shows the UI has used a bounded selector since depth was introduced, so this is not merely a moved old behavior.
CONFIDENCE: high
STRONGEST COUNTER: A caller can bypass the HTML control and send arbitrary JSON, but that is the API surface, not what the web form accepts; the runner still rejects the value.

### C2 — TRUE-TODAY
EVIDENCE: `packages/contract/src/index.ts:107-118` uses trimmed nonempty strings, closed enums, `z.iso.datetime()`, and a top-level `.strict()` object; `apps/api/src/index.ts:863-874` parses that schema before submission. `apps/api/src/index.ts:1247-1255` records and starts the run with `ask.question_line` itself.
CONFIDENCE: high
STRONGEST COUNTER: Zod trimming and the UI's own submit-time trimming mean byte-for-byte whitespace is rewritten; the true statement is that no semantic rewrite occurs.

### C3 — PARTLY
EVIDENCE: Effective risk can be raised by deployment policy at `packages/register/src/index.ts:415-447`; ask admission freezes fresh healthy discovery results at `apps/api/src/provider-discovery.ts:127-153` and runs before `startRun` at `apps/api/src/index.ts:1152-1187,1241-1251`. However, `packages/critique/src/index.ts:328-340` admits every nonempty panel regardless of risk, explicitly saying high-stakes mono answers are capped, never refused. The ceiling at `packages/register/src/index.ts:178-199` derives tree/authored/review/composition attempts, but its arithmetic is a sum of bounded terms, not the literal product claimed.
CONFIDENCE: high
STRONGEST COUNTER: Risk is still passed into `assertMakerAdmission` and appears in its refusal message; that does not make the current one-maker threshold risk-specific.

### C4 — TRUE-TODAY
EVIDENCE: `apps/api/src/index.ts:1267-1272` stores steering in `askContract`; the complete `readFrozenHead()` projection at `packages/db/src/index.ts:1434-1487` has no ask-contract or steering field. Author prompts consume only the supplied question text at `packages/judgement/src/index.ts:120-149`, and the runner has no steering read.
CONFIDENCE: high
STRONGEST COUNTER: The encrypted run record retains the ask contract for later use; the claim is about today's runner path, where it remains inert.

### C5 — TRUE-TODAY
EVIDENCE: `packages/battery/src/index.ts:278-290` inserts a `READY` item and makes `command_key` idempotent with `ON CONFLICT`; `apps/api/src/index.ts:1292-1299` supplies `S00:${runId}:Q1`, dispatches, then returns `QUEUED`. `apps/api/src/index.ts:1099-1118` uses Hatchet `runNoWait`, and `apps/api/src/index.ts:863-874` returns HTTP 202.
CONFIDENCE: high
STRONGEST COUNTER: The API awaits successful workflow dispatch before returning 202, but `runNoWait` does not await debate execution or an answer.

### C6 — STALE
EVIDENCE: The preflight still enforces claim/deadline coherence and required composition, judgement, serve, and multi-maker scoring settings at `apps/runner/src/index.ts:1223-1268`. Today `apps/runner/src/main.ts:72-100` supplies all of them, including terminal activation, so it no longer stops for the claimed omissions. The values come from `readDevelopmentRunnerPolicy` at `apps/runner/src/main.ts:41`; `apps/runner/src/dev-runner-policy.ts:91-118` rejects any non-development provenance, whose refs are explicitly `DEV-01-local-auth-topology.md#ordered-bootstrap:DEV-05` and `DEV-12D-development-runner-policy.md#sealed-v2` at `apps/runner/src/dev-deployment-register.ts:23-26`. This is a database-loaded development stub, not a production-grade sealed source. Git parent `2d1f86b8^` shows the old main ended with only `compositionRow`, making the source claim plausibly true before the wiring moved.
CONFIDENCE: high
STRONGEST COUNTER: The file is still named the production entry and can boot; its policy loader and accepted provenance are nevertheless explicitly development-only.

### C7 — TRUE-TODAY
EVIDENCE: `apps/runner/src/index.ts:1357-1422` resolves ask-time identities against configured gateways, optionally probes them, rejects changed model identity, and refuses if none remain. Roots are authored at `apps/runner/src/index.ts:1731-1779`; expansion is empty for one maker and uses the tree plan only for multiple makers at `apps/runner/src/index.ts:1839-1843`; cross-root exchanges follow at `apps/runner/src/index.ts:1900-1941`.
CONFIDENCE: high
STRONGEST COUNTER: `apps/runner/src/main.ts` does not supply `claimTimeProbe`, so today's boot path revalidates configuration identity but does not perform the optional live probe.

### C8 — TRUE-TODAY
EVIDENCE: The one strict artifact schema combines `statement` and all assessment fields at `packages/judgement/src/index.ts:26-35`, and one call parses and returns both at `packages/judgement/src/index.ts:120-210`. Root and child selection each receive a singleton array at `apps/runner/src/index.ts:1497-1510,1641-1654`.
CONFIDENCE: high
STRONGEST COUNTER: A different-maker review is called later, but it neither authors the node nor supplies a competing reduced judgement.

### C9 — TRUE-TODAY
EVIDENCE: `packages/judgement/src/index.ts:44-54` serializes named fields into `debateai.untrusted-prompt-fields.v1` and instructs the model to treat every content value as data; the author call places the question in that envelope at `packages/judgement/src/index.ts:142-149`.
CONFIDENCE: high
STRONGEST COUNTER: The wrapper is prompt-level isolation, not a hard security boundary against a model ignoring instructions.

### C10 — TRUE-TODAY
EVIDENCE: Call bounds are max attempts, token ceiling, and deadline at `packages/providers/src/index.ts:9-13`; the gateway enforces them and hashes/persists request and raw response metadata at `packages/providers/src/index.ts:308-396`. Parse/schema failures append failed ledger entries and build a repair packet at `packages/providers/src/index.ts:399-433` and `packages/judgement/src/index.ts:56-62`; transport failures persist typed `FAILED`/`TIMED_OUT` outcomes at `packages/providers/src/index.ts:461-498`. Optional cooldown and final retry are implemented at `apps/runner/src/index.ts:180-267`.
CONFIDENCE: high
STRONGEST COUNTER: A transport failure before an HTTP response has no raw HTTP artifact to persist, so its ledger entry lawfully carries a null raw-artifact ref.

### C11 — TRUE-TODAY
EVIDENCE: The original-text regex classifier and closed types are at `packages/judgement/src/s04.ts:44-71`; model adoption is limited to unknown classifications at `packages/judgement/src/s04.ts:74-82`. Judge resolution uses its classification line at `packages/judgement/src/index.ts:120-123,183-190`, while every child passes `claimClassificationLine: run.questionLine` at `apps/runner/src/index.ts:1630-1636` even though its reducer uses the child's normalized claim type at `apps/runner/src/index.ts:1641-1645`.
CONFIDENCE: high
STRONGEST COUNTER: Child nodes store their returned normalized type, but the code-first frame used to reach that type still comes from the original question.

### C12 — TRUE-TODAY
EVIDENCE: `packages/judgement/src/s04.ts:173-220` constructs exactly the seven claimed metrics, applies coefficients, clamps tau, applies matching fatal caps, and emits fatal/ambiguity drivers and fatal holes. Register row/cell validation is typed at `packages/register/src/index.ts:33-109`; a missing claim-type entry becomes unavailable and the runner loudly throws at `apps/runner/src/index.ts:1497-1505`.
CONFIDENCE: high
STRONGEST COUNTER: The reducer first returns `UNAVAILABLE` for a missing claim-type cell rather than throwing itself; the caller converts it to the loud failure.

### C13 — TRUE-TODAY
EVIDENCE: `packages/judgement/src/s04.ts:297-311` computes `selectionScore = tau * effectiveWeight` and explicitly returns the original tau; `apps/runner/src/index.ts:2006-2020` records the selection score in propagation provenance.
CONFIDENCE: high
STRONGEST COUNTER: Because the runner supplies exactly one candidate, earned weight cannot currently change which judgement wins.

### C14 — TRUE-TODAY
EVIDENCE: `packages/judgement/src/index.ts:192-200` preserves `LOOKED_UP` only when locator is non-null and otherwise returns `REASONING`; this necessarily collapses both `RAN` and locator-less `LOOKED_UP`.
CONFIDENCE: high
STRONGEST COUNTER: The input schema still declares `RAN` at `packages/judgement/src/index.ts:26-29`, so callers may reasonably mistake it for an output-preserved value.

### C15 — PARTLY
EVIDENCE: The multi-maker planner is breadth-first, emits support then attack, and rotates `(rootIndex + round) % effectiveMakerCount` at `apps/runner/src/index.ts:998-1030`; prompts request the strongest support/counter at `apps/runner/src/index.ts:1863-1877`. A failed leg marks every planned descendant halted at `apps/runner/src/index.ts:1844-1897`. The count formula is correct only for an unhindered multi-maker materialization: the code explicitly creates no expansion for one maker at `apps/runner/src/index.ts:1841-1843`, and any halted branch lowers the actual node count.
CONFIDENCE: high
STRONGEST COUNTER: Read as a nominal maximum for M>=2 with successful calls, the stated formula follows directly from the planner plus M(M−1) exchanges.

### C16 — PARTLY
EVIDENCE: `apps/runner/src/index.ts:1033-1042` plans exactly one leg for every ordered pair of distinct roots, and successful legs create support-own/attack-other edges at `apps/runner/src/index.ts:1900-1932`. But `apps/runner/src/index.ts:1934-1938` records a halted exchange without creating a response node, so “exactly one response node” is not an unconditional runtime invariant.
CONFIDENCE: high
STRONGEST COUNTER: The planner always schedules exactly one attempt per ordered pair; the defect is only the claim's conflation of planned and materialized nodes.

### C17 — TRUE-TODAY
EVIDENCE: Generated edges use `strength: null`, `magnitudeStatus: "UNKNOWN"`, and `strengthSource: "EVIDENCE_VERIFIER"` at `apps/runner/src/index.ts:1679-1693`. `packages/graph/src/index.ts:281-350` only inserts an edge or rejects a conflicting identity; it has no magnitude-update path. The shipped-source sentinel at `tests/unit/dr184-judged-standing.test.ts:85-105` scans apps, packages, and acceptance and requires no `MEASURED` writer.
CONFIDENCE: high
STRONGEST COUNTER: The graph types and fixtures can represent measured edges; the evidence shows no live shipped producer upgrades these generated edges.

### C18 — PARTLY
EVIDENCE: Reviewer selection excludes the author at `apps/runner/src/index.ts:116-129`, and review output is the three-value enum at `packages/judgement/src/index.ts:37-40`. Standing reads every review row without filtering outcome at `packages/judgement/src/index.ts:407-416`; no outcome is fed into tau, edges, polarity, propagation, or verdict. However, evaluator profiling does numericize the same outcomes—agree=1, dispute=0, cannot-assess=null—at `packages/evaluator/src/index.ts:2476-2480`, so “changes NOTHING numeric” is too broad.
CONFIDENCE: high
STRONGEST COUNTER: The evaluator number is out-of-band from this run's verdict pipeline, so the narrower parenthetical assertion about tau/edge/polarity/verdict remains true.

### C19 — TRUE-TODAY
EVIDENCE: `apps/runner/src/index.ts:299-375` seeds basis sets with directly reviewed nodes, repeatedly unions child and incoming-edge source bases until stable, removes zero-basis nodes from the snapshot, and returns those IDs for `HIDDEN-UNJUDGEABLE`; the runner applies it at `apps/runner/src/index.ts:1978-1986`.
CONFIDENCE: high
STRONGEST COUNTER: Mono-maker runs special-case every materialized node as reviewed at `apps/runner/src/index.ts:1978-1980`, so their basis is synthetic rather than review-row-backed.

### C20 — TRUE-TODAY
EVIDENCE: Contribution multiplication, UNKNOWN skipping, strict support-conjunct withholding, support aggregation, and final sigma are at `packages/propagation/src/index.ts:396-455`; withheld targets are recorded at `packages/propagation/src/index.ts:580-585`. The published arithmetic gives probabilistic aggregation and the exact piecewise sigma at `packages/published-arithmetic/src/index.ts:1-13`.
CONFIDENCE: high
STRONGEST COUNTER: Today's main can load only literal `accumulate` because `apps/runner/src/dev-runner-policy.ts:59-65` rejects `strict-and`; strict withholding is a live engine capability but not reachable through that current boot policy.

### C21 — TRUE-TODAY
EVIDENCE: The declared rule and implementation return array element zero at `apps/runner/src/index.ts:934-944`; the runner filters only for propagated eligibility and then calls it at `apps/runner/src/index.ts:1987-2000`. Low-score rows become condition marks with `excludedFromServedNumber: false` at `apps/runner/src/index.ts:2172-2186`.
CONFIDENCE: high
STRONGEST COUNTER: “Configured-provider order” means the first still-eligible authored root after standing exclusion, not necessarily the originally configured first provider if its root vanished.

### C22 — TRUE-TODAY
EVIDENCE: `apps/runner/src/index.ts:2082-2095` builds facts from only `servedRoot.statement`, an empty residual-objection array, and `servedRoot.reversalPoint`; `apps/runner/src/index.ts:963-983` projects exactly that selected root into the serve node set.
CONFIDENCE: high
STRONGEST COUNTER: Condition marks and memory disclosure also cross into composition metadata, but no other debate statement, branch, or root enters the fact array.

### C23 — PARTLY
EVIDENCE: `apps/runner/src/index.ts:2277-2287` supplies only the symbolic `number:final-strength`, not its value, and prompts preservation/no-new-facts; the strict schema caps segments at two at `apps/runner/src/index.ts:87-94`. Unknown node refs are rejected at `apps/runner/src/index.ts:2303-2317`, but served-number refs are copied without checking membership. `packages/serve/src/index.ts:483-510` checks node membership and conformance routing, not fact equality or number-ref membership. Thus parts of “must” are prompt/conformance requests rather than deterministic enforcement.
CONFIDENCE: high
STRONGEST COUNTER: The separate conformance model sees the frozen fact bundle and may reject invented facts or citations, but it is not a code-enforced reference whitelist.

### C24 — TRUE-TODAY
EVIDENCE: `packages/serve/src/index.ts:443-478` gates load-bearing R9, residual objections, exact max-recompose=2, and composition budget; the runner measures `Buffer.byteLength(JSON.stringify(facts), "utf8")` at `apps/runner/src/index.ts:2274-2276`. `packages/serve/src/index.ts:370-411` keeps `ENVELOPE_EXHAUSTED` distinct from `DEFECT`; `packages/serve/src/index.ts:480-523` allows two total composition attempts then returns components-only, and `packages/serve/src/index.ts:553-558` applies post-compose R9.
CONFIDENCE: high
STRONGEST COUNTER: Ordinary byte-budget excess is a `DEFECT` components-only result; `ENVELOPE_EXHAUSTED` is reserved for the separate run-cost envelope, exactly as the claim distinguishes.

### C25 — PARTLY
EVIDENCE: `packages/serve/src/index.ts:225-272` sums way-of-knowing counts, compares their shares to register cuts, and never accepts a numeric strength. The actual load-bearing counts are built at `packages/serve/src/index.ts:559-568`. But `apps/runner/src/index.ts:1100-1111,2271-2273` lowers a mono-maker candidate to the band immediately below the candidate, then applies the register ceiling; it does not calculate “one step below the ceiling.”
CONFIDENCE: high
STRONGEST COUNTER: If “below the ceiling” meant only “using the ceiling row's band ordering,” the source may have intended this implementation; that is not the ordinary meaning of the claimed arithmetic.

### C26 — TRUE-TODAY
EVIDENCE: `packages/serve/src/index.ts:662-667` can derive only `SUPPORTED` or null; its usable basis is exactly served-number-present plus terminal `SERVED`/`DOWNGRADED` at `packages/serve/src/index.ts:1007-1012`. The contract still declares `SUPPORTED`, `CONTESTED`, and `UNSUPPORTED` at `packages/contract/src/index.ts:479-490`. Answer, served number, number event, and terminal event share the transaction opened at `packages/serve/src/index.ts:1031-1045` and written through `packages/serve/src/index.ts:1111-1225`. The UI consumes streamed events and refreshes on `run.terminal` at `apps/ui/app/debate/[id]/DebatePageClient.tsx:120-154`.
CONFIDENCE: high
STRONGEST COUNTER: Catch-up versions preserve the prior verdict rather than rederive it (`packages/serve/src/index.ts:1126,1148-1154`), but the initial derivation has only the two claimed outcomes.

## MISSED BY THE SOURCE

1. Startup redispatch · WHERE `apps/runner/src/runner-startup-reconciliation.ts:21-33`, `apps/runner/src/main.ts:123-148` · WHY IT MATTERS: after the worker is ready, up to 100 READY or expired-CLAIMED work items are redispatched; backlog saturation or one dispatch failure aborts startup rather than silently stranding work.
2. Concurrent discovery coalescing · WHERE `apps/api/src/provider-discovery.ts:155-165` · WHY IT MATTERS: simultaneous asks share one in-flight discovery promise, avoiding duplicate provider probes and inconsistent same-moment frozen panels.
3. Owner-scoped admission isolation · WHERE `apps/api/src/index.ts:1196-1212,1244-1275` · WHY IT MATTERS: server and legacy admission use separate pools plus an owner lease, bounding concurrent private-history admission races before run creation.
4. Catch-up monotonicity · WHERE `apps/runner/src/index.ts:473-584` · WHY IT MATTERS: later reviews may create a new answer version only if the terminal does not downgrade and the served number does not move; otherwise the catch-up is explicitly refused.
5. Graph cycle rejection · WHERE `packages/graph/src/index.ts:307-323` · WHY IT MATTERS: edge insertion runs a recursive reachability check and refuses a write that would close a node cycle, protecting propagation assumptions at the storage boundary.
6. Typed memory segment partition · WHERE `apps/runner/src/index.ts:1088-1097,2303-2326` · WHY IT MATTERS: `memory:disclosure` is reserved, rendered and validated by code, appended as non-load-bearing, and excluded from model conformance segments rather than entrusted to the composer.
7. Selective replay suppression · WHERE `packages/serve/src/index.ts:923-968` · WHY IT MATTERS: evicting a stale served number suppresses only composed segments that cite that number ref, preserving unrelated prose while recording `MISSING-NUMBER`.
8. Persistence evidence invariants · WHERE `packages/serve/src/index.ts:972-1005` · WHY IT MATTERS: the repository retires `BLOCKED`, refuses missing/inconsistent composition evidence, and requires every condition mark to name affected nodes before opening the answer transaction.
9. Early projection refreshes · WHERE `apps/ui/lib/v3/liveEvents.ts:70-81` · WHY IT MATTERS: the UI reloads settled projections on node completion/failure/scoring, new edges, conformance, recomposition, and staleness—not only at terminal—so live views can reconcile before the run ends.

## TALLY

TRUE-TODAY: 18 · STALE: 1 · FALSE: 1 · PARTLY: 6 · CANNOT-ASSESS: 0

Three most consequential corrections:

1. C6 is stale: today's main supplies the formerly missing preflight policies, but it obtains them from explicitly development-only register provenance rather than a production-grade source.
2. C23 overstates enforcement: composer number refs are not whitelisted and fact preservation/no-invention is prompt-plus-conformance behavior, not a deterministic code invariant.
3. C15/C16 conflate plans with materialized graphs: mono runs do not expand, and failed branch or exchange calls reduce actual node counts below the nominal formulas.
