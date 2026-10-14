# Spec: a debate taken over after a crash finishes, and pays for nothing twice

Status: SPEC (2026-10-14). Base: `feat/2026-10-13-debate-shape-phase2` @ 7dc401063 (stacked: that branch rewrites the
same runner code). Owner ruling 2026-10-14: the TRUE RESUME (option 2 of
`docs/reviews/2026-10-14-reclaim-strength-lineage/REPORT.md`) — "the new copy reloads the saved points and skips the
AI calls already paid for, so nothing is paid twice". Binding: hosted and local behave as today on a first claim; one
small database change, as a chain step (`migrations/lineage/README.md`).

## The bug (REPORT.md §2)

A copy of a debate that dies after saving nodes (crash, restart, time limit, lost claim) lets the work item's claim
lapse. The next copy re-authors every site and saves a second tree, paying for every call again. Its scoring step reads
EVERY node of the run (`materialiseSnapshot`), meets the dead copy's nodes, which have no lineage in this copy, and
fails with `STRENGTH_LINEAGE_UNRESOLVED`. Red test: `tests/integration/reclaim-resume.test.ts` (four variants).

## Why not "read the saved nodes back into memory"

The runner keeps a lot of per-node state that is never stored as such (the author's parsed reply — its reversal point
and way-of-knowing downgrade —, each panel's degradation marks and close-call widening, who answered, the review
outcomes), and it READS ITS OWN PROGRESS BACK FROM THE DATABASE while it argues: the latest reviewer of each maker
(`readLatestReviewerMaker`), the round-boundary snapshot (`materialiseSnapshot`), the reviewed and disputed sets. A copy
that left the dead copy's rows in place would see, at its round-1 boundary, the round-2 nodes and reviews the dead copy
had already written, and decide differently from an uninterrupted debate. Restoring every structure by hand in every
phase (serial, together, shaped) is the most fragile option.

## The design: replay the recorded answers, set the old rows aside

The new copy runs the debate from the start, exactly as a first copy would. Two things differ.

