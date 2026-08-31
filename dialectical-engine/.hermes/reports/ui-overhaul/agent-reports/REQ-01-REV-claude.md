# REQ-01-REV self-report — Claude Opus 5, blind review seat (ui-overhaul)

Filed before the verdict, per `heartbeat-protocol` §3. Murder-case bar: cause, not symptom.

1. **The seat could not reach its own output surface, and that is a launch defect, not
   friction.** `launch-REQ-01-REV.sh:7` starts this seat with `--permission-mode acceptEdits`
   under `claude -p`. `acceptEdits` authorises file edits, not Bash. My packet §3/§4 name
   `hermes kanban --board ui-overhaul comment …` as the ONLY legal output. Verified:
   `hermes kanban --board ui-overhaul list` → `This command requires approval`;
   `which hermes` → `/Users/vladmihaimiron/.local/bin/hermes` (so it is not PATH). The
   worker's launcher (`launch-REQ-01.sh:7`) used `bypassPermissions`. **Cause: the launcher
   pair was not probed against the thing each seat is required to DO.** The spine already has
   this law (v3.3.0 item 9, "each CLI's goal invocation is probed"); it was applied to
   invocation and not to the seat's mandated side effects. Price: the entire verdict exists
   only in this session's return text and the tee'd log, not on the board — i.e. §2.4
   ("the board is the state") is unsatisfiable by this seat by construction.
2. **Fix for the class, not the instance:** the probe must be "can this seat execute every
   command its packet names", run at launch, per seat. One line in the launcher
   (`hermes kanban --board <b> comment <ticket> "LAUNCH PROBE"`) would have failed in
   2 seconds instead of after a full review.
3. **I nearly filed three false findings.** At ~16:38 I read `T1/SPEC.md:85` and
   `T4/SPEC.md:76` and found the pin-bind named a single example file instead of the
   `tests/render/**` class, while `T1/DECISIONS.md` and `T4/DECISIONS.md` both claimed the
   sweep had been applied. I had it written up as an evidence-integrity finding — a
   DECISIONS row asserting a change the artifact did not contain. Then `ls -lT` showed
   mtimes of **16:43:55** on both files: the worker applied the sweep DURING my review. A
   re-read at 16:45 returned the corrected text. **The finding was real for 5 minutes and
   false forever after.**
4. **Cause of (3): the packet aims the review at a commit while the worker still owns the
   tree.** My packet §1 says "review the COMMIT 6ec2f68, not the tree"; §4 says "No git
   commands." Those cannot both hold — reading a commit requires git. And 6ec2f68 is now
   the *stale* state: T5 was rewritten 16:42:21–16:43:28 and T1/T4 16:43:55–16:44:13. Had I
   obeyed §1 literally I would have reported T5's missing `REVIEW AGREED BY:` and the T1/T4
   pin binds — three findings already fixed — and bought a wasted rework round. This is the
   *identical* failure the spine records at §3b ("Measured basis, 2026-08-29"): a seat
   measured mid-flight produces a wrong finding against a seat doing its job. **The 2026-08-29
   fix made compliance observable; it did not make the review target immutable.**
5. **Upgrade that would close (4) permanently:** a review seat must be dispatched against a
   named immutable artifact, and the handoff marker must be the freeze. Either the worker
   commits/tags at `READY FOR PEER REVIEW` and the packet names that tag (and the reviewer
   is granted read-only `git show`), or the packet names the tree and the orchestrator
   confirms the worker's session is parked before dispatch. Today the packet did neither and
   the reviewer was launched while the worker was still writing — the worker's own log shows
   an internal skeptic loop still running at dispatch time.
6. **Dead end, so nobody re-derives it:** there is no readable board fallback. `~/.hermes`
   is outside the session's allowed working directory and `ls` on it is refused. Do not
   spend turns looking for a local Kanban store — either the CLI is executable or the seat
   is mute.
7. **Where the packet was unclear, exactly.** §1 "review the COMMIT" vs §4 "No git commands"
   (above). §3 "Also file every finding as its own comment ON THE WORKER TICKET" — with the
   one verdict comment on t_1ac0b5f9 this duplicates every finding twice on two boards; no
   rule says which is canonical if they diverge. §4 grants exactly one writable path and
   does not say where the verdict lives if the board is unreachable, which is the case that
   actually occurred.
8. **The packet omits the self-report instruction VERBATIM**, which spine R8 item 6 and
   v3.3.0 item 13 both require of *every* packet. Mine (§4) and the worker's (REQ-01 §1, §6)
   both paraphrase it as "murder-case bar" and point at the protocol file. It cost nothing
   here because both seats had read the spine — which is exactly why it will keep shipping
   until a packet template enforces it.
9. **Token sink, priced.** The spine is 2007 lines and had to be paged three times
   (~42k tokens) to satisfy a read-order that a reviewer uses maybe 200 lines of. The role
   skills are 151 + 80 lines and carry essentially all of the actionable law. **Cheapest fix:
   the read order should be role-skill-first, spine-by-section-on-demand**, with the packet
   naming the 3–4 spine sections that bind this seat (§9, §10, R8, v3.3.0 items 11–16).
   Rough saving: 35k tokens per review seat, every dispatch.
10. **Second token sink:** the design ground truth ships as a 207 KB rendered HTML and a
    574-line text export with no artboard IDs in the text. Both this seat and the worker
    (its self-report items 1 and 6 say the same thing independently) had to re-key artboards
    by hand. Two seats paying the same extraction cost on the same document is the strongest
    single argument in this mission for a machine-readable screen inventory emitted once at
    intake.
11. **What I did NOT verify, so the next lens knows the hole:** the worker's actual
    `SKILLS LOADED:` line and its `READY FOR PEER REVIEW` comment on t_7e83d3fb — both live
    on the board, which I cannot read. I therefore could not perform the §5 duty of checking
    the author's declared skills against the requirements floor. I checked its launcher and
    log instead: the packet's §0 never names `superpowers:brainstorming`, which is the
    requirements floor, so the declaration cannot show floor compliance either way.
12. **Honest shortfall of my own:** my `SKILLS LOADED` line is the three packet files plus
    `superpowers:verification-before-completion` (my role floor). I did not load
    `receiving-code-review` — no finding of mine has been contested yet; if one is, that
    load happens before I answer.
13. **What repeatedly costs tokens across this harness, in one sentence:** every seat re-reads
    the same 2000-line spine and re-extracts the same source document, and then the machine
    spends a rework round on a race the orchestrator could have removed with one `ls -lT`.
14. **One-prompt-machine upgrade, concretely:** three launcher preconditions, checked
    mechanically before any review dispatch — (a) execute the seat's own output command as a
    probe, (b) assert the artifact set's newest mtime is older than the dispatch timestamp,
    (c) assert the upstream seat's session is parked. All three are one-liners. All three
    failed or were absent here, and (b) is the one that nearly cost a round.
