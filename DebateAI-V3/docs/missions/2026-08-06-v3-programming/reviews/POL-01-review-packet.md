# Review packet — POL-01 (dual diamond, DR-153)

**Board:** `debateai-v3` · **Ticket:** `t_a8ad8b2f` (`review`) · READ-ONLY.
Both lenses must greenlight.

## What this ticket is

V hit this personally, twice. `apps/api/src/index.ts:71-77` collapsed EVERY
`TypedDomainError` except one into `500 INTERNAL_ERROR`, discarding the code,
with `Fastify({logger:false})` so nothing was logged either. A lawful refusal
was indistinguishable from a crash. V clicked "start debate", got a bare 500,
and the truth was `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED`.

Sibling defect, same theme: V pasted a CORRECT token against a down
coordinator and was told *"Token was rejected by the coordinator"* — a verdict
no server ever issued.

## What the author says it did

A **boundary-based rule**, not a hand-picked status per error:
- Zod / syntax failures → `400 MALFORMED_REQUEST` (unchanged)
- a `TypedDomainError` escaping the ask-submission boundary → **`422` with that
  error's exact `code` and `message`** (an observed semantic refusal)
- internal faults keep 5xx
- `MAKER_INVENTORY_UNSATISFIED` moves from its special-case **403 → 422**
Plus an audit of remaining bare-catch sites that falsely invalidated or cleared
a stored token on an outage.

Live evidence claimed: `POST /api/v1/asks -> HTTP 422`.

## Orchestrator's independent gates — do not re-run

root `tsc` clean · root vitest **61 files / 431 tests** · architecture
`{"edgeRowsChecked":27,"violations":[]}` · source `{"blocking":[]}`.

**Note:** the standing API on :8790 is still running PRE-POL-01 code, so a live
`POST` against it still returns the old 500. That is a stale process, not a
defect — do not report it as one. The author's live evidence was captured
against its own instance.

## What to judge

1. **Is the boundary rule sound, or does it mislabel?** DR-115 says never state
   an outcome the system did not observe — and a status code IS a statement.
   Can a genuine INTERNAL fault now escape the ask boundary as a
   `TypedDomainError` and get dressed as a client-actionable 422? Construct the
   case if it exists. That is the failure mode this fix could introduce.
2. **Is `422` right, and is moving `MAKER_INVENTORY_UNSATISFIED` off 403
   correct?** 403 carried an authorization flavour. Argue it either way, but
   say whether the change loses information a client could act on.
3. **Does the refusal/outage distinction hold end to end?** The proxy
   (`apps/v2-ui/app/api/[...path]/route.ts`) turns ECONNREFUSED into a bare
   500. If the API now speaks 422 but the proxy still speaks 500 for outages,
   is the browser genuinely able to tell them apart? Check what the UI shows
   for each.
4. **The token audit.** `apps/v2-ui/lib/v3/tokenUnlock.ts` classifies failures;
   the worker added `shouldClearStoredTokenAfterUnlockFailure`. Verify a stored
   token is cleared ONLY on a real rejection, never on an outage — and that no
   remaining action path still narrates a server verdict from a bare catch.
5. **The accumulated advisories** (A3: deployment floor read from a register
   row in acceptance but from env `DEPLOYMENT_RISK_TIER` at
   `apps/api/src/main.ts:37`; A4: a present-but-null `riskTier` row reads as
   ABSENT in the UI and INVALID in the engine). Worked, or honestly recorded?
6. **The defect class that has cost this mission most** — checks that cannot
   fail for the reason their author believed (four revisions on EXEC-01, two on
   UI-02a, one on DEPTH-01). Would these tests fail if the mapping regressed to
   500? A test asserting "an error is returned" cannot catch a refusal wrongly
   typed as internal.

## Verdict

`APPROVED` or `CHANGES REQUESTED`; BLOCKING → ADVISORY with file:line and the
concrete failing case. "Nothing blocking" is legitimate — do not manufacture
findings.

Write to `reviews/pol01-<yourname>-rev1.md` and print to stdout.
