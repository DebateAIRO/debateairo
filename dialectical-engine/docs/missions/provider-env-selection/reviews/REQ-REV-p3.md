# REQ-REV-p3 — blind review of the requirements, pass 3 of 3 · mission `provider-env-selection`

Seat REQ-REV-PES-p3 · node REQ-REV · pass 3 of 3 (last pass; a REWORK here would be a V row) · SCOPED to the REQ-FIX pass-3 closures of pass-2 B1, B2, N1, N2, N3 over `SPEC-v3.md` of S01 and S02. Lane `.worktrees/pes-base/dialectical-engine` @ `776359c3`, dirty 0 before and after. No product file edited. No git write. Probe log: `.hermes/reports/provider-env-selection/probes/REQ-REV-PES-p3/run.txt`. Independent runner: `probes/REQ-REV-PES-p3/exec.ts`.

The author's checkers fail on SPEC-v2 (7/7) and pass on SPEC-v3 (0). That order was re-run here before the v3 pass was credited. The v3 pass was then refused on its own terms: the same fixtures were executed through the lane's shipped functions by `exec.ts`, which does not read a SPEC to decide a code. The closures hold.

Pass-2 `detectors.py` still prints `v2: PASS` and `detectors_v3.py` prints `v3: PASS`. Those detectors match strings. They are quoted as insufficient, the same way pass 2 quoted them. They are not the evidence for this verdict.

## Blocking findings

None. B1 and B2 of pass 2 do not survive the v3 text plus one execution of the fixtures that text names.

### B1 (pass 2) — closed

`slices/S01/SPEC-v3.md:260-266` splits the old fixture into two cases.

- `targets-rejected` changes E's `base_url` to `https://api.acme.example/v2`. `exec.ts` builds the row (the roster passes the gate) and calls `parseProviderDiscoveryTargets`. The thrown message is exactly `PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID` (`packages/providers/src/index.ts:226-227`). The line the table requires is `PES_PUBLISH_SET_TARGETS_REJECTED:` plus that message (`SPEC-v3.md:133-136`). One composition. The duplicate roster is no longer this case.
- The duplicate roster is `roster-invalid` (`SPEC-v3.md:263`). R1.2 (`:80-92`) refuses it before the builder and the parser, printing `PES_PUBLISH_ROSTER_INVALID:` and the repeated ref `vendor:a`. R1.3 (`:126-129`) fixes that order. Skipping the gate still produces the pass-2 split: the builder throws `CONFIGURED_PROVIDER_SET_INVALID` and the parser throws `CONFIGURED_PROVIDER_DUPLICATE` (`exec.ts`). The SPEC says both are unreachable from a roster that passes the gate (`:82-85`, `:137-138`). Two coders who follow the order print one string.

Second member, the N4 pass test ("each builder argument has one named source, and that source exists in the database the acceptance creates").

| argument | named source | exists |
|---|---|---|
| `requiredDistinctMakers` | base row (`SPEC-v3.md:108`) | seed `requiredDistinctMakers` is `1` |
| `sealedSourceRef` | base row `sourceRef`, suffix stripped only when it is already the trailing constant (`:109`) | seed `sourceRef` is `DEV-01-local-auth-topology.md#ordered-bootstrap:DEV-05`; it does not end with the constant (length 163); the built sourceRef is 217 characters, under the 1024 bound |
| `baseRegisterVersion` | `REGISTER_VERSION` (`:110`) | acceptance sets `4`, the version `importHistoricalRegisterFixture` is called with (`:204-209`) |
| `rows` | every row of that version, one row replaced (`:111`) | the file has 32 rows, 0 duplicate keys, 0 `supportActivation`, every `valueJsonText` already canonical under `parseCanonicalRegisterJson`, every `sourceRef` inside 1..1024 |
| `publicationId`, `sourceRef`, `deployment` | the named construction, the literal, the literal `"hosted"` (`:112-114`) | not read from the database |

`tests/support/fixtures/register-development-v4.json` is the file `readLegacyDevelopmentV4Rows` parses (`tests/support/registerFixtures.ts:115-118`). Role-ref rows in that file: 0, which is the premise of V-10. The SQL insert was not run (UNVERIFIED). The bytes the named importer reads were.

### B2 (pass 2) — closed

One layout satisfies R2.8, R2.9 (iii), step 5 and step 7 together.

`exec.ts` created `<scratch>/custody.d/vendor.header` at modes `0700` / `0600` with the literal `Bearer pes-s02-fake-vendor-token` and one trailing newline. `readCustodyAuthorizationHeader` returned without a throw. The admission target through the R2.7 chain resolved, and the header equalled that literal. The scratch line `PES-S02 SCRATCH-DIR <scratch>` does not contain `<scratch>/custody.d` or the file path. Step 7's pattern `<scratch>/custody.d` (`SPEC-v3.md:244`) is a prefix of the file path and is not a substring of the scratch line. The scratch base name begins `pes-s02-` and contains no `custody` (`:189-193`).

