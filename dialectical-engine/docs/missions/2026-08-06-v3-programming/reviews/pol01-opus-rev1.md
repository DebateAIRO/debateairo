# POL-01 — Opus 5 lens, rev1

**Ticket:** `t_a8ad8b2f` · **Board:** `debateai-v3` · Read-only.
**Lens:** Opus 5 (dual diamond, DR-153). Grok's packet run was not consulted
before this verdict was formed. Gates were not re-run (orchestrator's are
authoritative); the standing :8790 process is stale by the packet's own note and
is not treated as evidence either way.

## Verdict: **CHANGES REQUESTED** — 1 BLOCKING, 6 ADVISORY

The half of this ticket that is right is genuinely right, and I want that on the
record before the blocker: a refusal's real `code` and `message` now reach the
browser instead of being crushed into `INTERNAL_ERROR`; the proxy's new
`502 API_UPSTREAM_UNREACHABLE` is a correct, honest statement of the only fact
the proxy actually observed; the token-clearing correction is a real defect fix
found by a real audit; and A3/A4 are worked, not narrated. The end-to-end
refusal/outage distinction (packet item 3) **does** hold for the ask path — I
traced both and they produce different visible text.

The blocker is not a request to revert any of that. It is that the *boundary*
the author chose is the HTTP route, and the code behind that route does three
different jobs — evaluate the ask, read deployment state, and persist. Only the
first can lawfully wear a 422 face. As written, an internal fault raised by the
second or third is dressed as a client-actionable refusal, and in three of the
four cases it is dressed that way **after the run has already been committed to
the database** — a 4xx asserting the ask was not processed, about an ask that
was.

---

# BLOCKING

## B1 — An internal fault inside `submit` is served as a client-actionable 422, in three cases after the run row is already committed

**Where:** `apps/api/src/index.ts:77-80` (the rule) and
`apps/api/src/index.ts:259-310` (what is actually inside the boundary).

```ts
const askRefusal = knownError instanceof TypedDomainError
  && request.method === "POST"
  && request.routeOptions.url === "/v1/asks";
const statusCode = malformed ? 400 : askRefusal ? 422 : 500;
```

The rule's premise — stated in the handoff as *"a `TypedDomainError` escaping the
ask submission boundary is an observed semantic refusal"* — is false about this
codebase. `PostgresAskApplication.submit` is not an evaluator. It is an
evaluator **plus** two live register reads **plus** four write transactions
**plus** a dispatch, and typed errors are raised from every one of those layers.

### What can actually throw a `TypedDomainError` across the boundary

Walking `submit` in execution order:

