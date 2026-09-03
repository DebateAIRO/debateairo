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

---

# Round 2 — verification of the REQ-01 rework (commit bc9f301)

Filed before the round-2 verdict, per `heartbeat-protocol` §3. The verbatim
instruction this section answers:

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

15. **Both round-1 launcher defects were fixed, and the fix is measurable in one
    number: this round produced 4 findings instead of 13, in roughly half the
    wall-clock.** Board access worked on the first command
    (`hermes kanban --board ui-overhaul show t_7e83d3fb`, ~2s). Read-only git was
    granted, so `git diff --stat 6ec2f68..bc9f301` and `git diff bc9f301`
    (empty — disk equals commit) replaced round 1's `ls -lT` mtime forensics
    entirely. **Cause of the round-1 loss, now confirmed by its absence: a review
    seat whose target is not immutable spends its budget proving the target
    instead of judging it.** Price of the fix: two lines in a packet.

16. **The single highest-value line in this packet was "The worker's claim is a
    claim; count them yourself."** I counted: 32 cluster headings, 32
    verification-command lines, zero bare `Assert` cells. The claim was TRUE.
    That matters more than if it had been false — **a reviewer who verifies a
    true claim in 3 commands is cheap; a reviewer who trusts one is worthless.**
    Generalize it: every packet that relays a worker's numeric claim should
    relay it *as a claim with the counting command attached*. It cost 3 tool
    calls to convert a sentence into evidence.

17. **What I nearly got wrong, and it would have cost the mission a round.** All
    32 clusters carry `Cluster verification command (ARCH finalizes): three runs
    of <prose>; worst run is verdict` — **not one is an executable command**. My
    first instinct was to file that as a blocking F3 regression against spine
    v3.3.0 item 12 ("one verification command per cluster"). I then read my own
    round-1 text: I had cited `T9-C1` as the exemplar to copy, and `git show
    6ec2f68:.../T9/PLAN.md` proves T9-C1's "command" was **already that same
    prose**. The worker did exactly what I prescribed. **Filing it would have
    been me charging a seat for obeying me.** Cause: my round-1 finding named an
    exemplar instead of naming the property. **Upgrade: a finding must state the
    PROPERTY the fix must satisfy, never "make the others look like this one" —
    an exemplar propagates its own defects at the exact rate the fix propagates.**