The five R2.7 fixtures, executed in `main.ts:300-318` order, print:

| case | thrown message |
|---|---|
| `refused-loopback` | `PROVIDER_TARGET_LOOPBACK_REFUSED:vendor:a` |
| `refused-inline` | `PROVIDER_INLINE_CREDENTIAL_REFUSED:vendor:a` |
| `refused-conflict` | `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT` |
| `refused-absent` | `PROVIDER_AUTHORIZATION_FILE_ABSENT:vendor:a` |
| `refused-price` | `PROVIDER_TARGET_PRICE_REQUIRED:vendor:a` |

Step 5 (`:232-239`) prints `PES-S02 REFUSED ` plus that message: a ref follows a code that ends in `:`, and the conflict code carries none. The absent-file message names the ref and not the path, so R2.9 (iii) (`:182-183`) holds on the refusal lines. The same target with `http://127.0.0.1:4455/v1` throws `PROVIDER_BASE_URL_TLS_REQUIRED:vendor:a` first, which is the note at `:148-150`. `isRefusedHostedProviderHost("api.localtest.me")` is false; `127.0.0.1` is true.

### N1, N2, N3 (pass 2) — closed

- N1. R2.8 names `probeFreshnessMs` `600000` and `probeTimeoutMs` `5000` (`SPEC-v3.md:167-171`). `createProviderDiscoveryResolver` with those integers returns. The same call with both integers omitted throws `PROVIDER_PROBE_FRESHNESS_INVALID`. `5000` is the loader default at `runtime-environment.ts:331`. `600000` is the constant at `dev-deployment-register.ts:344` and the seed's `probe_freshness_ms`.
- N2. R2.9 (i) (`:180-181`) forbids the exact token `pes-s02-fake-vendor-token`. None of the step 5–8 lines this probe built contain it. The v2 "any substring" reading is gone, so a line that contains `e` is lawful.
- N3. `slices/S01/PLAN.md:40` admits a credential file path only on the two `PES_HOSTED_TARGETS_*_V1=` lines. That is `SPEC-v3.md:178-180`. The cell does not say `path, anywhere`.

V-10 is already in `V-DECISIONS-PACKET.md`. SPEC-v3 carries non-provider rows forward and builds no role-ref check (`SPEC-v3.md:111`, `:298-302`). The seed has neither role row. The default binds. This pass adds no row.

## N-findings (WHEN, not WHETHER)

N1. Packet defect. `packets/REQ-REV-p3.md:9` tells the seat to read S03's SPEC, PLAN and DECISIONS exhaustively. `packets/REQ-REV-p3.md:31` says S03 is out of scope. A seat that obeys line 9 reviews S03; a seat that obeys line 31 does not. WHEN: the orchestrator drops S03 from the input list of a scoped pass. This pass followed line 31. S03 was not scored.

N2. The REQ-FIX READY comment on t_690beb44 names `brainstorming` in the pre-cut load and, in the re-load "before this handoff", names only `heartbeat-protocol` and `heartbeat-requirements`. The requirements floor loads `brainstorming` before a SPEC line (`.claude/skills/heartbeat-protocol/SKILL.md:37`). The orchestrator's RESUMED comment on that ticket says nothing the seat produced had reached disk before the resume, so the SPEC lines were written after the shorter re-load. The rejected alternatives are in `slices/S01/DECISIONS.md`. This is not a fabrication finding: the transcript was not opened, and the comment does name the earlier load. WHEN: the orchestrator records it on the ticket. No SPEC line changes because of it.

The N4 test this packet was held to is met. Charge 8 quotes the pass-2 prediction and the pass test verbatim (`reviews/REQ-REV-p2.md:107` and `:44`). It does not replace B1 with "one roster file determines every member."

## Charges

