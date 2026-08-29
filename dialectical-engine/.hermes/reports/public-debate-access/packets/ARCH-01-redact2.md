# ARCH-01 — REDACTION-CORRECTNESS thread, round 2 of 3

**Ticket:** `t_83a9eb08` (PLAN-07, BLOCKING). Round 2 of this thread's own budget. This does NOT
reopen the exhausted acceptance-command thread.
**Your file:** `docs/missions/public-debate-access/slices/S01/PLAN.md` + `DECISIONS.md`.
SPECs FROZEN. No product code, no tests, no worktrees — the coding seat is mid-implementation
and its work is preserved behind this block.

Open your handoff with `SKILLS LOADED: <list>`.

## The block (the seat's, loud and correct — its sixth, all six correct)

`S01-C2-1`'s acceptance:

    sed -n '153,220p' apps/api/src/publications.ts | grep -c "redactNodeForPublic\|redactEdgeForPublic"

The explicit-projection remedy **this thread mandated** expanded the file. The map calls now sit
at lines **236-237**. Measured: **0 matches against a correct implementation.**

## What the seat did NOT see, and it is the dangerous half

`S01-C4-2`'s acceptance asserts forbidden fields are ABSENT from `sed -n '153,175p'`. It returns
0 matches, so it **passes**. But lines 153-175 are now `auditPreflightDenial` — code with nothing
to do with publishing. The envelope construction moved to ~226-240.

**It asserts the absence of forbidden fields from unrelated code. It passes vacuously.** A
negative assertion over the wrong region always succeeds, so nothing would ever have flagged it.

## Scope, measured — 8 fixed-range acceptances, 4 files, 3 already drifted

| range | claims to check | matches now |
|---|---|---|
| `publications.ts 153,220` | the two `map(redact…)` calls | **0 — fails loudly** |
| `publications.ts 153,175` | forbidden fields absent | **0 — passes VACUOUSLY, wrong region** |
| `contract 252,260` | `PublicDebateSchema` shape | **0** |
| `contract 443,463` | `NodeSchema` fields | 1 |
| `contract 325,331` | — | check it |
| `NodeDetailDrawer 360,380` | `replay` render sites | 2 (file untouched) |

**Name the self-contradiction, because it is yours:** `contract 252,260` broke because this same
PLAN mandates **relocating `PublicDebateSchema`** for the temporal-dead-zone fix. One part of the
PLAN pins an acceptance to a line range; another part requires the change that moves it.

## Why this is the SIXTH variant, and the purest one

An acceptance whose correctness depends on the file **not changing**, whose entire purpose is to
verify that the file **did change**. Under your own exclusive-provenance rule, its PASS signal
traces to **line coordinates**, not to the fact it claims.

The family so far: gitignored path (could never observe its change) · dead reporter flag (crashed
before running) · `grep -q` (stole the runner's status) · unanchored guard (matched a test title)
· escaped pipe (matched nothing) · **this** (observes the wrong place). Variant 1 and variant 6
are mirrors — one could not see its target, this one sees something else and reports on it.

## What round 2 must produce

1. **Fix the CLASS — all 8 — not the two broken today.** The other six are latent, and a latent
   coordinate-pinned acceptance is a false GREEN waiting for the next edit.
2. **Choose the remedy by shape and say why.** Anchor-based matching (find the symbol, not the
   line) is the obvious direction; you may have a better one. Not prescribed — PLAN.md is your
   file, and a Router-authored fix to it is forbidden.
3. **State the limit** of whatever you choose, as you did for projection last round.
4. **Re-run every acceptance you touch** against the coder's worktree, which now contains the
   explicit-projection implementation, and paste one observed result each. Do not evaluate them
   against the main tree — the main tree has no product change and would mislead you.
5. **`S01-C4-2` needs more than a new range.** A negative assertion that passes over the wrong
   region is the failure; whatever replaces it must be capable of failing when the forbidden
   field IS present. Demonstrate that it can, by making it fail on purpose.

## Standing

- Reproduce first. RUN every command you touch.
- The coder is blocked with completed RED/GREEN evidence preserved; mutants and three-run cluster
  verification are pending behind you. Unblock it, do not enlarge its work.
- Do not disturb what REV-04 verified sound, or the round-1 classification you just settled.
- Say plainly what you could not do.

Return control at `REWORK READY FOR REVIEW` or a genuine blocker.
