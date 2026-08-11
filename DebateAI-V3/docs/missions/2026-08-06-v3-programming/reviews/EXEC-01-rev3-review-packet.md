# Review packet — EXEC-01 rev3 (dual diamond, DR-153)

**Repo:** `/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3`
**Board:** `debateai-v3` · **Ticket:** `t_6fae713b` (status `review`)
**Author:** Codex (gpt-5.6-sol), same session across rev1 → rev3.
You are one of TWO independent lenses; both must greenlight. READ-ONLY: produce
a verdict, edit nothing, run no git, mutate no board state.

## History you need

- **rev1:** Grok APPROVED; Opus 5 CHANGES REQUESTED with 3 blocking. Both
  lenses independently reached the SAME facts, differing only on severity.
- **rev2:** all three closed with RED→GREEN. But the orchestrator's independent
  gate run found the **root typecheck RED** while the progress log claimed it
  green (two `TS2345` in the author's own new tests; vitest does not typecheck,
  so 411 passing tests hid it). Reviewers were NOT fired on that tree.
- **rev3:** typecheck fixed; the author re-ran every gate and corrected its own
  false claim in the progress log.

**Because a gate claim was already found false once in this ticket, spot-check
the handoff's remaining claims rather than accepting them.** That is not an
accusation — it is calibration.

## Orchestrator's independent gate run (rev3, 2026-08-11 ~11:21 local)

All green, reproduced by the orchestrator, not quoted from the author:
root `tsc --noEmit` clean · v2-ui `tsc --noEmit` clean · root vitest
**60 files / 411 tests** · acceptance vitest **9 files / 34 tests** ·
architecture audit `{"edgeRowsChecked":27,"violations":[]}` · source audit
`{"blocking":[]}`.

So do NOT spend your budget re-running gates. Spend it on whether the CODE IS
RIGHT.

## What to read

1. `handoffs/EXEC-01-codex-handoff.md` — carries rev1 evidence plus rev2/rev3.
2. `reviews/EXEC-01-rework-directive.md` — the three findings it had to close.
3. `reviews/exec01-opus-rev1.md` and `reviews/exec01-grok-rev1.md` — rev1 verdicts.
4. `goal-packets/EXEC-01-codex-goal.md` — the original contract.
5. `CODING-LOOP-PROTOCOL.md` and `decisions-ledger.md` (DR-149..DR-153).
6. The diff. Rev2/rev3 touched `acceptance/main.ts`, `apps/v2-ui/app/new/page.tsx`,
   `apps/v2-ui/lib/api.ts`, `apps/v2-ui/lib/v3/adapter.ts`, and tests under
   `tests/unit/`.

## Verify the three closures

**R1 — the error path must carry the observed cause.** The dispatcher now
claims to preserve `TypedDomainError.code`. Does it? For a NON-typed error, does
it name that honestly or flatten it into a typed-looking string that implies a
code the runtime never produced (DR-115)? Is the composed reason parseable, or
has a new ambiguity been introduced (e.g. a delimiter that can appear inside a
code)? Does anything still swallow a cause on any path out of dispatch?

**R2 — `/new` must read the register, not literals.** New surface:
`runCostEnvelopeFromDeployment` (adapter) and `getRunCostEnvelope` (api).
Confirm the depth control and the attempt ceiling are genuinely derived from
`register.rows`, with NO surviving `1` or `9` literal that can drift. Confirm
the absent/malformed policy path REFUSES LOUDLY rather than falling back
(DR-115), and that the refusal reaches the user rather than blanking the form.
Critically: **does the new test actually fail when the register and the UI
disagree?** The rev1 test could not — it asserted on source text. If the
replacement still cannot fail on divergence, R2 is not closed.

**R3 — the crash-path stall must be honestly declared.** Confirm the handoff
now names the exact surviving window (process death mid-execution → work item
`CLAIMED` forever → UI reconnects showing a generating debate), why it is out
of scope, and what would close it. Confirm no unqualified "no silent stalls"
claim survives anywhere.

## Also worth your attention

The rev1 advisories the directive carried forward: claim expiry sized to one
call's deadline while a run makes several; the ceremony's unbounded
`setImmediate` settle-watch; synthetic terminal ordered at work-item creation
sequence (latent until a second work item per run exists). Were they fixed, or
recorded honestly as deferred? Either is acceptable — silence is not.

And: do the new tests fail for the RIGHT reason, or are they tautological?

## Your verdict

`APPROVED` or `CHANGES REQUESTED`, then findings ranked BLOCKING → ADVISORY,
each with file:line, the named law or concrete scenario broken, and the failing
case. An unsure observation is ADVISORY. "Nothing blocking" is a legitimate and
valuable verdict — do not manufacture findings to look thorough.

Write to `reviews/exec01-<yourname>-rev3.md` and print it to stdout.
