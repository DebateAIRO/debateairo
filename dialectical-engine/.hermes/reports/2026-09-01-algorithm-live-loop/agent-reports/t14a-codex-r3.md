CODEX REVIEW T14a r3 — APPROVE · comments read through: t14a-r3-2026-09-01

# CODEX REVIEW T14a r3

## VERDICT

**APPROVE**

All three and only three open r2 findings are resolved. No finding remains for a V DECISIONS
PACKET row. The stable conclusions are `OWNERSHIP = UNOWNED`,
`BROKEN TODAY = CANNOT-ASSESS`, and `T14b = DO NOT RUN pending joint production-version and
sealed-provenance evidence`.

## R2 FINDING VERIFICATION

### N1 — IMPLEMENTED

The report now requires both facts jointly at lines 124-140: (A) the version production
selects and (B) the `source_ref` values sealed at that version. It explicitly says A alone is
insufficient, a register receipt must be tied to A, and one combined artifact suffices only if
it proves both. The same rule replaces the old `any one` wording in the recommendation at
lines 305-308 and proposed G2 decision at lines 399-405.

### N2 — IMPLEMENTED

Lines 142-152 now make the outcome state-dependent and follow the reader's ordered guards:
bootstrap-only v1 is `DEV_RUNNER_POLICY_UNRESOLVED`; a complete runner-policy set with
non-development provenance is `DEV_RUNNER_POLICY_PROVENANCE_INVALID`; other versions depend
on their actual rows.

### N3 — IMPLEMENTED

The E8 reachability trace now cites `dev-deployment-register.ts:372`, matching the source.

## DIFF-SCALE SCRUTINY

The report is untracked, so Git cannot produce an r2→r3 blob diff. I compared the current file
against the exact r2 spans quoted in `t14a-codex-r2.md`, the full r2 report already read in this
same reviewer session, and a current quantifier/citation scan. The substantive changes are
confined to the three routed corrections:

1. the missing-evidence section plus its recommendation/G2 consumers now use joint A∧B;
2. the single universal error-code paragraph is replaced by the ordered, state-dependent
   failure statement; and
3. the E8 callsite anchor changes from `:371` to `:372`.

The first-line handoff marker advances to r3. No other new substantive claim was found.

## EVIDENCE RE-RUN

Command:

```sh
nl -ba apps/runner/src/dev-runner-policy.ts | sed -n '98,110p'; nl -ba apps/runner/src/dev-deployment-register.ts | sed -n '369,373p'
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
   369	  } finally {
   370	    authorityClient.release();
   371	  }
   372	  await persistOrAcceptSealedHistoricalBootstrap(input.adminPool, bootstrap);
   373	  const rows = await expectedRunnerRows(bootstrap, input.providerPanel);
```

This independently confirms N2's ordered failure semantics and N3's corrected anchor.

Current report residue scan:

```sh
rg -n 'any one|any other sealed|:371|BOTH|state-dependent|:372|jointly' .hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t14a-evidence.md
```

Output (verbatim):

```text
124:Closing the gate requires evidence establishing **BOTH** of the following facts jointly;
144:sealed version, the outcome is state-dependent, because the reader checks completeness before
184:  `:372`, which calls `persistBootstrapRegister` at `:320`, before writing version 4 — and
212:  `apps/runner/src/dev-api-environment.ts:372` and `apps/runner/src/dev-api-process.ts:180`.
306:is not met. Supplying evidence that jointly establishes both (A) and (B) in MISSING EVIDENCE
399:     MISSING EVIDENCE — closing the gate requires BOTH jointly: (A) which register version
```

The old `any one`, `any other sealed`, and erroneous `:371` report text is absent; both `:372`
hits resolve to real source anchors.

## DECISIONS REVIEW

- **G1:** faithful to the unchanged ownership evidence and preserves the DEV-12D clarification.
- **G2:** records `CANNOT-ASSESS`, the joint A∧B evidence requirement, the scoped launch/writer
  facts, and the correction that `readDevelopmentRunnerPolicy` is wired. Each is supported.
- **G3:** is the pure I-2 consequence: the conjunction is not authorized on `UNOWNED` plus
  `CANNOT-ASSESS`; no speculative reinforcement remains.
- **G4:** preserves the independent `claimTimeProbe` gap and does not dispose of it through
  Gate 2.

The proposed G1–G4 block is within the evidence and is ready for the orchestrator's append
decision. This review does not append it or modify board state.

## WHAT I DID NOT VERIFY

- No runtime, tests, builds, package commands, database queries, or live deployment checks were
  run; the packet forbids them.
- No live production version/provenance was available; Gate 2 correctly remains
  `CANNOT-ASSESS`.
- I did not read the 1959-line spine and did not write any board file.

## PREDICTIONS

I expect a later consumer's main failure risk is collapsing `CANNOT-ASSESS` into
`NOT-BROKEN` when copying G2, or treating the development v4 path as observed production
state. The first check should remain the joint A∧B requirement at report lines 124-140 and
G2 lines 399-405. A second risk is dropping G4 because T14b does not run; G4 explicitly
survives every Gate 2 disposition and still needs its routed ticket.
