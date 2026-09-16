# REV-S03-p3-product-truth — promoted probes (pass 3)

All five were written against **3f488b3f** (`integration/all` carrying slice head `0fe14637`
= `cd043907` + FIX-S03-p2-F1). Paths inside them are worktree-relative (`process.cwd()`)
or taken from `$WORKTREE` / argv — nothing is hard-coded to a lane.

## How to run

Copy the two `.test.ts` files to `tests/unit/` and the `.test.tsx` to `tests/render/` of the
worktree under review, then from that worktree:

```
LANG=en_US.UTF-8 npx vitest run \
  tests/unit/REV-S03-p3-product-truth-wire.test.ts \
  tests/render/REV-S03-p3-product-truth-page.test.tsx \
  tests/unit/REV-S03-p3-product-truth-drift.test.ts
```

Measured at 3f488b3f, three runs: `Test Files 3 passed (3) · Tests 20 passed (20)` each run.

## What each one is for

| file | joins | measured at 3f488b3f |
|---|---|---|
| `REV-S03-p3-product-truth-wire.test.ts` | the REAL publisher's row → the REAL projection → the REAL route → the REAL contract client | 12/12. Wire body `{"free":["gpt-5.6-luna","glm-5.3-flash"],"premium":["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]}`; wire key set exactly `["free","premium"]` |
| `REV-S03-p3-product-truth-page.test.tsx` | the bytes the REAL route returns → the REAL `/new` page's DOM | 5/5. Free card `["gpt-5.6-luna","glm-5.3-flash"]`, Premium card the three ids, no refusal banner |
| `REV-S03-p3-product-truth-drift.test.ts` | the DISPLAY roster (published register row) vs the EXECUTION roster (generated constant) | 3/3. They agree at the committed file; `dev:auth:up` runs no generator |
| `REV-S03-p3-product-truth-mutant-reader.sh` | proves the two fixtures above DETECT the pass-2 defect | reverting F1's projection turns them `10 failed \| 7 passed (17)` |
| `REV-S03-p3-product-truth-mutant-acceptance-residue.sh` | prices SPEC-v3 §2 steps 6 / 10a leaving `config/models.yaml` edited | `2 failed \| 48 passed (50)` after step 6; unchanged after 10a on top |

## Re-derivations from pass 2 (do not carry the pass-2 copies forward blind)

- Pass-2 case **C** (`REV-S03-p2-product-truth-newpage.test.tsx:127`) mocked `readPlanTiers`
  to **reject** and then asserted the Free card lists the ids — self-contradictory, so RED at
  every head. Re-derived here as the JOIN: the real route's body drives the page. Not "mock a
  resolved literal" (that is pass-2 case A, a control that says nothing about the route).
- Pass-2 case **3b** asserted the **writer-side** remedy (no `kind` in `value_json`). F1 ruled
  **reader-side**. Re-derived here as the two-sided statement: the persisted text KEEPS `kind`,
  the wire does NOT.

## Mutant discipline

Both `.sh` probes capture the target file's CURRENT bytes to a temp copy and restore FROM that
capture on EXIT (`trap`), never to a literal — the pass-2 lesson where a `disabled=false` revert
to a literal unlocked the whole page at a later head. Each prints `RESTORED: cmp equal`.