| # | line | call | typed errors it can raise | honest character |
|---|---|---|---|---|
| 1 | `index.ts:260` | `liveness.recordQuery` | `LIVENESS_QUERY_INVALID`; `SEQUENCE_ALLOCATION_FAILED` (`packages/db/src/index.ts:72`) | invalid input / **infrastructure** |
| 2 | `index.ts:261` | `resolveRisk` | `TIER_PROVENANCE_MISSING`, `RISK_TIER_POLICY_INVALID` | refusal / **deployment** |
| 3 | `index.ts:262` | `resolveDeploymentMakerAvailability` → `readDeploymentMakerCapability` | `CONFIGURED_PROVIDER_SET_UNRESOLVED` (`packages/critique/src/index.ts:254`), `CONFIGURED_PROVIDER_SET_INVALID` (`:261, :268, :273, :279`) | **deployment integrity** |
| 4 | `index.ts:262` | `assertMakerAdmission` | `MAKER_INVENTORY_UNSATISFIED` | **refusal (correct)** |
| 5 | `index.ts:263` | `resolveEnvelopeBasis` | `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED` | **refusal (correct — the ticket's motivating case)** |
| 6 | `index.ts:267` | `startRun` | `SEQUENCE_ALLOCATION_FAILED` | **infrastructure** — and it **COMMITs** at `packages/db/src/index.ts:187` |
| 7 | `index.ts:293` | `recordMemoryQuestion` → `MemoryRepository.recordQuestionAndMatch` | **`MEMORY_MATCH_PREDICATE_DRIFT`** (`packages/memory/src/index.ts:340`), `MEMORY_QUESTION_NOT_CANONICAL` (`:277`), `MEMORY_QUESTION_EMPTY` (`:58`), `MEMORY_PRIOR_ANSWER_MISSING` (`:407`), `SEQUENCE_ALLOCATION_FAILED` | **internal contradiction / infrastructure** |
| 8 | `index.ts:302` | `work.enqueue` | `SEQUENCE_ALLOCATION_FAILED` | **infrastructure** |

Rows 3, 6, 7, 8 are the defect. Every one of them now returns
`422 <internal code>`.

### The concrete failing case

`MEMORY_MATCH_PREDICATE_DRIFT` is thrown when the SQL `CASE` predicate in
`recordQuestionAndMatch` and the TypeScript `matchQuestionKeys` predicate
disagree about the match tier (`packages/memory/src/index.ts:338-341`). Its own
message — *"Database and domain match predicates disagree"* — is addressed to a
programmer. It says nothing about the ask. There is no ask a user could write
that makes it fire and no ask they could write that makes it stop.

Reachability is ordinary, not exotic: it needs only that the asker has a prior
accepted, terminal run whose question key overlaps, which is the *normal* case
for a returning user, plus one drift between two separately-maintained copies of
the same predicate — the exact bug class that motivates having both.

Sequence of events today:

1. `POST /v1/asks` with a perfectly lawful ask.
2. `startRun` **commits** the run row, three progress events and the battery
   activations (`packages/db/src/index.ts:187`).
3. `recordMemoryQuestion` throws `MEMORY_MATCH_PREDICATE_DRIFT`.
4. The client receives
   `422 {"error":"MEMORY_MATCH_PREDICATE_DRIFT","message":"Database and domain match predicates disagree"}`.
5. `/new` (`apps/v2-ui/app/new/page.tsx:117-118`) renders that string in the
   form's error box, framed as a rejection of what the user just typed.
6. The user edits the ask and presses Start again — 4xx is the status class that
   means "your input; fix and retry". Each retry commits another orphan run.

That is DR-115 in its strongest form as this mission has been using it (and as
`tokenUnlock.ts:12` and `route.ts:55` invoke it): the API states an outcome the
system did not observe. It never observed a refusal. It observed its own
inconsistency, *after* it had already opened the run — so the 4xx is false about
two things at once.

### On "can a broken database present as an invalid request?"

The precise answer, which I think matters for how this gets fixed: a broken
database **connection** cannot. `pg` raises plain `Error`s (ECONNREFUSED,
connection terminated, undefined function), which stay untyped and correctly get
500. A database in a broken **state** can, three ways: a missing/corrupt
`configuredProviderSet` register row (row 3), the `ledger.allocate_sequence()`
guard (rows 1/6/8), and predicate drift (row 7). `readDeploymentMakerCapability`
is validated once at boot (`apps/api/src/main.ts:22`) but is re-read **per ask**
(`main.ts:30`), so post-boot register mutation lands on the 422 face.

### Why this is blocking rather than advisory

Three reasons, and I weighed the counter-argument (that these cases are rare and
were 500s a day ago) seriously:

1. **There are no logs.** `Fastify({ logger: false })` is unchanged at
   `apps/api/src/index.ts:68`. The packet names this as half of the original
   defect. The status code and body *are* the entire diagnostic channel; "the
   operator will check logs" is not available here.
2. **After a commit, a 4xx is affirmatively false, not merely imprecise.** Rows
   6–8 all fire post-COMMIT. The old 500 was at least true about the ask having
   been received and processed.
3. **The rule is stated as a law and will be inherited.** DR-154(2) puts PANEL-01
   inside this exact path and DEPTH-01 changes what row 5 resolves against.
   Every typed error added to `submit` from now on inherits the 422 face by
   default. The correctness of the rule matters more than today's error
   inventory.

### Minimal fix (the boundary is the evaluation stage, not the route)

The author's instinct — "boundary-based, not a hand-picked status per error" — is
right. The boundary is just drawn one layer too high. Move it from *the route*
to *the stage that evaluates the ask*, which is `index.ts:261-266` (the three
policy calls) and nothing after it. Either:

- split `AskApplication.submit` into `evaluate(ask, session)` (pure policy; may
  refuse) and `open(...)` (persistence + dispatch), and let only `evaluate`'s
  typed errors reach the 422 face; or
- wrap `index.ts:261-266` and re-raise as an `AskRefusal` (subclass, or a
  branded marker on the error), with `askRefusal = knownError instanceof AskRefusal`.

Either keeps the code and message pass-through exactly as shipped and keeps
`RUN_COST_ENVELOPE_MEMBER_UNRESOLVED` and `MAKER_INVENTORY_UNSATISFIED` on 422.
Both need one test: an application whose `submit` throws
`MEMORY_MATCH_PREDICATE_DRIFT` must yield 500 from `POST /v1/asks`. The current
suite has no such case (see A5).

Note that rows 3 and 5 are, on the author's own reasoning, indistinguishable
from the "typed errors on other routes represent broken deployment/read
invariants" class the handoff explicitly keeps at 500 — the same
`readDeploymentMakerCapability` read is a deployment invariant on `/v1/deployment`
and a client refusal on `/v1/asks`. That inconsistency is the tell.

---

# ADVISORY

Ranked by how much they cost if left.

## A1 — `pol01-policy.test.ts:101-109` cannot fail for the reason its author believes

```ts
expect(authGate).toContain("shouldClearStoredTokenAfterUnlockFailure");
expect(authGate).not.toContain("Saved token is no longer valid.");
expect(debatePage).toContain("shouldClearStoredTokenAfterUnlockFailure");
```

The identifier appears in `AuthGate.tsx`'s **import block**. The import alone
satisfies both `toContain`s. A regression that restores
`catch { clearStoredToken(); setError("Saved token is invalid."); }` while
leaving the import in place passes this test unchanged — and that is precisely
the regression it exists to prevent. The `not.toContain` bans one exact
sentence, not the behaviour.

This is the mission's named defect class (packet item 6; four revisions on
EXEC-01, two on UI-02a, one on DEPTH-01). I checked before raising it: there is
no DOM test infrastructure in this repo (no `@testing-library`, no `jsdom`/
`happy-dom`), and `v2ui-pages.test.ts` establishes `source()` assertions as
accepted practice here — so the *choice* of a source test is fair. The
*assertion* is not. Two cheap repairs, either sufficient:

