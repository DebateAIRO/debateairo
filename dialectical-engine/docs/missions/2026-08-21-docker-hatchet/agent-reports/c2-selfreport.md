# SELF-REPORT — C2-DOCKER-OPUS (Claude Opus 5)

- **Ticket:** `C2-DOCKER-OPUS` · mission `2026-08-21-docker-hatchet` · loop ARCHITECTURE · stage C2
- **Seat:** Claude Opus 5, **new session** `353f7aa5-5955-4e9b-8601-812810039d2b`
- **Date:** 2026-08-21 · risk_tier high · planning_tier 2 · comments read through: **intake**
- **Deliverable:** `docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md`

## Contract compliance

**Writes: exactly the two paths in my goal packet's `allowed` list.**

| Path | Action |
|---|---|
| `docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md` | created |
| `docs/missions/2026-08-21-docker-hatchet/agent-reports/c2-selfreport.md` | created (this file) |

No other file was written, created, moved or deleted. **No commit. No push.** No board was
operated (the Kanban at `localhost:9119` was not mutated; the packet makes comments
optional and my deliverable is the file). **Hermes Agent was not run** — no `hermes --yolo`,
no `hermes -z`, no Qwen-backed inference seat. **No reviewers were launched.** **V was not
contacted.**

**Docker was not touched.** I did not start Docker Desktop, did not put the CLI on `PATH`,
did not run `docker`, `docker compose`, `docker info` or any registry call. V-1 /
IMPORTANT OPERATION is untouched and still open. I confirmed the machine's state
non-mutatingly only: `command -v docker` → exit 1; the CLI and Compose v2 plugin exist
inside `/Applications/Docker.app`; no `Docker Desktop` process is running.

**Freeze honored.** No file under identity, registration, MFA, sessions, crypto shredding,
`packages/crypto/**`, identity migrations `0030+`, or `docs/missions/2026-08-17-*/**` was
read for a write or written. `compose.dev.yaml` is byte-unchanged (hash re-verified after
writing the plan). None of the five foreign boards was touched.

**Scope honored.** No Dockerfile, no compose file, no application code, no schema, no
migration, no configuration. DR-117 and DR-118 were restated as constraints and not
re-argued. Nothing was executed against a container runtime.

## Packet requirements → where each landed

| Packet requirement | Plan section |
|---|---|
| 1. Target topology against ADR-0018; what runs in Compose vs on the host; freeze honored | **§1** (§1.1 the seven ruled services placed; §1.2 the host set with a justification per exclusion; §1.3 project/network/store boundaries; §1.4 the MB-11 disclosure verbatim) |
| 2. Hatchet wiring — dispatcher only; claim-before-call stays ours; how `apps/runner` registers; env/DNS so `localhost:7077` is not the worker's own loopback; RabbitMQ off | **§2** (§2.1 the ownership boundary + two containerization corollaries; §2.2 the wiring that already exists, cited to line numbers; §2.3 the exact env keys per service; §2.4 the address fix + token ordering; §2.5 the RabbitMQ guard; §2.6 the MB-9 triple) |
| 3. File/image contract executable without guessing; new files vs extend `compose.dev.yaml` | **§3** (§3.1 exact-file path classes; §3.2 the ownership mechanism + hash baseline; §3.3 AR-1/AR-2; §3.4 image contract; §3.5 credential injection map) |
| 4. Slice/lane order, named slices, dependencies, first coding ticket, do not implement | **§4** — D0…D7 plus the non-required DV lane, each in `07-build-order.md`'s five-field shape. **First coding ticket: D0**, unclaimable until V-1 closes. |
| 5. V DECISIONS PACKET draft, V-1…V-10 carried forward, no winner picked on 2–1 contests | **§6** |
| 6. Non-goals | **§7** — ten, including all five the packet named |

## Decisions I made, and the ones I refused to make

**Made (13 architecture rulings, AR-1…AR-13, tabled at §5 so each is overturnable without
reopening requirements).** Each carries the reading it rejects. The four the mission turns
on:

