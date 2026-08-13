# POL-01 — Opus 5 lens, rev2

**Ticket:** `t_a8ad8b2f` · **Board:** `debateai-v3` · Read-only.
**Lens:** Opus 5 (dual diamond, DR-153). `pol01-grok-rev2.md` exists in the
reviews directory and was deliberately **not** opened before this verdict was
formed. Gates were not re-run — the orchestrator's are authoritative.

## Verdict: **APPROVED** — 0 BLOCKING, 6 ADVISORY (all low)

B1 is closed, and closed the right way. The marker is not merely moved down a
level; it is drawn around exactly two pure functions, each of which raises
exactly one typed code, with the live deployment read deliberately left
*outside* it. I went looking for the over-correction that this shape invites —
a lawful client input that used to get 422 and now gets 500 — and there isn't
one reachable from the wire. The required test is present and goes red for the
right reason under the exact regression it exists to prevent. A1 and A2 are
genuinely fixed, not narrated. A3/A4/A7 are fixed; A6 is explicitly deferred
with a real argument.

Nothing below blocks. The six advisories are hardening notes and one honest
coverage seam; they are ranked, and I would not hold the ticket for any of them.

---

# 1. Is the boundary genuinely at the evaluation stage now?

Yes. The rule at `apps/api/src/index.ts:113` is now
`knownError instanceof AskRefusal` — **no route context at all**. `AskRefusal`
(`index.ts:60-68`) is minted only by `markAskRefusal` (`index.ts:88-91`), which
is called from exactly two places, both inside `evaluateAskAdmission`
(`index.ts:274-298`). Grep confirms no other producer and no other consumer in
`apps`, `packages`, `tests`, `acceptance`, `tools`.

The eight rows from rev1, re-walked against `PostgresAskApplication.submit`
(`index.ts:319-365`) and `evaluateAskAdmission` (`index.ts:274-298`):

| # | line now | call | inside marker? | status | directive |
|---|---|---|---|---|---|
| 1 | `:320` | `liveness.recordQuery` | no | **500** | — |
| 2 | `:281` | `resolveRisk` | no | **500** | — |
| 3 | `:282` | `resolveDeploymentMakerAvailability` | **no** | **500** | must be 500 ✅ |
| 4 | `:283-287` | `assertMakerAdmission` | **yes** | **422** `MAKER_INVENTORY_UNSATISFIED` | must be 422 ✅ |
| 5 | `:288-296` | `resolveEnvelopeBasis` | **yes** | **422** `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED` | must be 422 ✅ |
| 6 | `:322` | `runs.startRun` | no | **500** | must be 500 ✅ |
| 7 | `:348` | `serve.recordMemoryQuestion` | no | **500** | must be 500 ✅ |
| 8 | `:357` | `work.enqueue` | no | **500** | must be 500 ✅ |
| 9 | `:363` | `dispatcher.dispatch` | no | **500** | (new row; correct) |

All four directive requirements are met. Row 3 — the "tell" from rev1, where
the same `readDeploymentMakerCapability` read wore a 500 face on
`/v1/deployment` and a 422 face on `/v1/asks` — is resolved: the await sits
*before* the `try`, so `CONFIGURED_PROVIDER_SET_*` now wears one face on both
routes. `MEMORY_MATCH_PREDICATE_DRIFT`, `SEQUENCE_ALLOCATION_FAILED` and the
whole post-COMMIT region can no longer borrow the refusal face.

**Code/message pass-through on rows 4 and 5 is intact.** `AskRefusal` copies
`refusal.code` and `refusal.message` (`index.ts:61-67`) and the handler emits
`{ error: knownError.code, message: knownError.message }` (`index.ts:116-120`).
Pinned end-to-end by `tests/unit/api.test.ts:178-215` (exact body) and
`tests/unit/pol01-policy.test.ts:73-91` (real `createDebate` data path).

**I checked the over-correction risk specifically.** Moving a boundary down can
turn a genuine client refusal into a 500. Rows 1 and 2 are the candidates, and
both are dead from the wire:

- `LIVENESS_QUERY_INVALID` fires only on `questionLine.trim() === ""` or an
  empty asker (`packages/liveness/src/index.ts:122`); `AskRequestSchema` applies
  `z.string().trim().min(1)` to `question_line`
  (`packages/contract/src/index.ts:107`), so it is rejected at 400 first and the
  asker id is server-derived.
