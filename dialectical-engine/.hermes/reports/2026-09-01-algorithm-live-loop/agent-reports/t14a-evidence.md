REWORK READY FOR REVIEW — T14a r3 · comments read through: t14a-codex-r2-2026-09-01

# T14a EVIDENCE r1

*(r2 revision of the r1 report, per codex review r1 verdict CHANGES. Heading retained as the
packet prescribes it; round state is carried by the marker line and the r2 disposition below.)*

Seat: evidence lens (Opus 5), read-only. Base: dev@1c9578a (`git rev-parse HEAD` =
1c9578a24d5aedd0302fbda5593f66277cd87b98). Method: source reads, greps, `git log`/`git show`,
`find`/`ls`. No tests, no builds, no git state change, no database access — per ticket
contract `forbidden: all_others`.

Ruling under test, verbatim (`../2026-08-31-algorithm-correctness/DECISIONS.md:8-9`):
"WIRING SCOPE: production wiring enters the /goal only if proven broken today AND not owned
by the in-flight S06 runner-binding / DEV-12E lane."

---

## REVIEW DISPOSITION — r2

Codex review r1 (`agent-reports/t14a-codex-r1.md`), verdict CHANGES. I verified each of the
four findings routed to me against the tree before acting. **All four verify; all four are
implemented.** I contest none.

| Finding | Verified how | Disposition |
|---|---|---|
| **B1** — dev-only version pin promoted into a universal launch claim | `apps/runner/package.json:8` ships `"start": "tsx src/main.ts"`; `packages/register/src/runtime-environment.ts:174-177` accepts `REGISTER_VERSION: positiveInteger` (definition at `:66`, `z.coerce.number().int().positive()`) | **ACCEPTED.** Gate 2 → CANNOT-ASSESS. My r1 strongest-counter claim "no shipped script performs it" was refuted by a file I never opened. |
| **B2** — E8's "exactly two seeders" omits a non-test writer | `packages/register/src/index.ts:467` `persistBootstrapRegister`, INSERT at `:529`, seal at `:534-537`; called at `apps/runner/src/dev-deployment-register.ts:320` | **ACCEPTED, and it is worse than reported** — see E8. The bootstrap path seals **version 1** with **non-DEVELOPMENT** provenance, from inside the dev seeder itself. |
| **N1** — E11's command/output pair not truthful | Re-ran my own r1 command: it returns `./node_modules/.pnpm/docker-compose@1.4.2`, not empty | **ACCEPTED.** This was a protocol §2.6 violation (verbatim means verbatim) and is the most serious defect in r1. Replaced with the pruned command and its literal result. |
| **N2** — speculative reinforcing judgments in the recommendation and G3 | Re-read; the claims are inferences about hypothetical future implementations and about external state, neither required by the conjunction | **ACCEPTED.** Both paragraphs and the `Additionally …` clause removed. |

N3 and N4 are orchestrator-owned packet defects (ticketed F7, corrections recorded in mission
`DECISIONS.md` D8). I take no action on them; my r1 findings that identified the same two
underlying problems are retained below as ROUTED, not re-litigated.

---

## GATE 1 — OWNERSHIP

**ANSWER: UNOWNED** — the in-flight S06 runner-binding / DEV-12E lanes do not own runner
policy provenance. (Read the STRONGEST COUNTER and E5–E6 before acting on this word: the
capability *is* owned, by a lane that already closed.)

Unchanged from r1. Codex checked E1 and E2 independently and returned AGREE on both.

### Evidence

- **E1 — the file carrying the provenance rejection has one commit in its entire history,
  and it is neither lane.** `git log --oneline -- dialectical-engine/apps/runner/src/dev-runner-policy.ts`
  returns exactly one line: `2d1f86b chore: checkpoint all local mission artifacts and
  in-flight tree` (2026-08-28, V-ordered bulk checkpoint), which created the file whole
  (`git show --stat 2d1f86b -- .../dev-runner-policy.ts` → 1 file changed, 171 insertions).
  Neither `e8d99d3` nor `7b3a306` has ever touched it. *(codex: AGREE)*

