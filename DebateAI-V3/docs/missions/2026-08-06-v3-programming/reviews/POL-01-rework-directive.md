# POL-01 rework directive — rev1 → rev2

**Diamond (DR-153):** Grok **CHANGES REQUESTED** · Opus 5 **CHANGES REQUESTED**
(1 BLOCKING, 7 advisory). Both lenses reached the SAME blocking defect
independently, from different angles. Nothing to adjudicate.

## What is genuinely right — do not touch it

- Refusals now carry their real `code` and `message` to the browser. The
  motivating case (`RUN_COST_ENVELOPE_MEMBER_UNRESOLVED`) is fixed.
- **You also fixed the proxy** — it now emits `502 API_UPSTREAM_UNREACHABLE`
  instead of a bare 500, which the review packet still assumed was outstanding.
  The end-to-end refusal-vs-outage distinction **holds for the ask path**: a
  refusal shows its code, an outage shows `API_UPSTREAM_UNREACHABLE`. Traced
  and confirmed by the lens.
- The token-clearing fix is a real defect found by a real audit; the unlock
  decision is correct at all four call sites.
- Advisories A3/A4 are genuinely worked, not narrated: `DEPLOYMENT_RISK_TIER`
  is gone from the env schema with zero leftover references (grep-verified),
  `readDeploymentRiskTier` is the sole source, and present-but-NULL now reads
  INVALID on both sides.
- The `403 → 422` move for `MAKER_INVENTORY_UNSATISFIED` is CORRECT. 403's
  authorization flavour was actively misleading.

## B1 — BLOCKING: internal faults are served as client-actionable 422

The rule at `apps/api/src/index.ts:77-80` classifies by HTTP **route**. But the
code behind that route does THREE jobs — evaluate the ask, read deployment
state, and persist — and only the first can lawfully wear a 4xx. Your handoff's
premise, *"a TypedDomainError escaping the ask submission boundary is an
observed semantic refusal"*, is false about this codebase.

What is actually inside the boundary (`apps/api/src/index.ts:259-310`):

| # | line | call | typed error | character |
|---|---|---|---|---|
| 1 | `:260` | `liveness.recordQuery` | `LIVENESS_QUERY_INVALID`, `SEQUENCE_ALLOCATION_FAILED` | input / **infra** |
| 2 | `:261` | `resolveRisk` | `TIER_PROVENANCE_MISSING`, `RISK_TIER_POLICY_INVALID` | refusal / deployment |
| 3 | `:262` | `readDeploymentMakerCapability` | `CONFIGURED_PROVIDER_SET_UNRESOLVED` / `_INVALID` | **deployment integrity** |
| 4 | `:262` | `assertMakerAdmission` | `MAKER_INVENTORY_UNSATISFIED` | **refusal — correct** |
| 5 | `:263` | `resolveEnvelopeBasis` | `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED` | **refusal — correct** |
| 6 | `:267` | `startRun` | `SEQUENCE_ALLOCATION_FAILED` | **infra**, and COMMITs |
| 7 | `:293` | `recordMemoryQuestion` | `MEMORY_MATCH_PREDICATE_DRIFT`, `MEMORY_QUESTION_NOT_CANONICAL`, `MEMORY_PRIOR_ANSWER_MISSING` | **internal contradiction** |
| 8 | `:302` | `work.enqueue` | `SEQUENCE_ALLOCATION_FAILED` | **infra** |

Rows 3, 6, 7 and 8 now return `422 <internal code>`.

**Concrete case.** `MEMORY_MATCH_PREDICATE_DRIFT` fires when the SQL `CASE`
predicate and the TypeScript `matchQuestionKeys` disagree — its message is
*"Database and domain match predicates disagree"*, addressed to a programmer.
No ask makes it fire and no ask makes it stop. It needs only a returning asker
with a prior accepted run (the normal case) plus one drift between two
separately-maintained copies of a predicate. The sequence: lawful ask →
`startRun` **COMMITS** the run row, progress events and battery activations →
drift throws → client receives `422 MEMORY_MATCH_PREDICATE_DRIFT` → `/new`
(`apps/v2-ui/app/new/page.tsx:117-118`) frames it as a rejection of what the
user typed → the user edits and retries, because 4xx MEANS "your input, fix and
retry" → **each retry commits another orphan run**.

