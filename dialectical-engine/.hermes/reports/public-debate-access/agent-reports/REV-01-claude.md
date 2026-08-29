# SELF-REPORT — REV-01 (Claude, SPEC reviewer) — public-debate-access

Treat it like a murder case. Cause, not symptom. Priced. Dead ends named. Near-misses named.

## Verdict filed

PASS, with N1-N3 (non-blocking, all need tickets). Posted to `t_2a279210`, 18209 bytes.
Full findings and probe log are on the ticket comment, not duplicated here.

## The one decision that mattered most

REQ-01's own `CONTRADICTIONS` section on `t_5c7a1e7f` already said: "owner export/scoring
currently use owner-only side channels; SPEC requires public READ surfaces from public-safe
data with label-honest typed absence — Architecture resolves HOW." I read that, and for a
few minutes my working draft treated it as **the tension already caught and handled** — box
checked, move on to the next probe target. That would have been wrong. Actually opening
`AnswerHonestyDrawer.tsx` and `apps/ui/lib/api.ts` turned one vague acknowledged "tension"
into two concrete, differently-shaped findings: N1 (`cost_envelope`/`tier_provenance_ref`
are READ content the owner sees today, banned under a pre-existing list nobody re-asked V
about after V's new full-parity ruling) and N2 (scoring diagnostics isn't an "owner-only
side channel" at all — it's a dead stub with zero backend route, so the PLAN note that frames
it as needing an architecture endpoint decision is simply wrong).

**Cause, not symptom:** the surface-level failure mode would have been "reviewer read the
SPEC and nodded because the author's own self-critique sounded thorough." The actual cause is
subtler and is named explicitly in my own packet's §8 (decorrelation): a same-base-model
reviewer finds an author's reasoning persuasive because it's reasoning the reviewer would
have produced. REQ-01's `CONTRADICTIONS` prose was well-written and plausible — exactly the
kind of text that reads as "already handled" to a lens sharing its training. The fix wasn't a
new tool, it was refusing to let an author's *acknowledgment* of a risk substitute for a
reviewer's *independent check* of that risk. **Price if missed: this is the highest-value
pair of findings in the whole review; skipping it would have produced a technically-clean but
substantively weaker PASS** — the SPEC would have shipped to Architecture with a scoring
requirement built on a false premise (wasted design effort) and a parity gap never routed to
V (rework after code exists, the single most expensive failure mode this review contract
names).

## Dead ends (priced, so nobody re-derives them)

1. **`pnpm exec tsx <script>`** — failed immediately:
   `[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command "tsx" not found`. Cause: this worktree has
   **no installed node_modules anywhere** — not a missing symlink, dependencies were simply
   never installed here. Price: 1 command, ~10 seconds, but it's the kind of failure a
   less careful pass could misread as "tsx isn't the right tool" rather than "deps aren't
   installed," burning more time chasing the wrong branch.
2. **`npx tsx` importing `packages/contract/generated/client.ts`** (the path the package.json
   `exports` field actually names) — failed, directory doesn't exist. Cause: that file is a
   build artifact of `pnpm run generate:contract`, never run in this worktree. Price: 1
   command.
3. **`npx tsx` importing `packages/contract/src/index.ts` directly instead** — got past the
   missing-generated-file problem but hit `Cannot find package 'zod'`. Cause: Node/tsx module
   resolution walks up from the **importing file's own directory**, and the repo genuinely has
   zero installed dependencies — importing the real source module was never going to resolve
   its own `zod` import regardless of where my script lived. Price: 1 command +
   the diagnostic read of the error to understand why (not obvious on first read — it looks
   like a scratchpad-vs-repo path problem before it's clear it's an install problem).
   **Fix that worked:** stopped trying to import the live module. Instead, copied
   `PublicDebateSchema`'s literal definition (verbatim, from the file I'd already Read at
   exact line numbers) into a standalone script, and `npm install --prefix <scratchpad> zod`
   to get a real zod runtime, isolated to my scratchpad only — never touched the repo's
   (nonexistent) `node_modules` or `package.json`. This produced a genuine 3-trial, real-data
   experiment (against the one actual published debate, fetched live) without needing a full
   `pnpm install` across the monorepo, which would have been slower and riskier to run
   unprompted inside someone else's review worktree.

**Total dead-end cost this session: ~4 failed/diagnostic commands, low single-digit minutes.**
Not expensive, but avoidable. **Worth adding to `.hermes/TOOLING-TRAPS.md`:** *"Review
worktrees under `/private/tmp/debateai-rev*` have no installed node_modules — `pnpm exec` and
direct imports of any repo module will fail. To probe a Zod schema's real runtime behavior
without a full install, copy the literal schema definition (cite the file:line you copied it
from) into a scratchpad script and `npm install --prefix <scratchpad> <pkg>` there — never
`pnpm install` inside someone else's review worktree without being asked."* This is a
generalizable recipe every future blind-lens reviewer on this mission (or any review
worktree) will otherwise re-derive from scratch, at the same ~4-command cost.

