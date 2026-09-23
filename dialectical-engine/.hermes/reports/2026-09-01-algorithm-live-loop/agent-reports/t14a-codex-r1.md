CODEX REVIEW T14a r1 — CHANGES · comments read through: t14a-r1-2026-09-01

# CODEX REVIEW T14a r1

## VERDICT

**CHANGES**

Gate 1's `UNOWNED` answer is supported, and the report correctly catches that
`readDevelopmentRunnerPolicy` is already wired. Gate 2's `NOT-BROKEN` answer is not
supported by the static record: the cited version-4 checks constrain the development wrapper,
not every runner launch, and no production deployment/environment receipt establishes which
register version or provenance production actually selects. The packet requires
`CANNOT-ASSESS` when that evidence is missing. Two blocking and four non-blocking findings
follow; all six require disposition.

## FINDINGS

### B1 — BLOCKING

- **WHAT:** Gate 2 promotes a development-only version pin into the false universal claim
  that the runner is launched only by the dev stack, then uses that claim to answer
  `NOT-BROKEN`.
- **WHERE:**
  `.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t14a-evidence.md:89-91,110-115,156-168,292-301`;
  counter-evidence at `apps/runner/package.json:7-8`,
  `packages/register/src/runtime-environment.ts:174-195`, and `apps/runner/src/main.ts:19,41`.
- **WHY:** `apps/runner/package.json` ships a direct `tsx src/main.ts` start script.
  `loadRunnerEnvironment` accepts any positive `REGISTER_VERSION`, and `main.ts` passes that
  value to `readDevelopmentRunnerPolicy`. Lines 70/148 of `dev-runner-process.ts` pin only
  the separate development wrapper. Because the repository has no production deployment or
  environment receipt, the actual production version/provenance is unknown. The report's
  strongest-counter rebuttal that "no shipped script performs it" is directly contradicted
  by `apps/runner/package.json:8`.
- **SUGGESTED FIX:** Change Gate 2 to `CANNOT-ASSESS` unless production deployment/env/register
  evidence is supplied. Rewrite the T14b consequence as `DO NOT RUN pending the missing Gate 2
  evidence` and replace the proposed G2/G3 DECISIONS lines; do not record `NOT-BROKEN` as fact.

### B2 — BLOCKING

- **WHAT:** E8's exhaustive claim that exactly two disjoint register seeders exist omits a
  non-test writer/sealer used by the development seeder.
- **WHERE:**
  `.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t14a-evidence.md:95-103,156-168,292-299`;
  omitted code at `packages/register/src/index.ts:467-539` and caller at
  `apps/runner/src/dev-deployment-register.ts:315-325,362-386`.
- **WHY:** `persistBootstrapRegister` inserts rows and seals bootstrap register version 1;
  `seedDevelopmentDeploymentRegister` invokes it before writing version 4. It can also accept
  an already sealed historical v1 through `assertSealedHistoricalBootstrap`. Thus the
  development path itself has historical-v1 and current-v4 behavior, and the repository-wide
  writer proof is not exhaustive as reported. This is also a stronger counter to the broad
  phrase "the deployment does not seal non-dev rows" than the hypothetical acceptance-db
  hand-run the report presents.
- **SUGGESTED FIX:** Enumerate all non-test `register_row` writers, distinguish "any sealed
  version" from "the version selected by the production runner", and re-evaluate Gate 2 and
  its strongest counter from that complete set. Remove "exactly two seeders" from the report,
  self-report, and DECISIONS text.

### N1 — NON-BLOCKING

- **WHAT:** The E11 command/output pair is not truthful as written.
- **WHERE:**
  `.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t14a-evidence.md:117-124,298-299`.
- **WHY:** The quoted `find -maxdepth 3` command does not encode the stated
  node_modules/worktree exclusions and returns
  `./node_modules/.pnpm/docker-compose@1.4.2`, not empty output. A separate full-depth search
  with explicit pruning emitted no first-party Docker/Compose/Terraform paths, so the narrow
  repository fact can be repaired; it still cannot prove live production state.