**Why this blocks even though these were 500s yesterday:**
1. `Fastify({ logger: false })` is unchanged (`index.ts:68`), so the status and
   body are the ENTIRE diagnostic channel. "Check the logs" does not exist.
2. Rows 6–8 fire POST-COMMIT, so the 4xx is affirmatively FALSE about two
   things. The old 500 was at least true that the ask had been processed.
3. It is stated as a law and will be inherited — DR-154(2) puts PANEL-01
   inside this exact path.

**The tell:** the same `readDeploymentMakerCapability` read is a "broken
deployment invariant" at **500** on `/v1/deployment` by your own rule, and a
"client refusal" at **422** on `/v1/asks`.

**Minimal fix — your instinct was right, one layer too high.** Move the
boundary from the ROUTE to the EVALUATION STAGE (`index.ts:261-266`): either
split `submit` into `evaluate` / `open`, or wrap those lines and re-raise as an
`AskRefusal` marker. That keeps 422 for rows 4 and 5 and preserves the
code/message pass-through exactly as shipped. Everything else stays.

**Plus the missing test that would have caught this during TDD:** an
application whose `submit` throws an INTERNAL typed error
(`MEMORY_MATCH_PREDICATE_DRIFT` is the clearest) must yield **500**.

## Fold into the same pass — two cheap ones

**A1 — a new test that cannot fail for its stated reason.**
`tests/unit/pol01-policy.test.ts:101-109`:
`expect(authGate).toContain("shouldClearStoredTokenAfterUnlockFailure")` is
satisfied by the IMPORT LINE ALONE. A regression restoring
`catch { clearStoredToken(); setError("Saved token is invalid."); }` passes
unchanged — exactly what the test exists to prevent. This is the mission's
named defect class (seven revisions lost to it across three tickets). The
BEHAVIOUR is correct at all four sites; the assertion is not. Either assert the
guarded form literally, or lift the handler into `tokenUnlock.ts` as
`decideUnlockFailure(error) → {clearStored, message}` and test it behaviourally.
Same family at `:63-67` (add `toContain("deploymentRiskTier.value")`).

**A2 — delete a heuristic that is now dead in both directions.**
`looksAuthRelated` (`DebatePageClient.tsx:320-322,1055`;
`DebateTree.tsx:69-72,101,117`; `NodeDetailDrawer.tsx:31-34,168`) clears the
token from a SUBSTRING SNIFF of an error message. Dead today — and POL-01
itself changed `Error.message` from `Contract request failed with 401` to
`SESSION_REQUIRED`, disabling its positive branch too. DR-154(2) wires exactly
these surfaces, so remove it rather than leave a trap.

## Record or fix, your call — say which in the handoff

- **A3:** `codeForStatus` (`packages/contract/src/client.ts:48-55`) is
  unchanged, so 422 collapses to `SERVER_FAILURE` — at the TYPED layer a
  refusal still wears the crash's face. `MAKER_INVENTORY_UNSATISFIED` used to
  arrive as `FORBIDDEN`. Nothing live misdisplays (the UI renders `message`),
  but `tests/unit/api.test.ts:176` PINS the collapse.
- **A4:** `tokenUnlock.ts:50-54` renarrates the proxy's 502 as *"the coordinator
  failed while checking the token"* — on a 502 the coordinator was never
  reached, and the deliberate `API_UPSTREAM_UNREACHABLE` code is discarded. One
  line.
- **A6:** `Fastify({ logger: false })` is untouched AND undisposed. The defect
  had two halves; the handoff does not mention the second. Explicit deferral or
  one line — silence is the wrong answer.
- **A7:** a server-side contract violation still reports `400
  MALFORMED_REQUEST` (`index.ts:105`, and the response-side parses at
  `:98,:129,:143,:157,:177`) — blaming the client for the server's own breach.
  Nearly free once B1's stage marker exists.

## Done when

B1 closed by moving the boundary to the evaluation stage, with the internal-
error-yields-500 test present; A1 and A2 closed; A3/A4/A6/A7 fixed or explicitly
recorded; every gate re-run with REAL pasted output EACH (the orchestrator
re-runs them and has already caught one claimed-green gate this mission).
Update the handoff in place. Back to `review` with
`REWORK READY FOR HERMES REVIEW — POL-01 rev2`.