1. **Recorded answers are replayed, never re-bought.** At claim, the runner reads this run's recorded model calls (the
   ledger's `MODEL_CALL` rows, each attempt's exact prompt in `ledger.call_prompt`, each reply in `ledger.raw_artifact`,
   decrypted inside the run's content lease). Every member gateway is wrapped, innermost, by a REPLAY gateway: a call
   whose site, member and prompt match a call the dead copy got answered returns that recorded answer at once — the
   same raw artifact and ledger entry, no vendor contact, no new ledger row, no money, no attempt counted. Anything
   else goes to the vendor as today.
   - **Prompt match:** the scorecard's `canonicalPromptFingerprint` (the random fence and canary masked) of the
     request's messages equals the fingerprint of the first attempt of the ANSWERED gateway call: the last `n` attempts
     at that site and member, `n` being the OK reply's place in its call (`raw_artifact.metadata_json.attempt`). An
     earlier call at the site that failed in full, and may have asked something else, never matches.
   - **Site match:** the recorded call site key and member, exactly. `JUDGE:review:<node>` is the only key that names a
     node: a node this copy saves from the same author reply (`provenance_ref`) as an earlier copy's node keeps the
     EARLIEST copy's review site (`siteNodeId`), so its ledger key, its reviewer rotation (`seatRotationOffset`, on a
     pinned role assignment) and the ledger-read seat restores (A15d/A16a) are the same on every copy.
   - **The keep-alive:** a replayed answer is refused like a real call once the copy has lost its claim or its time.
   - **The answer:** the message content of the OK attempt's vendor reply, read as the gateway reads it (OpenAI shape;
     Anthropic normalised). When the step's own classifier does not accept it as a whole answer, the OK attempt was a
     patch: the content is the first reply with the patch merged (`planPatchFollowUp` + `mergePatchReply`, the
     gateway's own functions). The classifier is run on the accepted content, as the gateway does, so a judge that
     remembers its reading (`rememberingAcceptedReply`) reads it again. A content that cannot be rebuilt is not
     replayed (the call is made: correct, at today's price).
   - Each recorded call is replayed at most once, in ledger order.
2. **The dead copy's rows are set aside.** Just before the arguing starts — after every claim-time refusal, and after an
   answer the dead copy already served is settled — every node of the run is marked `generation_status = 'stale'` (a
   value the database already allows; the graph reader already skips stale nodes and their edges). The copy then writes its own nodes, judgements, edges and reviews — identical to the dead copy's, since
   the answers are the same — so every read of "progress so far" sees only this copy's work, as on a first claim.
   - Before scoring, any node of the run this copy did not save is set aside too (a dying copy that was still writing),
     and a map position such a copy pointed at its own root is moved to this copy's root.
   - **Fenced on the claim.** Setting nodes aside is the one write that changes rows another copy saved, so it runs only
     while THIS copy holds the work item: in the same transaction, under a share lock, the item must be CLAIMED by this
     worker with a deadline still ahead, at or within one claim length of the deadline this copy last set
     (`RunKeepAlive.heldUntil`). A later claim by another copy (even a same-process retry with the same worker id) can
     only start after that deadline passed, so its deadline lies beyond the window. Otherwise RUNNER_CLAIM_LOST and
     nothing changes.
   - Readers that list a run's nodes or reviews skip stale nodes: the judgement reads (latest reviewer, reviewed,
     disputed, lineage), the serve reads (node projection, edges, review catch-up), the private evaluator's reads.
   - Debate shape: `core.map_position` (one row per argued answer, naming its root) keeps the dead copy's root; the
     move to this copy's root is recorded in `core.map_position_repoint`, and the map's reader
     (`readMapChoiceForRun`, behind the debate page and the publication copy) serves the root in force.

## The database change (chain step 0118)

- `debateai_runtime` may `UPDATE (generation_status) ON core.node`; a trigger lets an update change ONLY
  `generation_status`, and only to `stale` from another value (never back), and never once the run has a
  `serve.answer` (NODE_RETIRE_AFTER_ANSWER: a served debate keeps its tree whoever asks). It replaces 0000's blanket
  `reject_mutation` on `core.node`; DELETE stays refused, and an erased encrypted run refuses the mark
  (`PRIVATE_CONTENT_ERASED`). The chain refuses to start a runner while 0118 is pending, so no runner without the grant
  ever reaches the set-aside.
- `core.map_position` itself cannot be changed: 0116's chain step digests its ACL and triggers on every later
  `migrate()`, so a grant or trigger there would read as drift. The move is a NEW append-only table,
  `core.map_position_repoint` (run, answer, from root, to root, maker; ids and codes only): a trigger allows a move only
  from the root in force, only when that root is stale, and only to a live node of the same run; 0040's erasure
  barrier refuses a move on an erased run.
- Chain step files: `migrations/0118_reclaim_resume.sql`, `migrations/lineage/reclaim-resume-forward0118.json`,
  `packages/db/src/migration-forward0118.ts`, appended last to `STEPS`.

## What does not change

- A first claim: the replay book is empty, nothing is wrapped, every call goes to the vendor. The only new statement is
  the fenced, zero-row set-aside before scoring (the guard against a copy still writing).
- The ledger keeps every attempt the dead copy made; attempt counts, seat restores (A15d/A16a) and spend read it as
  today. Replayed calls add nothing to it.
- Story calls run after the work item is settled and are never replayed.

## Known limits

- A dead copy that died after `serve.persist` but before settling is not covered (today's behaviour).
- A call answered while the copy was lost (its result never saved) is asked again: it was in flight.
- A legacy run without recorded prompts (before 0090) replays nothing and is re-asked in full, but finishes.
- A copy that lost the run but is still writing can add nodes and reviews while the new copy argues (only its setting
  aside is fenced); they are set aside before scoring, but the new copy's "progress so far" reads may see them first.
- Tested end to end on the legacy seat book only (the preview); the pinned role assignment's review-site rule is
  covered by the review keys the resumed runs record.

## Tests

- `tests/integration/reclaim-resume.test.ts`: lost at the first review, mid-arguing serial and together, shaped — the
  resumed run's live debate equals an uninterrupted run's, and no call answered before is asked again except calls in
  flight when the copy was lost; the shaped case also checks the map serves the live roots; plus a divergence case (a
  recorded member busy on the second copy) that still finishes with one live tree. Three mutants (no replay, no node-id
  translation, no setting aside at claim) each turn it red.
- `tests/integration/reclaim-replay-book.test.ts`: the book read from what the recording gateway wrote, on an encrypted
  and a legacy run.
- `tests/integration/reclaim-resume-database.test.ts`: the runtime role can set a node stale and cannot change anything
  else, bring it back or delete it; the re-point rules; every reader skips a stale copy.
- Unit: grouping recorded attempts into calls, the prompt and site match, patch reconstruction.