18. **The class-sweep law (spine §2.2 / v3.3.0 item 16) failed in the same shape
    it always fails, and it is now measurable.** Round 1 named 4 design
    paragraphs (F11) and 2 self-cancelling preconditions (F4g). The rework fixed
    **exactly those 6 instances** and did not sweep either class: 4 more design
    paragraphs (the METHOD 01–04 bodies) are still unbound, and 2 more
    self-cancelling cells (`T1-C3-2`, `T5-C1-2`) still carry "when fixture
    has X". **Cause: the finding was written as a list of file:line, so the list
    is what got fixed.** The spine already diagnoses this ("searching by NAMED
    LEAD instead of by RISK CLASS is how the second and third defects ship") —
    my round-1 findings were themselves written as named leads. **Upgrade, on the
    reviewer not the worker: every finding must ship with the GREP that
    enumerates its class**, and the rework must paste that grep's output back.
    `grep -rE 'when (the )?(fixture|data|tree|multiple)' slices/*/PLAN.md` is
    four seconds and would have closed F4g's class in round 1.

19. **The rework introduced one new vacuity, in the cell that closes a V
    ruling.** `T9-C4-3` proves "static placeholders" with an **OR**: hero meta OR
    pricing strip contains `[PLACEHOLDER]`. A live counter in the hero passes it.
    **Cause: a fix written to satisfy the reviewer's sentence rather than the
    requirement's scope** — R8 binds both strings, the check binds either.
    Cheapest general guard: **any acceptance cell containing "OR" between two
    independently-required observations is a defect by construction.** That is
    a lint rule, not a judgement call, and it is worth adding to the
    quantifiability law in `heartbeat-requirements`.

20. **A FROZEN artifact cannot carry a conditional that its own closure
    invalidates.** `T8/SPEC.md:50-52` still says "until then use design copy on
    this auth marketing-adjacent shell" — while `T8/SPEC.md:98` records that V
    closed exactly that question. Dead text pointing the opposite way from the
    ruling, inside a v2 FROZEN document. **Cause: closing a ruling was treated as
    editing the OPEN QUESTIONS section, not as sweeping every clause conditioned
    on it.** Upgrade: when a V ruling closes an OQ, grep the slice for the OQ's
    subject and re-read every hit — the closure is a class, and the OQ entry is
    one member of it.

21. **Token accounting for this seat, honestly.** Round-2 read cost was dominated
    by the same thing as round 1: the 2006-line spine, paged in four reads to
    satisfy the packet's "read fully" gate (~40k tokens), against ~230 lines of
    role skill that carry every rule I actually applied. **This is now a measured,
    repeated, per-seat, per-round cost** — round 1 priced it at ~35k, round 2 paid
    it again for the same seat on the same mission. The `heartbeat-protocol`
    router itself says "if you are reading more than ~200 lines of protocol
    before starting work, something is wrong — say so." I am saying so: **the
    packet's §0 gate and the router's own advice contradict each other, and the
    packet wins, so every seat pays.** Fix: §0 should name the spine SECTIONS
    that bind the seat (for a reviewer: §9, §10, R8, v3.3.0 items 11–16) and
    require a re-read of the role skill in full. Saving ≈35k tokens × every seat
    × every round, at zero loss of law — I applied none of §6, §7's diamonds, the
    worktree chapter, or the compaction chapter to this review.

22. **Second repeated cost, unchanged from round 1 and now proven to repeat:**
    the design ground truth is still a 574-line text export with no artboard IDs.
    I re-extracted the TURN 9 landing copy by hand *again* this round to verify
    the vocabulary translation was faithful (design lines 10–30, 70–100). Three
    seats have now paid the same extraction. **A `design/screens.json` emitted
    once at intake — artboard id, region, verbatim strings — would have made this
    round's central duty (is the translation faithful?) a diff instead of a
    reading.** This is the strongest efficiency upgrade available to this mission
    and it is still not done.

23. **One-prompt-machine upgrades this round earns, concretely:**
    (a) **Ship the grep with the finding.** A finding without an enumeration
    command is a named lead, and named leads produce partial sweeps — measured
    twice now, F4g and F11.
    (b) **Ban `OR` between independently-required observations** in acceptance
    cells; add it to the forbidden-words list beside the vague adjectives.
    (c) **Findings state properties, not exemplars** (item 17 — this one is on
    me, and it nearly cost a round).
    (d) **Section-scoped spine reads** in §0 of every packet (item 21).
    (e) **`design/screens.json` at intake** (item 22).
    (f) **When a V ruling closes an OQ, sweep by subject, not by section**
    (item 20).

24. **What I could not verify this round, so the next lens knows the hole:** the
    worker's `SKILLS LOADED` line is now readable on the board (17:12 comment)
    and it DOES name `brainstorming`, the requirements floor — so round 1's
    open gap is closed at the declaration layer. But the spine (v3.3.0 item 15)
    says "only the skill BODY proves a load", and I have no access to the Grok
    session transcript. I am accepting the declaration, and saying so rather than
    implying I proved it. I also did not verify the eight `PROGRESS.md` files were
    advanced past "REQUIREMENTS DRAFTED — awaiting review": they were untouched by
    bc9f301, which is CORRECT for the worker (orchestrator is sole writer per
    spine item 11) and is therefore an open item for the orchestrator, not a
    finding against the seat.

25. **Honest shortfall of my own, again:** `SKILLS LOADED` this round is the three
    gate files plus `superpowers:verification-before-completion`. I did not load
    `receiving-code-review` — no finding of mine has been contested. If the worker
    contests one of the four new findings, that load happens before I answer.
