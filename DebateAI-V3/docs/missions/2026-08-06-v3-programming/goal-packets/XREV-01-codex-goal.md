# /goal packet — XREV-01 (Codex seat, PROG-V3-R1) — the last substantive ticket

**Board:** `debateai-v3` · **Ticket:** `t_b8750870` · **Assignee:** codex
**Roster (DR-153):** Codex implements · dual diamond (Opus 5 + Grok).
**NIGHT MODE (V, 2026-08-12):** questions go in the handoff's QUESTIONS FOR V
section; take the conservative documented-law path; a genuine wall means STOP
LOUDLY and park, never invent.

Standing law: `CODING-LOOP-PROTOCOL.md` + the ledger through DR-164. Read the
ticket body (`hermes kanban --board debateai-v3 show t_b8750870`).

## V's requirement (DR-148(4), V's words)

*"I wanna see how each new node is reviewed by yet another model."* Each
authored node gets reviewed by a SECOND, DIFFERENT-MAKER model, with:
- the review's OWN lineage (who reviewed, recorded as produced — DR-115),
- a TYPED outcome: `agree` / `dispute` / `cannot-assess`,
- V2-vocabulary UI (extend the existing node drawer / card language; do not
  invent a new widget class — DR-145).

## What you inherit (all dual-approved — build on, do not rework)

- Maker lineage per node end to end (UI-02b/c): `maker_lineage` on the node,
  `makerIdentityLabel` seam rendering the house on all seven surfaces.
- The M=2 engine: two maker roots, per-root B3-B expansion, cross-root edges
  (PANEL-01); depth-driven expansion (PRO-01).
- The enforced M=2 fixture + provider doubles (HYG-01) — your iteration bed.
- DR-161's precedent for adding a kernel condition mark + required typed
  record, if your design needs a disclosure surface.

## Design constraints

1. **The reviewer maker must differ from the author maker** — that is the
   ticket. Enforce it structurally (the FX-HR-H6 discipline: no maker grades
   its own artifact) and record what ACTUALLY ran.
2. **The typed outcome is a closed vocabulary** (`agree`/`dispute`/
   `cannot-assess`) — minted once in the kernel, carried on a contract
   surface you choose and justify (per-node field vs review resource — the
   UI-02b precedent chose the additive node field for reader-adjacent data).
3. **`cannot-assess` is honest absence**, not failure: a reviewer that
   cannot judge says so typed; a reviewer CALL that fails leaves the review
   ABSENT with typed absence in the UI — never a fabricated verdict (DR-115).
4. **Envelope honesty:** each review is a MODEL_CALL charged to the ratified
   ceiling. At depth-1 M=2 (8 authored nodes) reviews add ~8 calls → ~24
   total vs ceiling 42: fits. At deeper depths reviews may NOT fit — if the
   arithmetic exceeds the ratified member, the run must stop loudly on the
   typed exhaustion path, and your handoff must state the per-depth review
   arithmetic so V can re-rule ceilings if V wants reviews at depth 3+.
   DO NOT invent a bigger number (AC-76). DO NOT silently skip reviews to
   fit (that fabricates coverage).
5. **UI:** review outcome + reviewer house on the node drawer (and a compact
   card affordance in V2's idiom). Typed absence rendered like the scoring
   pills and maker pill (the house pattern, thrice-established).
6. **N-generic (DR-162-A):** reviewer selection must be a rule over the
   maker set (e.g. "any configured maker ≠ author"), not a hardcoded pair.

## Cost discipline

Iterate ENTIRELY on provider doubles. ONE real proof at depth 1 (~24 calls
total). Disclose exact real spend. The depth-3 run stays V's.

## DONE WHEN

Depth-1 M=2 real proof: every authored node carries a cross-maker review with
typed outcome + reviewer lineage, proven with pasted output; the
different-maker rule and the exhaustion path proven by test (mutation-proof
per the house standard — state which mutation each key assertion kills);
contract regenerated if touched; every gate green with REAL pasted output
EACH; handoff `handoffs/XREV-01-codex-handoff.md` (+ QUESTIONS FOR V section
— night mode); progress log `handoffs/XREV-01-progress.log`; ticket to
`review` with `READY FOR PEER REVIEW — XREV-01`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable. If blocked with no lawful
path: STOP, park, say why — the orchestrator ends the loop rather than
guessing at V's values overnight.
