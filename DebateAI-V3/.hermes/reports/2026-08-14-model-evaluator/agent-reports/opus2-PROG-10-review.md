# opus2 — PROG-10 peer review (second independent reviewer, Grok substitute per V)

- **Lane:** `codex/eval-10-seatshare`
- **Round 1:** `0c17179` — **PASS** (8 non-blocking findings) — 2026-08-15
- **Round 2:** `310ce9b` "test(evaluator): close seat-share rework gaps" — **PASS** — 2026-08-15
- **Review files:** `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-10-opus2-review-1.md`,
  `…/PROG-10-opus2-review-2.md`

## Independence

No other PROG-10 review file read in either round; reviewer A's four coverage blockers are known to me
only as a count, not as content. Every harness was written from scratch outside the repository and
imported the lane's source by absolute path. No lane fixture or expected value reused. Worktree left
clean in both rounds (`git status --porcelain` empty); no commits, no writes inside either repository.

---

## Round 2 — narrow delta (`0c17179..310ce9b`, +115/-16 across 5 files)

Three questions were put to me. All three answered yes.

**1. Is the locale finding actually fixed on the real write path?** Yes. I re-ran my round-1 reproduction
verbatim — same input persisted through `computeAndPersistShadowDecision` against real embedded
PostgreSQL under three host locales:

| Locale | Round 1 (`0c17179`) | Round 2 (`310ce9b`) |
|---|---|---|
| `en_US.UTF-8` | `52583c34…` | `26035987eb2cfbe8…` |
| `tr_TR.UTF-8` | `26035987…` | `26035987eb2cfbe8…` |
| `sv_SE.UTF-8` | — | `26035987eb2cfbe8…` |

Identical everywhere. I also characterised the replacement `compareCodePointStrings` rather than trusting
it: **0 antisymmetry and 0 transitivity violations** over 17 adversarial strings (incl. astral characters
and a lone surrogate), and a byte-identical sorted fingerprint under both locales. Correct total order,
genuinely locale-free.

**2. Is my round-1 verified surface unbroken?** Yes, bit-for-bit. 30/30 hand-computed allocator assertions
identical; 3,888-case invariant grid identical (0 violations on the lane's vectors); real-Postgres
byte-identity unchanged — an admitted run's persisted state is still byte-identical shadow-ON vs
shadow-OFF, with `ledger.sequence_allocator` the only delta and **zero** differing tables once sequence
numbers are normalised; all structural leak checks (inward FKs, views, matviews, rules), all CHECK/trigger
refusals, all role probes (`debateai_runtime` → *permission denied for schema evaluator*) identical.
Full suite **98 files / 702 tests** green (was 700), typecheck exit 0, both audits clean.

**3. Did my recommended checklist additions land?** All four: rank-monotonicity constraint on approved
share vectors (naming the rank-2 starvation mechanism); explicit approval of M=2 silent residual
reabsorption; a mandatory gate to add and bind a validated `evaluatorSeatSharePolicy` register reader; and
the widened guard roots, in both the live-source-audit gate and PROG-07 disclosure 2. Reviewer A's
two-seat 1/1 disclosure also landed — correctly, since FR-8.1 AC2 does not hold at exactly two seats and
architecture §6.4 step 4's preservation clause is what overrides it.

## Both new guards verified non-vacuous

- **Locale regression test:** I reconstructed the lane's own receipt rows under the test's mocked
  `localeCompare` — the old order `best, runner` flips to `runner, best`, so the test would have failed at
  `0c17179`. Passes now because the code no longer consults `localeCompare`.
- **Widened dark-launch guard:** ran the guard's predicate myself over the five roots — scans 75/30/22/4/31
  files, confirmed it reads contents in each newly added root, result `[]`, 22ms.
- **Grant-level darkness:** the un-failable `routing_decision count = 0` assertion is replaced by
  `has_table_privilege(… 'INSERT') = false` on `routing_decision` and `session_assignment` — the same proof
  class I ran with `SET ROLE` in round 1, now pinned in the lane's suite.

## Findings still open (all non-blocking, none dispatch-affecting)

1. Sequence burn on the idempotent no-op path shifts later admissions' `created_at_seq` (32 vs 34).
   Pre-existing pattern; **the only one of my four checklist recommendations that did not land** — worth
   one disclosure line before V sees the packet.
2. M=1 persists `selectedVector: "NORMAL"` for a premium request (allocation correct, audit trail is not).
3. Risk-tier union re-declared inline instead of importing `RiskTier` from `@debateai/kernel`.
4. New, cosmetic: the receipt now sorts by code **point** while `compareProfileIdentity` and the checklist
   wording use code **unit**; they diverge only for astral vs U+E000+ characters.
5. New, cosmetic: the locale test patches `String.prototype.localeCompare` process-wide across an awaited
   DB round-trip (restored in `finally`, contained by `fileParallelism: false`).

**Recommendation: merge.** Attach finding 1 to `BIND-READINESS-seat-share.md`.
