CODEX REVIEW T14a r2 — CHANGES · comments read through: t14a-r2-2026-09-01

# CODEX REVIEW T14a r2

## VERDICT

**CHANGES**

All four routed r1 findings are implemented, the new bootstrap writer/provenance claim is
substantially correct, the proposed T14b recommendation is now a pure conjunction, and the
worker's marker-ordering deviation is on the record. Approval is withheld because the rewrite
introduces two new universal over-claims and one incorrect file:line anchor. These do not
change `UNOWNED`, `CANNOT-ASSESS`, or `DO NOT RUN pending evidence`, but the append-only
DECISIONS proposal must not say that any one incomplete artifact closes Gate 2. This CHANGES
verdict opens r3, the last lawful rework round.

## R1 CONVERGENCE

- **B1 IMPLEMENTED:** Gate 2 is `CANNOT-ASSESS`; the direct package start and unpinned
  `REGISTER_VERSION` parser are recorded, and the missing production state is named.
- **B2 IMPLEMENTED:** E8 enumerates all three non-test SQL writer sites and traces
  `persistBootstrapRegister` through the development seeder.
- **N1 IMPLEMENTED:** E11 now gives the explicit pruned full-tree command, its literal empty
  result, and the correctly scoped conclusion.
- **N2 IMPLEMENTED:** The speculative T14b reinforcements and G3 `Additionally ...` clause are
  removed. The recommendation and G3 now use only the gate conjunction.

## FINDINGS

### N1 — NON-BLOCKING · NEW OVER-CLAIM

- **WHAT:** The report says any one of three evidence items independently closes Gate 2, but
  items 1 and 2 normally establish only the production-selected version, not the sealed
  `source_ref` values at that version.
- **WHERE:**
  `.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t14a-evidence.md:113-135,293-295,383-389`.
- **WHY:** The report correctly defines the unknown as two facts: (A) which version production
  selects and (B) which provenance is sealed at that version. A launch definition showing how
  `main.ts` starts, or an environment receipt naming `REGISTER_VERSION`, does not by itself
  observe B. A register receipt is sufficient only when tied to the version production
  actually selects. The current `any one` language would let the gate be closed with half the
  evidence and is repeated in the proposed append-only G2 decision.
- **SUGGESTED FIX:** Say that Gate 2 needs evidence jointly establishing A and B. One combined
  artifact may suffice if it proves both; otherwise require launch/environment evidence for A
  plus a register receipt for B. Apply the same correction to the recommendation and G2
  DECISIONS line.

### N2 — NON-BLOCKING · NEW OVER-CLAIM

- **WHAT:** The report says selecting any sealed version other than dev-seeded v4—including
  bootstrap v1—throws `DEV_RUNNER_POLICY_PROVENANCE_INVALID`.
- **WHERE:**
  `.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t14a-evidence.md:137-140`;
  ordered guards at `apps/runner/src/dev-runner-policy.ts:98-110` and bootstrap row
  construction at `packages/register/src/index.ts:467-480`.
- **WHY:** The reader checks completeness first. Bootstrap v1 contains tool/bootstrap and
  auth/MFA/session/recovery/product-role rows, not the required runner-policy row set, so a
  bootstrap-only v1 reaches `DEV_RUNNER_POLICY_UNRESOLVED` at line 104 before the provenance
  guard at lines 105-110. More generally, the result for another sealed version depends on
  row completeness and provenance; it cannot be assigned one universal error code.
- **SUGGESTED FIX:** Replace the sentence with a state-dependent statement. Name bootstrap-only
  v1 as `DEV_RUNNER_POLICY_UNRESOLVED`; say a complete non-development runner-policy version
  reaches `DEV_RUNNER_POLICY_PROVENANCE_INVALID`; leave other versions conditional on their
  actual rows.

### N3 — NON-BLOCKING · CITATION

- **WHAT:** The new E8 reachability trace cites the development-seeder call one line early.
- **WHERE:**
  `.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t14a-evidence.md:170-173`.
- **WHY:** `seedDevelopmentDeploymentRegister` calls
  `persistOrAcceptSealedHistoricalBootstrap` at
  `apps/runner/src/dev-deployment-register.ts:372`, not `:371`. Line 371 closes the preceding
  `finally` block.
