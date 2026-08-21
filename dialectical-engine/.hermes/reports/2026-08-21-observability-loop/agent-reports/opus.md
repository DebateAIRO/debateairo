# Self-report — Claude Opus blind seat, 2026-08-21-observability-loop

**Went well**

1. The codebase is small enough (~50k lines outside `apps/ui`) that I could read
   the whole server-side product path rather than sample it: both API files, all
   2,606 runner lines, scheduler, replay, evaluator-worker, and the error-bearing
   parts of every package. The RQ-A1 and RQ-C3 inventories are therefore
   enumerations, not impressions.
2. Grep-then-read-context worked better than reading files whole for the bare-catch
   sweep. I pulled ±5 lines around all 58 `catch {` sites and classified each; that
   is where the SWALLOW/FLATTEN/REPLACE/DROP/BENIGN distinction came from, and it
   stopped me writing "errors are swallowed" as a vibe.
3. Three findings I did not expect and would have missed by staying in the brief's
   frame: the product tree is 99% untracked in git (kills the loop agent's PR
   capability outright), the production runner entrypoint is mis-wired and would
   fail every work item, and 19 of 29 declared wire event types have no producer.
   All three came from checking claims rather than accepting them.
4. Verifying numbers instead of asserting them paid off repeatedly. I wrote "26
   event types" and "~370 wrap sites" in a first pass; counting gave 29 and
   492-throws/49-wraps. Both were corrected before handoff.

**Fought me**

5. The git state. Ten minutes of confusion because `git log -- '*observability*'`
   returned nothing — the repo root turned out to be one level up, the tree was
   renamed without git recording it, and the history uses two dead prefixes.
   I nearly wrote "the observability files were deleted in commit X" from a
   half-read log. There is no such commit.
6. Deciding how much of the security zone to read. The boundary is genuinely
   entangled — `packages/db` re-exports the identity repository, and the shared
   Fastify error handler branches on `AuthFlowError` — so mapping the seam meant
   opening files I was told not to work in. I read import/export lines and the one
   `instanceof` branch, and stopped. I am confident the boundary map is right and
   equally confident I stayed out.
7. RQ-E3's budget cap. I wanted to give V a number. There is no pricing data in
   this repository and the CLI relays only report usage when the CLI does. I wrote
   UNVERIFIED and recommended capping on calls and wall-clock instead. That is the
   honest answer and it is less useful than what was asked for.
8. Length discipline. The artifact is long. I judged that the architecture loop
   needs to navigate from it without re-reading the codebase, which is what my
   packet asked for — but a synthesiser now has a lot to reconcile against two
   other seats.

**Would change**

9. I would run the acceptance harness. Every runtime claim above is read off
   control flow, not observed. The `JUDGEMENT_POLICY_UNRESOLVED` finding in
   particular deserves a live confirmation, and I flagged it as static-only rather
   than proving it.
10. I under-read `packages/serve` (2,026 lines) and `packages/evaluator` (4,866).
    I grepped their throw/catch sites exhaustively but did not read them whole, so
    non-throwing silent-failure paths inside them may be missing from RQ-A3. Said
    so in the gaps section rather than papering over it.
11. I should have checked the git state in the first ten minutes, not the last
    hour. It turned out to be the single most consequential finding for RQ-D5, and
    I found it by accident while chasing the observability history.
12. My RQ-D3 fix taxonomy carries thresholds (1 file / 10 lines) that I then argued
    against in my own counter-argument. That tension is real and I left it visible
    rather than resolving it, because I think V should see the trade rather than
    inherit my resolution of it.
