# KB evidence — support-conversation-20260914

Node `KB`, BUILD CP1-C1 pass 1/3, ticket `t_3e878484`, session `/root/requirements`, authority epoch 1. Worktree branch `codex/support-conversation-cp1` started at `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`. Scoped commit: `fb47b34eac5d72b324def7499828de15cf44b9ba` (`feat(support): add reviewed knowledge catalog boundary`).

## Implemented boundary

- `packages/support-kb/src/catalog.ts:1-235` defines the browser-safe language, audience, availability, closed action IDs, 11 named page-route dispositions, proxy exclusion, bilingual labels, article mappings and canonical catalog bytes.
- `packages/support-kb/src/navigation.ts:9-89` resolves only closed first-party actions. Private and public debate links require trusted UUID projections. Unknown, unresolved Forgot password, malformed, external, backslash, token-bearing and unverified dynamic requests resolve to nothing.
- `packages/support-kb/src/context.ts:4-116` always emits the complete compact policy/catalog, lexically selects up to three whole reviewed article sections in one language, emits up to three requested action IDs and omits internal source/review fields. CP1 prior history is fixed to empty.
- `packages/support-kb/src/index.ts:24-54,369-509` parses exact-byte Sol editorial records separately from owner ratification, hashes canonical catalog bytes plus selected article/provenance bytes, reports preview-reviewed and owner-ratified counts, and exposes immutable exact-version process lookup without rereading documents.
- `packages/support-kb/package.json:8-10` exports browser/catalog, context and navigation subpaths without Node imports in the catalog.
- The corpus now contains 18 complete EN/RO pairs. Six unchanged pairs retain historical owner ratification. Six corrected and six new pairs, 24 exact files total, have blank `ratified_by` and `ratified_on` and remain excluded until separate editorial review.

## Editorial handoff

`KB-manifest.json` records SHA256 for every one of the 24 changed/new article draft files and all nine code/test boundary files. It contains no review identity or owner approval. The runtime canonical catalog digest is:

```text
24784328a4bb8d4e5205b3036dd369268180df792243db1c296a0a7ed2a0f9fe  SUPPORT_CATALOG_CANONICAL
```

The separate editorial manifest must use schema version 1; its catalog record contains the exact canonical digest plus literal role `SOL`, actual separate reviewer session, valid review date and durable evidence locator. Each accepted article record contains `id`, `lang`, exact markdown-byte SHA256 and the same actual review fields. Both EN/RO article bytes and catalog digest must match. Owner ratification remains independent and blank until V accepts CP1.

## RED/GREEN and refutation evidence

All test commands used the repository capture runner. No identical passing suite was repeated without a relevant implementation, test, failure-fix or mutation-restore change.

| Evidence | Result |
|---|---|
| `KB-baseline-support-kb.log` | untouched baseline `tests/unit/support-kb.test.ts`: 22/22 passed |
| `KB-red-c1.log` | RED: 4/4 files failed at import because catalog/navigation/context and new loader exports did not exist; no test bodies ran |
| `KB-green-c1.log` | diagnostic: 46/47 passed; export query also selected creation through shared stop words |
| `KB-green-context-fix.log` | after root-cause stop-word fix: context 5/5 passed |
| `KB-green-c1-final.log` | exact C1 suite: 47/47 passed |
| `KB-mutant-snapshot-red.log` | mutation returned current snapshot for every version: 29/30 passed, exact-version assertion failed |
| `KB-mutant-attestation-red.log` | mutation accepted a non-Sol catalog reviewer: 29/30 passed, invalid-reviewer assertion failed |
| `KB-green-after-mutants.log` | exact C1 suite after byte-for-byte restores: 47/47 passed |
| `KB-green-final-acceptance.log` | after catalog-pair, partial-ratification and catalog-digest acceptance assertions: 51/51 passed |

`git diff --cached --check` was clean before commit. `git show --name-only fb47b34e` lists only the 33 packet-authorized KB product/test files. Concurrent Preview/API/Register changes remained unstaged. The post-commit KB scope is clean, and all 33 entries in `KB-manifest.json` match current committed bytes.

## Key SHA256 receipt

```text
be0c28d2629fa01cba3351e31f6f4864391fcc091b33d978e52551471bc41e36  packages/support-kb/src/catalog.ts
d55c80d91d7e0d737787220539b26dc10ebf8f497d09a58e86e0160c81469cfe  packages/support-kb/src/navigation.ts
e7c9c6ff6a223c419630d62c2befc5fb3d9fdecc3c6fff207474f4f42aa5fae0  packages/support-kb/src/context.ts
63bb5bb52c8457e5126ccefd953d667c48a71712c6fd06d635c2df186d3ae239  packages/support-kb/src/index.ts
11ae5b086ed8242c86eb21f2e99af208c217fb87d1e72947b78ad973a84f6b19  packages/support-kb/package.json
171bab4197f3111ba09c163572667a4a85ff04b3e6bd4fbf877b1f61c4677b5c  tests/unit/support-kb.test.ts
1260593faf5160d5f3c47b41c6606919b0ddfc64cb2e18314047069057eeacfd  tests/unit/support-context.test.ts
5c2489530cc0614906720f45f485c54876a7830a4e62a322cd25101fd1101052  tests/unit/support-navigation.test.ts
78c69649a3459eee15a7c1c40bde9ceaf21d7b7812ea5cbcc4e8dfe2cd1a78fe  tests/architecture/support-catalog-coverage.test.ts
```

The full exact article/file receipt is `KB-manifest.json`; its own digest and this report's digest are recorded in the ticket handoff.

## UNVERIFIED

- No current draft byte is editorially attested; therefore the 12 changed/new pairs remain excluded from runtime eligibility.
- The exact existing Forgot password destination remains unresolved and the action intentionally does not resolve.
- API/UI integration, session 409 behavior, disjoint-stack preview, typecheck/build and manual UI acceptance belong to later owners/checkpoints and were not run here.
- Agent token usage and exact wall-clock duration are unavailable from this harness.
