# SELF-REPORT — C2-DOCKER-OPUS rework round 1 (Claude Opus 5)

- **Ticket:** `C2-DOCKER-OPUS` · mission `2026-08-21-docker-hatchet` · loop ARCHITECTURE · stage C2
- **Seat:** Claude Opus 5, **same session** `353f7aa5-5955-4e9b-8601-812810039d2b` (resumed)
- **Round:** `rework_round: 1` · `authority_epoch: 2` · comments read through: **G3+H2 union**
- **Deliverable:** `docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md` (revised in place, 1369 lines)

## Contract compliance

**Writes: exactly the two paths in the rework packet's `allowed` list.**

| Path | Action |
|---|---|
| `docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md` | revised in place |
| `docs/missions/2026-08-21-docker-hatchet/agent-reports/c2-rework1-selfreport.md` | created (this file) |

No other file was written, created, moved or deleted. **No commit. No push.** No board was
operated. **Hermes Agent was not run.** **No reviewers were launched.** **V was not contacted.**
**Docker was not started**, nothing was put on `PATH`, and no `docker` command was executed.
`compose.dev.yaml` re-hashed unchanged after the write (`a61c779d5b61010c`). No tracked file
was modified by this seat. DR-117 / DR-118 not reopened. **No OPEN-V row was closed.**

## Method — reproduce-first

Per the packet, **every finding was reproduced against the round-0 text before any rewrite**.
`Plan.md` §0.2 is the ledger: one row per finding, carrying the **quoted round-0 passage** that
exhibited it and the clause that now answers it.

**All sixteen reproduce. None is refutable, so none is contested.** I did not manufacture a
disagreement to look independent; where a reviewer was right, the finding is simply flipped.

Where the two lenses overlapped, **one clause answers both write-ups**, as the packet required:

| Overlap | The single clause |
|---|---|
| F-1 ≈ H2-03 | **AR-15** — `scheduler` is a one-shot invocation unit outside the MB-1/MB-3 quantifier, with the §2.7.2 completion contract and **V-11** as the named owner of the exception |
| F-2 / F-6 ≈ H2-01 | **AR-2 + AR-2a** — a mission-owned Compose project plus a foreign-runtime ownership probe that **refuses** rather than warns, with §2.8's command-scope table |
| F-7 ≈ H2-05 (part) | **§3.2** — every hashed path classified, including a new **GENERATED OUTPUT** class for `.env.compose` |

**No third architecture was invented.** Every re-cut takes an option the reviewers themselves
named: AR-2 is F-2's flip (a) / H2-01's correction (2); AR-15 is F-1's third option /
H2-03's second; AR-17 is F-3's first flip; DP is F-5's first flip; AR-19 is H2-08's correction.

## Findings → clause

| Finding | Flipped by |
|---|---|
| **F-1 · H2-03** scheduler vs MB-1/MB-3 | **AR-15**; §1.1's new *unit class* column; §2.7.2's completion contract; D6; MB-11 item 6; **V-11** |
| **F-2 · F-6 · H2-01** project takeover / runtime freeze | **AR-2** (project `docker-hatchet`, own postgres, own volume, base file never on a command line); **AR-2a** (probe before every lifecycle command, foreign owner ⇒ `BLOCKED`); §2.8's command table; the freeze banner extended to runtime |
| **F-3** U-2 has no lawful repair | **AR-17** — idempotent always-run SQL one-shots; `init-hatchet.sql` is **MUST NOT TOUCH and unused**; fresh-volume and existing-volume become **one** path; U-2 demoted to a recorded fact |
| **F-4** MB-3 only postgres+runner | **§2.7.1** — a named contract check for all five required units, its lawful source, and a blocker (not a workaround) where none exists |
| **F-5** V-2 designed-through | **DP** slice, gated on V-2(b)/(c), with all five build-order fields |
| **F-7** unclassified hashed paths | **§3.2** classification column + **GENERATED OUTPUT** class |
| **H2-02** D0 impossible | **D0a / D0b split**; U-2 moved to D3; an explicit zero-mutation boundary; D0b's negative fixture uses a disposable mission-owned project |
| **H2-04** V gates missing | **§4.1** authoritative gate matrix (V decisions · values · IMPORTANT OPERATIONS · predecessors · stop marker) from which slice entries derive; **V-4 now gates every slice** |
| **H2-05** globs / alternatives / parallel writers | **§3.1** exact paths only; **AR-16** per-slice compose fragments; **§4.3** slice→file writer matrix; D6 re-parented to D3 so the D5∥D6 overlap is gone |
| **H2-06** invented values | **§3.6** value/secret/image matrix; **V-12** (base-image identity); **V-13** (the runtime value set) |
| **H2-07** principals + product truth | **AR-17** (three exact SQL artifacts, four named roles, negative receipts); **AR-18** (a real ask through the front door as the lawful trigger) |
| **H2-08** D5 deepens AC-60 | **AR-19** — D5 gated on V-9, one resolved ingress model per answer, bypass negative check; round 0's "publish `api` alongside `web`" removed |
| **H2-09** MB-9 does not falsify | **§2.6.2** — L-1…L-7 with triggers, expected call/ledger counts, and "route a blocked edge, do not weaken the check" |
| **H2 secondary** replay invocation | **AR-4 re-cut** — `replay-ceremony` is a profiled one-shot **service definition**; the round-0 "not a service" is corrected to "not a long-running required service" |

