# Loop report 22 — BUG-02 (t_59d211be) · closed 2026-08-14

V's lived defect ("CLAIMED → 404s → no loading bar → nothing happens")
through the full loop: diagnose → ticket → Codex → SPLIT diamond → rev2 →
finder confirmation → done. Two revisions; the split earned its keep.

## The split (the run's teaching case)
Rev1: Grok APPROVED from sources; Opus BLOCKED from the live world — the
serve-flip never fired live, and deleting the entire flip mechanism kept
all 551 tests green (no DOM environment ran any effect). Every prior split
had this anatomy; this one proved the discipline again ON the ticket meant
to fix V's live pain.

## Rev2 (same session)
R1 flip as rendered behaviour (jsdom, single-file opt-in, devDependency
only); R2 answer authority (a 200 answer beats a lagging projection; the
TERMINAL event now writes inside the answer-persist transaction, closing
the crash-window by construction); R3 client FAILED banner; R4 smaller
pins. Rev1's five silent survivors all red now; 22/25 confirmation
mutations red, one desired-green (source-regex retired for behaviour
kills), one proven-equivalent mutant, one narrow gap (N1, advisory).

## Live confirmation (run 34913492, one depth-1 ask)
Unattended parked tab flipped loading→debate on the terminal SSE frame with
zero interaction; 1,489 requests, 0 non-200, zero absent-answer probes in
flight; state honest (RUNNING → SETTLED, raw CLAIMED never on the wire).

## Ops incidents logged against the loop itself
1. The rev2 seat WEDGED overnight in a corrupt codex models_cache error
   loop AFTER completing its work (22:35) — exit-wire never fired (no
   exit), no stall-watchdog existed; 10h invisible. Cure: cache
   quarantined; every seat now gets exit-wire + no-log-growth watchdog.
   The spine's liveness law finally wired into DR-168-A practice.
2. The orchestrator's own depth-5 "unlock probe" was an F1-class check
   (proof by elimination through a guard that fires first) — confessed in
   DR-172-A; the coverage guard was a hardcoded placeholder needing a
   ratification sync, done under V's small-ticket grant with re-pinned
   tests.

## Suite
562 → 601 tests authored across the ticket (561 passing + 1 skipped at
close; jsdom render layer added). Files: 24 changed, +1683/−78.

## Board after close
Everything DONE except S15 (parked by V). Push state: origin/dev 49a83c5
(pre-BUG-02); the BUG-02 delta awaits V's next push word.