- `TIER_PROVENANCE_MISSING` fires only on
  `askerProvenanceRef.trim() === ""` (`packages/register/src/index.ts:388-390`);
  `tier_provenance_ref` is likewise `.trim().min(1)`
  (`packages/contract/src/index.ts:110`).

So **no lawful client input loses a 4xx it previously had.** The only other
error `resolveRisk` can raise, `RISK_TIER_POLICY_INVALID`
(`register/src/index.ts:398`), is a deployment-integrity fault and belongs on
500.

**I also checked the marker is not over-broad.** `markAskRefusal` marks *any*
`TypedDomainError` from the two wrapped calls, so the guarantee rests on those
two being pure. They are:

- `assertMakerAdmission` (`packages/critique/src/index.ts:324-338`) — pure, one
  throw, one code.
- `resolveEnvelopeBasis` is, in the only composition root, a closure over a
  policy read **once at boot** (`apps/api/src/main.ts:23, 31`);
  `resolveRunCostEnvelopeBasis` (`packages/register/src/index.ts:253-277`) is
  pure, one throw, one code.

Both wrapped calls are therefore incapable of raising an internal fault today.
That is exactly the property the directive asked for. See ADVISORY-1 for the
one thing that keeps it true only by convention.

# 2. Does the new internal-error test fail for the right reason?

**Yes.** `tests/unit/api.test.ts:217-252` drives a real
`POST /v1/asks` with a contract-valid payload against an application whose
`submit` throws `TypedDomainError("MEMORY_MATCH_PREDICATE_DRIFT", …)` and
asserts `500` **and** the exact body `{error:"INTERNAL_ERROR", message:…}`.

Under a regression to the rev1 rule
(`instanceof TypedDomainError && method === "POST" && url === "/v1/asks"`) that
request yields `422 {"error":"MEMORY_MATCH_PREDICATE_DRIFT"}` — **both**
assertions go red, and they go red naming the precise thing that is wrong. It is
the directive's requested test, with the directive's requested error, at the
directive's requested altitude. This is not a "an error is returned" check.

Three further checks in the same suite fail for their own stated reasons rather
than duplicating each other:

- `api.test.ts:105-112` — `resolveDeploymentMakerAvailability` throwing
  `CONFIGURED_PROVIDER_SET_UNRESOLVED` must escape `evaluateAskAdmission` as a
  bare `TypedDomainError`, not an `AskRefusal`. This is the direct guard on row
  3, and it goes red if anyone widens the `try` to enclose the availability
  read.
- `api.test.ts:84-103` — both ruled refusals must be marked, with exact code and
  message. Goes red if the marker is removed.
- `api.test.ts:295-323` — an invalid `submit` **response** stays 500 (A7).

# 3. A1 — can the reworked assertion fail for its stated reason?

**Yes.** `tests/unit/pol01-policy.test.ts:118` and `:120` no longer use
`toContain` on a bare identifier; they count the literal guarded statement:

```ts
expect(authGate.match(/if \(shouldClearStoredTokenAfterUnlockFailure\(error\)\) clearStoredToken\(\)/g)).toHaveLength(2);
```

The import line cannot satisfy that. The exact regression the test exists to
prevent — restoring `catch { clearStoredToken(); setError("…"); }` — drops the
count and goes red. I verified the counts against the sources: `AuthGate.tsx:29`
and `:52` (automatic stored-token check, manual submit); `DebatePageClient.tsx:508`
and `:948` (same two). Two each, matching the assertion.

The second family named in the directive is also closed:
`pol01-policy.test.ts:69` now adds `expect(source).toContain("deploymentRiskTier.value")`
alongside the existing `readDeploymentRiskTier` / `not.toContain(environment.DEPLOYMENT_RISK_TIER)`,
so a regression that reads the row and then passes a literal tier to
`policyLevels.deployment` no longer passes. And the behaviour is now covered
behaviourally as well — `pol01-policy.test.ts:93-109` exercises 401 → clear,
403 → clear, `NETWORK_FAILURE` → retain, 500 → retain, and 502 →
`UNREACHABLE`, which is the durable half of this fix. Residual gap in
ADVISORY-5.