1. Skills read are the five files in the handoff. `receiving-code-review` was not loaded: the READY comment says every assigned finding is ADDRESSED and none is CONTESTED. Comments at claim: the DISPATCHED comment only (`comments read through: 1`). Re-read at handoff is in the verdict comment.
2. `packets/REQ.md` read. The range `configured-provider-set.ts:5-144` at `REQ.md:24` is still the pass-2 outside-scope item (that review's N2). Not re-scored. This packet's own defect is N1 above.
3. `INSTRUCTIONS.md:12-18` is still four GAP cells and one GAP/UNVERIFIED. No BUILT cell to re-measure. v3 did not flip one. Neither SPEC-v3 repeats the intake §7 stale sentences "there is no VPS deployment path yet" or "no environment switch".
4. The two-coder failures inside the closures do not remain. Banned-word grep on both SPEC-v3 files: 0 hits. `ui: no` on both, line 3; acceptance is shell. V-1..V-10: V-10's default is what R1.2 does; V-5's token is `pes-s02-fake-vendor-token`; V-7's floor is not added (the acceptance passes `600000` into one in-process resolver and reads no register row). The four RED-at-base suites stay named in S01 §4 and S02 §4. No real key.
5. S01's acceptance is `pnpm pes:accept-publish-set`. S02's is `pnpm pes:accept-hosted`. `INSTRUCTIONS.md:38-42` states no edge. S02 step 5 and R2.9 (iii) now have one layout (B2 closed).
6. This file. Author checkers: v2 FAIL rc=1 (7 failing checks), then v3 PASS rc=0. `exec.ts` agrees with the v3 codes and does not agree by reading the SPEC.
7. No git write, no product edit, no install, no listener, no real key, no board switch. Lane dirty 0.
8. Scope kept to the five closures and to requirements v3 changed around them (R1.2, R1.3, R1.5, R1.7, R1.9, R1.12, R2.7, R2.8, R2.9, R2.10, the two acceptance sections, the two PLAN traces). S03 not opened.

## Verification

```
python3 probes/REQ-FIX-PES/p3_checks.py v2
  FAIL B1 codes, B1 base row, B2 layout, R2.7 sweep, N1, N2, N3
  v2: FAIL (7 failing checks)  rc=1

python3 probes/REQ-FIX-PES/p3_checks.py v3
  pass all seven
  v3: PASS (0 failing checks)  rc=0

tsx probes/REQ-REV-PES-p3/exec.ts
  targetsRejected = PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID
  unvetted = PROVIDER_VENDOR_NOT_VETTED:vendor:a
  published = PUBLISHABLE setVersion=2
  duplicateBuilder = CONFIGURED_PROVIDER_SET_INVALID
  duplicateParser = CONFIGURED_PROVIDER_DUPLICATE
  five S02 refusals as the table above
  layout reader = READ_OK, headerEqualsLiteral = true
  scratch line contains custody path = false
  n1 = CONSTRUCTED; n1 missing integers = PROVIDER_PROBE_FRESHNESS_INVALID
  seed rowCount = 32, roleRef = 0, canonicalProblemCount = 0

python3 probes/REQ-FIX-PES/detectors.py v1 → v1: FAIL (4 failing checks) rc=1
python3 probes/REQ-FIX-PES/detectors.py v2 → v2: PASS rc=0
python3 probes/REQ-FIX-PES/detectors_v3.py → v3: PASS rc=0
wc -l INSTRUCTIONS.md → 99
lane HEAD 776359c3 dirty 0
```

`check_b1_fixture_codes` on `roster-invalid` feeds the SPEC's own uniqueness sentence back through `p3_exec.ts`'s gate flag. That arm cannot see a wrong string if the sentence is present. `exec.ts` is the check that does not do that. The shipped-function arm of the same author check (the `/v2` fixture, the five refusals, the resolver integers, the custody reader) does execute, and it failed on v2 before it passed on v3.

## PREDICTIONS

A reader who starts from `p3_checks.py v3` will PASS this pass and will treat `roster-invalid` as executed. It is the SPEC's sentence, modelled. They will miss that the builder on that same roster still throws `CONFIGURED_PROVIDER_SET_INVALID` the moment the gate is skipped. A security reader will spend the pass on whether `startTestDatabase` can bind `:55432` and will not re-run the five refusal fixtures or the custody read. On any later edit of these two SPECs I would check first that `https://api.acme.example/v2` still throws `PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID` and that a scratch line which stops at `<scratch>` still fails to contain `<scratch>/custody.d`.

## UNVERIFIED

- `pnpm pes:accept-publish-set` and `pnpm pes:accept-hosted` do not exist at this base. No acceptance step was run as a shell a stranger would type. The fixture lines were executed through the shipped functions.
- No connection to `127.0.0.1:55432`. Embedded PostgreSQL was not started. `importHistorical` and `publishGeneral` were not called. The seed file was parsed with `parseCanonicalRegisterJson`.
- The fake vendor was not bound. The resolver was constructed and not awaited. Step 6's `PES-S02 ADMITTED` line was not produced.
- The baseline suites and `pnpm typecheck` were not re-run.
- The REQ-FIX transcript was not opened.
- S03 was not reviewed (N1).
- Pass-2 items that pass 2 itself left outside scope (intake §6–§9, the `REQ.md:24` range, N6, N12's old `:55432` premise) were not re-opened. R1.12 removes the `:55432` premise; the security lens still owns `database.stop()`.

## V-ROW

None.

VERDICT PASS / CONFIDENCE high / STRONGEST COUNTER: the base row was proven in the seed file the named importer reads, not inside a running PostgreSQL, so a failure that exists only in `importHistorical`'s SQL was not seen. The text checks that function shares with `validateRows` (canonical JSON, sourceRef bounds, unique keys) passed on all 32 rows.
