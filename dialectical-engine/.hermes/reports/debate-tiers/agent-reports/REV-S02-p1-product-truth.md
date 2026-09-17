# Self-report — seat `REV-S02-p1-product-truth`, node REV(S02) pass 1, ticket `t_cb78a63d`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Session: Claude Opus 5 subagent, blind, fresh. Worktree `.worktrees/rev-s02-p1-product/dialectical-engine`,
detached `9ef275aa`, 0 dirty at claim and 0 dirty at handoff. No git write of any kind.
Wall clock 11:15 → 12:0x EEST. No process started that outlived a vitest run; no listener taken.

## 1. The body: what the slice actually got wrong, and why nobody saw it

**The build is right. The net has a hole exactly where the product's own law lives.**

Every behaviour SPEC-v2 asks for is present and I measured it: the refusal names every missing
roster member and the tier in all seven refusal shapes; `panelSize` equals the roster size for both
tiers; no non-roster model ever enters the panel; a refused ask writes no row on a real database;
`plan_tier` reads back for both tiers through both principals. I tried to refute all of it and
could not.

What I *could* refute is the **guard**. Mutant M2 — make the refusal name no model **only when every
roster member is missing** — survives all three cluster commands green (C2 55/55, C3 at baseline,
C4 42/42). That case is not an edge: `/new` preselects Free (`apps/ui/app/new/page.tsx:77`), today's
fleet has neither Free model, so *every ask V starts today* takes that exact branch. R15 names this
test in so many words — "a message naming every roster member of that tier" — and it is the one
requirement of R15 the slice did not build.

**Cause, not symptom.** R15 enumerates seven RED tests. Six are pinned by an assertion that would
fail if the behaviour regressed. The seventh was built as *three* tests — `:140`, `:176`, `:187` —
each asserting the **code** and none asserting the **message**, because the SPEC sentence that
demands the message sits in an italic gloss *below* the seven-item list, not inside it. The seat
built the list. The gloss is where the load was.

That is the generating condition, and it is a packet/SPEC-authoring defect more than a coding one:
**a requirement whose teeth are in a footnote gets built as the headline.** The same shape produced
finding B1 at REQ-REV pass 2 (the order of the check was also only implied until it was pinned in
control-flow terms). SPEC-v2 fixed B1 by moving the order *into* R6's body in bold. It did not do
the same for the message. R15's gloss should be R15's own numbered sub-item.

## 2. What repeatedly cost tokens here

