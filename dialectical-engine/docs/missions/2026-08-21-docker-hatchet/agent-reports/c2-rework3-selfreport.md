# SELF-REPORT — C2-DOCKER-OPUS rework round 3 of 3 (Claude Opus 5) · **LAST LAWFUL ROUND**

- **Ticket:** `C2-DOCKER-OPUS` · mission `2026-08-21-docker-hatchet` · loop ARCHITECTURE · stage C2
- **Seat:** Claude Opus 5, **same session** `353f7aa5-5955-4e9b-8601-812810039d2b` (resumed)
- **Round:** `rework_round: 3` · `authority_epoch: 4` · **rework cap = 3; there is no round 4**
- **Comments read through:** H2-rework-2 remaining RED; G3-rework-2 APPROVED preserved
- **Deliverable:** `architecture/Plan.md` (1904 lines, was 1691)

## Contract compliance

**Writes: exactly the two paths in the rework-3 packet's `allowed` list.**

| Path | Action |
|---|---|
| `docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md` | revised in place |
| `docs/missions/2026-08-21-docker-hatchet/agent-reports/c2-rework3-selfreport.md` | created (this file) |

No other file written, created, moved or deleted. **No commit. No push.** No board operated.
**Hermes Agent not run.** **No reviewers launched.** **V not contacted.** **Docker not
started**, no `docker` command executed, nothing put on `PATH`. **No compose mutation.** All
seven §3.2 baseline hashes re-verified unchanged after the write, `compose.dev.yaml` included
(`a61c779d5b61010c`). No tracked file modified. **No OPEN-V row closed; no 2–1 product contest
decided** (V-2, V-3, V-5 remain parameterized).

## Scope and reproduce-first

Scope was the **residuals** of H2-03…H2-09 at `H2-rework-2`. H2-01, H2-02 and the secondary
replay-service defect remain RESOLVED and were not touched.

**Confirmed the reviewer read this exact artifact:** the cited SHA
`c1d8db0ce2b2ad6b06cf17bd384d68f165f9a44f4cf5d05b78be65e85cf82901` matches the round-2 file
byte for byte. **All seven residuals reproduce**; `Plan.md` §0.2c is the ledger with the quoted
round-2 passage for each.

## Residual → fix

| Residual | Fix |
|---|---|
| **H2-03** — D3 stopped on "engine healthy" while D3a, which *produces* the readiness command, entered after D3 | **AR-21b** — renamed **D2a**, made **documentation-only** (no image, no container, no engine) and moved **before D3**; §4.2's graph now states why it is acyclic |
| **H2-04** — D6's jobs write product data under grants V-14 only *created* | **V-15 split**: (a) D4's asks, (b) D6's job writes, each separately answerable; (b) is a D6 entry gate |
| **H2-05** — D4/D6 had to write D7-owned evidence files to complete | **AR-23** — per-slice `deploy/evidence/*.md`, one writer each, D7 **reads and assembles**; all eleven manifest paths enumerated in full, no `…`/`<slice>` shorthand |
| **H2-06** — no Postgres bootstrap credential, no dispatcher DB contract, `SERVER_URL` outside the matrix | **§3.6a** — the three `POSTGRES_*` bootstrap variables, **AR-24**'s dedicated `v3_hatchet_engine` principal, the dispatcher's full vendor env table, `SERVER_URL` decided by evidence at D2a, and **six** `OPS` entries (was four) |
| **H2-07** — the fixture was a path plus a schema | **the literal JSON body is now in the plan**; every enum taken from `packages/contract/src/index.ts:4-7`; **V-15(a) is hash-bound** and states the exact request count |
| **H2-08** — the predecessor's owner was the router, which does no content work | **AR-22 re-cut** — the intake's PROGRAMMING seat under its own goal packet, an exact two-file contract, a durable acceptance artifact D5 **reads**, plus a named exit if the ticket is not authorized |
| **H2-09** — several assertions measured the wrong quantity | **L-1/L-2 re-cut onto a polling observer**; **L-4 uses `core.run_progress_event`**; **L-5/L-6 count `DISTINCT attempt_id` filtered to `call_site_key='JUDGE'`**; L-0 §4 adds exact capture-and-bind commands |

**Findings BLOCKED or deferred: none.**

## The sharpest correction was a fact, not a judgement