- **SUGGESTED FIX:** Replace E11 with the explicit pruned full-tree command and its literal
  result. Limit the conclusion to "no first-party Docker/Compose/Terraform file is present in
  this checkout" and keep it separate from the missing production-state evidence in B1.

### N2 — NON-BLOCKING

- **WHAT:** The T14b recommendation and G3 decision line add speculative reinforcing
  judgments beyond the required pure gate conjunction.
- **WHERE:**
  `.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t14a-evidence.md:190-197,302-305`.
- **WHY:** A test that pins the current development reader proves current wiring; it does not
  prove every possible T14b implementation "would break" a valid architecture requirement.
  Likewise, absence of deployment files in the checkout does not prove production provenance
  does not exist externally. These claims are neither required nor reliable inputs to the
  `UNOWNED AND PROVEN-BROKEN` conjunction.
- **SUGGESTED FIX:** Remove both reinforcing paragraphs and the `Additionally ...` clause from
  G3. State only the gate values and their mechanical conjunction.

### N3 — NON-BLOCKING · PACKET DEFECT

- **WHAT:** The upstream evidence packet labels an expanded, stale paraphrase as the gate text
  "verbatim".
- **WHERE:**
  `.hermes/reports/2026-09-01-algorithm-live-loop/packets/t14a-evidence.md:13-21` versus
  `.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md:298-302`; factual
  counter-evidence at `apps/runner/src/main.ts:41`.
- **WHY:** The packet inserts evidence-source instructions into the quoted ownership text and
  repeats that `readDevelopmentRunnerPolicy` and `claimTimeProbe` are "both UNWIRED". The
  former is called by the production entrypoint. The evidence report correctly filed this
  factual half as its N1, but the orchestrator's source packet remains defective.
- **SUGGESTED FIX:** On reissue, quote the goal text exactly or label the block as an expanded
  restatement, and correct the stale `readDevelopmentRunnerPolicy` premise. Route the packet
  correction against the orchestrator, not the evidence author.

### N4 — NON-BLOCKING · PACKET DEFECT

- **WHAT:** The upstream packet applies one provenance-sealing condition to two independent
  wiring questions, allowing the claim-time probe gap to be retired by an unrelated answer.
- **WHERE:**
  `.hermes/reports/2026-09-01-algorithm-live-loop/packets/t14a-evidence.md:18-21` and
  `.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md:299-302`; independent probe
  behavior at `apps/runner/src/index.ts:823-828,1371-1412`.
- **WHY:** Register provenance controls whether `readDevelopmentRunnerPolicy` rejects at boot.
  It does not control whether the runner performs the optional claim-time liveness/model-id
  probe. The evidence report correctly identified this as its N2, but the malformed gate still
  needs an orchestrator-owned disposition under the "a finding is a finding" law.
- **SUGGESTED FIX:** Split provenance compatibility and production `claimTimeProbe` wiring into
  separate gates/tickets. Do not close the latter through the former's deployment condition.

## PACKET REVIEW

The current review packet has all four required elements. Its board path resolves; the board
shows `waiting_review`, high risk, base `dev@1c9578a`, and the expected evidence-report
verification route. Both demanded outputs are within the two-file writable list, all upstream
paths resolve from the declared checkout, and the six read-only checks fit the stop conditions.

The upstream evidence packet's working directory, allowed deliverables, base T14 line range,
and I-2 line range resolve. Its substantive defects are N3 and N4 above. The evidence report
correctly recognized both underlying problems, but packet defects remain orchestrator-owned
findings and require routing.

## EVIDENCE CHECKED

### E1 — AGREE

Command:

```sh
git log --oneline -- dialectical-engine/apps/runner/src/dev-runner-policy.ts
```

Output (verbatim):

```text
2d1f86b chore: checkpoint all local mission artifacts and in-flight tree
```

