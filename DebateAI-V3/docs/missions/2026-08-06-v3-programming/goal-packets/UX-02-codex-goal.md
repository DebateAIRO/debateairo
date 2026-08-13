# /goal packet — UX-02 (Codex seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_e795a52c` · **Assignee:** codex
**Roster (DR-153):** Codex implements · dual diamond (Opus 5 + Grok).

Standing law: `CODING-LOOP-PROTOCOL.md` + ledger through DR-166-B. Read the
ticket body (`hermes kanban --board debateai-v3 show t_e795a52c`).

## V's ruling (DR-166-B) — from V's own screenshot of the live form

V saw the five machine-defaulted fields rendered prefilled-with-provenance
and ruled: *"user should not have to type in there, or even see those."*

## DELIVERS on `apps/v2-ui/app/new/page.tsx` — LAYOUT ONLY

1. The DEFAULT form surface is: **the question, the depth dial, Start.**
   Nothing else visible.
2. The five DR-166 fields (agent count, as_of, decision owner, action owner,
   decision scope) move inside a collapsed **"Advanced"** disclosure — closed
   by default, fields still prefilled + editable + provenance-hinted inside
   (DR-166 editability preserved; DR-166-B visibility ruled).
3. **Do NOT touch `defaults.tsx` logic** — the UX-01 derivations and guards
   are settled and dual-approved. This is disclosure/layout only.
4. Risk/budget: leave where they are unless they sit inside the same noise —
   if judgement is needed, NOTE it in the handoff rather than deciding.

## Tests (under the enforced render layer)

- The rendered DEFAULT view must NOT contain the five fields — mutation:
  render them visible → red.
- The disclosure opens to reveal them prefilled — the existing UX-01
  assertions keep passing against the EXPANDED state (adjust selectors, not
  guarantees).
- The DR-166-A two-identity guard keeps working through the collapsed layout.
- `vitest list` collection proof, mutations named per the house standard.

## DONE WHEN

Default surface = question + depth + Start; disclosure works; UX-01
guarantees intact; every gate green with REAL pasted output EACH; handoff
`handoffs/UX-02-codex-handoff.md`; progress log `handoffs/UX-02-progress.log`;
ticket to `review` with `READY FOR PEER REVIEW — UX-02`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.
