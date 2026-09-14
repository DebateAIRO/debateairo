# FIX-09 C3 fresh independent Sol review

Date: 2026-09-04

Review range: `4d598fd91d7db20d0f884871215203bdc7f608ec..8619b9ab4dbc01fdd166337a641193675b24380a`

## Verdicts

- **SPEC: PASS**
- **CODE QUALITY: PASS**

This is a C3-only milestone verdict for live-plan steps 9.7–9.8. It does not
claim C4, production/launchd acceptance, V's veto, merge readiness, or FIX-09
Done.

## Findings

### P0

None.

### P1

None.

### P2

None.

### P3

None.

## Authority and scope reconciliation

I read the supplied review package first, then the task brief, implementer
report, frozen `FIX-09/{SPEC,PLAN,DECISIONS}.md`, and successor
`SPEC-v2.md`/`PLAN-v2.md` plus `SPEC-v3.md`/`PLAN-v3.md`. The successors alter
C2 only; frozen R05/R07 and live-plan steps 9.7–9.8 remain the C3 authority.

The accumulated range changes exactly five regular paths:

- `.superpowers/sdd/PLAN-FixAgent/FIX-09-C3.md`;
- `tests/architecture/fix09-no-model.test.ts`;
- `tests/unit/fix09-tier-gate.test.ts`;
- `tools/obs-listener/src/daemon/fold.ts`;
- `tools/obs-listener/src/daemon/tier-gate.ts`.

That is the authorized C3 report/test/gate surface plus the minimum C2 fold
integration. C1 policy bytes, frozen interfaces and fixtures are unchanged.
Every C2 path outside `fold.ts` is byte-unchanged from the reviewed base.
`git diff --check` passes.

## Specification review

The implementation satisfies the C3 contract:

- `evaluateTierGate` snapshots and validates a closed input, hashes
  `canonicalJson(tierInput) || canonicalBundleHash` with SHA-256, and returns a
  frozen closed decision object. Independent recomputation matched the emitted
  hash.
- Reordered top-level and nested object keys produce byte-identical decisions.
  The same fingerprint produces the same input hash; a changed fingerprint
  changes it.
- Floor paths, zone context, unknown taxonomy class and external roots all
  produce `ESCALATE|FLOOR_DENIED` with `REPORT_ONLY`. Unconfirmed roots,
  non-first-party inputs, and non-production roots also conservatively
  escalate.
- The exact QUICK boundary—one production file, one test file, twenty
  production lines, fifty total lines, RED/GREEN present—produces
  `QUICK|FLOOR_CLEAR`; exceeding any bound or removing RED/GREEN produces
  `PR_FIX|FLOOR_CLEAR`. QUICK and PR_FIX remain `APPROVAL_FIRST` while the
  loaded bundle has `quick_arm=OFF`.
- The lawful `quick_arm=ON` bundle neighbor changes the bundle and input hashes
  but does not turn the C3 label into dispatch authority.
- Null, missing/extra-key, noncanonical-count, invalid-version, negative-shape,
  traversal-path and invalid-boundary inputs fail closed with
  `INVALID_INPUT`. Hostile accessors and proxies are rejected without invoking
  their getter/traps. Decisions contain no input fingerprint, root path, raw
  message or other free text.
- An independent fixed-seed set of 1,000 inputs evaluated twice produced
  byte-identical serialized persistence payloads. The committed fixed-seed
  test independently passes the same 1,000-input/two-pass property.
- Fold integration inserts the decision before ACK and contiguous-cursor
  advancement in the existing occurrence transaction. A real PostgreSQL probe
  injected a failure at `INSERT INTO obs.policy_decision`; incident, decision,
  ACK and cursor all remained absent. Retry committed exactly one of each, and
  replay returned `ALREADY_ACKED` without duplication.
- The persisted row is the closed identity
  `{policy_ref,input_hash,decision}` and re-evaluates to the same values. The
  real daemon run persisted `ESCALATE|FLOOR_DENIED` for its explicit
  `UNCONFIRMED` root and left `obs.budget_usage` at zero.
- The executable resolve trace reaches `main.ts`, `fold.ts`, and
  `tier-gate.ts` without a model, provider, CLI/child-process, or
  `@debateai/db` edge. A focused source scan also found zero forbidden schema,
  module, process-launch, or budget-write matches in daemon production source.

## Independent verification evidence

### Focused and adjacent tests

- Focused C3 suite, three fresh embedded-PostgreSQL runs: each reported
  `2 passed` files and `8 passed` tests.
- Restored isolated inverse-control run: `2 passed`, `8 passed`.
- Adjacent C1/C2 suite with real PostgreSQL:
  `3 passed` files and `99 passed` tests.
- The first sandboxed focused attempt could not bind localhost (`EPERM`); the
  required local-database reruns outside that restriction produced the passing
  results above. This was an execution-environment restriction, not a product
  failure.

### Harmful mutants and inverse neighbors

All mutations were made only in an isolated temporary copy and removed after
the run; comparison against the review worktree confirmed restored bytes.

- Floor bypass (`FLOOR_PATH` -> `PR_FIX|FLOOR_CLEAR`): killed; the floor test
  failed, with `1 failed | 5 passed`.
- Bundle-hash omission from SHA-256: killed by the pinned expected input hash;
  `1 failed | 5 passed`.
- QUICK off-by-one (`productionFiles < max`): killed at the exact boundary;
  `1 failed | 5 passed`.
- Persistence omission (removed `appendTierDecision`): killed by the real
  daemon case, which observed policy-decision count zero instead of one; the
  import-graph neighbor remained green.
- Inverse neighbors remained green: floor-clear production root, exact QUICK
  bounds, every one-over bound, RED/GREEN false, same/different fingerprint,
  key reordering, bundle-hash inclusion, restored persistence, replay, and
  `quick_arm` toggle behavior.

### Hash, interface, type, source, text, and scope

- Loader-independent bundle hash:
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- Frozen C1 interface fixture compile: exit 0.
- Repository typecheck has no C3 diagnostic. It retains exactly the known
  eight diagnostics in unchanged `tests/unit/s14-ui.test.ts`: TS2307 twice,
  TS18046 twice, TS2339 twice, and TS7006 twice.
- The supported source audit retains only the known three direct-environment
  findings in unchanged obs-capture installers and the two known migration
  0062 replay-form findings. It reports no C3 file.
- C3 text control-byte scan: `C3_TEXT_CONTROL_BYTES=0`.
- C3 forbidden production-source scan:
  `C3_FORBIDDEN_SOURCE_MATCHES=0`.
- Accumulated path ledger: `C3_SCOPE_PATHS=5`.

## Code-quality assessment

The gate keeps parsing, canonicalization, floor precedence, sizing, routing and
closed-output construction explicit and reviewable. Its validation eliminates
ambiguous property order, noncanonical counts, unsafe numbers, arbitrary
external-boundary strings, path traversal, accessors and proxies. The custom
production-glob matcher is bounded by the frozen, loader-validated bundle and
is covered at the decisive floor/production neighbors. The integration reuses
C2's transaction and exact occurrence advisory lock instead of adding a second
durability mechanism. The focused tests exercise the authority rules and kill
the four claimed high-value mutants; the additional independent probes close
the replay and persistence-failure gaps for this review. No reportable quality
defect remains in the reviewed range.
