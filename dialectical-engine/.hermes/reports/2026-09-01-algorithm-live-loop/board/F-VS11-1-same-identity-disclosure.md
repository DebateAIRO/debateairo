# [claude@opus-5] F-VS11-1 · same-identity grading is permitted but NEVER DISCLOSED to the reader

```yaml
state:
  ticket: F-VS11-1
  risk_tier: high            # V's 2026-09-03 ruling makes disclosure the entire safeguard
  status: done # SUPERSEDED by ticket W2-emit-diversity-mark, which V authorized 2026-09-03. The finding stands; the work is now tracked there
  owner: { agent: unassigned, session: n/a }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [V decision first]
    human_review: yes
  worktree: { path: n/a, branch: n/a, merge_status: n/a }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: 2026-09-03
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: v-ruling-2026-09-03
```

## What I found, following V's instruction to check "other places where this rule is in place"

Three sites carry the non-self-grading rule. Two are fine and one has a hole.

1. **`packages/register/src/algorithm-policy.ts:137-149`** — `warnOnIdenticalSynthesisRoleRefs`
   already does exactly what V ruled: when a deployment seals the synthesizer and evaluator as
   the SAME provider identity it **warns and proceeds**, it does not refuse. Its message even
   states the consequence plainly: "the evaluator will grade a candidate written by its own
   provider identity." No change needed.
2. **`slices/S11-eval-harness/SPEC.md:25`** (goal-verbatim, frozen) — "2 graders that are never
   the candidate." This is the harness's hard refusal, and it is being fixed under the V-S11-1
   ruling by the S11 seat: degrade to the best available assignment and disclose.
3. **`slices/S12-closure/SPEC.md:38`** (goal-verbatim, frozen) — the Global DoD requires the
   flagship run to show "panel-reduced τ (non-self-graded)". Satisfiable on this deployment,
   which seals three identities. Not a conflict today; it WOULD be one on a single-identity
   deployment, which V's ruling now explicitly permits.

## The hole

**The disclosure never reaches the reader.** `SYNTHESIS_ROLE_REFS_IDENTICAL` is a `console.warn`
in `algorithm-policy.ts` and is exported from `packages/register/src/index.ts:575`. A search
across `apps/` and `packages/serve` finds it **nowhere**: it is never turned into a condition
mark, never persisted, never served. So a debate whose synthesizer and evaluator share a
provider identity proceeds — correctly, per V — and the person reading the answer is never told.
The only record is a line in a server log.

Worse, the mark that would say so **already exists and is already wired to a UI string, and
nothing ever emits it**: `DEGRADED-DIVERSITY` is declared in `packages/kernel/src/index.ts:126`
and rendered as "Model diversity degraded" at `apps/ui/lib/v3/labels.ts:27`. Grep finds no
producer anywhere. A vocabulary member with a label and no emitter is a promise the system does
not keep.

## Why this matters MORE after V's ruling, not less

V ruled that a single-model or cost-constrained deployment is a legitimate configuration and the
engine must produce the best debate it can inside it, that same-model provenance is **recorded
and disclosed, never hidden**, and that a disclosed substitution is acceptable while a silent one
never is (the V-ROLE-1 / J24 shape). Goal line 26 independently requires every degradation or
skip to emit a visible condition mark.

Permitting same-model grading and not disclosing it to the reader is precisely the silent
substitution all three rules forbid. Before V's ruling this was latent; after it, disclosure is
the whole safeguard.

## Recommendation

Emit `DEGRADED-DIVERSITY` on the served answer whenever the synthesizer and evaluator resolve to
the same provider identity (and, once T15's harness lands, whenever a grader shares an identity
with its candidate), carrying which roles collapsed onto which identity. Small and well-bounded:
the mark, its UI label and the detection all exist already; only the emission is missing.

**Held for V because it is a product change outside every open ticket, and because the frozen
specs say "non-self-graded" — widening that reading is V's call, not the orchestrator's.**
