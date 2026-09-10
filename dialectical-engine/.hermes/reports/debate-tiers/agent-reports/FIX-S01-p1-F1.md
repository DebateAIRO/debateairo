# FIX-S01-p1-F1 — case file

Question from V (verbatim): treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Disposition

Commit `53b903d24a81da7e77998114feddf7bb8ea8fc06` addresses product B1 / correctness N2, product N3, and correctness N3 in the two allowed paths. The final S01-C3 cluster returned `CLUSTER_GREEN` three times. `pnpm typecheck` retained its inherited `rc=1` and named neither allowed path.

## Cause and price

The common cause was a set of browser and accessibility contracts that the prior jsdom-only assertions did not exercise:

- `maxTokens=800` and `max=4000` were both off the `min=128, step=128` lattice. Chrome coerced them to `768` and `3968`, while jsdom reported the requested values. The page now declares `step=32`, the greatest step that keeps both oracle values on-grid (`apps/ui/app/new/page.tsx:389-398`), and the test checks both lattice remainders (`tests/render/tier01-new-plan-tier.test.tsx:392-395`).
- Native `disabled` preserved the artboard appearance but removed every Free-state gauge from keyboard reach. The page now exposes `aria-disabled`, resolves each `aria-describedby`, rejects changes in every control-family handler, and preserves exactly `opacity: 0.45; cursor: not-allowed` (`apps/ui/app/new/page.tsx:46`, `:279-318`, `:445-568`).
- `modelIdentity` duplicated a partial ID grammar. The page now delegates the dot to `modelMeta(modelId).dot` (`apps/ui/app/new/page.tsx:201-206`), while the render suite exercises the reviewer's six divergent ID shapes (`tests/render/tier01-new-plan-tier.test.tsx:216-242`).

Wall-clock price: 39 minutes 11 seconds from CLAIM at 04:30:16 to the post-commit evidence read at 05:09:27 EEST. Token counts are not exposed to this seat, so an exact token price would be fabricated. The measurable proxy is six avoidable attempts: one path-alias failure, one wrong UI-server cwd, one unquoted zsh URL, two stale Next-browser replays, and one accessibility implementation that passed jsdom but failed computed-style verification.

## What nearly went wrong

1. The first model regression tried to mutate `PLAN_TIER_ROSTERS`; the arrays are frozen, so that RED was a fixture error rather than evidence. A module-level roster fixture made the real rendered dots fail instead.
2. Replacing `disabled` with `aria-disabled` initially made the lock visually live because the stylesheet keys M8 to `:disabled`. The focused jsdom suite was 22/22 and would not have caught it. The headless computed-style probe exposed opacity `1` and pointer/text cursors; the page-level lock treatment then restored the oracle without touching F2's CSS surface.
3. The private Next dev server twice served a stale pre-edit bundle after fast refresh. A clean private-server restart made the browser evidence trustworthy. Treating either stale replay as a product result would have sent the fix backwards.
4. F2 committed concurrently and advanced the shared lane from `f6c147cc` to `f9b40d0f`. Exact-path staging prevented cross-seat files from entering this commit.

## Dead ends

- `pnpm exec playwright` is unavailable in this lane. The browser probe used installed Chrome in headless remote-debugging mode instead.
- Running the correctness probe directly with `tsx` from the repository root could not resolve the UI package's `@/` alias. `pnpm --dir apps/ui exec tsx` resolved the actual functions.
- The reviewer's `jsdom-range.mjs` hard-codes `step=128`, and the correctness probe copies the removed `modelIdentity` implementation. Those snapshots are excellent RED exhibits but cannot become GREEN when the worktree changes. GREEN required promoted render assertions plus a page-driven Chrome replay.
- The first scratch UI launcher ran the custom server from the lane root, where Next could not find `app/`; the reviewer's own package-cwd instruction was required.

## Packet ambiguities and protocol upgrades

1. `FIX-S01-p1-F1.md` §2 requires the reviewer's probe RED then GREEN, but the named probes are immutable copies of the defective constants/functions. Upgrade each probe to import or interrogate the current worktree, and give it a stable exit contract: nonzero on the defect, zero on the fix.
2. `FIX-S01-p1-F1.md` §1 requires the N3 remedy to stay invisible while §2 forbids the stylesheet owned by F2. The existing appearance is keyed to native `:disabled`, so the semantic change necessarily crosses that selector contract. Either assign page + matching selector/test atomically, or state in the packet that the page must carry the two M8 presentation properties.
3. The packet should state the promoted render count expected after the fix. It says the old `21/0` "becomes your new count" without saying whether a new case is expected; the evidence-backed count is now `22/0`.
4. Supply one generated seat harness with `claim`, `probe`, `mutate`, `cluster --three`, `typecheck-delta`, and `handoff` phases. It should create unique logs, refuse `git add -A`, validate the branch/allowed paths, capture the comment cursor/session ID, and render the eight-line READY body from those logs.
5. Give browser seats an isolated Next cache and a standard headless driver. This removes package-cwd guessing, stale HMR bundles, visible-browser risk, and provider-specific updater noise.
6. Put the write-surface ownership graph in a machine-readable packet field. A preflight can then reject a finding whose semantic fix invalidates a forbidden owner's selector before code is written.

## One-prompt machine target

The smallest credible single-prompt loop is: packet schema names exact inputs/ranges, allowed paths, current comment cursor, per-finding executable RED/GREEN probes, expected suite deltas, cross-seat contracts, and commit/handoff templates; one repository-owned harness validates those fields, records evidence, and refuses any mutation outside the contract. The model then spends context on the defect rather than reconstructing launch commands, adapting frozen probes, or discovering ownership coupling during browser verification.

VERDICT: the code findings are addressed; the highest-leverage system change is executable, worktree-relative probes plus machine-checkable cross-seat ownership / CONFIDENCE high / STRONGEST COUNTER: richer packets and a harness cost maintenance whenever the protocol evolves.
