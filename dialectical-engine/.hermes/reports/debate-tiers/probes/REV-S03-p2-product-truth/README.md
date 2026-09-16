# REV-S03-p2-product-truth — promoted probes (head they were written against: `d35a9634`)

Both are the lens's OWN fixtures, built from SPEC-v3 acceptance step 2, and both assert what the
product PROMISES — so at `d35a9634` their failures ARE finding B1 speaking, and a later head that
makes them green is the fix landing. **Re-derive before trusting a direction at another head.**

## How to run (from ANY worktree)

Copy the two files into the tree under test and run them by path, from the repo root
(`$WORKTREE/dialectical-engine`) — nothing here hard-codes a root; imports are relative and the model
config is read through `loadModelConfig(process.cwd())`, as the stack reads it.

```
cp REV-S03-p2-product-truth-probe.test.ts    "$WORKTREE/dialectical-engine/tests/unit/"
cp REV-S03-p2-product-truth-newpage.test.tsx "$WORKTREE/dialectical-engine/tests/render/"
cd "$WORKTREE/dialectical-engine"
LANG=en_US.UTF-8 npx vitest run tests/unit/REV-S03-p2-product-truth-probe.test.ts \
                                tests/render/REV-S03-p2-product-truth-newpage.test.tsx
```

Delete both copies afterwards: they are review fixtures, never committed to a slice.

## What each case measured at `d35a9634` (2026-09-16)

`REV-S03-p2-product-truth-probe.test.ts` — **4 passed / 3 failed**. Joins the REAL publisher → the
REAL projection → the REAL route → an ordinary cookie session, which no shipped suite joins.

| case | measured |
|---|---|
| 0 | the file's Free ids are `gpt-5.6-luna`, `glm-5.3-flash` — PASS |
| 1 CONTROL | a bare `{free,premium}` row ⇒ **200** with the file's ids — PASS |
| 2 THE REAL ROW | the published row ⇒ **500** `{"error":"INTERNAL_ERROR","correlation_id":"…"}` — **FAIL (B1)** |
| 3 projection | `ZodError … "unrecognized_keys", "keys": ["kind"]` at `apps/api/src/index.ts:1539` — **FAIL (B1)** |
| 3b persisted | `{"free":["gpt-5.6-luna","glm-5.3-flash"],"kind":"PLAN_TIER_ROSTERS","premium":["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]}` — **FAIL (B1)** |
| 4 | no cookie ⇒ **401 `SESSION_REQUIRED`** — PASS |
| 5 | `/v1/deployment`, same session ⇒ **403 `OPERATOR_REQUIRED`** (stayed operator-only) — PASS |

`REV-S03-p2-product-truth-newpage.test.tsx` — **2 passed / 1 failed**. What V's screen shows.

| case | measured |
|---|---|
| A CONTROL | a resolved read renders exactly the file's five ids, each with a non-empty `--dot` — PASS |
| B RE-DERIVED | `ids=[]`, `error="ASK_PLAN_TIER_ROSTERS_UNAVAILABLE: INTERNAL_ERROR"`, both cards rendered — PASS (the refusal IS named: F2's honesty half works) |
| C step 2 | `expected [] to deeply equal [ 'gpt-5.6-luna', 'glm-5.3-flash' ]` — **FAIL (B1)** |

Pass-1's case B asserted SILENCE (0 ids, no `.error`). That direction is **stale** at this head —
`FIX-S03-p1-F2` made the refusal visible — which is why case B here asserts the named error and case C
carries step 2's actual claim.