| Cost | What happened | Price | Upgrade |
|---|---|---|---|
| **Re-deriving "what does V actually see"** | The on-screen string is composed by three files nobody reads together: `apps/api/src/index.ts:1214-1221` (text) → `packages/contract/src/client.ts:88-91` (prefixes the code) → `apps/ui/app/new/page.tsx:162,182` (renders it). Each is cited separately in probes.md. **No artifact in the package states the resulting sentence.** I had to build a fetch shim into `api.inject` to learn it. | ~25 min, two probe iterations (the first died on `(input as Request).url` — the client passes a `URL`, `client.ts:114`) | **The review package should carry a `what-the-asker-reads.txt`: the literal string, per tier, produced by a committed probe.** This is a `ui: no` slice whose entire acceptance is a sentence on a screen; the package gave me nine code citations and zero sentences. |
| **Absolute-line citations drifting under C1** | SPEC-v2 R4 cites `packages/db/src/schema.ts:123` for `discovered_panel`; C1 inserted `planTier` at `:121`, so `:123` is now `agentCount`. R3 cites `packages/db/src/index.ts:973-979`; it is `974-980`. Each cost a verification detour. | ~8 min | The mission already knows this (`TOOLING-TRAPS` variant 6; R14's own note). **A frozen SPEC should cite a symbol, not a line** — `schema.ts` `discoveredPanel:` — since the slice under review is the thing that moves the lines. |
| **Two authorities disagreeing about the fleet** | `COMMON §6` says no `grok-4.6` target exists; the oracle's Precondition A says `grok-4.6`'s bridge answers `CLI_HANDSHAKE_UNAVAILABLE`. Both give the same refusal, so nothing broke — but I spent time deciding whether one of them was my finding, and I cannot settle it (`.local/**` is forbidden, correctly). | ~10 min, ends UNVERIFIED | **One fleet fact, one owner, one place.** COMMON §6's row should point at the oracle rather than restate it. |
| **The package's own completeness** | I verified `git diff --name-only 3bf54957..HEAD` returns exactly the six files the pathspec-filtered diff shows — i.e. the `-- apps packages tests migrations` filter hid nothing. That was cheap and it paid: it let me trust the diff instead of re-reading the tree. | ~2 min | **Keep doing this, and say so in the README** — "the pathspec hid nothing, verified by `--name-only` without it" is one line that buys a lens real trust. |

## 3. What I nearly got wrong

- **I nearly filed the code-prefix as blocking.** `ASK_PLAN_TIER_MODEL_UNAVAILABLE: The free plan
  needs …` is what V reads, and R10 says the message reaches the browser "unchanged". It does not.
  But acceptance step 6 asks only that the error *name every missing member*, which it does — so this
  is a V row about copy, not a REWORK. The discipline that caught me: read the acceptance step, not
  the requirement's prose.
- **I nearly missed that M2 is a real hole rather than a pedantic one.** My first mutant (M1, drop
  the names entirely) *was* caught — by the two Premium tests — and I almost stopped there and wrote
  "the message is pinned". The second mutant exists only because I asked "pinned *for which tier*?"
  **Rule I would hard-code: a mutant that is caught tells you nothing until you know which test
  caught it and which cases that test does not cover.**
- I nearly reported the runner's claim-time panel shrink as an R9 violation. R9 says "…*starts* a
  run with the members that are present". The runner drops members *after* the run started. R9 is
  intact; the product gap is real; it is a V row.

## 4. Dead ends — do not re-derive these

1. **`markAskRefusal` without `throw`** (`index.ts:1215`) looks like a missing `throw`. It is not:
   the function is declared `: never` (`:300`) and TypeScript narrows control flow after it. I
   confirmed by execution, not by reading — the empty-panel probe returns 422, never 500.
2. **The dev stack does apply migration 0061 on its own.** I went looking for a missing migration
   step for acceptance step 9; `apps/runner/src/dev-auth-data-plane.ts:100,363` runs `pnpm db:migrate`
   in the boot sequence. Not a finding. Do not re-open it.
3. **R1's "exactly one file" is not violated by the landing page.** `gpt-5.6-sol` and `claude-opus-5`
   also appear in `apps/ui/components/landing/cards.ts:27-28` — as display strings, not roster
   members. My own grep of all five ids confirms one roster declaration. The architecture test
   documents the two extra hits honestly.
4. **The R12 read-back command is not missing.** Acceptance step 9 threatens "a command that exists
   in no seat's handoff is a finding"; it is at line 279 of
   `review-packages/S02-p1/board/BUILD-S02-C1.t_422678f3.txt`, inside the package. Verified before
   claiming.

## 5. How to make this a one-prompt machine

1. **Make the oracle executable, not narrative.** Every `ui: no` SPEC acceptance step that ends in
   "an error appears and it says X" should ship as a committed probe printing the literal string.
   Today the seat writes the code, another seat writes a test for the code, and *nobody produces the
   sentence* — which is the only thing V will judge. My two promoted probes
   (`.hermes/reports/debate-tiers/probes/REV-S02-p1-product-truth.*.test.ts`) are that artifact; they
   should be the shape the BUILD seat delivers, not the shape the reviewer reconstructs.
2. **R15-style test lists must be machine-checkable.** Seven RED tests were required; seven exist by
   name; one does not assert what its own SPEC sentence demands. A packet that lists required tests
   should list, per test, **the mutant it must kill**. "Seven tests exist" is a count; "seven mutants
   die" is a gate. The C4 seat already writes `// Production break: …` comments above its two tests
   (`tests/unit/tiers-s02-wire.test.ts:697,730`) — that convention, made mandatory and checked,
   would have caught B1 at BUILD time with no review pass at all.
3. **Give the reviewer the diff's completeness, not just the diff.** One `git diff --name-only`
   without the pathspec, printed in the README, removes a whole category of reviewer doubt.
4. **One lens, one probe budget.** Everything of value I produced came from four mutants and two
   fixtures, ~35 minutes. Everything expensive came from reconstructing facts that a 10-line package
   addition would have handed me. The ratio is the lever.

## 6. Where THIS packet fought me, exactly

- **§3 charge 2** asks for "the honesty law … checked against the code as built, not the plan" and
  "what V will experience TODAY". Both are the right charges — and the package contains no rendering
  of the message, so the charge is answerable only by building a client shim. **Name that shim in
  the packet, or ship its output.** (~25 min of my run.)
- **§3 charge 2** also says "step 9 (R12 read-back for both tiers on the embedded DB: probe 7)".
  Probe 7 asks for "BOTH tiers and BOTH paths" = four cells; C1 builds two. The packet does not say
  the other two are mine to build. I built all four and both new cells pass. **A charge that
  silently demands more coverage than the CLAIM should say so.**
- **§2 `verification`** carries "on UI: rendered DOM … both modes" on a `ui: no` slice. Inert here,
  but a lens reading its contract top-down burns a minute deciding it does not apply. The template
  should drop the UI clause when `ui: no`.
- **§1 `inputs`** says "the freeze commits (COMMON §6 …; `git diff --stat <previous>..<latest> --
  docs/missions/debate-tiers` is exactly what the seat under review changed)". For a REV lens over a
  *code* slice this is a planning-review instruction that does not bear on the verdict. It reads as
  an obligation and is not one.
- Everything else in the packet resolved: all seventeen `path:line` citations I checked in the packet
  and probes.md land on the text they quote at `9ef275aa`. That is unusually good and worth saying.

## 7. Ledger

Cluster commands re-run by me, three runs each, worst run reported — C1 `2 passed (2)` / `25 passed
(25)`; C2 `3 passed (3)` / `55 passed (55)`; C3 `1 failed | 1 passed (2)` / `3 failed | 6 passed (9)`
(the three `s14-contract` failures, pre-existing, at `BASELINE.md`'s value, delta `+1 file +4 passing`);
C4 `4 passed (4)` / `42 passed (42)`. Mutants M1, M2, M4, M5, M6 applied and restored from a captured
copy (`shasum` matched on every restore, `git status --porcelain` empty after each). Two probes
promoted. Temporary fixtures deleted; worktree byte-clean at `9ef275aa`.
