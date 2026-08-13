# PANEL-01 rework directive — rev1 → rev2

**Diamond:** Grok CHANGES REQUESTED (2 blocking) · Opus 5 CHANGES REQUESTED
(3 blocking, 8 advisory). Both lenses independently failed the SAME two soul
checks. V has since RULED the contract question (DR-161), so everything you
need is decided.

## What both lenses verified RIGHT — do not touch

Two maker-authored roots, per-root B3-B via real expansion, real symmetric S07
cross-root edges (all 4 independent, no self-grading), honest per-node
lineage, arithmetic reconciling exactly (8 nodes / 4 attacks / 12 calls),
dormant `runJudgePanel` surfaces byte-untouched, the two-root topology pinned
hard by test. The engine is done. This rework is the HONESTY LAYER.

## B-1 — V RULED IT (DR-161): mint `UNSERVED-MAKER-POSITION`

The current disclosure is a bare `UNCOVERED-SCOPE` mark: no typed record, a
chip reading "Scope not fully covered", colliding with the DR-020 knob-8 /
battery-Q27 meaning — and mutating the mark list to `[]` fails NO test.

V minted a NEW kernel condition mark: **`UNSERVED-MAKER-POSITION`**.
1. Add it to the closed CONDITION_MARKS vocabulary (`packages/kernel`).
2. Typed `ConditionMarkRecord` REQUIRED for it — add to the required-record
   list at `packages/serve/src/index.ts:882` — whose reason text NAMES BOTH
   MAKERS and WHICH root was served (e.g. "Served answer composed from the
   OpenAI-authored root; the Anthropic-authored position (node <id>) is in
   the graph unserved").
3. Chip label in `apps/v2-ui/lib/v3/labels.ts` in V2's vocabulary — plain
   words, e.g. "A maker's position is not in the served answer".
4. STOP using `UNCOVERED-SCOPE` for this purpose; Q27 keeps its meaning.
5. A test that FAILS if the mark or its record is missing on a multi-root
   serve (the exact mutation that survived rev1: disclosure set to `[]`).

## B-2 — the served root must be a RECORDED DECISION, not `providers[0]`

Today: `authoredNodes[0]` ← `policy.providers.openai.providerRef` ←
`configuredProviderSet.providers[0]`. OpenAI every run, by array position,
declared nowhere, recorded nowhere. That silently reopens the model-balance
question V dismissed.

Fix: make the rule EXPLICIT and CARRIED. A named function/constant declaring
the rule (first-configured-provider is acceptable AS A RULE if stated), its
outcome recorded on the answer's provenance (the DR-161 record's text already
names the served maker — ALSO carry the rule's identity, e.g.
`served_root_rule: "first-configured-provider"`, wherever the record's typed
shape lives), and a test pinning that the recorded rule matches what actually
served. You are NOT being asked to alternate or randomise — that is V's
future call; you are being asked to stop hiding the current rule.

## B-3 — the M-guard needs an integration test

The guard is correct, wired, typed, DR-159-naming — and DELETING IT leaves
the whole suite green. `tests/integration/database.test.ts:104` already
parameterises runs; add the case: `agent_count: 3` → typed refusal
`RUN_MAKER_CONFIGURATION_MISMATCH`/DR-159 code BEFORE any model call.
Also assert the mismatch code somewhere. (~10 lines, the lens estimates.)

## Advisories to fold or record (say which)

- **A-1 (fold if cheap, else record loudly):** PRO-01's
  `buildDebateExpansionPlan` now has ZERO production callers and
  `buildMultiMakerExpansionPlan` is a divergent copy whose M=1 branch would
  author every leg "primary" (self-pro/con, FAIR-illegal) if it ever ran.
  Dead code that disagrees with its live sibling is how drift ships: either
  unify to one planner or delete the dead branch and record why.
- **A-3 (record in handoff + ledger note):** the shape costs +1 logical call
  vs DR-159's basis; depth-5 worst case 405 vs seeded 402 — graceful
  HARD_STOP, but STATE it.
- **A-4 (record):** `/new` offers unbounded agent_count with no hint only 2
  works — UI ticket territory.
- **A-5 (record):** 2 of 4 cross-root attacks are invisible in the tree
  (support edge wins the parent link) — surfaced only in the drawer.
- A-2, A-6..8: record.

## Done when

DR-161 implemented end to end (kernel mark, required typed record naming both
makers and the served root, chip label, the `[]`-mutation test red);
served-root rule explicit + recorded + pinned; M-guard integration test in;
advisories folded/recorded; every gate green with REAL pasted output EACH
(contract change → run `generate:contract` and the architecture suite);
handoff updated in place; same session; `REWORK READY FOR HERMES REVIEW —
PANEL-01 rev2`.