- **E2 — S06's entire touch on the runner entrypoint is one import line.**
  `git show e8d99d3 -- dialectical-engine/apps/runner/src/main.ts` is a single-hunk diff
  adding `import "@debateai/obs-capture/install/runner";` at `apps/runner/src/main.ts:1`.
  Zero policy content, zero provenance content. *(codex: AGREE)*

- **E3 — S06's scope is observability capture binding, defined as exactly that.**
  `docs/missions/2026-08-21-observability-loop/demo/observability-demo.sh:535` makes the S06
  gate literally the presence of that import — `"apps/runner/src/main.ts carries no capture
  installer import (S06 …)"` — and `:627` scopes the stage to `"runner job" … "Retries of one
  work item must fold into ONE work unit, not N."` Its rework packet
  `docs/missions/2026-08-21-observability-loop/goal-packets/s06-rework-1.md:55` locates S06's
  open defect at `apps/runner/src/index.ts:2509` (`hatchetContext?.retryCount?.()` outside
  every `try`), inside `declareHatchetWalkingSkeletonTask`. Ticket `t_5504afe0`.

- **E4 — DEV-12E's scope is the real-CLI provider panel.**
  `docs/missions/2026-08-17-accounts-privacy-security/IMPLEMENTATION-STATUS.md:47` (status
  `◐`, still open — "still needs a fresh debate receipt"): removal of the deterministic
  provider, `dev:auth:up` handshaking the Codex/Claude/Grok CLI relays. Commit `7b3a306`
  matches: deletes `apps/runner/src/dev-local-provider.ts` (−205), adds
  `dev-cli-provider-panel.ts` (+104) and `dev-provider-panel.ts` (+132).

- **E5 — runner policy provenance is owned by DEV-12D, and DEV-12D is CLOSED.**
  `docs/missions/2026-08-17-accounts-privacy-security/IMPLEMENTATION-STATUS.md:46`, marked
  `✓`: "The production runner selects v2 explicitly, loads and validates every row with exact
  provenance, and wires the resulting policies plus the durable hold recorder before claiming
  work. Focused real-PostgreSQL policy readback, entrypoint architecture, environment,
  typecheck, and diff checks are GREEN." Kanban card `t_c56b17bc` holds the RED/GREEN receipts.

- **E6 — the enforced constant names DEV-12D.** `apps/runner/src/dev-deployment-register.ts:25-26`:
  `DEVELOPMENT_RUNNER_SOURCE_REF = "DEV-12D-development-runner-policy.md#sealed-v2"`. This is
  the exact string `readDevelopmentRunnerPolicy` demands at `dev-runner-policy.ts:105-111`
  and `:116-118`.

- **E7 — both named lane commits are already merged.** `git merge-base --is-ancestor` returns
  true for `e8d99d3`, `7b3a306` and `2d1f86b` against HEAD; `origin/obs-lane-2-capture` and
  `origin/obs-lane-3-runner-cause` are likewise ancestors of dev@1c9578a. "In-flight" means
  unfinished work owed (S06's RED/GREEN chain per the `e8d99d3` commit body; DEV-12E's fresh
  debate receipt per E4), not unmerged code.

**VERDICT: UNOWNED**
**CONFIDENCE: high** (E1 and E2 are mechanical, independently re-runnable in one command each,
and were independently re-run by codex with AGREE.)
**STRONGEST COUNTER:** DEV-12E's commit `7b3a306` *did* edit the file where the provenance
constants live — `apps/runner/src/dev-deployment-register.ts` — bumping
`DEVELOPMENT_REGISTER_VERSION` 3→4 and adding the seal-state machinery (`sealed` assertions,
`readExactState`, `assertSealedHistoricalBootstrap`). So an open lane has live hands on the
provenance *seeding* surface and moved the very register version the dev wrapper selects. The
honest rebuttal: owning the writer and the version is not owning the reader's rejection rule.
The rejection at `dev-runner-policy.ts:105-118` and the `claimTimeProbe` gap in `main.ts` are
untouched by either lane and are DEV-12D / DR-182 artifacts. But the adjacency is real: any
T14b that edited `dev-deployment-register.ts` would collide with an open DEV-12E.

---

## GATE 2 — BROKEN TODAY

**ANSWER: CANNOT-ASSESS.**

