# Legacy 4-value POV `node_type` reuse

Investigation-and-documentation note. **No behavior change.** Written for Task 9
(P2.5, scoring/status hygiene — see `docs/improvement-plan-2026-07-22.md` §P2.5:
"retire the legacy 4-value POV `node_type` reuse (the QBAF adapter comment in
`dialectical_v2.py:107` documents the constraint)"). That retirement is
explicitly **not** done in this pass; this note records why, and what it would
take.

## Which legacy values exist

`Node.node_type` is a plain, unconstrained `String(16)` column
(`coordinator/app/models/entities.py:55` — no enum, no CHECK constraint).
Four literal strings, defined once as `POV_BRANCHES`
(`coordinator/app/services/dialectical_v2.py:76-81`):

- `SCIENTIFIC_POV`
- `STATISTICAL_POV`
- `ETHICAL_POV`
- `PRACTICAL_POV`

These, plus the structural types `ROOT_CLAIM`, `PRO`, `CON`, `EVIDENCE`, are
the entire vocabulary ever written to `node_type` (confirmed by grepping every
`node_type="..."` write in `coordinator/app`; also independently confirmed by
the adapter's own "Vocabulary confirmed via `grep -rn node_type
coordinator/app`" comment, `coordinator/app/qbaf/debate_adapter.py:28-32`).

**Two different things currently share this vocabulary:**

1. **The original fixed POV quartet** (`DIALECTICAL_DYNAMIC_PERSPECTIVES=false`):
   exactly 4 branch-container nodes per debate. `node_type` and the node's
   `claim` label are in a genuine 1:1 pairing — a `SCIENTIFIC_POV` node always
   carries `claim="Scientific POV"`.
2. **Dynamic perspectives** (`DIALECTICAL_DYNAMIC_PERSPECTIVES=true`, the
   default): 2-16 branch-container nodes per debate (`max_perspectives()`,
   default 7, `dialectical_v2.py:186-193`), each carrying an arbitrary
   claim-type-derived or LLM-planned label (e.g. "Mechanism POV",
   "Confounding POV", "Trend POV" — see `_CLAIM_TYPE_PERSPECTIVES`,
   `dialectical_v2.py:122+`). Here `node_type` no longer identifies the
   perspective at all: it is assigned by cycling `POV_BRANCHES` on the
   perspective's ordinal position (`_attach_pov_node_types`,
   `dialectical_v2.py:196-204`: `pov_types[index % len(pov_types)]`). A
   6-perspective debate reuses the `SCIENTIFIC_POV` and `STATISTICAL_POV`
   node_types on two unrelated sibling perspectives each (ordinal 0 & 4,
   1 & 5). The perspective's real identity lives entirely in `Node.claim`
   and in `debate.config["perspective_derivation"]["lenses"]` — never in
   `node_type`. This reuse is written up in
   `dialectical_v2.py:100-118` ("node_type design (safest minimal choice,
   justified)").

## What depends on them (the QBAF adapter constraint)

`coordinator/app/qbaf/debate_adapter.py` hardcodes the four strings as the
recognized branch/support vocabulary, in **both** scoring-graph semantics
paths:

- `_SUPPORT_TYPES = {"PRO", "SCIENTIFIC_POV", "STATISTICAL_POV", "ETHICAL_POV", "PRACTICAL_POV"}`
  (line 40) — legacy `DEFAULT_SEMANTICS` path (`_edge_for`, lines 67-77).
- `_DEFAULT_CONTAINER_TYPES = frozenset({"SCIENTIFIC_POV", "STATISTICAL_POV", "ETHICAL_POV", "PRACTICAL_POV"})`
  (lines 43-45) — `SEMANTICS_V2_LENS_LIFT` path (`_v2_node_class`, lines 80-91).

Any `node_type` **not** in these sets returns `"unmapped_edge"` in both paths
— that node's edge into the QBAF `ArgumentGraph` is silently dropped, and (via
the lens-lift semantics' parent-walk in `_v2_effective_parent`,
`debate_adapter.py:94-126`) the entire subtree under that container becomes
disconnected from the root's aggregated score. This is the exact mechanism
the `dialectical_v2.py:107` comment warns about, and it is why dynamic
perspectives cannot simply mint a new, more honest `node_type` (e.g.
`"PERSPECTIVE"`) today — the adapter would treat every such node as unmapped
and drop the whole perspective's contribution to scoring, silently (no error,
just a subtree that never influences the debate's verdict).

Three more call sites depend on the same four-string vocabulary as a
fallback/mirroring concern (not a hard scoring dependency, but part of the
coupling surface a retirement would have to touch):

- `coordinator/app/services/orchestrator.py:38-43` (`V2_POV_ROLES`) — regen-role
  fallback used only when a POV node's `claim` is blank
  (`orchestrator.py:1786-1794`).
- `coordinator/app/services/serialization.py:249-259` (`_LEGACY_POV_LABELS`,
  duplicated from `POV_BRANCHES` — a real circular-import cycle prevents
  importing it directly, per the comment there: "Keep in sync with
  dialectical_v2.POV_BRANCHES") — used by `_node_label`
  (`serialization.py:262-280`) to decide whether the frontend needs an
  explicit label override, or can render the legacy curated name from
  `node_type` alone.
- `coordinator/app/protocol/cross_exam.py:18-22` — documentation-only comment
  listing the same vocabulary; `_OPPOSING_NODE_TYPES` itself only matches
  `"CON"`, so there is no functional dependency here, just a stale-vocabulary
  comment to update if the values ever change.

The frontend does **not** hardcode the four strings: `web/lib/debateTreeUtils.ts`'s
`NON_LENS_NODE_TYPES` (line 56) / `isLensNodeType` (lines 63-67) already treats
any `node_type` outside `{ROOT_CLAIM, PRO, CON, EVIDENCE}` as a generic lens,
by design ("Generic across any backend-provided lens type -- not limited to
the four legacy POV literals"). The reuse constraint is a backend-only (QBAF
adapter) concern.

## What a safe retirement would require

1. **A new, honest generic node_type** (e.g. `"PERSPECTIVE"` or
   `"LENS_CONTAINER"`) so a dynamically-labeled "Mechanism POV" node stops
   being literally typed `SCIENTIFIC_POV`.
2. **QBAF adapter change**: recognize the new type identically to the old
   four in *both* `_edge_for`/`_SUPPORT_TYPES` and
   `_v2_node_class`/`_DEFAULT_CONTAINER_TYPES`. This is the load-bearing
   change — getting it wrong silently orphans scoring subtrees exactly as
   described above.
3. **A data migration** for every existing branch-container `Node` row
   (`node_type IN (SCIENTIFIC_POV, STATISTICAL_POV, ETHICAL_POV,
   PRACTICAL_POV)` at `depth=1`, direct child of the debate's `ROOT_CLAIM`)
   to the new type. This is safe to do in bulk without losing information —
   the real label has always lived in `Node.claim`, never in `node_type` —
   but it must run against the live `~/.dialectical/db.sqlite3` (out of
   scope for this task; see this task's companion node-status item for why
   prod DB writes are not made here) and must be sequenced with #2: an
   un-migrated legacy row hitting a *new* adapter that dropped the old four
   from its recognized set, or a migrated row hitting an *old*, unpatched
   adapter, both reproduce the same "unmapped_edge" orphaning bug.
4. **Update the three fallback/mirroring call sites** above so they degrade
   sensibly once rows are migrated: their fallback branches already fail soft
   (a missing dict key falls through to `else`), but the "keep in sync with
   `POV_BRANCHES`" duplication (`serialization.py:250-253`) would need
   re-auditing, and `V2_POV_ROLES`/`_LEGACY_POV_LABELS` would become
   dead code for every post-migration debate.
5. **Decide the fixed-quartet-off path's fate**: with
   `DIALECTICAL_DYNAMIC_PERSPECTIVES=false`, a debate legitimately wants
   exactly the four original semantic types — retirement needs to either
   keep the four types *only* for that flag-off path (two `node_type`
   conventions living side by side) or fold the flag-off path into the same
   generic container type too (simpler, but changes what a flag-off debate's
   `node_type` looks like on disk, a further migration/compat concern).
6. **Re-verify QBAF graph construction end-to-end** (both semantics paths,
   fixed-quartet and dynamic-perspective debates, old and migrated rows)
   before shipping, since the failure mode is silent (a debate scores as if
   an entire perspective's argument tree never existed) rather than a loud
   error.

## Why this is not being done in this pass

This task (P2.5, hygiene) is scoped to two small, local, independently
TDD-able fixes (a rationale string template; one status-string literal).
Retiring the node_type reuse is a cross-cutting change that touches the
single most correctness-sensitive module in the scoring pipeline — a mistake
in the QBAF adapter silently drops real argument subtrees from a debate's
score rather than raising a visible error — and requires a live-database
migration plus end-to-end re-verification of graph construction. That is out
of proportion to a hygiene pass and carries materially more risk than the two
behavior changes actually made under this task. Retiring it is a candidate
for its own dedicated, reviewed task, not a hygiene-pass line item.
