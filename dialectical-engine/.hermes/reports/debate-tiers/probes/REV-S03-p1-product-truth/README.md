# Probes — REV-S03-p1-product-truth (slice S03, head `cc014550`)

Two probes, written against the slice head `cc014550`. Neither hard-codes a repository root:
`model-config-broken-edits` reads `config/models.yaml` from `process.cwd()`, and
`new-page-deployment-refusal` imports the page by a path relative to `tests/`.

**How to run them from any worktree** (`$WORKTREE` = that worktree's `dialectical-engine` directory):

```
cp new-page-deployment-refusal.test.tsx "$WORKTREE/tests/render/"
cp model-config-broken-edits.test.ts    "$WORKTREE/tests/unit/"
cd "$WORKTREE"
LANG=en_US.UTF-8 npx vitest run tests/render/new-page-deployment-refusal.test.tsx tests/unit/model-config-broken-edits.test.ts
```

They are test files, not mutants: they write nothing into the tree, and
`model-config-broken-edits` builds every fixture in its own `mkdtemp` root and removes it.

## `new-page-deployment-refusal.test.tsx` — 3 cases, all passing at `cc014550`

Case A is the control on known-good input: a RESOLVED deployment payload renders all five ids with
a non-empty identity dot. Cases B and C are what the author's suite does not cover — the page when
the deployment read does NOT resolve, which is what the real API answers a browser
(`GET /v1/deployment` is `auth: "operator"`, `apps/api/src/index.ts:139`, and the only runtime
evaluation of that policy refuses every cookie session, `apps/api/src/index.ts:475-477`).

**Case B is the evidence for finding B1:** both tier cards render ZERO model ids, no `.error`
element appears, and the two tier buttons still render — so the page looks finished and names no
model. Case C shows a resolved payload with no `planTierRosters` row behaves identically.

Note for anyone extending it: mock `readSession` RESOLVED. The author's harness rejects it, which
paints `ASK_SESSION_DEFAULTS_UNAVAILABLE` and masks whether the deployment failure says anything.
That cost this seat one run.

## `model-config-broken-edits.test.ts` — 10 cases, all passing at `cc014550`

V's own plausible edits to `config/models.yaml`, each asserted on the product observable (the
refusal names the tier, the entry's model and a class; no key-looking value is ever echoed):
a pasted real key, `api: acme`, a second Anthropic entry in Premium, a query string in `base_url`,
credentials in `base_url`, a deleted tier, broken YAML indentation.

Two cases pin STANDING RISKS rather than defects, so that a later pass sees them move:
`glm-4.7` (the id V asked for in words) is ADMITTED by the file check — the echo rule R30 only bites
later as an availability warning (row V-37) — and a file with no `cli:` entry at all is ADMITTED
(row V-39).