- assert the guarded form literally —
  `expect(authGate).toContain("if (shouldClearStoredTokenAfterUnlockFailure(error)) clearStoredToken()")`
  and assert `clearStoredToken()` appears nowhere unguarded in a `catch`; or
- better, lift the handler into `tokenUnlock.ts` as
  `decideUnlockFailure(error) → { clearStored: boolean; message: string }` and
  unit-test it behaviourally, leaving the components as thin call sites.

The **behaviour today is correct** — I read all four call sites
(`AuthGate.tsx:28, 51`, `DebatePageClient.tsx:513, 953`) and each
one clears storage only through `shouldClearStoredTokenAfterUnlockFailure`. This
is a test-strength finding, not a behaviour finding.

`pol01-policy.test.ts:63-67` (`toContain("readDeploymentRiskTier")` /
`not.toContain("environment.DEPLOYMENT_RISK_TIER")`) is the same family and the
same import-satisfies-it weakness — a regression that reads the row and then
passes a literal tier to `policyLevels.deployment` passes. Here I think the
source test is genuinely the only cheap option (`main.ts` is a side-effecting
composition root that opens a pool, constructs Hatchet and listens), so I would
accept it with the addition of `expect(source).toContain("deploymentRiskTier.value")`.

## A2 — Three action paths still clear the stored token from a substring match on an error message

`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx:320-322, 1055`,
`apps/v2-ui/components/DebateTree.tsx:69-72, 101, 117`,
`apps/v2-ui/components/NodeDetailDrawer.tsx:31-34, 168`:

```ts
function looksAuthRelated(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("401") || lower.includes("403") || lower.includes("invalid user token");
}
// ...
if (looksAuthRelated(message)) rejectActionToken();   // → clearStoredToken()
```

The packet asks me to verify a stored token is cleared **only** on a real
rejection. Through `tokenUnlock.ts`, yes. Through these three, no — they clear it
on a string sniff, which is the same shape of error the ticket exists to remove.