- **AR-2** — the mission's compose model is a **self-contained sibling file** using the
  same project name, `postgres` service key and named volume; `compose.dev.yaml` is
  byte-unchanged **and not chained**. This is the SR-D2.4 decision the synthesis delegated
  to architecture. It closes `[G]`'s E4-c by construction (no base env key is overridden,
  so no token is invalidated) and it dodges the `${VLLM_MODEL:?}` parse-time blocker. It
  deviates from SR-D2.1's *stated default mechanism* ("composes with or includes it") while
  honoring SR-D2.1's *binding clause* ("leave the base byte-unchanged") more strongly —
  said out loud in the plan, with two named fallbacks and the costs recorded.
- **AR-1** — `packages/register/src/compose-env.ts` obtained by **exact file name**, with a
  `deploy/`-owned emitter as the named fallback. This is the path class the synthesis
  required architecture to obtain or replace, and it may not be resolved by writing
  literals.
- **AR-3** — credential separation is an **exposure** property, not a usage property; the
  scheduler is three profiled one-shots with one credential each. Synth §3.5 and §6 both
  assign this to architecture explicitly.
- **AR-12** — ownership is adjudicated by a **content-hash baseline** re-checked per
  ticket, because `git diff` is blind to the untracked files this mission needs.

**Refused.** I picked no winner on any of the three 2–1 product contests (**V-2** mission
scope, **V-3** dispatcher service key, **V-5** postgres digest), closed no OPEN-V row, and
did not contact V. Each contested item is designed as a single parameter, with the
"invariant under either answer" column in §6 stating what holds regardless.

## What I added that the requirements did not have

Four live-tree facts with a named consequence, plus one collision the upstream missed:

1. **`web/lib/api.ts:3-11`** requires `NEXT_PUBLIC_API_BASE` to be a **same-origin path**
   and throws `NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH` otherwise. The browser
   therefore **cannot** be pointed at `api` directly — `web`'s `/api/[...path]` proxy is
   the browser's path **by construction**. This materially sharpens **V-9** and
   strengthens `[O]`'s own counter-argument against his own recommendation.
2. **`web/.env.local`** exists, is untracked and not ignored, and sets
   `DIALECTICAL_API_BASE=http://127.0.0.1:8790`. Under the forced workspace-root build
   context it lands in the `web` image and produces a container that looks configured and
   addresses a host port no compose service owns. It is now a named `.dockerignore`
   requirement.
3. **The dirty set grew between the synthesis and this plan** — `tools/orphan-audit/src/index.ts`
   and `docs/missions/2026-08-17-accounts-privacy-security/logs/run-claude-seat.sh` are new.
   SR-D1.2 fired within one day; it is not a formality.