# 4. A2 — is `looksAuthRelated` gone?

**Yes, from all three sites.** A repo-wide grep for `looksAuthRelated` over
`*.ts`/`*.tsx` returns **only** the three negative assertions in
`tests/unit/pol01-policy.test.ts:121-123`. No production occurrence remains in
`DebatePageClient.tsx`, `DebateTree.tsx` or `NodeDetailDrawer.tsx`.

The action paths that used to call it now simply surface the message
(`DebateTree.tsx:83-86, 97-100`; `NodeDetailDrawer.tsx:155-165` all end in
`onError(message)`), so no token is cleared from a string sniff anywhere.

The token is now cleared in exactly three places, and every one is either typed
or explicitly user-initiated:

| site | guard |
|---|---|
| `AuthGate.tsx:29, :52` | `shouldClearStoredTokenAfterUnlockFailure(error)` |
| `DebatePageClient.tsx:508, :948` | `shouldClearStoredTokenAfterUnlockFailure(error)` |
| `DebatePageClient.tsx:958` (`lockActions`) | explicit user "lock" — correct unguarded |

`shouldClearStoredTokenAfterUnlockFailure` (`tokenUnlock.ts:82-84`) resolves to
`kind === "REJECTED"`, which is reachable only from `SESSION_REQUIRED` /
`FORBIDDEN` (`tokenUnlock.ts:42-45`) and only *after* the
`API_UPSTREAM_UNREACHABLE` / 502-503-504 branch at `:36-41` has taken the
outage cases away. So: **cleared only on an observed rejection.** Confirmed.

One leftover, ADVISORY-4: the socket `looksAuthRelated` used to feed is still
wired.

# 5. A3 / A4 / A6 / A7 — fixed or recorded?

| rev1 advisory | disposition | verified |
|---|---|---|
| **A3** 422 collapses to `SERVER_FAILURE` | **Fixed** | `ContractErrorCode` gains `"UNPROCESSABLE"` (`packages/contract/src/client.ts:31`); `codeForStatus(422)` returns it (`:54`). `tokenUnlock.ts`'s `switch` has no `default`, so TypeScript forced the new member to be handled — it is, at `:67`. `tests/unit/v2ui-data-layer.test.ts:705-716` walks all nine codes and pins that only `SESSION_REQUIRED`/`FORBIDDEN` may say "rejected". `tests/unit/api.test.ts:280-293` replaces the old pin that locked the collapse. The 403 → 422 move no longer costs the typed distinction. |
| **A4** 502 renarrated as "the coordinator failed" | **Fixed** | `tokenUnlock.ts:36-41` classifies `serverCode === "API_UPSTREAM_UNREACHABLE"` **or** status 502/503/504 as `UNREACHABLE`, *before* the `code` switch, with the honest message ("never checked"). Token retained. Pinned at `pol01-policy.test.ts:106-108`. |
| **A6** `logger: false` | **Explicitly deferred** — the correct disposition per the directive, and the argument given (logging destination/redaction/retention is an application-wide policy decision, not a POL-01 one-liner) is a real argument, not a dodge. `apps/api/src/index.ts:106` unchanged. See ADVISORY-3 for the one thing missing from the deferral. |
| **A7** server contract breach blamed on the client | **Fixed** | Only the two request schemas go through `parseRequest` (`index.ts:138` `AskRequestSchema`, `:197` `InvestigationRequestSchema`), and only `parseRequest` mints `MalformedRequestError` (`:77-86`). Every response-side parse is a direct `.parse` — `:132, :139, :151, :163, :177, :184, :191, :199, :211, :220` — so its `ZodError` is neither a `MalformedRequestError` nor a `SyntaxError` and lands on 500. Pinned at `api.test.ts:295-323`. |

Nothing was answered with silence.

---

# ADVISORY

Ranked by cost if left. None blocks.

## ADVISORY-1 — the marker is scoped by call site, not by code, and DEPTH-01 is aimed at one of the two call sites

`apps/api/src/index.ts:88-91`:

```ts
function markAskRefusal(error: unknown): never {
  if (error instanceof TypedDomainError) throw new AskRefusal(error);
  throw error;
}
```