**They are not live today.** All three call sites invoke hard-rejecting stubs in
`apps/v2-ui/lib/api.ts` (`V3_HAS_NO_SCORING_FEEDBACK`,
`V3_HAS_NO_NODE_REGENERATION`, `V3_HAS_NO_GENERATION_HISTORY`), none of whose
messages contain `401`/`403`/`invalid user token`, so `looksAuthRelated` is
always false and no token is ever cleared. So this is a latent trap, not a defect —
which is why it is advisory. But it has a named trigger: DR-154(2) puts
regeneration/panel work on exactly these surfaces, and the moment any of the
three is wired to the contract client, a 5xx whose server `message` happens to
contain "403" (e.g. a provider error quoted upstream) silently clears the user's
token. The fix is one line each: route them through
`shouldClearStoredTokenAfterUnlockFailure` like the unlock paths.

Worth flagging in the same breath: POL-01 changed `Error.message` for every
non-2xx from the fixed `Contract request failed with <status>` to
`<serverCode>: <serverMessage>` (`packages/contract/src/client.ts:70-73`). A 401
now yields the message `SESSION_REQUIRED` — which no longer contains `"401"`. So
this heuristic's *positive* branch was silently disabled by this ticket too. It
is dead in both directions right now; it should be deleted rather than left to
be rediscovered.

## A3 — `serverCode` is written and asserted but read by nothing; 422 collapses into `SERVER_FAILURE`

`packages/contract/src/client.ts:48-55` is unchanged, so `codeForStatus(422)`
falls through to `"SERVER_FAILURE"` — the same `ContractErrorCode` as a genuine
500 crash. And `serverCode`, the new field that carries the distinction, has
exactly one reader in the tree: `tests/unit/api.test.ts:178`. No production code
consults it.

Two consequences the packet's item 2 asked about:

- **Information genuinely lost by 403 → 422.** `MAKER_INVENTORY_UNSATISFIED`
  used to arrive at the browser as `ContractHttpError.code === "FORBIDDEN"` — a
  typed category distinguishable from a server fault. It now arrives as
  `"SERVER_FAILURE"`. At the *typed client layer*, that refusal now wears the
  same face as a crash, which is the exact thing this ticket is about. Nothing
  live misdisplays because `/new` renders `message` (which carries the code), so
  it is advisory — but the distinction survives only as a string.
- Anything downstream that branches on `code` (e.g. `getDebateServer` at
  `apps/v2-ui/lib/serverApi.ts:75` surfaces `failure.code` as the user-visible
  message) will report `SERVER_FAILURE` where the API said something exact.

Adding a `"REFUSED"` (or `"UNPROCESSABLE"`) member to `ContractErrorCode` for
422 costs one line and makes the distinction survive in the type system rather
than in prose. (It would require updating `tests/unit/api.test.ts:176`, which currently pins
`code: "SERVER_FAILURE"` for a 422 and thereby locks the collapse in.)

**On the 403 → 422 move itself: I think it is correct.** 403 carried an
authorization flavour that was actively misleading — it invited "sign in as
someone else", when the truth is that this deployment's model inventory cannot
serve the requested tier. 422 is right and the action is real and client-side
(lower `risk_tier`). No information a client could act on is lost at the wire
level: the body's `error` field carried the exact code before and carries it now.

## A4 — The 502 the proxy went to the trouble of naming is renarrated as "the coordinator failed"

`apps/v2-ui/lib/v3/tokenUnlock.ts:50-54`: 502 → `codeForStatus` →
`SERVER_FAILURE` → `COORDINATOR_FAILED` → *"The coordinator failed while
checking the token (HTTP 502). The token was not rejected."*