The gate is conditional on whether "the deployment seals non-dev rows". Settling it requires
knowing **which register version production selects** and **which `source_ref` values are
sealed at that version**. Neither fact is recoverable from this checkout, and this seat cannot
observe a running deployment. Per router §2.7 and the packet's own stop condition, that is
CANNOT-ASSESS, not a guess in either direction.

My r1 answer of NOT-BROKEN rested on the claim that the runner is launched only by the dev
stack. That claim is false — see E10. I withdraw it.

### MISSING EVIDENCE — what would settle Gate 2

Closing the gate requires evidence establishing **BOTH** of the following facts jointly;
neither is available in the checkout:

- **(A) which register version production actually selects** — from a production launch
  definition for `apps/runner/src/main.ts` (container spec, process supervisor unit,
  orchestrator manifest, or deploy script showing how the entrypoint is started outside the
  development wrapper), or a production environment receipt naming the `REGISTER_VERSION`
  value production sets. `loadRunnerEnvironment` accepts any positive integer (E10), so this
  value is a free parameter of the deployment, not a property of the code.
- **(B) which `source_ref` values are sealed at that version** — from a production register
  receipt giving the sealed rows at the version established in (A). Equivalent to
  `SELECT register_version,row_key,source_ref FROM register.register_row` against the
  deployment's database.

Evidence for (A) alone does not observe (B), and a register receipt observes (B) only when it
is tied to the version (A) establishes. A single combined artifact suffices only if it proves
both.

Absent both, the two readings the packet asks me to choose between are both live: if production
selects version 4 seeded by the dev seeder, the provenance check passes. If it selects another
sealed version, the outcome is state-dependent, because the reader checks completeness before
provenance — `dev-runner-policy.ts:104` throws `DEV_RUNNER_POLICY_UNRESOLVED` when the selected
version does not carry all of `runnerRowsSchema`'s required rows, ahead of the provenance guard
at `:105-110`. So a bootstrap-only version 1 reaches `DEV_RUNNER_POLICY_UNRESOLVED` (its rows
are the five tool-version bootstrap keys plus the auth/MFA/session/recovery/product-role policy
rows — none of the runner-policy set); a version carrying the complete runner-policy row set
under non-development provenance reaches `DEV_RUNNER_POLICY_PROVENANCE_INVALID` (`:110`); and
any other version's outcome depends on its actual rows and cannot be assigned one error code
in advance.

### Evidence — what IS established, scoped to what it actually proves