This converts **any** `TypedDomainError` raised by `assertMakerAdmission` or
`settings.resolveEnvelopeBasis` into a 422. Today that is exactly right, because
I verified both are pure and single-coded (see §1). But the property is held by
convention, not by the type system: `resolveEnvelopeBasis` is an injection point
on `RunCreationSettings` (`index.ts:263-266`) whose signature —
`(input) => Promise<Record<string, unknown>>` — permits a live register read,
and the rework directive itself names DEPTH-01 as the ticket that changes what
row 5 resolves against. The moment that closure reads the register per-ask, a
malformed `runCostEnvelope` row raises a `RUN_COST_ENVELOPE_POLICY_*` integrity
fault inside the `try` and inherits the 422 face — B1 in miniature, in the one
place the directive predicted.

No test would catch it: `api.test.ts:95-103` stubs the resolver with a throw of
the *ruled* code, so it passes either way.

One line closes it — mark only the two ruled codes:

```ts
const ASK_REFUSAL_CODES = new Set(["MAKER_INVENTORY_UNSATISFIED", "RUN_COST_ENVELOPE_MEMBER_UNRESOLVED"]);
if (error instanceof TypedDomainError && ASK_REFUSAL_CODES.has(error.code)) throw new AskRefusal(error);
```

That converts the invariant from "these two functions happen to be pure" into
"these two codes are the refusal vocabulary", which is the thing the rule
actually means and the thing a new maintainer will inherit. Cheap; I would take
it, but it is not worth a third revision on its own.

## ADVISORY-2 — `AskRefusal` discards the original error

`apps/api/src/index.ts:60-68` copies `message` and `code` but does not pass
`cause`, so the `TypedDomainError`'s stack — the actual throw site — is lost at
the marker, and `instanceof TypedDomainError` no longer holds downstream. With
`logger: false` standing (A6, deferred), the response body is the entire
diagnostic channel, so throwing away the one artefact that says *where* is a
poor trade. `super(refusal.message, { cause: refusal })` is the whole fix and
changes no observable behaviour.

## ADVISORY-3 — the A6 deferral is real but is not carried by anything

The handoff's deferral argument is sound and I am not asking for a logging
decision inside this ticket. But the deferral lives only in
`handoffs/POL-01-codex-handoff.md`; there is no ticket, no decisions-ledger
entry, and no comment at `apps/api/src/index.ts:106`. When the handoff is
archived, the second half of the packet's original defect — "so nothing was
logged either" — has no carrier. A one-line source comment naming the deferral,
or a ledger row, makes it survivable.

## ADVISORY-4 — `looksAuthRelated` is gone but the socket it fed is still wired

`onAuthRejected` is still declared and threaded through `DebateTree.tsx:44, 55,
74, 253, 273, 293, 314`, `NodeDetailDrawer.tsx:92, 117` and
`ArgumentFocusView.tsx:14, 25, 48, 110, 137` — and is **never invoked**
(grep for `onAuthRejected()` returns nothing). Its target,
`rejectActionToken` (`DebatePageClient.tsx:963-966`), is now unreachable and
clears the token **unconditionally**.

So the substring sniff was correctly removed, but what remains is a dangling
socket labelled "auth rejected" wired to an unguarded `clearStoredToken()`. DR-154(2)
puts regeneration/panel work on exactly these components; the natural move for
whoever lands it is to call the prop that is already threaded to their
component, which reintroduces the defect without touching a single line POL-01
wrote. Either delete the prop chain, or change `rejectActionToken(error)` to
route through `shouldClearStoredTokenAfterUnlockFailure` so the socket is safe
by construction.

## ADVISORY-5 — A1's repaired assertion is count-based, with one residual false-negative

`pol01-policy.test.ts:118, :120` counts exactly two guarded statements. That
closes the regression the directive named. Two residuals, both minor:

- **False negative:** adding an *additional* unguarded `clearStoredToken()` in a
  new `catch` leaves the count at 2 and passes. A blanket "no unguarded clear"
  ban is not available here, because `lockActions()` (`DebatePageClient.tsx:958`)
  clears unguarded and is correct to. The durable version remains the one the
  directive offered as the alternative: lift the handler into `tokenUnlock.ts`
  as `decideUnlockFailure(error) → {clearStored, message}` and test it
  behaviourally.
