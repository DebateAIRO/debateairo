# 34 — Cross-run memory & Q61 retrieval design

Type: research
Status: resolved
Blocked by: none

## Answer

Resolved by Opus research seat — full design at
[../../research/34-cross-run-memory.md](../../research/34-cross-run-memory.md).
Gist: the match key is a PROJECTION of already-frozen artifacts (Q2 binding,
Q7/Q8 enums, R6/R7, Q11's hashed terms — V's "keywords" already exist as
typed objects); memory key = cache key MINUS as_of/policy_version or the
mechanism is inert; a match must NEVER reduce work (else it becomes the
banned semantic cache). Five precision-ordered match tiers (similarity
BANNED as decider, legal only as blocking); LINK-NEVER-MERGE with typed
run_link edges; negative disclosure required (candidate found-but-not-linked
is served too). Payload rungs P0–P5; scorecard facts need NO match at all
(class-level Q61 value ships via the scorecard pipeline). Four entry points;
key law: A PRIOR VERDICT IS NOT EVIDENCE FOR ITS OWN CLAIM (only the
resolver's outcome + re-verifiable sources are); prior-vs-now contradiction
routes to DR-032's flag, never averaged. Statistical debt flagged: linked
repeats are clustered (DEFF correction needed or scorecard gates pass that
shouldn't). 24 sharp V questions for the Q61-mechanism confirmation round.

## Question

(Commissioned by V in the theme-6 sitting, 2026-08-04.) V's Q61 mechanism:
when a new question arrives, the machine checks whether its keywords/topic
have been seen before by the algorithm; if yes, data from the previous
session is pulled in. Design the mechanism honestly: what "seen before"
means (keyword/topic matching — noting the standing ban on inferring semantic
cache hits from similarity, ARCH-D5, and the exact-string-dedup indictment
D3 — the match must be typed and visible, never a silent semantic guess);
WHAT gets pulled (settled outcomes, prior graphs, scorecard facts, open
triggers); how it feeds SERVE/SETTLE and the composition prompt (DR-044);
how it interacts with staleness (DR-015: pulled material carries its
spawn-time stamp and staleness state) and retirement/revival (DR-016); and
what the asker sees ("this builds on a previous answer" — visible, per the
execution-ledger law).

## Deliverable

`../../research/34-cross-run-memory.md` — marker `RESEARCH HANDOFF COMPLETE`
at top; match-mechanism options with failure modes; pull-payload options;
serve integration; the sharp V questions, numbered. Feeds the spec's SETTLE
chapter and the resumed Q61 mechanism ruling.

## Comments