## What I nearly got wrong (a second one)

I nearly treated the "AnswerSchema already carries nodes/edges" claim as fully discharged by
a single `grep`/`Read` (confirms the field exists) and moved on — but that's a materially
**weaker** claim than the one my packet actually asked me to test: not "does the field
exist" (READ) but "does widening the PUBLIC schema with a required version of it break old
snapshots" (needs MEASURED). My packet itself flagged this exact claim as "INFERRED, not
measured, by both the Router and REQ-01" — a direct instruction to go further than reading.
The cheap version (re-read the code, restate INTAKE's already-published number) would have
produced a review that looked thorough but added zero new evidence over what REV-00 (the
other blind lens, whom I never contacted) had already measured. Building the actual 3-trial
parse experiment against the real live publication is the one piece of evidence in this
review that is **independently mine**, not inherited from either INTAKE or REQ-01 — which is
the entire point of having two decorrelated-by-prompt reviewers instead of one.

## Where the packet fought me

One real ambiguity, not a blocker: REV-01.md §4 says "Verdict is exactly one of PASS · REWORK
(numbered findings) · BLOCKED," and separately "Non-blocking does not mean optional — every
N-finding demands a fix and must land on a ticket." Taken together, it's not immediately
obvious whether **any** finding (even all-N, zero-B) forces a REWORK verdict, or whether
PASS-with-N-tickets is the intended, legitimate outcome. I resolved it by reading
`heartbeat-reviewer`'s "Never 'pass with concerns' — concerns are N-findings" as endorsing
PASS-plus-N-tickets as the correct shape (the instruction is telling reviewers to convert
vague "concerns" into concrete N-findings, not telling them findings preclude PASS). This cost
real interpretive time and could recur for every future reviewer seat on every mission.
**Fix:** state it once, explicitly, in `heartbeat-reviewer` itself: "PASS may carry N-findings
that still need tickets; REWORK is reserved for at least one B-finding." That's a
protocol-level fix, cheaper to make once than to have every reviewer re-derive.

## One-prompt-machine angle

The generalizable lesson worth encoding, not just reporting: **when the artifact under review
already names a risk in its own self-critique section (CONTRADICTIONS, DECISIONS, a
"tension recorded" note), that is a signal to go deeper on exactly that item — not evidence
the author has handled it.** A same-model reviewer is most likely to under-probe precisely
the things the author already wrote persuasive prose about, because persuasive-to-a-similar-
model is not the same as correct. If this instruction were baked into `heartbeat-reviewer`
or the packet template directly (something like: "any risk the author's own CONTRADICTIONS/
DECISIONS section names is a MANDATORY probe target, not a discharged one"), future reviewer
seats would not depend on catching themselves mid-draft the way I did here — it would be
load-bearing instruction instead of a lucky self-correction.

## Comments read through

`t_5c7a1e7f`: ROUTER DISPATCH 2026-08-29T07:46Z; WORKER CLAIM 2026-08-29 10:49; READY FOR
PEER REVIEW 2026-08-29 10:53; ROUTER VERIFICATION 2026-08-29T07:55Z (2026-08-29 10:55).
`t_2a279210`: ROUTER DISPATCH 2026-08-29T08:05Z (2026-08-29 11:00); my own verdict comment
(2026-08-29 11:08).

## Addendum — rework round 1, N2 only (2026-08-29)

Confirmed PASS on the N2 rework (`t_68386dd8`): the false "live authenticated load /
public-safe endpoint" framing is gone from both `SPEC.md` v2 and `PLAN.md`, replaced with the
actual DR-115 stub evidence inlined; `SPEC-v1.md` is preserved byte-for-byte (diffed against
what I quoted from it in round 0); re-confirmed the underlying `apps/ui/lib/api.ts` stub and
the zero-match `apps/api/src/*.ts` scoring grep myself rather than trusting the rework's own
citation.

**The one thing worth recording for next time:** v1's R6 gave Architecture a standing option
("or a public-safe scoring projection Architecture defines") that v2 explicitly forecloses —
that is a textual narrowing of what the SPEC permits, not a pure rewording, and I nearly
signed off on "scope unchanged" as asserted rather than testing it. What made it safe to pass
without routing to V: the removed option pointed at data that doesn't exist anywhere (not
owner-side, not public-safe) and would have meant inventing a whole new scoring feature
disconnected from V's actual brief (visibility/access parity, not new capability) — so
exercising that option would itself have been the scope violation. The generalizable
instruction for future rounds: **when a correction narrows a requirement's stated options,
don't accept the author's "scope unchanged" label at face value — trace whether the removed
option was ever a real, exercisable, in-scope choice. If it was, it needs V; if it was a dead
clause pointing at data/capability that doesn't exist, removing it is a correction.** That
test is reusable and cheaper than re-deriving the reasoning each round.