- **False positive:** the regex pins the exact single-line form and the exact
  binding name `error`; renaming the catch binding or a formatter wrapping the
  line turns it red with no behaviour change. A red for the wrong reason is far
  cheaper than a green for the wrong reason, so this is acceptable — but it is
  the kind of assertion that gets "fixed" by loosening it back to `toContain`.

## ADVISORY-6 — the two proven halves are not joined by a test

The stage marker is proven to be *minted* correctly (`api.test.ts:67-113`,
against the real `assertMakerAdmission` and a stubbed resolver) and proven to be
*mapped* correctly (`api.test.ts:178-215`, `:217-252`). Nothing asserts that
`PostgresAskApplication.submit` actually routes through `evaluateAskAdmission`.
Inlining the two policy calls back into `submit` without the marker keeps all
three tests green while turning the ticket's motivating refusal back into a 500.

This is mitigated in practice — the join is a single direct call
(`index.ts:321`) under typecheck, and the author's live evidence
(`POST /api/v1/asks -> HTTP 422` with the real `PostgresAskApplication` and real
PostgreSQL) exercises it end to end. Recording it because the mission's most
expensive defect class is precisely "the halves are each proven and the seam is
not", and because rev1 accepted the same two-halves shape on the UI chain.

---

# What I checked and am not raising

- **`SyntaxError` in the `malformed` predicate** (`index.ts:109`). A `SyntaxError`
  raised from *inside* the application would still be reported as
  `400 MALFORMED_REQUEST` — the residual sibling of A7. I grepped `JSON.parse`
  across `packages/db`, `packages/serve`, `packages/memory`, `packages/liveness`,
  `packages/battery` and `apps/api`: **zero occurrences**. Unreachable; the
  branch is needed for Fastify's own body-parse failure. Not a finding.
- **`AskRefusal` escaping a non-ask route.** The handler no longer route-scopes,
  so I checked whether the marker could reach another route. It cannot:
  `evaluateAskAdmission` has exactly one caller (`index.ts:321`). If a future
  route reuses it, inheriting 422 is the *correct* semantics — that is the point
  of a marker rather than a URL string.
- **`UNPROCESSABLE` breaking a consumer.** Every `ContractErrorCode` consumer in
  `apps/v2-ui` either renders `failure.code` as text or compares against
  `NOT_FOUND`/`SESSION_REQUIRED`/`FORBIDDEN`; the only exhaustive `switch` is in
  `tokenUnlock.ts` and it handles the new member. No silent fallthrough.
- **The proxy** (`apps/v2-ui/app/api/[...path]/route.ts:50-69`) is unchanged from
  rev1 and was already correct; refusal-vs-outage still holds end to end.
- **`apps/v2-ui/.next-dev/`** exists in the working tree and is not matched by
  `.gitignore`'s `.next/`. It is produced by `NEXT_DIST_DIR=.next-dev` in
  `.claude/launch.json`, i.e. by the harness's standing dev server — **not** by
  POL-01's temporary proxy. The handoff's phrasing ("no generated Next directory
  remains") is imprecise about a directory that isn't POL-01's. Noted, not
  charged.

# What I did not verify

- No gate re-run; the orchestrator's are authoritative.
- No live HTTP; the standing :8790 process still has the pre-POL-01 module
  loaded by the author's own disclosure, and restarting it would invoke real
  providers.
- No rendered-browser check. Every trace above is read from source. Visual
  acceptance remains outstanding for the human/browser seat — unchanged from
  rev1.
- `reviews/pol01-grok-rev2.md` — not read, to keep the second lens independent.
- Interleaved UI-02 hunks in `adapter.ts`, `DebateCanvas.tsx`,
  `NodeDetailDrawer.tsx`, `lib/types.ts` and the two v2ui test files are outside
  POL-01's claimed authorship and were read only far enough to confirm that.

# Recommendation

**APPROVED.** B1 is closed at the altitude the directive specified, with the
required test, and without the over-correction the fix invited. A1 and A2 are
closed. A3/A4/A7 are fixed and A6 is honestly deferred. The six advisories are
all one-liners or notes; ADVISORY-1 and ADVISORY-4 are the two I would want
picked up by whoever lands DEPTH-01 and DR-154(2) respectively, since both are
traps aimed squarely at those tickets — but neither is a defect in what shipped.
