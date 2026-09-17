# Self-report — orchestrator/judge/teacher/drafter (Fable 5 main session, T3)
Mission 2026-08-31-algorithm-correctness · filed before mission close per router §3.
The question, verbatim: "treat it like a murder case. I want to get a nice report on
what can be done better. What we must upgrade. what repeatedly costed us tokens. how we
can make the coding more efficient. How can we turn this into a one prompt machine even
better."

## The case

**Cause of the biggest single loss: I dispatched before reading the packet law.**
The router caps protocol reading at ~200 lines, so I read router + role contract and
wrote a mission-briefing-style packet. The codex seat correctly refused it against
spine §4 (F1). PRICE: one full dispatch round, ~4 min of codex spend, ~20 min of repair.
The nuance worth keeping: the ~200-line cap and the four-element packet law live in
DIFFERENT documents, and nothing in the router says "spine §4 governs packet SHAPE".
The seat found it because reviewer duty §1 sends it to the packet; I never had a duty
that sent me to §4. FIX FOR THE SPINE: one line in the orchestrator contract — "packet
shape is spine §4; read that section before your first dispatch" — would have cost 3
lines of reading against a full round lost.

**Cause of the second recurring loss: vocabulary conflation across documents, twice.**
(1) "S0-N" labels I invented for intake rulings (off-by-one caught by opus M3);
(2) risk_tier "standard" — the ENGINE's ask-tier word — in a SPINE-typed field whose
enum is low|medium|high, then "medium" against the immutable scoring-semantics floor
(codex N1(r2), B1(r3)). PRICE: two packet regenerations, one extra review finding cycle.
FIX: typed vocabularies deserve the same treatment the engine gives register rows — a
loud validator. A 20-line `board-lint` script checking ticket state blocks against the
spine enum + floor triggers would have caught both mechanically. That script should be
the first tool the NEXT mission's orchestrator writes.

**What repeatedly cost tokens: reviewing MY OWN artifact took four passes for one
defect class.** The verdict ladder (T11) went: not-total (opus B3) → total-over-wrong-
domain (opus B1(r2) + codex B2(r2), independently) → fixed. Opus's close-out names the
lesson: a TOTALITY TEMPLATE CLAUSE in the /goal format ("every derivation task states
its input domain incl. absent/null arms, and its property test covers that domain")
would have zeroed this. Same shape for the retry-feedback loop (codex B2(r3)): a LOOP
template clause ("every bounded loop names what each round receives that the previous
round produced") catches converge-by-accident designs at drafting time.

**What went right and should be kept, verbatim:**
- The blind + audit split (V's I-3). The two lenses converged independently on the same
  load-bearing truths (M8/C17, D1/C21, D2/C26) and DIVERGED exactly where the ground
  truth was subtle (two UIs, C1). One lens would have missed one half of that.
- The writer-sweep heuristic (opus): "reader sweeps find architecture; writer sweeps
  find lies." Four headline findings from one grep pattern. This belongs in the
  reviewer contract as a named technique.
- Packet-review duty. F1 hurt but the refusal was CORRECT, and the repaired dispatch
  was better. The system worked as designed against its own orchestrator.
- Conversation-mode recovery on the same codex session — zero context re-derivation
  across five dispatch rounds on one session.
- Marker-file watchdogs over log-grepping (TOOLING-TRAPS' own advice) — every lane
  completion was detected within 60s with zero false positives after round 1's
  existence-vs-completion lesson (a findings file EXISTING is not a lane DONE; watch
  the marker line, not the file).

**Near-misses (what I NEARLY got wrong):**
- Nearly taught V the depth-trap from the legacy web/ form as if it were the product
  (my Stop-1 premise). Codex's C1 FALSE forced the two-UI adjudication; the ruling
  survived on the contract hole, but the teaching premise was wrong for ~one stop.
- Nearly mutated goal-v3 while codex was mid-review of it (opus's routed clause);
  caught the race and deferred. I did NOT catch the same race for judge-adjudication.md
  (appended round 6 while codex r3 held it readonly). Additive-only, no harm observed —
  but the rule should be: freeze EVERY readonly input of an in-flight review, or pin a
  content hash in the packet.
- Nearly credited the Monitor's ALL-LANES-LANDED as completion in round 1.
- Wrote "risk_tier: standard" in a spine-typed field — pattern-matched from the engine
  domain I had spent the whole mission reading. Cross-domain vocabulary bleed is real.

**Dead ends (so nobody re-derives them):**
- `codex exec resume` rejects `-s`/`--add-dir`; config-key equivalents work (now in
  TOOLING-TRAPS). Resume is cwd-filtered: cd into the seat's worktree first.
- hermes kanban CLI absent from PATH this environment — file board (D1) worked; the
  typed state block + mirror law is the part that carries the weight, not the CLI.
- The evaluator package's MEASURED_* strings are profiling basis literals, not edge
  magnitudes — checked once, settled, do not re-open (also opus's own top worry).

## Prices (ledger summary)
F1 packet refusal: 1 round + ~25 min. resume-flag trap: 1 dead relaunch + ~4 min.
Draft convergence: v1→v4, three rework rounds (the lawful cap, fully spent), 34+7+3+2
findings, ALL accepted, 0 contested. Lens spend: opus ~1.03M subagent tokens across 5
resumes; codex 5 exec/resume rounds on one session. Wall-clock mission span: ~2h40m
from /heartbeat to goal-v4.

## One-prompt machine upgrades, ranked
1. board-lint (typed-state validator vs spine enums + floors) — kills the whole
   vocabulary-conflation class mechanically.
2. Totality + loop template clauses in the /goal task format — kills the two
   four-pass defect classes at drafting time.
3. Orchestrator contract line pointing at spine §4 before first dispatch.
4. Generated (never hand-written) orientation maps + entry SYMBOLS in research packets
   (opus §2b/§5.4) — its evaluator-omission nearly cost the mission's central finding.
5. Claim manifests: one clause = one subject, one runtime profile, one quantifier
   (codex's upgrade #1) — my C-claims cost extra evidence passes at every compound claim.
6. Freeze-or-hash every readonly input of an in-flight review round.
