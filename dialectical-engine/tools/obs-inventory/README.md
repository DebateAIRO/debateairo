# Observability inventory gate

`pnpm audit:obs-inventory` scans the production roots `apps/`, `packages/`,
`tools/`, and `acceptance/`. It compares the deterministic inventory with
`tools/obs-inventory/baseline.json` and reports every addition as
`FAIL <path>:<line> <class>`.

The scanner never opens, stats, or lists a classified zone path. Zone imports
are classified from the importing source text. The exact classification-list
source at `packages/obs-capture/src/zone/manifest.ts` is exempt because its
string literals are data, not imports.

## Authoritative baseline snapshot

The production baseline does not exist on this branch because FIX-02 through
FIX-05 have not been integrated. Do not create or copy a baseline from this
tree.

From the eventual integration candidate, run these read-only preflight checks:

```sh
git merge-base --is-ancestor e7b9f6812cafc8808cf5e188cd6440f19beda831 HEAD
git merge-base --is-ancestor 322b188649e5db7b1a264ceef2155f35470acd3e HEAD
git merge-base --is-ancestor 6d55ed4c5e3e8fef20b93ed91850cdd1766eac12 HEAD
git merge-base --is-ancestor ecbad9d60987a28d479dd13062fa763048aed4d8 HEAD
```

STOP on the first non-zero exit. A different reviewed tip or a rewritten
integration history requires fresh authority before snapshotting. When all
four checks return zero and V has approved the snapshot act, run:

```sh
pnpm audit:obs-inventory --snapshot
pnpm audit:obs-inventory
```

Commit `baseline.json` and append that commit to
`docs/missions/observability-agents/slices/FIX-16/DECISIONS.md`. Replacing the
baseline later is another V-approved act.

The labelled inventory ceiling is 30,000 ms. The inventory verdict is
independent of `audit:source`; root `lint` runs it as a separate command before
`audit:source`.
