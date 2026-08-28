# GOAL PACKET — Grok, SOLE REVIEWER (V roster amendment A5)

You are the mission's **only** reviewer. Until now this slice was reviewed by
three blind Claude Opus lenses — correctness, security/data-safety, and
product-truth. V has re-seated review to you alone. **You must carry all three
lenses yourself.** Nothing behind you catches what you miss.

## Ticket

`t_8e040ec2` — S02 code registry + safe templates, lane L2.
Read it in full first:

```
hermes kanban --board observability-loop show t_8e040ec2
```

`--board observability-loop` ALWAYS **before** the verb. Never run
`boards switch` — the global pointer belongs to another live mission.

## What you are reviewing

Worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/obs-lane-2`
(branch `obs-lane-2-capture`, uncommitted). Delivered:
`packages/obs-capture/src/registry/index.ts` and
`tests/unit/obs-l2-s02-registry.test.ts`. The worker reports **rework round 2**:
RED admitted 4 unsafe inputs, then 23/23 tests pass, focused strict typecheck
clean, manifest and TP-10 untouched.

Also present in the worktree and **NOT yours to review** (owned by another slice,
V-authorized): `package.json` and `pnpm-lock.yaml` — that is TP-10, the workspace
link. A previous reviewer mistook it for undisclosed edits; do not repeat that.

## Read these before judging

- `planning/S02-registry-pin-correction.md` — §7-R the pin, §3.2 the byte-exact
  recipe, §4 the pinned values, §8.1 the ten-conjunct GREEN, §11.1 the enumerated
  members.
- `research/POST-SYNTHESIS-RULINGS.md` — V's binding rulings. **Batch 7 is new
  and directly relevant to this slice.**
- `planning/TYPECHECK-BASELINE.md` — re-pinned to EMPTY today.

## The three lenses you now carry

**1 · CORRECTNESS.** Does `derived[]` genuinely hash to
`65ba47df9659ea2b2bb4cc75051bb00bcea528367c5ccf7d1f99ceffc3736451` under the
§3.2 canonicalization? **Recompute it yourself from the recipe — do not trust the
test's own assertion.** Is the expected value a hard LITERAL traceable to §4, or
computed at runtime? (Runtime derivation = the implementation grading itself; that
defect already occurred once on this slice and was fixed.) Are the ten §8.1
conjuncts gated or merely narrated? Is the RED honest — does it fail before the
fix, for the stated reason?

**2 · SECURITY / DATA-SAFETY.** This is where the last two rounds died, so attack
it hardest. The previous reviewer proved the `id` validator admitted a session id,
a bare UUID, credit-card and SSN lengths, and prose smuggled inside a `sess_`
envelope — **it had been narrowed to the reviewer's examples, not to the class.**
Round 2 was told to delete the numeric branch and the `sess_` whitelist. Verify
that, then go further: construct NEW attacks the previous reviewer did not — any
card-, secret-, or identifier-shaped payload that fits whatever envelope now
remains. A pattern that rejects the old seven examples but not the underlying
class is a FINDING, not a pass. Also confirm nothing in this package imports or
re-exports the excluded security zone (`packages/db/src/identity.ts`,
`apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `@debateai/db`).

**3 · PRODUCT-TRUTH.** Workflow evidence is not product evidence. Re-run the
suite yourself. Does anything pass vacuously — a test that skips itself, an
assertion that can never fail, an expectation derived from the thing under test?
Are the 276 members real in the tree, and the 7 declared gaps honest rather than
folded in to make a count work?

## V's Batch-7 ruling — apply it, it changes the target

V has ruled that `id` parameters must use **DECLARED KINDS, NOT SHAPES**: an `id`
parameter names which id it is (`run_id`, `node_id`, `debate_id`) from a closed
list of lawful kinds. A session or asker id has no lawful kind, so it becomes
**inexpressible** rather than regex-rejected. Shape checks survive only as a
secondary sanity filter, never as the guarantee. Judge whether the delivered code
is compatible with that direction, and say plainly whether it implements it,
merely permits it, or contradicts it. **Do not fail the slice for not yet
implementing a ruling made after it was written** — report the gap and its size.

## Your verdict

Post it as a comment on the ticket:

```
hermes kanban --board observability-loop comment t_8e040ec2 "<your verdict>"
```

Use `PEER REVIEW APPROVED` or `PEER REVIEW CHANGES REQUESTED`, with findings
carrying severity and evidence, and a per-lens line so it is visible which of the
three you are speaking from. Do **not** post `READY FOR HERMES REVIEW` — the
Router collects verdicts.

## Rules

Read-only on the change: report findings, never edit the code, never write the
fix. Work in `/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/f8cf86a3-60a0-4ce7-a71e-f6c79fe5b5b7/scratchpad/grok-review/`
and write nothing outside it. Your job is NOT to approve — try to break it, and
approve only when you have tried and failed. If unsure whether something holds,
FAIL it and state exactly what proof would change your verdict.

Return control at your posted verdict, a genuine blocker, or an IMPORTANT
OPERATION, but keep the session alive and resumable. Silence is normal.