This agrees with E1: the file has one commit in the visible history.

### E2 — AGREE

Command:

```sh
git show --format= --unified=0 e8d99d3 -- dialectical-engine/apps/runner/src/main.ts
```

Output (verbatim):

```text
diff --git a/dialectical-engine/apps/runner/src/main.ts b/dialectical-engine/apps/runner/src/main.ts
index 47e95c1..2095e4b 100644
--- a/dialectical-engine/apps/runner/src/main.ts
+++ b/dialectical-engine/apps/runner/src/main.ts
@@ -0,0 +1 @@
+import "@debateai/obs-capture/install/runner";
```

This agrees with E2 and supports Gate 1's reading of S06 scope.

### E8 — DISAGREE

Command:

```sh
rg -n --glob '!**/*.test.ts' 'INSERT INTO register\.register_row|DEVELOPMENT_REGISTER_VERSION =|ACCEPTANCE_REGISTER_VERSION =|persistBootstrapRegister\(pool' apps/runner/src/dev-deployment-register.ts acceptance/seed-register.ts packages/register/src/index.ts
```

Output (verbatim):

```text
acceptance/seed-register.ts:6:export const ACCEPTANCE_REGISTER_VERSION = 1 as const;
acceptance/seed-register.ts:291:        `INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
apps/runner/src/dev-deployment-register.ts:42:export const DEVELOPMENT_REGISTER_VERSION = 4 as const;
apps/runner/src/dev-deployment-register.ts:264:      `INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
apps/runner/src/dev-deployment-register.ts:320:    await persistBootstrapRegister(pool, bootstrap);
packages/register/src/index.ts:467:export async function persistBootstrapRegister(pool: Pool, bootstrap: BootstrapRegister): Promise<void> {
packages/register/src/index.ts:529:        `INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
```

The reported two-family enumeration omits the bootstrap writer/sealer and its dev-seeder call.

### E10 — AGREE WITH THE CITED LINES; DISAGREE WITH THE UNIVERSAL CLAIM

Command:

```sh
nl -ba apps/runner/src/dev-runner-process.ts | sed -n '70p;148p;180p'
```

Output (verbatim):

```text
    70	    || apiEnvironment.REGISTER_VERSION !== String(DEVELOPMENT_REGISTER_VERSION)) {
   148	      || message.registerVersion !== DEVELOPMENT_REGISTER_VERSION) {
   180	        [join(cwd, "node_modules", "tsx", "dist", "cli.mjs"), "apps/runner/src/main.ts"],
```

Those lines pin the development launcher. Independent counter-probe:

```sh
nl -ba apps/runner/package.json | sed -n '6,9p'; nl -ba packages/register/src/runtime-environment.ts | sed -n '174,178p'; nl -ba apps/runner/src/main.ts | sed -n '19p;41p'
```

Output (verbatim):

```text
     6	  "exports": "./src/index.ts",
     7	  "scripts": {
     8	    "start": "tsx src/main.ts"
     9	  },
   174	export function loadRunnerEnvironment() {
   175	  const environment = parseEnvironment({
   176	    KEK_PATH: kekPath, DATABASE_URL: z.string().url(), RUNNER_WORKER_ID: z.string().min(1),
   177	    REGISTER_VERSION: positiveInteger,
   178	    CONTENT_ENCRYPTION_ENABLED: z.enum(["true", "false"]).default("false"),
    19	const environment = loadRunnerEnvironment();
    41	const policy = await readDevelopmentRunnerPolicy(pool, environment.REGISTER_VERSION);
```

This refutes "launched only by the dev stack" and the strongest-counter statement that no
shipped script can start the entrypoint without the dev wrapper's version check.

### E11 — DISAGREE

Command exactly as reported:

```sh
find . -maxdepth 3 \( -iname 'docker-compose*' -o -iname 'Dockerfile*' -o -iname '*.tf' \)
```

Output (verbatim):

```text
./node_modules/.pnpm/docker-compose@1.4.2
```

The stated empty result is false. The corrected full-depth command

```sh
find . \( -path './.git' -o -path './node_modules' -o -path './.worktrees' \) -prune -o \( -iname 'docker-compose*' -o -iname 'Dockerfile*' -o -iname '*.tf' \) -print
```

emitted no bytes and exited 0. That proves only the absence of matching first-party files in
this checkout.

### E13 — AGREE ON CURRENT WIRING; DISAGREE WITH THE T14b INFERENCE

Command:

```sh
nl -ba tests/architecture/dev-runner-provider-set.test.ts | sed -n '43,55p'; nl -ba apps/runner/src/main.ts | sed -n '91,119p'
```

Output (verbatim):

```text
    43	    const source = await readFile("apps/runner/src/main.ts", "utf8");
    44	    expect(source).toContain("readDevelopmentRunnerPolicy(pool, environment.REGISTER_VERSION)");
    45	    for (const setting of [
    46	      "compositionRow: policy.compositionRow",
    47	      "servePolicy:",
    48	      "judgementPolicy: policy.judgementPolicy",
    49	      "scoringOperator: policy.scoringOperator",
    50	      "runDeathPolicy: policy.runDeathPolicy",
    51	      "hiddenNodeScoreThreshold: policy.hiddenNodeScoreThreshold",
    52	      "holdRecorder:"
    53	    ]) expect(source).toContain(setting);
    54	  });
    55	});
    91	  compositionRow: policy.compositionRow,
    92	  servePolicy: {
    93	    compositionBudgets: policy.compositionBudgets,
    94	    candidateConfidenceBand: policy.candidateConfidenceBand,
    95	    bandCeiling: policy.bandCeiling
    96	  },
    97	  judgementPolicy: policy.judgementPolicy,
    98	  scoringOperator: policy.scoringOperator,
    99	  runDeathPolicy: policy.runDeathPolicy,
   100	  hiddenNodeScoreThreshold: policy.hiddenNodeScoreThreshold,
   101	  holdRecorder: {
   102	    countCooldownHolds: (runId) => runRepository.countCooldownHolds(runId),
   103	    record: (event) => runRepository.recordRunLifecycleEvent({
   104	      runId: event.runId,
   105	      kind: event.kind,
   106	      value: {
   107	        state: event.state,
   108	        call_site_key: event.callSiteKey,
   109	        parent_node_ref: event.parentNodeId,
   110	        hold_ms: event.holdMs,
   111	        hold_until: event.holdUntil,
   112	        attempts_spent: event.attemptsSpent,
   113	        transport_outcome: event.transportOutcome,
   114	        planned_leg_count: event.plannedLegCount
   115	      }
   116	    }),
   117	    wait: (cooldownMs) => new Promise((resolve) => setTimeout(resolve, cooldownMs))
   118	  }
   119	});
```

This confirms the packet's `both UNWIRED` premise is half false. It does not establish that a
future, authorized T14b design must violate an enduring invariant.

## WHAT I DID NOT VERIFY

- No runtime, test, build, package-manager, database, or production-environment probe was run;
  the seat contract forbids them.
- No live production register contents or deployment environment were available. That missing
  evidence is exactly why Gate 2 must not be recorded as `NOT-BROKEN`.
- The live Hermes/Kanban service was unavailable. Board state was read from the file board and
  no board file was written.
- I did not read the 1959-line spine.

## PREDICTIONS

I expect another lens to accept E10 after seeing the valid version-4 checks and miss that they
belong only to `dev-runner-process.ts`; the first place I would check is the package-local
`start` script and the production environment parser. I also expect a lens to flag only E11's
node_modules output as cosmetic while missing the third non-test register writer in E8. On
Gate 1, a lens may call DEV-12E `OWNED` because commit `7b3a306` edits the seeder; its lane
scope and unchanged provenance constant are the discriminating evidence.
