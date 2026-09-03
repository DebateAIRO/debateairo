# ARCH-01 — REWORK ROUND 3 of 3. THE LAST LAWFUL ROUND.

Round 4 does not exist. Anything unresolved after this becomes a V DECISIONS PACKET row rather
than another lap. This round is deliberately small — one defect, one member of its class.

Handoff OPENS with `SKILLS LOADED: <list>`.

## PLAN-01 — `t_08356244`. Your acceptance test can never observe its own change.

`S01-C1-2` (`S01/PLAN.md:222-225`) has:

- **File surface:** `packages/contract/generated/client.ts` (and siblings)
- **Change:** Run `pnpm run generate:contract`
- **Acceptance test:** `git diff --stat packages/contract/generated/`

`packages/contract/generated/` is **gitignored** — `dialectical-engine/.gitignore:7`. The Router
ran the command: it returns **empty**, always, regardless of what the step does. The step cannot
be marked done by its own test. That is the stranger test failing, on the one law your contract
is most explicit about.

**Reproduce it yourself first** — `git check-ignore -v packages/contract/generated/client.ts`
and `git diff --stat packages/contract/generated/` — then fix it. If the evidence does not hold,
say so and change nothing.

**The fix must observe the actual effect, not the git index.** The step's purpose is that the
regenerated client carries the widened envelope. An acceptance test that greps the generated
artifact for the fields the step is supposed to introduce, or compares a content hash across the
run, observes that; `git diff` on an ignored path observes nothing by construction.

## The class, already swept — do not re-derive it

The Router checked **all 21 acceptance-test paths across all four PLANs** against
`git check-ignore`. This is the **only** gitignored one, so the class has exactly one member.
You are not being asked to re-sweep. **But do check the neighbouring failure mode while you are
here:** an acceptance test whose command can pass without the step having happened is the same
defect wearing different clothes. If you find one, fix it and say so; if you do not, say that.

## Root cause worth naming in your self-report

This survived two full review rounds. Both reviewers verified that each cluster *has* one
verification command; neither *ran* this one. Your own contract and both review packets said to
try the commands where possible. A command that is present but never executed is indistinguishable
from a working one until a worker is blocked by it — which is exactly what happened: the S01
coding seat stopped on a different defect and the Router found this one while fixing that.

## Bounds

SPECs stay FROZEN. `S01/PLAN.md` edit and `S01/DECISIONS.md` APPEND only — never edit a
DECISIONS line, append a superseding one citing `t_08356244`. No product code, no tests, no
`PROGRESS.md`, no other slice. The mission graph does not change; no lane shape moved.

V's four rulings stand unchanged: Row 1 reads-not-mutations · Row 2 disclosed answer-only ·
Row 4 `cost_envelope` + `tier_provenance_ref` EXCLUDED · Row 5 lane plan approved.

## Handoff

`SKILLS LOADED: <list>`, then `REWORK READY FOR REVIEW` on `t_f864a84b` naming the new
acceptance test and the evidence that it actually discriminates — i.e. that it FAILS before the
regeneration and PASSES after. An acceptance test you have not seen fail is the same unverified
thing you are being asked to fix. Append to your self-report, then stop.