- **SUGGESTED FIX:** Change `:371` to `:372`.

## NEW CLAIM VERIFICATION

### Non-test writer enumeration — AGREE

Command:

```sh
rg -n --glob '!node_modules/**' --glob '!.worktrees/**' --glob '!docs/**' --glob '!.hermes/**' --glob '!**/*.test.ts' 'INSERT INTO register\.register_row' apps acceptance packages tools deploy
```

Output (verbatim):

```text
acceptance/seed-register.ts:291:        `INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
packages/register/src/index.ts:529:        `INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
apps/runner/src/dev-deployment-register.ts:264:      `INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
```

The revised three-writer enumeration agrees with this scoped search.

### Bootstrap v1 provenance and dev reachability — AGREE, with N3's line correction

Command:

```sh
nl -ba apps/runner/src/dev-deployment-register.ts | sed -n '315,325p;362,376p'; nl -ba packages/register/src/index.ts | sed -n '467,478p;527,537p'; nl -ba register.bootstrap.json | sed -n '1,15p'; nl -ba packages/register/src/session-policy.ts | sed -n '47,50p'
```

Output (verbatim):

```text
   315	async function persistOrAcceptSealedHistoricalBootstrap(
   316	  pool: Pool,
   317	  bootstrap: BootstrapRegister
   318	): Promise<void> {
   319	  try {
   320	    await persistBootstrapRegister(pool, bootstrap);
   321	  } catch (error) {
   322	    if (!(error instanceof TypeError) || error.message !== "FX-REG-SEALED_VERSION_MISMATCH") {
   323	      throw error;
   324	    }
   325	    await assertSealedHistoricalBootstrap(pool, bootstrap.registerVersion);
   362	export async function seedDevelopmentDeploymentRegister(
   363	  input: SeedDevelopmentDeploymentRegisterInput
   364	): Promise<DevelopmentDeploymentRegisterReceipt> {
   365	  const bootstrap = await loadBootstrapRegister();
   366	  const authorityClient = await input.adminPool.connect();
   367	  try {
   368	    await assertAdmin(authorityClient);
   369	  } finally {
   370	    authorityClient.release();
   371	  }
   372	  await persistOrAcceptSealedHistoricalBootstrap(input.adminPool, bootstrap);
   373	  const rows = await expectedRunnerRows(bootstrap, input.providerPanel);
   374	  const registerVersion = DEVELOPMENT_REGISTER_VERSION;
   375	  if (registerVersion <= bootstrap.registerVersion) {
   376	    throw new TypeError("DEV_DEPLOYMENT_REGISTER_VERSION_INVALID");
   467	export async function persistBootstrapRegister(pool: Pool, bootstrap: BootstrapRegister): Promise<void> {
   468	  const rows = [
   469	    ...bootstrapKeys.map((rowKey) => Object.freeze({
   470	      rowKey,
   471	      value: bootstrap.values[rowKey],
   472	      sourceRef: bootstrap.resolution[rowKey]
   473	    })),
   474	    ...AUTH_POLICY_REGISTER_ROWS,
   475	    MFA_POLICY_REGISTER_ROW,
   476	    SESSION_POLICY_REGISTER_ROW,
   477	    RECOVERY_POLICY_REGISTER_ROW,
   478	    PRODUCT_ROLE_POLICY_REGISTER_ROW
   527	    for (const row of rows) {
   528	      await client.query(
   529	        `INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
   530	         VALUES ($1, $2, $3::jsonb, $4)`,
   531	        [bootstrap.registerVersion, row.rowKey, JSON.stringify(row.value), row.sourceRef]
   532	      );
   533	    }
   534	    await client.query(
   535	      `INSERT INTO register.register_version (register_version, row_count, sealed)
   536	       VALUES ($1, $2, true)`,
   537	      [bootstrap.registerVersion, expectedRowCount]
     1	{
     2	  "registerVersion": 1,
     3	  "values": {
     4	    "nodeRuntimeVersion": "v22.23.1",
     5	    "pnpmVersion": "11.20.0",
     6	    "postgresMajorVersion": "18",
     7	    "typescriptVersion": "7.0.2",
     8	    "vllmImageDigest": "sha256:ffb2d59b1c059a5bd8d781320c9f5189de8293693b7d95da54befddaa54abf52"
     9	  },
    10	  "resolution": {
    11	    "nodeRuntimeVersion": "node --version on 2026-08-07",
    12	    "pnpmVersion": "pnpm --version on 2026-08-07",
    13	    "postgresMajorVersion": "embedded-postgres darwin-arm64 postgres --version on 2026-08-07",
    14	    "typescriptVersion": "pnpm exec tsc --version on 2026-08-07",
    15	    "vllmImageDigest": "Docker Hub registry API manifest HEAD for vllm/vllm-openai:latest on 2026-08-07"
    47	export const SESSION_POLICY_REGISTER_ROW = Object.freeze({
    48	  rowKey: SESSION_POLICY_ROW_KEY,
    49	  sourceRef: "DR-179; wave-2-target-architecture:session-security; S5-binding-contract",
    50	  value: Object.freeze({
```

This proves the v1 seal is reachable from the dev seeder on an empty v1 state and that the
written source refs are not the two development provenance constants. On a pre-existing
sealed mismatch, the catch path accepts only the historical seal/count invariant; the report
already notes that branch.

### Ordered bootstrap-v1 failure — DISAGREE with the reported error code

Command:

```sh
nl -ba apps/runner/src/dev-runner-policy.ts | sed -n '98,111p'
```

Output (verbatim):

```text
    98	  const keys = Object.keys(runnerRowsSchema.shape);
    99	  const result = await pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(
   100	    `SELECT row_key,value_json,source_ref FROM register.register_row
   101	     WHERE register_version=$1 AND row_key=ANY($2::text[])`,
   102	    [registerVersion, keys]
   103	  );
   104	  if (result.rows.length !== keys.length) throw new TypeError("DEV_RUNNER_POLICY_UNRESOLVED");
   105	  if (result.rows.some((row) => row.source_ref !== (
   106	    row.row_key === "acceptanceOrganCostBounds" || row.row_key === "runDeathPolicy"
   107	      ? DEVELOPMENT_SOURCE_REF
   108	      : DEVELOPMENT_RUNNER_SOURCE_REF
   109	  ))) {
   110	    throw new TypeError("DEV_RUNNER_POLICY_PROVENANCE_INVALID");
   111	  }
```

The bootstrap row construction shown above contains none of `runnerRowsSchema`'s required
policy rows. Completeness therefore fails before provenance for bootstrap-only v1.

### E11 correction — AGREE

Command:

```sh
find . \( -path './.git' -o -path './node_modules' -o -path './.worktrees' \) -prune -o \( -iname 'docker-compose*' -o -iname 'Dockerfile*' -o -iname '*.tf' \) -print
```

Output (verbatim): no bytes emitted; exit 0.

The revised conclusion is correctly limited to matching first-party files in this checkout.

## DECISIONS REVIEW

- G1 remains within the unchanged, independently checked ownership evidence.
- G2's `CANNOT-ASSESS` disposition and scoped writer/launcher facts are supported. N1 must be
  corrected before the proposed line is appended because it currently understates the
  evidence needed to close the gate.
- G3 is now the pure gate consequence required by the packet; no speculative reinforcement
  remains.
- G4 faithfully preserves the independently routed `claimTimeProbe` issue.

## MARKER-ORDERING DEVIATION

The worker disclosed the deviation in
`agent-reports/t14a-evidence-self.md:216-222`: it wrote the revised report marker before
appending the r2 self-report and explicitly declined to disguise the sequence. The required
deviation is therefore on the record.

## WHAT I DID NOT VERIFY

- No runtime, tests, builds, package commands, database queries, or live deployment checks were
  run; the packet forbids them.
- No live production version/provenance was available, so Gate 2 remains `CANNOT-ASSESS`.
- I did not read the 1959-line spine and did not write any board file.

## PREDICTIONS

I expect another lens to approve after matching the four-row r2 disposition table to B1/B2/N1/N2
and to miss the new `any one` and `any other` quantifiers. The first discriminating check is a
two-column matrix of Gate 2's unknown facts versus each proposed evidence artifact; the second
is the ordered completeness-before-provenance guard at `dev-runner-policy.ts:104-110`.