- **E8 — there are THREE non-test writers of `register.register_row`, not two, and the third
  seals non-DEVELOPMENT provenance from inside the dev seeder itself.**
  Command (primary checkout; `node_modules`, `.worktrees` and `*.test.ts` excluded):

  ```sh
  grep -rn "INSERT INTO register.register_row" --include="*.ts" . \
    | grep -v node_modules | grep -v "^\./\.worktrees" | grep -v "\.test\.ts"
  ```

  Output (verbatim):

  ```text
  acceptance/seed-register.ts:291:        `INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
  packages/register/src/index.ts:529:        `INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
  apps/runner/src/dev-deployment-register.ts:264:      `INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
  ```

  No `.sql` migration writes the table (same grep over `--include="*.sql"` returns nothing).
  The three writers:

  | # | Writer | Version | Provenance family | Sealed |
  |---|---|---|---|---|
  | 1 | `apps/runner/src/dev-deployment-register.ts:264` (`insertAndSeal`) | 4 (`:42`) | `DEVELOPMENT_SOURCE_REF`, `DEVELOPMENT_RUNNER_SOURCE_REF` (`:23-26`) | yes (`:269-272`) |
  | 2 | `acceptance/seed-register.ts:291` | 1 (`:6`) | `acceptance:DR-*:V-approved` (`:7-23`) | yes (`:298-301`) |
  | 3 | `packages/register/src/index.ts:529` (`persistBootstrapRegister`) | `bootstrap.registerVersion` = **1** (`register.bootstrap.json:2`) | **non-DEVELOPMENT**: tool-version strings from `bootstrap.resolution` (`:472`) plus constant policy rows | yes (`:534-537`) |

  Writer 3 is invoked **by the development seeder**: `seedDevelopmentDeploymentRegister`
  (`dev-deployment-register.ts:362`) calls `persistOrAcceptSealedHistoricalBootstrap` at
  `:372`, which calls `persistBootstrapRegister` at `:320`, before writing version 4 — and
  `:374-376` requires `DEVELOPMENT_REGISTER_VERSION > bootstrap.registerVersion`. Its five
  distinct `resolution` source refs are tool-provenance strings, e.g.
  `"node --version on 2026-08-07"` and
  `"Docker Hub registry API manifest HEAD for vllm/vllm-openai:latest on 2026-08-07"`; the
  constant rows carry their own, e.g.
  `packages/register/src/session-policy.ts:49` →
  `"DR-179; wave-2-target-architecture:session-security; S5-binding-contract"`.

  **Consequence for the gate:** the phrase "the deployment does not seal non-dev rows" is
  **false as a general statement**. The dev deployment path does seal non-dev-provenance rows —
  at version 1. Whether that matters depends entirely on which version production selects,
  which is the unknown named above. (Note the collision hazard: writer 2 and writer 3 both
  target version 1 with different provenance; `persistBootstrapRegister` guards it with
  `FX-REG-SEALED_VERSION_MISMATCH` at `:519-521`, which `:322-325` catches and routes to
  `assertSealedHistoricalBootstrap`.)

- **E9 — each reader is paired with its own seeder.** `readDevelopmentRunnerPolicy` has exactly
  one non-test caller: `apps/runner/src/main.ts:41`. Acceptance never calls it —
  `acceptance/main.ts:405` and `:678` call `readAcceptanceRuntimePolicy`
  (`acceptance/runtime-policy.ts:185-188`). This establishes the intended pairing; it does not
  establish which version the production caller is pointed at.

- **E10 — the version-4 pin belongs to the development wrapper only; the entrypoint can be
  started without it.** *(scoped per codex B1)*
  `apps/runner/src/dev-runner-process.ts:180` spawns `apps/runner/src/main.ts` via tsx, and
  `:70` refuses unless `apiEnvironment.REGISTER_VERSION === String(DEVELOPMENT_REGISTER_VERSION)`,
  with `:148` re-asserting on the ready receipt. The dev env pins `REGISTER_VERSION=4` at
  `apps/runner/src/dev-api-environment.ts:372` and `apps/runner/src/dev-api-process.ts:180`.
  **Those checks constrain `dev-runner-process.ts` and nothing else.** Counter-evidence:
  `apps/runner/package.json:7-8` ships a direct start script —

  ```text
       7	  "scripts": {
       8	    "start": "tsx src/main.ts"
       9	  },
  ```

  — which bypasses the wrapper entirely, and `packages/register/src/runtime-environment.ts:174-177`
  accepts any positive `REGISTER_VERSION` (`positiveInteger` = `z.coerce.number().int().positive()`,
  `:66`), which `main.ts:19,41` passes straight into `readDevelopmentRunnerPolicy`. There is no
  code-level pin of the production version.

- **E11 — no first-party Docker/Compose/Terraform file exists in this checkout.** *(corrected
  per codex N1; my r1 command and result were both misstated)*
  Command:

  ```sh
  find . \( -path './.git' -o -path './node_modules' -o -path './.worktrees' \) -prune -o \
    \( -iname 'docker-compose*' -o -iname 'Dockerfile*' -o -iname '*.tf' \) -print
  ```

  Output (verbatim): *no bytes emitted; exit 0.*

  For the record, the command as printed in r1 (`find . -maxdepth 3 …`, no pruning) returns
  `./node_modules/.pnpm/docker-compose@1.4.2` — it did not encode the exclusions r1 claimed and
  did not return the empty result r1 reported.
  **This proves only the absence of matching first-party files in this checkout.** It is not
  evidence about live production state, and it is kept separate from the missing evidence above.
  Related and equally scoped: `.github/workflows` does not exist; `deploy/` holds only
  `IMAGE-PINS.md`, `postgres/init-hatchet.sql`, and dev-auth TLS/sendmail helpers; the only
  register-seed script is `"dev:auth:seed-register"` (`package.json:26`); and
  `tests/architecture/p3-production-database-principals.test.ts:313` binds that CLI
  `DEVELOPMENT_ONLY`. None of these observes a deployment.

- **E13 — `readDevelopmentRunnerPolicy` is NOT unwired; it is a pinned architecture invariant
  at the production entrypoint.** `tests/architecture/dev-runner-provider-set.test.ts:43-44`
  asserts `apps/runner/src/main.ts` contains
  `readDevelopmentRunnerPolicy(pool, environment.REGISTER_VERSION)`, and `:45-53` asserts it
  wires `compositionRow`, `servePolicy`, `judgementPolicy`, `scoringOperator`,
  `runDeathPolicy`, `hiddenNodeScoreThreshold`, `holdRecorder`. All seven are present at
  `apps/runner/src/main.ts:91-119`. This refutes the packet's "both UNWIRED" premise.
  *(codex: AGREE on current wiring)*

- **E14 — `claimTimeProbe` absence is a declared-optional degradation, not a rejection or a
  wrong result.** Declared optional at `apps/runner/src/index.ts:824` under the comment
  "DR-182 VROW-5: one immediate, no-hold health check at work-item claim". With it undefined:
  `:1367-1370` still revalidates configuration identity (unconfigured member → `ABSENT` /
  `CLAIM_GATEWAY_UNRESOLVED`); `:1388-1400` still records the ABSENT provider probe and shrinks
  the panel; `:1415-1419` still refuses loudly with `RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM`.
  Only the live relay re-probe (`:1371-1387`) and the HEALTHY probe receipt (`:1402-1412`) are
  skipped. Supplied in product code solely at `acceptance/main.ts:519`. The prior review record
  classified this as intentional —
  `docs/missions/2026-08-06-v3-programming/reviews/disc01-grok-rev2-confirm.md:117`:
  "acceptance wires it; production runner main still does not (plan non-goal parity)."
  This half of the gate never depended on provenance sealing at all (see ROUTED-2).

**VERDICT: CANNOT-ASSESS**
**CONFIDENCE: high** — high confidence that the record *cannot* settle the question, not
confidence in either reading. E10 establishes the version is a free deployment parameter; E8
establishes that more than one sealed version with more than one provenance family exists.
**STRONGEST COUNTER:** the best case for answering NOT-BROKEN anyway is that every launch
artifact present in the repository routes through the dev wrapper, the register seeder is
architecturally bound `DEVELOPMENT_ONLY`
(`p3-production-database-principals.test.ts:313`), and DEV-12D's closure note asserts the
production runner "selects v2 explicitly" and validates "every row with exact provenance"
(`IMPLEMENTATION-STATUS.md:46`) — so a reader could say the intended and only deployment is the
dev stack at version 4, and the question is settled by design intent. I reject this because
design intent is not deployment state: `apps/runner/package.json:8` is itself a shipped launch
artifact that does not route through the wrapper, `loadRunnerEnvironment` imposes no version
pin, and the absence of deploy files in a checkout is not an observation about a deployment.
A gate that turns on what production actually selects cannot be closed by what the repository
intends. (Secondary, unchanged from r1: `readDeploymentMakerCapability`
(`packages/critique/src/index.ts:245-291`), called one line later at `main.ts:42`, reads
`source_ref` only to compose a `registerRef` string (`:291`) and never rejects — provenance
strictness is asymmetric within `main.ts` itself. A design observation, not evidence either way.)

---

## T14b RECOMMENDATION

**DO NOT RUN — conjunction undecidable pending Gate 2 evidence; UNOWNED alone is insufficient
to authorize.**

I-2 authorizes T14b only on `UNOWNED AND PROVEN-BROKEN`:

| Gate | Answer | Conjunct |
|---|---|---|
| 1 — OWNERSHIP | UNOWNED | satisfied |
| 2 — BROKEN TODAY | CANNOT-ASSESS | **undecided** |

The conjunction cannot evaluate to true on the present record, so the authorization condition
is not met. Supplying evidence that jointly establishes both (A) and (B) in MISSING EVIDENCE
— a single combined artifact only if it proves both — would make Gate 2
answerable and the conjunction decidable.

---

## PACKET FINDINGS

Filed in r1 against the orchestrator's packet and the T14 task text it quotes, not against any
worker (reviewer contract §1). Codex independently reached the same two underlying problems
(its N3 and N4). Both are now **orchestrator-owned, ticketed F7, corrections recorded in
mission `DECISIONS.md` D8** — retained here for the record, not for re-litigation.

**ROUTED-1 (was r1 N1) — the packet's premise is half false.** The packet at
`packets/t14a-evidence.md:20` and `goal-prompt.md:301-302` state that
`readDevelopmentRunnerPolicy` and `claimTimeProbe` are "both UNWIRED".
`readDevelopmentRunnerPolicy` is wired: `apps/runner/src/main.ts:41`, pinned by
`tests/architecture/dev-runner-provider-set.test.ts:44` (E13). Only `claimTimeProbe` is
unwired. → F7 / D8.

**ROUTED-2 (was r1 N2) — one provenance condition applied to two independent questions.**
"Broken ONLY IF the deployment seals non-dev rows" is a coherent test for the provenance half
and has no bearing on `claimTimeProbe`, whose gap is independent and permanent: production
performs no claim-time liveness or model-identity re-check, leaving
`apps/runner/src/index.ts:1377-1381` (`CLAIM_MODEL_IDENTITY_CHANGED`) unreachable in
production. **Note this survives the r2 change**: Gate 2 is now CANNOT-ASSESS rather than
NOT-BROKEN, so the probe gap is no longer at risk of being retired by an answer — but it is
also still not ticketed on its own. Carried into T14a-G4 below. → F7 / D8.

**ROUTED-3 (was r1 N3) — I-2's ownership test names the wrong lane.** The owner of runner
policy provenance is DEV-12D (`IMPLEMENTATION-STATUS.md:46`; constant at
`dev-deployment-register.ts:25-26`), a closed and GREEN lane — not the in-flight S06/DEV-12E
lanes the ruling names, so the gate can only ever return UNOWNED. A bare "UNOWNED" reads as
*nobody built this*, which argues **for** running T14b — the inverse of the truth. Recorded
inside T14a-G1 so the word is never consumed without E5–E6 attached. → F7 / D8.

---

## WHAT I DID NOT VERIFY

Stated so the next lens knows the gaps (reviewer contract §4).

- **No runtime evidence of any kind.** The seat is read-only by contract (board
  `forbidden: all_others`; "NO tests, NO builds, NO git state changes"). I ran no test, no
  migration, no query. Every claim is static: source, git history, mission documents.
- **No production deployment, environment, or register state was observable.** This is now the
  load-bearing gap, enumerated as MISSING EVIDENCE (A) and (B) under Gate 2. In r1 I treated the
  absence of deployment files in the checkout as equivalent to the absence of a deployment;
  it is not, and that error produced the withdrawn NOT-BROKEN answer.
- **I did not verify which register version any real database currently holds**, for any
  environment, including the developer's own.
- **S06's Hermes ticket state (`t_5504afe0`) is unrecoverable from this checkout.** The kanban
  CLI is absent (D1) and `.hermes/reports/2026-08-21-observability-loop/` holds only
  `agent-reports` and `mission-graph.svg` — no board. "In-flight" for S06 rests on the
  `e8d99d3` commit body; for DEV-12E on the `◐` marker at `IMPLEMENTATION-STATUS.md:47`.
- **I did not read the spine** (1959 lines), per packet instruction.
- **`.worktrees/lane-t16/`** was excluded from greps as a duplicate of the primary tree; I did
  not audit it for divergence from dev@1c9578a.

**Predictions for the next lens.** The r1 predictions are now partly settled: codex did catch
E10's scope error and E8's third writer, which I predicted no one would. For r2 I expect the
remaining disagreement to be about whether CANNOT-ASSESS is too conservative — a lens may argue
that DEV-12D's closure note plus the `DEVELOPMENT_ONLY` binding are together sufficient to
answer NOT-BROKEN. The discriminating question is whether any artifact in the repository
*observes* a deployment rather than *prescribes* one; I found none, and `apps/runner/package.json:8`
is the single fact that breaks the prescriptive argument. The second thing I would check first
is whether the version-1 collision between writer 2 and writer 3 (E8) is reachable in any
environment where both acceptance and the dev seeder have run against one database — I did not
pursue it because it is outside both gate questions.

---

## DECISIONS LINES

Exact dated lines for the orchestrator to append to
`.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md` (append-only, dated, matching
the file's existing block style):

```
## 2026-09-01 · T14a double-gate evidence (I-2 WIRING SCOPE) — r2, after codex review r1
T14a-G1 OWNERSHIP = UNOWNED. The in-flight S06 runner-binding / DEV-12E lanes do not own
     runner policy provenance. S06 = observability capture binding: its entire main.ts touch
     is the one-line `import "@debateai/obs-capture/install/runner"` in e8d99d3, and its
     scope is fixed at observability-demo.sh:535,627 (ticket t_5504afe0). DEV-12E = real-CLI
     provider panel (IMPLEMENTATION-STATUS.md:47, still ◐). apps/runner/src/dev-runner-policy.ts
     has ONE commit in its history — 2d1f86b, which created it whole; neither lane commit has
     ever touched it. READ WITH THE ANSWER: the capability IS owned, by DEV-12D — closed and
     GREEN (IMPLEMENTATION-STATUS.md:46, card t_c56b17bc) and named in the enforced constant
     DEVELOPMENT_RUNNER_SOURCE_REF (dev-deployment-register.ts:25-26). "UNOWNED" here means
     "not owned by the two lanes I-2 names", NOT "never built".