**Findings BLOCKED or deferred: none.**

## What I verified this round (read-only, no runtime)

Three live-tree facts established during rework, each of which decides a finding:

1. **`POST /v1/asks` is `auth: "user"`, and that gate is satisfied by any non-empty
   `x-user-dev-token`.** `apps/api/src/index.ts:152` → `resolveSession` (`:130-140`) derives
   `asker:<sha256>` from the token string alone (`provisional_identity_model: true`). **It reads
   no identity table and touches no frozen code path**, so H2-07's "no lawful dispatch trigger"
   has a concrete answer with **no freeze collision** — AR-18.
2. **`GET /v1/session` (`:237-239`) returns `request.session` and nothing else** — it exercises
   routing, the auth `preHandler`, the session schema and JSON encoding while reaching neither
   the database nor a frozen file. That is the `api` health contract F-4 demanded. The plan also
   records **why it must not be `/v1/auth/*`**: those are `public` but exercise frozen
   registration behaviour.
3. **Nothing in the tree supplies the runner's strict values.** `JUDGE_MAX_ATTEMPTS` / `CLAIM_MS`
   occur only in the loader that declares them (`runtime-environment.ts:81-82`) and the consumer
   that reads them (`apps/runner/src/main.ts:28-29`); the acceptance harness uses a disjoint
   `ACCEPTANCE_*` contract (`acceptance/README.md:156-166`). **The containerized runner is the
   first consumer these values have ever had, and none is ratified.** That is H2-06's true size,
   and it is now **V-13** — the largest single executability gap in the mission.

## Where the revision exceeds the findings

Three additions no finding required, each named as such in `Plan.md` §10:

- **AR-20** — the dispatcher *container*'s own retry configuration must be register-sourced or
  off, with AR-10's guard failing on a numeral in its environment. G3's dispatcher-only lens
  raised this as an explicitly **non-blocking residual**; adopted anyway, because ADR-0017
  clause 5 says *"never left at the engine's defaults"* and round 0 bounded only the worker SDK.
- **AR-14** — health-check timing values are **operational, not verdict-bearing** under §5.4c's
  own test, so they are recorded once rather than minted as register rows. This answers H2-03's
  "start-period/timeout values by lawful source" without asking V to ratify an interval.
- **U-9…U-12** — four new UNVERIFIED rows created by the new mechanisms (host project/volume
  enumeration; a lawful redelivery trigger; the dispatcher's readiness surface; whether a
  producer exists for the five contract hashes).

## New V rows, and why each is V's rather than mine

The packet forbids closing OPEN-V rows; it does not forbid raising ones the review exposed.
**None of the three is a product contest this seat declined to decide** — each is a value or a
bounded change to an inherited requirement that architecture is not entitled to close.

- **V-11** — does the bar's *"every required service is healthy"* quantifier admit one-shot
  units? A **bounded requirements change**: `apps/scheduler/src/cli.ts` runs one command and
  exits, and `job:reaper` is not runnable at all, so the ADR-0018 `scheduler` row cannot be both
  required and continuously healthy. Both lenses asked for exactly this routing.