On a 502 the coordinator was never reached — the proxy could not deliver the
request. The sentence asserts the coordinator did something ("failed while
checking") it did not do. It is a much milder instance of the very error this
ticket fixes, and it discards the `API_UPSTREAM_UNREACHABLE` code the proxy
deliberately emitted for this purpose. One line in
`classifyTokenUnlockFailure`: treat `serverCode === "API_UPSTREAM_UNREACHABLE"`
(or status 502/503/504) as `UNREACHABLE`, whose message is already exactly right.

The important half is correct and I want it recorded: the token is **retained**
in this case, and the message does not claim rejection. Refusal vs outage holds.
Outage vs upstream-fault does not.

## A5 — No test spans an internal fault *through* the ask boundary, and the UI-side test cannot detect the mapping regressing

Packet item 6, checked case by case against a regression to 500:

| test | detects `askRefusal → false` (all typed → 500)? |
|---|---|
| `tests/unit/api.test.ts:102-138` "maps ask-boundary domain refusals to 422" | **Yes.** Asserts `statusCode === 422` and the exact body. Fails for the right reason. |
| `api.test.ts:141-166` "keeps typed internal faults ... on the 500 face" | Detects the *opposite* regression (422 leaking to other routes). Genuine — but it exercises `/v1/deployment`, so it proves route-scoping only. |
| `api.test.ts:168-181` contract-client `serverCode` | Client-layer only; constructs its own 422. Correctly scoped, no API coupling. |
| `pol01-policy.test.ts:69-87` "/new form data path" | **No.** The stub is hard-coded to 422 and `contractErrorForResponse` builds the same `<code>: <message>` string at any status — this passes verbatim against a 500. Fine as a UI test; must not be read as evidence for the mapping. The handoff's wording ("proves the exact run-cost refusal reaches it") is accurate about what it proves. |
| `v2ui-proxy.test.ts:100-115` transport 502 | **Yes**, for the proxy half. |

So the mapping is genuinely nailed at the API layer, and the chain is proven in
two disjoint halves that agree on the body shape — acceptable. The real hole is
the one B1 names: **no test throws an internal typed error from `submit` and
asserts 500.** Adding it is the natural companion to the B1 fix and would have
surfaced B1 during TDD.

Minor: `pol01-policy.test.ts:89-99` covers `SESSION_REQUIRED → true` but not
`FORBIDDEN → true`, the other `REJECTED` branch.

## A6 — `logger: false` is untouched and undisposed

`apps/api/src/index.ts:68`. The packet's statement of the defect has two halves —
the collapsed status *and* "so nothing was logged either". The ticket body only
promised the first, and the handoff does not mention logging at all. With B1
fixed, an internal fault becomes a 500 whose only trace anywhere in the system is
the response body the client sees. I am not asking for a logging decision inside
this ticket — but silence is the wrong disposition for a defect the packet
itself named. It should be an explicit deferral with a ticket, or one line.

## A7 — A server-side contract violation is still reported as `400 MALFORMED_REQUEST`

Pre-existing, not introduced by POL-01, but it lives in the fifteen lines this
ticket rewrote and is the same law. `apps/api/src/index.ts:105`:

```ts
const accepted = AskAcceptedSchema.parse(await options.application.submit(ask, session));
```

If the application returns a shape that violates the wire contract, the resulting
`ZodError` hits `malformed` at `index.ts:71` and the client is told
`400 MALFORMED_REQUEST` — the server blaming the client for the server's own
contract breach. The same holds for every response-side parse on the read routes
(`DeploymentSchema` at `:98`, `AnswerSchema` at `:129`, `NodeSchema` at `:157`,
`InspectionSchema` at `:143`, `RunEventSchema` at `:177`). If B1's fix
introduces a stage marker anyway, distinguishing request-parse from
response-parse is nearly free at that point.

---

# Packet items — direct answers

**1. Is the boundary rule sound, or does it mislabel?** It mislabels. The rule is
sound in *intent* and drawn at the wrong altitude. Constructed case: **B1**, with
`MEMORY_MATCH_PREDICATE_DRIFT` (`packages/memory/src/index.ts:340`) as the
sharpest instance and `CONFIGURED_PROVIDER_SET_*` /
`SEQUENCE_ALLOCATION_FAILED` behind it. A broken database *connection* correctly
stays 500; a broken database *state* becomes 422.

**2. Is 422 right, and is 403 → 422 correct?** Yes to both. 403's authorization
flavour was actively misleading for an inventory fact. No wire-level information
is lost — the body already carried the exact code. The one real loss is at the
typed-client layer (**A3**): `FORBIDDEN` → `SERVER_FAILURE`.

**3. Does refusal/outage hold end to end?** **Yes, for the ask path**, and this
is the ticket's real win. Traced both:
- *Lawful refusal:* API `422 {"error":"RUN_COST_ENVELOPE_MEMBER_UNRESOLVED", "message":"No runCostEnvelope member matches…"}` → proxy passthrough (`route.ts:62-69`) → `contractErrorForResponse` → `/new` error box shows
  `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED: No runCostEnvelope member matches the declared depth and effective risk tier`.
- *API down:* proxy `fetch` rejects → `502 {"error":"API_UPSTREAM_UNREACHABLE", …}` → `/new` shows
  `API_UPSTREAM_UNREACHABLE: The API upstream did not answer the proxy request.`

Different text, different cause, neither invented. The token path also holds:
401 → `REJECTED` (token cleared); 502 → `COORDINATOR_FAILED` (token retained,
"The token was not rejected"). The premise in the packet's question — that the
proxy still turns ECONNREFUSED into a bare 500 — no longer holds; the worker
fixed it. What does **not** hold end to end is outage vs upstream-fault (**A4**).

**4. Token audit.** `shouldClearStoredTokenAfterUnlockFailure` is correct and all
four unlock/validate call sites route through it. Three *action* paths still
clear from a substring sniff (**A2**) — dead today, live the moment those stubs
are wired. No remaining bare catch narrates a server verdict: the survivors
either decode local input, render an honest unavailable state, or route to
`/new`. One borderline: `NodeDetailDrawer.tsx:146-148` catches and renders
`setHistory([])`, showing "no generations" where the truth is "no such
resource" — pre-existing UI-02 territory, not a token path, not raised.

**5. Advisories A3/A4 (deployment floor, present-NULL riskTier).** Both genuinely
worked, not narrated. `DEPLOYMENT_RISK_TIER` is gone from the env schema
(`packages/register/src/runtime-environment.ts:39`) with no leftover references
anywhere in configs or deploy files (verified by grep); `readDeploymentRiskTier`
(`packages/register/src/index.ts:167-200`) validates value, enum membership and
provenance and is the sole source at `apps/api/src/main.ts:24, 39`. Present-NULL
now reads INVALID on both sides — engine at `register/src/index.ts:186-190`, UI
at `apps/v2-ui/lib/v3/adapter.ts:578-586` — and only a genuinely missing row
projects typed absence. The remaining asymmetry (missing row: UI `null`, engine
throws at boot) is harmless and arguably unreachable, since the API will not
serve `/v1/deployment` at all in that state. The FAIR `independence: undefined`
fix prints a recorded count (`acceptance/fair-debate.ts:98`), inventing nothing.
The DR-158 non-existence is honestly recorded and I confirmed it: the ledger ends
at DR-157.

**6. Checks that cannot fail for their stated reason.** Two found: **A1**
(import-satisfied source assertion on the token decision, and the same on
`main.ts`) and the coverage hole in **A5/B1**. The headline 422 test is real and
does fail for the right reason.

---

# What I did not verify

- Did not re-run any gate; the orchestrator's are authoritative.
- Did not exercise :8790 (stale process, per the packet).
- No rendered-browser check — the end-to-end traces above are read from source,
  not from a screenshot. The author makes the same disclosure. Visual acceptance
  remains outstanding for the human/browser seat.
- The UI-02 hunks interleaved in `adapter.ts`, `DebateCanvas.tsx`,
  `NodeDetailDrawer.tsx`, `lib/types.ts`, `v2ui-data-layer.test.ts` and
  `v2ui-pages.test.ts` are outside POL-01's claimed authorship and were read only
  far enough to confirm they are not POL-01's.

---

# Recommendation

**CHANGES REQUESTED**, on B1 only. The rework is small and does not touch the
parts that are right: move the refusal marker from the route to the ask-evaluation
stage (`apps/api/src/index.ts:261-266`), and add the one test that is currently
absent — an internal typed error thrown from `submit` must yield 500 from
`POST /v1/asks`. A1 and A2 are cheap enough to be worth folding into the same
pass. A3–A7 can travel separately.