4. **U-7 (new UNVERIFIED)** — whether `${VLLM_MODEL:?}` fails a render even with `vllm`
   behind a profile, i.e. whether interpolation precedes profile filtering. AR-2 is
   deliberately designed **not to depend on the favourable answer**. Also **U-6a** (does
   `SERVER_URL` also have to change for a re-issued token?) and **U-8** (does a lawful
   in-container worker-registration signal exist for the runner's health check?).
5. **The collision:** `[C]`'s AGREED RED/GREEN fixture requirement for the RabbitMQ check
   needs a fixture, but `tests/**` is a path class this mission does not hold and
   `tools/orphan-audit` is dirty and foreign. Resolved at **AR-10** by putting the check and
   its fixtures under `deploy/checks/`, wired by one additive root `package.json` script
   line.

## Verification against the packet's four checks

| Check | Result | Evidence |
|---|---|---|
| `Plan.md` exists and is an architecture plan, not code | **YES** | `docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md`, ~1140 lines, no Dockerfile / compose / application code; mechanisms and file contracts only |
| Every AGREED synthesized requirement maps to a plan clause or is deferred with a named successor | **YES** | **§8** is the explicit map: §8.1 MB-1…MB-11 (11/11), §8.2 the section-level AGREED rows and every `SR-*`, §8.3 the seven deferrals each with a named successor |
| Every OPEN-V / CONTESTED item is a V DECISIONS PACKET row, not silently closed | **YES** | **§6** carries V-1…V-10 with what each blocks in this plan. The two items the synthesis assigned to **architecture** rather than to V (the C5 co-residency reading, the compose merge mechanism) are ruled at AR-3 / AR-2 and **listed together at §5** with the reading each rejects — closed loudly and overturnable, not silently. `[G]`'s E4-c, which the synthesis demoted to architecture with a re-escalation trigger, is closed by construction at AR-2 and its trigger is preserved in AR-2's fallback (ii). |
| Freeze honored | **YES** | See "Contract compliance" above; `compose.dev.yaml` hash re-verified unchanged after the write |

## Assumptions and risks

- **AR-2 is the load-bearing ruling and it rests on U-7, which is unverified.** Its two
  fallbacks are named precisely so a wrong guess costs one ticket rather than the mission.
- **AR-9's runner health check rests on U-8.** If no lawful in-container registration
  signal exists, MB-3 is unmeetable for `runner` without an `apps/runner` change that would
  be scope expansion. D4 is instructed to report that as a **blocker**, not to work around
  it with an `["CMD","true"]`-class check.
- **The §3.2 hash baseline is a mechanism, not a fact.** Its value depends entirely on
  every PROGRAMMING ticket re-running it; a seat that trusts the table instead of
  recomputing it has the same blindness the mechanism exists to fix.
- **Nine items are UNVERIFIED and ten questions are V's.** Six of the nine and one of the
  ten are downstream of **V-1** alone; **V-7(b)** is the only row that can make a slice
  (D6) *unpassable* rather than merely unstarted.
- **Single-source upstream findings I relied on and re-verified myself:** the git-tracking
  state (141 tracked files; `compose.dev.yaml` untracked and not ignored; the dirty set),
  the `runReaper` stub, the `${VLLM_MODEL:?}` guard with no producer, and the deleted
  `Makefile`. All re-confirmed in the live tree for this plan.
- **What I could not do and did not simulate:** anything requiring a container runtime.
  No endpoint path, dashboard label, `runNoWait` return shape, Compose merge behaviour or
  image manifest was invented; each is an `UNVERIFIED` row in §9 with the command that
  closes it and the slice that owns it.

```
WORKER CLAIM:
- ticket: C2-DOCKER-OPUS
- owner CLI session: 353f7aa5-5955-4e9b-8601-812810039d2b
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-docker-hatchet / C2
- owner CLI session: 353f7aa5-5955-4e9b-8601-812810039d2b
- artifact path: docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md
- upstream artifacts used:
  docs/missions/2026-08-21-docker-hatchet/goal-packets/c2-plan.md;
  docs/missions/2026-08-21-docker-hatchet/research/synthesized-requirements.md;
  docs/missions/2026-08-21-docker-hatchet/reviews/h1-integrity.md;
  docs/missions/2026-08-21-docker-hatchet/brief.md;
  docs/missions/2026-08-21-docker-hatchet/00-intake-H0.md;
  docs/architecture/01-decisions/ADR-0017-durable-execution-hatchet.md;
  docs/architecture/01-decisions/ADR-0018-deployment-topology.md;
  docs/architecture/03-module-design.md; docs/architecture/05-register-skeleton.md;
  docs/architecture/07-build-order.md
- checks/evidence: all 11 mission-bar rows and every SR-* carried forward map to a plan
  clause or a named successor (Plan.md section 8); V-1..V-10 are carried forward as a
  V DECISIONS PACKET draft with what each blocks (section 6) and no 2-1 product contest
  is decided by this seat; 13 architecture rulings AR-1..AR-13 are tabled with the
  reading each rejects (section 5); nine UNVERIFIED items carry the command that closes
  each and the slice that owns it (section 9); slices D0..D7 plus the non-required DV
  lane carry the build-order five-field shape and D0 is named the first coding ticket.
- assumptions/risks: AR-2 rests on the unverified U-7 and carries two named fallbacks;
  AR-9 rests on U-8 and D4 is instructed to report a blocker rather than weaken MB-3;
  the section 3.2 hash baseline is a mechanism that only works if every ticket re-runs
  it; V-1 blocks the first slice entirely and V-7(b) can make D6 unpassable.
- comments read through: intake
```
