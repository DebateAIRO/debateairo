# /goal packet — UX-01 (Codex seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_b2f82786` · **Assignee:** codex
**Roster (DR-153):** Codex implements · dual diamond (Opus 5 + Grok).

Standing law: `CODING-LOOP-PROTOCOL.md` + ledger through DR-166. Read the
ticket body (`hermes kanban --board debateai-v3 show t_b2f82786`).

## V's ruling (DR-166) — minted after V's OWN test failed

V typed Agent Count 3 into `/new`; the M-guard lawfully refused with a typed
`RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE`. The guard worked; **the form
failed the user** — no human can know the ratified maker count. V: *"The user
should have to click and type as little as possible."*

## DELIVERS on `apps/v2-ui/app/new/page.tsx`

Five fields become MACHINE-DEFAULTED, each prefilled and EDITABLE, each with
a small hint naming its provenance (visible machine-default, never hidden):

1. **agent_count** ← the configured maker count from the DEPLOYMENT, via the
   same `readDeployment` path the depth control already uses. N-generic
   (DR-162-A): no literal `2`. Hint cites the deployment.
2. **as_of** ← ask time, refreshed at submit.
3. **decision_owner** ← the asker's session identity.
4. **action_owner** ← the asker's session identity.
5. **decision_scope** ← `"personal"` (the string is V's, DR-166; a future
   re-rule changes one constant).

**The user path to a debate: type the question, click Start.** Nothing else
mandatory.

## Constraints

- The deployment read can fail — a failed default derivation shows TYPED
  ABSENCE with the field awaiting input, never a fabricated value and never a
  blocked form with no explanation (DR-115).
- Do not touch the depth control (register-driven, settled) or the envelope
  logic. Do not weaken the M-guard — the point is the USER never collides
  with it accidentally.
- Tests: behavioural under the NEW enforced render layer (LOAD-01 landed it —
  `tests/render/`, root-config collected). Each default's derivation killed
  by a named mutation (e.g. hardcode agent_count 2 → red when the deployment
  fixture says 3). The happy path — question + Start only — exercised as a
  rendered flow.

## DONE WHEN

Question + Start creates a valid ask with all five defaults derived and
disclosed; failed derivations honest; mutations named and killed; every gate
green with REAL pasted output EACH (`vitest list` discipline stands — prove
new test files are COLLECTED by the enforced suite); handoff
`handoffs/UX-01-codex-handoff.md`; progress log `handoffs/UX-01-progress.log`;
ticket to `review` with `READY FOR PEER REVIEW — UX-01`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.
