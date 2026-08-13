# Review packet — UI-02b (dual diamond, DR-153)

**Board:** `debateai-v3` · **Ticket:** `t_35a2b742` (`review`) · READ-ONLY.
Both lenses must greenlight. Verdict + findings only; no edits, no git, no
board mutation.

## Why this ticket exists

V looked at a genuinely two-maker debate and asked *"this debate was
mono-model?"* — because the UI named the maker nowhere. The Anthropic call in
that run was not a rubber stamp: it AUTHORED the counter-position node through
the shipped JUDGE organ at call site `JUDGE:critic`. V could not tell.

**V's steer mid-ticket (DR-recorded):** *"UI-02b is nice yes. But we already
have the code for it inside the V2 UI."* V was right — V2 already ships
`ModelBadge` / `ModelMetaLine` / `modelColor` (`components/ModelPresentation.tsx`)
and six views already render them, all reading
`node.active_generation.model_id`. The adapter was setting
`active_generation: null` on every node. So the UI half is "fill the field V2
already reads", NOT "build a surface". The worker was relaunched with that
steer before it designed anything.

## What the author says it did

1. `NodeSchema` now REQUIRES `maker_lineage` — either a strict recorded
   identity (`maker`, `model_id`, nullable `model_version`, `provider`,
   `provider_ref`) or explicit `null`.
2. `ServeRepository.readNodesForRun` left-joins `ledger.raw_artifact` on the
   node's recorded `provenance_ref`. `projectNodeMakerLineage` relays a
   complete identity exactly and returns `null` if ANY required join member is
   unresolved — "never guesses from the model-id string".
3. The adapter fills `node.active_generation.model_id` with a model-id-only
   `GenerationPresentation`; `active_generation_id` stays null and no `role`,
   `argument`, `worker_id` or `created_at` is invented.
4. V2's presentation components are unchanged.

Contract-boundary choice: an ADDITIVE NODE FIELD rather than a separate
inspection resource, argued on the grounds that maker identity belongs to the
same node/provenance aggregate and every card view needs it. Claims no
migration was needed, no package edge changed, and no orphan-audit row is
needed because `projectNodeMakerLineage` has a production caller.

## Orchestrator's independent gates — do not re-run

root `tsc` clean · v2-ui `tsc` clean · root vitest **60 files / 418 tests** ·
acceptance vitest **9 files / 34 tests** · architecture
`{"edgeRowsChecked":27,"violations":[]}` · source `{"blocking":[]}`.
Confirmed present: `packages/contract/src/index.ts:278`
`maker_lineage: MakerLineageSchema.nullable()`.

## What to judge — spend your budget here

1. **DR-115 is the whole ticket.** V's complaint was being unable to tell who
   wrote what; the failure mode of the FIX is telling them something FALSE.
   Attack the resolver: can any path produce a maker that was not recorded?
   Can a partial ledger row yield a half-identity that renders as confident
   attribution? Is `null` genuinely returned when ANY member is missing, or
   only when all are? Does the UI distinguish "no maker recorded" from
   "maker recorded as X"?
2. **The V2 seam.** `Generation` (`apps/v2-ui/lib/types.ts:10-24`) REQUIRES
   `role`, `argument`, `worker_id`, `created_at`. The author says it supplies a
   "model-id-only `GenerationPresentation`" instead. Does that typecheck
   honestly, or does it lie to the type system (a cast, a partial, an `as`)?
   Do V2's six consumers behave correctly given the reduced shape — especially
   any that read `active_generation.role` or `.argument`? Name the consumers
   you checked.
3. **A REQUIRED field on a served contract is a breaking change.** Every
   producer of a `Node` must now supply `maker_lineage`. Did every construction
   site get updated — including test fixtures, the live/streaming projection,
   and any replay path? What happens to an answer persisted BEFORE this change?
4. **The ledger join.** Left-joining `ledger.raw_artifact` on `provenance_ref`
   — is the join key correct and unique? Can it fan out and duplicate nodes?
   Is it evaluated per node in a loop (N+1) on a path the browser hits?
5. **The defect class that has cost this mission most:** checks that cannot
   fail for the reason their author believed. Four revisions on EXEC-01, two on
   UI-02a. Are the new tests behavioural, and would they fail if the resolver
   started guessing?

## Verdict

`APPROVED` or `CHANGES REQUESTED`; BLOCKING → ADVISORY, each with file:line,
the named law or concrete scenario, and the failing case. "Nothing blocking" is
legitimate — do not manufacture findings.

Note `apps/v2-ui/lib/v3/adapter.ts` previously held raw NUL bytes that made
plain `grep` skip it silently; that is fixed, but `grep -a` on that file costs
nothing.

Write to `reviews/ui02b-<yourname>-rev1.md` and print to stdout.