T14a-G2 BROKEN TODAY = CANNOT-ASSESS. Settling the gate requires knowing which register
     version production selects and which source_ref values are sealed at that version.
     Neither is recoverable from this checkout and this seat cannot observe a deployment.
     MISSING EVIDENCE — closing the gate requires BOTH jointly: (A) which register version
     production actually selects, from a production launch definition for
     apps/runner/src/main.ts outside the development wrapper or a production environment
     receipt naming REGISTER_VERSION; AND (B) which source_ref values are sealed at that
     version, from a production register receipt tied to the version (A) establishes.
     Evidence for (A) alone does not observe (B); a single combined artifact suffices only if
     it proves both. WHY THE r1 NOT-BROKEN ANSWER WAS WITHDRAWN:
     the version-4 pin at dev-runner-process.ts:70,148 constrains the development wrapper
     only — apps/runner/package.json:8 ships `"start": "tsx src/main.ts"`, which bypasses it,
     and loadRunnerEnvironment (runtime-environment.ts:174-177) accepts any positive
     REGISTER_VERSION, passed straight through main.ts:19,41. SCOPED FACTS THAT DO STAND:
     three non-test writers of register.register_row exist, not two — dev seeder
     (dev-deployment-register.ts:264, DEVELOPMENT_* refs, version 4), acceptance
     (seed-register.ts:291, acceptance:DR-*:V-approved, version 1), and persistBootstrapRegister
     (packages/register/src/index.ts:529, non-DEVELOPMENT refs, version 1), the last invoked BY
     the dev seeder at dev-deployment-register.ts:320 — so the dev path does seal non-dev-
     provenance rows, at version 1; and no first-party Docker/Compose/Terraform file exists in
     this checkout (pruned full-depth find, no output, exit 0), which is a fact about the
     checkout and not about production. CORRECTION TO THE T14 TEXT: readDevelopmentRunnerPolicy
     is NOT unwired — it is called at apps/runner/src/main.ts:41 and pinned there by
     tests/architecture/dev-runner-provider-set.test.ts:44.
T14a-G3 CONSEQUENCE: T14b is NOT authorized — DO NOT RUN, conjunction undecidable pending the
     Gate 2 evidence above. I-2 requires proven-broken AND unowned; UNOWNED alone is
     insufficient to authorize.
T14a-G4 CARRIED FORWARD — still needs its own ticket (protocol §2.2). claimTimeProbe remains
     unsupplied by apps/runner/src/main.ts: declared optional at index.ts:824 (DR-182 VROW-5),
     supplied in product code only at acceptance/main.ts:519. Production therefore performs no
     claim-time liveness or model-identity re-check, leaving index.ts:1377-1381
     (CLAIM_MODEL_IDENTITY_CHANGED) unreachable in production. This gap is independent of
     register provenance, so no Gate 2 answer — NOT-BROKEN or CANNOT-ASSESS — disposes of it.
```
