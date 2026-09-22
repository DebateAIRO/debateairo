# BUILD-S03-C3 self-report — t_843976bb

Seat: `BUILD-S03-C3` · node: `BUILD(S03-C3)` · pass 1 of 3  
Lane: `slice/tiers-s03` · base: `62a4c367` · commit: `43efdb1a`  
Session: `01a09b78-6a4d-7d83-9062-fd59100e32b9` · `/Users/vladmihaimiron/.codex/sessions/2026/09/13/rollout-2026-09-13T18-52-35-01a09b78-6a4d-7d83-9062-fd59100e32b9.jsonl`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Verdict

The 24-path cluster is committed and clean. The file-owned five-slot provider set now drives the CLI starts, configured discovery set, API availability, deployment register, and runtime refresh rules. Invalid model configuration is refused before any other stage. Missing or mismatched API availability leaves the slot configured but absent. The provider key reader enforces private ownership, modes, no symlink at the leaf, and one-link custody. File entry removal is admitted only against the exact provider set held by the outgoing register version. The `planTierRosters` row comes from the model file and remains invariant when API availability changes.

`run-suites.sh` printed `CLUSTER_GREEN` for these pairs: `11/0`, `24/0`, `3/0`, `14/0`, `12/0`, `4/0`, `3/0`, `5/0`, `12/2`. The final three aggregate runs were identical: `Test Files 1 failed | 8 passed (9)` and `Tests 2 failed | 88 passed (90)`. The two failures are the inherited `register-support-publication` titles named by the packet. The previously failing provider-panel title is gone.

## Evidence ledger

- Base: `build-s03-c3-base-claim.log` — C1 landing state `4 failed | 5 passed` files, `3 failed | 46 passed` tests, with both unit suites broken at module load.
- Pre-product: `build-s03-c3-s22-pre-red.log` — module load restored, alias assertion red; `build-s03-c3-s25-cluster-red.log` — class-2 fixture returned exit 0 and changed the `api.env` digest before the stage existed.
- Final aggregates: `build-s03-c3-cluster-final-1.log`, `build-s03-c3-cluster-final-2.log`, `build-s03-c3-cluster-final-3.log` — each `1 failed | 8 passed` files and `2 failed | 88 passed` tests, with only the two named inherited titles.
- Per-suite verdict: `build-s03-c3-run-suites-final.log` — `CLUSTER_GREEN`.
- Embedded PostgreSQL before/after: register support `25/25` in `build-s03-c3-embedded-register-before.log` and `build-s03-c3-embedded-register-after.log`; production principals `32/32` in `build-s03-c3-embedded-principals-before.log` and `build-s03-c3-embedded-principals-after.log`.
- Typecheck: `build-s03-c3-typecheck-post-cluster.log` — inherited nonzero rc; no new diagnostic in any changed path. The only matching allowed-path diagnostics are the packet-recorded TypeScript import failures in `tests/architecture/register-support-publication.test.ts`.
- Final deterministic v4 snapshot: 33 rows, `f02c8c003c75c2513672fc4380d4302d5dd18e576fcb498d968c61ba5cb32cf9`; the legacy v1 digest and 14-row count did not move.

## Refutation matrix

| Step | Temporary mutant | Result | Restored evidence |
|---|---|---|---|
| S18 | assigned catalogue port 8794 | collision case red | `s18-mutant-restored-green.log` |
| S19 | appended model id to provider ref | stable-ref case red | `s19-mutant-restored-green.log` |
| S20 | ordered API before CLI | order case red | `s20-restored-green.log` |
| S21 | ignored the configured-set parameter; separately restored a zero-argument publication call | assembler and CLI-source cases red | `s21-green.log` |
| S22 | sent `opus` instead of the full Claude id | full-id case red | `s22-restored-green.log`; adjacent maker-label change stayed green |
| S23/S29 | derived the tier row from runtime targets | key-arrival row equality red | `s29-register-green.log` |
| S25 | moved the model-config stage after the public-port stage | order case red | `s25-restored-green.log` |
| S26 | attached a credential to the absent-slot sentinel | class-(a) case red under the panel shape guard | `s26-restored-green.log` |
| S27 | accepted mode 0644 | custody case red | `s27-restored-green.log` |
| S28 | disabled the exact held-set admission | legitimate-removal case red | `s28-green.log`; the no-map v4 fallback remains refused |
| S30 | added a minimum-five publication guard | smaller-set publication case red | `s30-green.log` |
| S31 | appended another `/v1` segment to an API endpoint | Z.AI endpoint case red | `s31-green.log` |

S32–S34 are fixture/assertion moves rather than production changes. S32 began at its expected 2/3 red and ended 3/3; S33 deliberately made the shared digest and downstream fixture cases red before the coordinated sweep; S34 ended 4/4 with the two Support-seam negatives unchanged.

## Findings and their price