- **V-12** — the two Dockerfiles' base image identity and whether its digest is a register row.
  MB-8 requires third-party images by digest; resolving one **mints a value** (DR-104), which is
  V's.
- **V-13** — ratify the runtime value set, or name the successor that does. Without it the
  `.strict()` loaders throw and **`api` and `runner` cannot boot**, so D4 is blocked.

## Verification against the re-review bars

| Bar | Where |
|---|---|
| G3: `scheduler` vs MB-1/MB-3 is one coherent sentence | AR-15 + §1.1's unit-class column + §2.7.2 |
| G3: AR-2 must not take `accounts-phase1`'s project | AR-2 (distinct project) + AR-2a (refusing probe) + §2.8 |
| G3: MB-3 names a contract check per required service | §2.7.1 — five rows, each with its lawful source |
| G3: V-2(b) has a slice or an explicit rework clause | **DP**, plus "under V-2(a) it is not built; under V-2(d) the plan is re-cut" |
| G3: every hashed path sits in exactly one class | §3.2 |
| H2-1: one authoritative slice/gate/value matrix | §4.1 |
| H2-2: one exact slice/file matrix | §4.3, backed by §3.1's exact paths |
| H2-3: the freeze is enforceable at runtime, not only source | §1.3, §2.8, freeze banner |
| H2-4: every required unit has an attainable health/completion state | §2.7.1 (health) + §2.7.2 (completion) |
| H2-5: database, secret, image and product-truth ops have a named source and authority | §3.5, §3.6, AR-17, AR-18 |
| H2-6: adversarial dispatcher-only checks beyond the happy path | §2.6.2 L-1…L-7 |
| H2-7: standing constraints preserved | §7, AR-10/AR-20 (no RabbitMQ), §1.3/§2.4 (no `localhost`/host-port addressing), §2.6 (no sidecar or host-process masquerade), §1.3 (one Postgres instance), §7 item 2 (no write to the live security mission) |

## Assumptions and risks

- **AR-2's AC-02 reading is a reading, and the plan says so.** The mission's deployment is the
  `docker-hatchet` project and contains exactly one Postgres; `compose.dev.yaml` is AUTHORED-DORMANT
  under DR-121 and has never run. **If V or a reviewer reads AC-02 as host-wide regardless of
  ownership, the answer is V-2(d) — serialize — and this plan is re-cut single-project.** The
  reading is made safe in practice by AR-2a's refusal rather than by argument.
- **V-13 may be large.** If V declines to ratify ~30 values for a dev deployment, D4 has no lawful
  path and the mission's honest ceiling is D3: a data plane and a dispatcher with **no proven
  dispatch**. That is a reportable outcome, not something to plan around.
- **Three mechanisms rest on vendor reality** (U-8 runner registration signal, U-10 forced
  redelivery, U-11 dispatcher readiness). Each is instructed to **report a blocker rather than
  weaken the check**, so the plan can deliberately stall — the alternative is a green bar that
  proved less than it claims.
- **AR-15 asks V to amend an inherited MB row.** If V refuses (V-11(b)), the scheduler needs a
  supervisor inside `apps/**` — scope expansion this plan forbids — and V-11(c) is the only
  lawful exit.
- **The §3.2 hash baseline is a mechanism, not a fact**; its value depends on every ticket
  re-running it.

## Session continuity

The packet notes that round 0's WORKER CLAIM carried `5f3f7a2e-…`, which is not a Claude session
id. That value was a placeholder I wrote and then **corrected before the C2 handoff**; the file
has carried `353f7aa5-5955-4e9b-8601-812810039d2b` since, which matches both the packet's
recovered id and the G3 reviewer's citation of the artifact. This is the **same session**, resumed.
The board's `WORKER CONTINUITY OVERRIDE` is consistent with the artifact; **no continuity gap
exists**, and nothing in the plan depends on the resolution either way.

```
REWORK READY FOR PEER REVIEW:
- mission/step: 2026-08-21-docker-hatchet / C2-rework-1
- owner CLI session: 353f7aa5-5955-4e9b-8601-812810039d2b
- findings addressed: F-1, F-2, F-3, F-4, F-5, F-6, F-7, H2-01, H2-02, H2-03, H2-04, H2-05, H2-06, H2-07, H2-08, H2-09, H2-secondary-replay-invocation
- findings BLOCKED/deferred: none
- comments read through: G3+H2 union
```
