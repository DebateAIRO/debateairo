# Self-report — REV-S03-p1-product-truth (REV(S03) lens product-truth, pass 1 of 3, ticket `t_31d988e8`)

Seat: REV-S03-p1-product-truth · model claude-opus-5 · Agent tool, background, blind · started
2026-09-13 21:42:31 EEST, handed off 2026-09-13 22:0x EEST · worktree
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s03-p1-product-truth/dialectical-engine`
at `cc014550`, porcelain 0 in and 0 out.

The question, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## 1. The body: a user-visible surface that no suite in the slice can see

**Cause, not symptom.** The slice moved `/new`'s tier rosters from a compiled constant to a runtime
read of `GET /v1/deployment`. That route is `auth: "operator"`. There is exactly ONE runtime
evaluation of `operator` in the product (`apps/api/src/index.ts:475-477`) and it refuses **every**
cookie session with 403. So the page reads a route no browser can read, and
`page.tsx:123`'s `.catch(() => undefined)` turns that refusal into an empty list with no message.
Acceptance step 2 — the step V wrote to check this slice — cannot pass on merge day.

Why no one caught it: **the render suite mocks `readDeployment` RESOLVED, so the only state the
suite ever renders is the state the product cannot reach.** The mock was the oracle. The C4 seat
itself smelled it (its F3), the orchestrator carried it to this review as probe 13 — and the
parenthetical it carried was **false**: "the page already reads the deployment for riskTier
defaults" is not true. `deriveRiskTierDefault` (`apps/ui/app/new/defaults.tsx:26`) has **zero call
sites**; I checked with `git grep`. S03 introduced the first deployment read on `/new`. A reviewer
who trusted that parenthetical would have written "precedent exists, not a regression" and moved on.

**The upgrade this demands, and it is the general one:** when a node moves a value from
build-time to request-time, the packet must require ONE test at the new boundary that exercises
the transport's REFUSAL, not only its success. A mocked dependency that can only resolve is not a
test of a runtime read. Concretely: a BUILD packet whose step introduces a new client call gets a
mandatory RED line "the call REJECTS — assert what the user sees". That is one line in a template
and it would have cost the slice nothing.

## 2. What repeatedly cost tokens

1. **Reading the lane's paths from `probes.md` while forbidden to read the lane.** Every one of the
   thirteen probes cites `/.worktrees/tiers-s03/dialectical-engine/<file>:<line>`. My packet forbids
   the lane. I had to re-resolve each citation into my own worktree before I could use it. It is a
   mechanical translation the orchestrator can do once at assembly instead of every lens doing it
   three times in parallel. **Price: ~10 minutes and a real risk that a tired lens just opens the
   lane path and breaks blindness.** Fix: assemble `probes.md` with `$WORKTREE`-relative paths.
2. **The package's own numbers disagreeing with the package's own command.** The README's three-run
   table says "C4 73/73 ×3"; the §2 cluster row's C4 command is four files and gives **67/67**,
   which is exactly what the gate's per-suite re-verification sums to. The seat ran five files (the
   S13 flip joined `tiers-s02-rosters`). I spent a full cycle reconciling a number that was never
   wrong, only unlabelled. **Price: ~8 minutes + one board-file read.** Fix: the three-run table
   names the command that produced it, or prints the file count.
3. **My own harness contaminating my own finding.** I copied the author's `beforeEach`, which
   rejects `readSession`. My first run then showed an `.error` div and I nearly recorded "the page
   DOES surface the failure" — the opposite of the truth, from my own fixture. **Price: one run,
   ~3 minutes.** The lesson is in TRAPS already ("a BROKEN run inside a MUTANT harness"); what it
   needs is the positive form: **when you copy a harness to probe X, reset every mock that is not X.**

## 3. What I nearly got wrong

- **I nearly filed a finding on `apps/ui/components/landing/cards.ts:27-28`** ("Anthropic · Claude ·
  claude-opus-5" compiled into the landing page → stale after V edits the file). I opened the file
  to write the finding and found `A_GEMINI = "Google · Gemini · gemini-3-ultra"` two lines down — a
  model in no tier at all. It is an illustrative sample exchange, not a roster claim. **Refuted my
  own finding before filing it.** R8's "display copy" ruling is correct.
- I nearly reported the mutant experiment (§4) as a defect. It is not: the three suites that go RED
  when `config/models.yaml` is edited are doing exactly what R7/R27 ask. The defect is only that
  the acceptance never tells V to put the file back (N2).

## 4. Dead ends — do not re-derive these

- **Looking for an operator-granting code path.** There is none. `git grep 'OPERATOR_REQUIRED'`
  returns one production site; three suites pin the refusal (`api.test.ts:233`,
  `s5-session-http.test.ts:178`, `s7-authorization.test.ts:189-197`); **no suite anywhere asserts a
  200 for `/v1/deployment`**. The retired dev header is pinned at 401. Do not go looking again.
- **Looking for a server-side proxy that could attach an operator credential.** `contractClient` is
  `createBrowserContractClient()` (`apps/ui/lib/api.ts:106`) over a same-origin fetch; the client
  throws on any non-2xx (`packages/contract/src/client.ts:122`). There is no proxy seam.
- **The `api:` slot's sentinel model in `dev-cli-provider-panel.ts:65-70` is NOT a bug.** It is the
  CLI panel's observation; `resolveDevelopmentApiProviderSlots`
  (`apps/runner/src/dev-provider-panel.ts:232-262`) replaces it with the entry's real model and
  `Bearer <key>` when the key exists and the probe echoes the id. I chased this for several minutes.

## 5. Where THIS packet was unclear, exactly

- **§2 charge (c) asks a question and answers it in the same breath**: "render it yourself with the
  real compiled CSS? a `ui: no` slice: the DOM assertion is the oracle, no artboard exists". I read
  it three times to be sure I was not being asked for a CSS measurement I would then be faulted for
  skipping. Say it as an instruction: "render the DOM; do NOT measure CSS — `ui: no`."
- **§2 contract line vs the README.** The contract says "on UI: rendered DOM with the real compiled
  CSS … a scoped pass's README may narrow this line per lens, and wins where it narrows". The
  README's "For a lens" section narrows nothing, so the reader must derive that `ui: no` already
  makes the clause inert. One word in the packet ("`ui: no` — this clause does not apply") removes
  the derivation.
- **"file the self-report FIRST"** conflicts with COMMON §4's "write every artifact to disk the
  moment it is ready". I resolved it as: both before the verdict comment, self-report first. Worth
  one clarifying clause, because a seat that batches the self-report to the end is the failure mode
  the rule exists against.

## 6. Toward the one-prompt machine

1. **Make the mock the suspect.** The single highest-value automatic check available here is
   mechanical: for every `vi.mock`ed client method a slice introduces, grep the slice's tests for a
   `mockRejected`/failure case on that same method; if there is none, the packet-check fails. This
   slice would have failed that check, and B1 would have been found by the C4 seat in minutes
   instead of by a review pass hours later.
2. **Route policy is product surface.** `apps/api/src/index.ts:139`'s policy table is the list of
   what a browser may read. Any step that makes a USER-facing page call a route in that table
   should require the route's `auth` value quoted in the step. One grep, at plan time.
3. **Assemble the review package in the reviewer's coordinate system.** Lane paths in a blind
   reviewer's package are a standing blindness hazard and a standing token tax (§2.1).
4. **State numbers with their command.** Every `passed/total` in a package carries the exact command
   that produced it (§2.2). Three lenses re-derive every unlabelled number, in parallel, every pass.

## 7. Price of this seat

Wall clock ~25 minutes. Test runs: 4 cluster commands (C1 24/24, C2 26/26, C3 88/90, C4 67/67), 2
probe suites (3/3 and 10/10, plus one contaminated run), 1 mutant cycle (edit → `generate:contract`
→ C1 → restore → `generate:contract`). Zero processes left running (I started none that outlived a
command; nothing to kill by PID), zero pane tabs opened, no browser, no dev server, no live
database, no provider call, no `.local` read. Worktree returned byte-clean: my two probe fixtures
deleted from `tests/`, `config/models.yaml` restored from my own byte copy and re-verified by
sha256 `97af8017bf45e3d2b1da2b8907318475b044d3ba765a6ef12e8e10a9ad8654ea`.