H2-09 claimed L-1's right-hand row did not exist. Verified:
`packages/kernel/src/index.ts:200-211` — `LEDGER_ACTION_KINDS` is exactly `MODEL_CALL`,
`JUDGEMENT_SCHEDULED`, `PROPAGATION`, `BUDGET_SKIP`, `SERVE`, three `SETTLEMENT_*`,
`SCORECARD_DERIVED_FROM_LEDGER`, `UNCLASSIFIED_ACTION`. **There is no claim-recording kind**,
so round 2's "sequence of the claim-recording entry" compared against a row the schema cannot
produce.

The replacement is **stronger than what it replaces**: a polling observer that catches a
sample where `core.work_item.state='CLAIMED'` is visible **from an independent session** while
`ledger.raw_artifact` for that run is still **zero**. That observes the transaction boundary
directly, rather than inferring commit-before-call from two sequence numbers — and it answers
L-2's "no call-start synchronization is defined" with the same capture.

Other code facts established this round, so no assertion names an invented object:
`core.run_progress_event (run_id, at_seq, kind, value_json)` with `kind='TERMINAL'`
(`packages/serve/src/index.ts:1178-1179`) is L-4's surface; `call_site_key` for the judge path
is the literal `'JUDGE'` (`apps/runner/src/index.ts:1435`), which makes L-5/L-6's
distinct-attempt count dimensionally comparable to `JUDGE_MAX_ATTEMPTS`.

## What I declined to do

The reviewer offered, as an alternative for H2-08, *"constrain this mission to V-9(a)."*
**I did not take it.** Choosing V-9(a) because it is the easier branch would decide an OPEN-V
row by convenience, which every packet in this sequence forbids. Instead V-9(b) received a
real producer **and** a named exit (if the `AC60-ROUTE-CONTRACT` ticket is not authorized,
`web` leaves this mission and becomes a named successor). Both branches are now executable
without pre-empting V's answer.

## G3 preservation

**G3-rework-2: APPROVED — F-1…F-7 still flipped.** Round 3 again used surgical section edits,
so the approved clauses are preserved by construction. Verified by anchor count after the
edits: AR-2/AR-2a, §2.8, AR-15 and §1.1's unit-class column, AR-17, §3.2's classification and
GENERATED OUTPUT class, and DP's V-2(b)/(c) gating all intact. §0.2a's audit table stands
unchanged. **No G3 flip is unwound.**

Three G3-carrying clauses were **extended, never reversed**: AR-17 gained AR-24's dedicated
engine principal (same idempotent mechanism); §2.7.1's dispatcher row now sources its command
from a predecessor rather than a successor; DP gained nothing this round.

## Self-audit findings, fixed before handoff

Grep-auditing my own edits caught three places where a predecessor still wrote a D7-owned
file — the exact cycle H2-05 named — that my first pass missed: §2.6.2's ABSENT rule
(`ACCEPTANCE.md` → `evidence/D4.md`), §3.4's MB-8 image-id rule (→ `evidence/D2.md`), and D6's
done-when (`DISCLOSURE.md` → `evidence/D6.md`). Also fixed: one `<slice>` shorthand surviving
in §3.2's rule 5, and D4's slice entry still citing `V-15` rather than `V-15(a)`.

## Assumptions and risks

- **AR-14's numerals** remain the most overturnable ruling in the document (§2.7.1a), for the
  reason recorded in §10: if the §5.4c classification is wrong, the timing table is the only
  thing that falls, and it falls back to V.
- **Sixteen V rows now gate this plan**, and three of them (V-14/V-15/V-16) are
  authorizations rather than values. **V-1 + V-4 gate everything; V-13 gates the
  load-bearing slice; V-15(a)/(b) and V-16 gate every mutation.** If the mission proceeds
  without them, it proceeds unlawfully — which is the point of separating them.
- **D2a can still come back `ABSENT`.** Moving it earlier removes the cycle but not the
  possibility: if §W or §E is `ABSENT`, MB-3 is unmeetable for `runner` or the dispatcher and
  the answer is a blocker. What changed is that this now surfaces at D2a — **before any
  container is built** — instead of inside D3 or D4.
- **This was the last lawful rework.** If H2 finds further RED, the packet says it goes to a
  V DECISIONS PACKET rather than a round 4. I have no further reproduction to offer against
  the current text; the seven residuals are addressed at the exactness bar the reviewer set.

```
REWORK READY FOR PEER REVIEW:
- mission/step: 2026-08-21-docker-hatchet / C2-rework-3
- owner CLI session: 353f7aa5-5955-4e9b-8601-812810039d2b
- findings addressed: H2-03, H2-04, H2-05, H2-06, H2-07, H2-08, H2-09
- findings BLOCKED/deferred: none
- comments read through: H2-rework-2 remaining RED; G3-rework-2 APPROVED preserved
```