1. **S26/S27 describe a dependency in the opposite order.** S26 says the stack reads through `readProviderKeys`, while S27 is the step that creates that module and lists no auth-stack edit. The packet simultaneously says each step must be green before the next. I built S26 behind an injected read seam, then connected the custody reader in S27. Price: one extra seam design, two verification cycles, and substantial reasoning about whether creating the file early would violate the prescribed order. Upgrade: make the plan say “S26 defines the availability seam; S27 supplies its default reader,” or reverse the steps.
2. **The relay option types lag S22's full-model requirement.** `apps/runner/src/dev-cli-provider-panel.ts` must send full Claude and Grok model ids, but the imported option types reject a `model` member. Because `acceptance/**` is forbidden, the implementation requires a local boundary cast. Price: one failed typecheck and an unverified real-relay boundary. Upgrade: change the relay option contract in the owning slice, then remove both casts. This is the highest-value follow-up before calling live-provider acceptance complete.
3. **S28 names a producer that is outside the write surface.** The assembler accepts the bounded held-version map and the auth stack threads an optional map from the publication receipt, but no path in this cluster is authorized to query and populate the newest 64 configured sets. Price: the filesystem rules are proved, while live map population remains outside this seat's evidence. Upgrade: assign the producer explicitly to the data-plane/register owner and add one source-to-sink integration case.
4. **The spawned CLI fixture did not own its new file dependency.** S21 made the CLI read model configuration from its cwd; the database test still spawned it in a temporary root containing custody files only. This surfaced only in the first full cluster run. Price: about two minutes and a second focused embedded-PostgreSQL run. Upgrade: fixture factories should declare every cwd dependency and materialize them from a single model-config fixture.
5. **Line-anchored instructions were less useful than symbol-anchored ones after S18–S23.** The packet already warned about this, but later step references shifted by hundreds of lines as the same files grew. Price: repeated `rg`/numbered reads and patch-context repairs. Upgrade: generated packets should carry symbol plus a short content hash, using line numbers only as a hint.
6. **The verification contract intentionally repeats the most expensive suite.** Three aggregate runs plus `run_suites` execute the 14-case embedded register suite four times, then two additional embedded suites run independently. Price in this session: roughly eight minutes of wall time and repeated polling, with no variance observed. Upgrade: let `run_suites` consume signed per-suite summaries from the three aggregate logs instead of rerunning them, or state that the fourth run is the desired variance sample.
7. **The planned final count is attainable only if S21 and S29 extend an existing environment-refresh case.** Naively adding one case for every prose clause yielded 14 cases, while the packet requires 12/12. I folded S21's configured-set check and S29's same-version key-arrival check into the existing refresh case; S28 remains the two required new cases. Upgrade: every step should state whether its case is “new test” or “additional assertions in named test.”

## Near misses and dead ends

- A patch overlap briefly left two chained `.toEqual(...)` lines in the publication test. A numbered source read caught it before a test run.
- The first S31 catalogue patch briefly contained a placeholder endpoint typo. It was noticed and corrected before evidence was recorded.
- The first shared-fixture register run exposed maker sorting (`Z.AI` before `xAI`); the assertion, not the product, was corrected.
- I initially imported the plan-tier type from the wrong package. Typecheck caught it; the production signature now uses the exact local two-word domain.
- One diagnostic command targeted a non-existent capture-script path, and one empty patch targeted a malformed path. Neither changed repository state.
- The first full cluster run found the missing temporary `config/models.yaml`; all three final cluster runs occurred after that correction.

## One-prompt-machine upgrade

Generate a machine-readable execution manifest beside the prose packet. It should contain: immutable base sha, branch, exhaustive read/write paths, ordered RED and implementation events, exact test selectors, mutation patches and expected killed/surviving tests, baseline failure identities, suite pairs, capture paths, staging paths, commit-message pattern, and handoff fields. A preflight command should validate branch/head/cleanliness, comment cursor, required exports, file anchors, platform dependencies, and spawned-fixture cwd dependencies before CLAIM. A single executor can then advance a typed state file (`CLAIMED → RED → GREEN → MUTANT_KILLED → VERIFIED → COMMITTED → REPORTED`) and refuse any transition lacking its artifact. That would remove most manual command transcription and make resumed sessions continue from evidence rather than replaying prose.

The prose remains valuable for intent and disputed decisions; the manifest should own mechanical facts. Generate both from one source and validate that every prose step maps to one manifest event and every allowed path has an owner.

## Acceptance step 4 readback command

Record and relay this verbatim; V substitutes the run ref from the debate URL. It discovers the one relation carrying `discovered_panel`, then reads only that field for the selected run:

```sh
db_url="$(sed -n 's/^DATABASE_URL=//p' .local/dev-auth/api.env)"; relation="$(psql "$db_url" -XAt -v ON_ERROR_STOP=1 -c "SELECT format('%I.%I',table_schema,table_name) FROM information_schema.columns WHERE column_name='discovered_panel' ORDER BY table_schema,table_name LIMIT 1")"; psql "$db_url" -X -v ON_ERROR_STOP=1 -v run_ref='<RUN_REF_FROM_DEBATE_URL>' -c "SELECT discovered_panel::text FROM ${relation} WHERE run_ref = :'run_ref';"; unset relation db_url
```

## Unverified

- Real OpenAI and Z.AI calls, including endpoint response shape and model echo, were not made.
- Real Claude/Grok relay handling of the newly supplied full-id option is not proved because the owning acceptance modules are out of scope.
- The browser and `:3000` stack were not started; acceptance steps 2–11 remain V/TEST work as marked by the SPEC.
- Live population of S28's newest-64 held-version map is not proved by this cluster's authorized paths.
