# REQ-REV-p2 — blind review of the requirements, pass 2 of 3 · mission `provider-env-selection`

Seat REQ-REV-PES-p2 · node REQ-REV · pass 2 of 3 · SCOPED to the REQ-FIX closures (pass-1 B1, B2, B3 and N3, N4, N5, N7, N8, N9, N10, N11) over `SPEC-v2.md` of S01 and S02. Lane `.worktrees/pes-base/dialectical-engine` @ `776359c3`, dirty 0 before and after. No product file edited. No git write. Probe log: `.hermes/reports/provider-env-selection/probes/REQ-REV-PES-p2/remeasure.txt`.

The author's detectors pass on v2 and fail on v1. That green run is real and it does not close the class. `detectors.py` `check_b1` passes when six member names appear in a table. `check_b3` passes when every `authorization` code the acceptance prints is listed as lawful. Neither check runs the parser or lays the credential file next to the line the acceptance must print.

Class A — the publish command's inputs still do not determine a row the acceptance can publish. Member: B1.
Class B — a rule forbids a line the acceptance requires. Member: B2.

## B1 — the targets-rejected case names a code the shipped parser does not throw for that input, and the base row the table reads is not in the database the acceptance creates

`slices/S01/SPEC-v2.md:89-96` derives both targets JSON values from the roster, element for element. `SPEC-v2.md:99-102` then parses those values with the shipped `parseProviderDiscoveryTargets`, passing the providers of the row just built. `SPEC-v2.md:199-201` says the fixture that fires this check declares the same `provider_ref` twice, so the printed code is `PROVIDER_DISCOVERY_TARGET_DUPLICATE`.

Feed that roster to the functions the SPEC names.

- The row builder rejects a repeated `providerRef` with `CONFIGURED_PROVIDER_SET_INVALID` before it returns (`packages/register/src/configured-provider-set.ts:82`, called at `:184`). There is no built row whose providers contain the duplicate.
- Pass the duplicate-laden providers array as the parser's second argument and the parser throws `CONFIGURED_PROVIDER_DUPLICATE` while building its map (`packages/providers/src/index.ts:249-256`), before it walks the JSON.
- `PROVIDER_DISCOVERY_TARGET_DUPLICATE` is thrown later, at `index.ts:292-294`, and only when the configured map itself has no duplicate. Reaching it requires a JSON array that repeats a ref the row does not. That split abandons the element-for-element derivation.

Concrete run: roster of two elements, both `provider_ref` `vendor:a`, otherwise valid. Coder A builds the row first and the command dies on `CONFIGURED_PROVIDER_SET_INVALID`, which step 2 does not accept. Coder B parses first with those same providers and prints `PES_PUBLISH_SET_TARGETS_REJECTED:CONFIGURED_PROVIDER_DUPLICATE`. Step 2 requires `PROVIDER_DISCOVERY_TARGET_DUPLICATE`. Coder C dedupes the row and leaves the duplicate only in the JSON, which is the one way to get the code step 2 names, and which `SPEC-v2.md:89-96` forbids. No composition satisfies the derivation, the "row it has just built" sentence, and step 2 together.

Same class, second member. `SPEC-v2.md:86-87` reads `requiredDistinctMakers` and `sealedSourceRef` from "the `configuredProviderSet` row at the BASE register version" in the database. `publishGeneral` takes `baseRegisterVersion` as a caller-supplied argument (`packages/register/src/register-publication.ts:429`, required at `:871` alongside `publicationId`, `rows`, `sourceRef`, and `deployment`). The SPEC names no selector among the versions a database can hold, and it names no seed. `SPEC-v2.md:155-160` and steps 2–3 (`:192-206`) create a database and then require `PES-S01 CASE published`. An empty database has no `configuredProviderSet` row to read, so the publish step 3 requires cannot get the two values the table requires. Coder A imports a bootstrap and copies `requiredDistinctMakers` from it. Coder B invents a refusal and fails step 3. Coder C copies a different version than coder A and publishes a different floor. I did not read the body of `publish_register_version`, so this member does not claim the SQL rejects a one-row snapshot. The block is the SPEC's own read against the database its own acceptance creates.

`detectors.py` `check_b1` cannot see either member: both documents contain the table, the string `REMOVED` next to the old order code, and `PES_PUBLISH_SET_TARGETS_REJECTED`.

## B2 — step 5 prints the directory R2.9 forbids

`slices/S02/SPEC-v2.md:212-214` (step 7) greps for `<the PES-S02 SCRATCH-DIR path>/credential`. That is the credential file path the acceptance is checking. `SPEC-v2.md:143-146` (R2.8) puts that file inside a `0700` directory, which is the custody contract at `deploy/vps/README.md:788-789`: the file sits in the `0700` directory. The parent of `<scratch>/credential` is the scratch directory, so that directory is the `0700` directory.

`SPEC-v2.md:155-158` (R2.9 (iii)) says no line of stdout or stderr contains the absolute path of the credential file or of its `0700` directory. `SPEC-v2.md:204` (step 5) and `SPEC-v2.md:165-167` (R2.10) require a line `PES-S02 SCRATCH-DIR` followed by that directory's absolute path. `slices/S02/PLAN.md:39-40` carries both sentences side by side.

A run that prints the scratch path fails R2.9. A run that omits it fails step 5. Nesting a second `0700` directory under a looser scratch directory makes step 7 grep a path that is not the credential file, so the check passes while looking at the wrong place. The layout step 7 names and the layout R2.8 plus R2.9 allow are not the same layout.

The pass-1 contradiction (R2.9 forbade the word `authorization` while step 4 printed two codes containing it) is gone. R2.9 `:158-161` lists the four codes as lawful, and step 7 no longer excludes `^PES-S02 REFUSED`. `check_b3` tests only that word. It passes on v2.

## N-findings (WHEN, not WHETHER)

N1. `slices/S02/SPEC-v2.md:9-12` and R2.8 `:147-150` list the resolver's arguments as `configuredProviders`, `targets`, a probe store, `fetchImplementation`, and a clock. `createProviderDiscoveryResolver` also requires `probeFreshnessMs` and `probeTimeoutMs` and throws `PROVIDER_PROBE_FRESHNESS_INVALID` or `PROVIDER_PROBE_TIMEOUT_INVALID` when either is missing (`apps/api/src/provider-discovery.ts:44-54`). The loader default for the timeout is `5_000` (`packages/register/src/runtime-environment.ts:331`). An empty in-memory store makes freshness unobservable on the one resolve R2.8 awaits; a timeout of `1` makes the probe ABSENT and step 6's `PES-S02 ADMITTED` line does not print. WHEN: name both integers in R2.8. Timeout: the loader default `5000`, or any integer the fixture's own handshake fits inside, written as that integer. Freshness: one positive integer, written as that integer.

N2. `slices/S02/SPEC-v2.md:156-157` forbids "any substring of [the credential literal] after the scheme word". The literal is `Bearer pes-s02-fake-vendor-token` (`:119-121`). Read as every substring of the tail, the rule fails on any line that contains `e`. Step 7 (`:213`) greps the full token `pes-s02-fake-vendor-token` and nothing shorter. WHEN: replace the clause with that exact token.

N3. `slices/S01/PLAN.md:40` says R1.9 constrains "no credential value and no credential path, anywhere". `slices/S01/SPEC-v2.md:141-144` and step 6 (`:221-223`) admit the credential path in exactly the two `PES_HOSTED_TARGETS_*_V1=` lines. PLAN `:4-6` says the SPEC owns the WHAT. WHEN: rewrite the PLAN cell so the path is lawful only on those two lines.

N4. Packet defect, `packets/REQ-REV-p2.md:31`. The B1 parenthesis says one roster file determines every deployment-row member. Pass-1 B1 said the builder also needs `requiredDistinctMakers` and `sealedSourceRef`, which are not roster fields (`reviews/REQ-REV-p1.md:17`). A seat that scores the parenthesis fails a table that names the database. A seat that scores the finding fails a table whose database row is not in the acceptance database (B1 above). WHEN: the next charge's pass test is "each builder argument has one named source, and that source exists in the database the acceptance creates".

## Closures that hold

Checked against the lane at `776359c3`, not against the detector.

| id | result | evidence |
|---|---|---|
| B2 (pass 1) | closed | S02 depends on no other slice. `SPEC-v2.md:9-16` withdraws the publish reading. `INSTRUCTIONS.md:38-42` says edges none. `slices/S02/PLAN.md:24` strikes S01's command. §5 preamble `:192` and steps 5–6 (`:204-211`) are the refusal lines and the admit line. v1 `SPEC.md` still carries the old header; `git diff --stat 84106e07 -- slices/S01/SPEC.md slices/S02/SPEC.md` is empty. |
| B3 word | closed as a word, class open as B2 | R2.9 `:158-161` names the four codes. Step 7 greps the token and the path. |
| N3 | closed | `provider-probe.ts:103-105` requires `decoded.model === target.model` and `content === "OK"`. R2.5c `:108-114` quotes that body and the 64 KiB ceiling at `:41` and `:91`. |
| N4 | closed | The resolver takes `fetchImplementation` (`provider-discovery.ts:46`, used at `:61`) and the probe calls it (`provider-probe.ts:74`). R2.5b `:100-106` names that seam and forbids `NODE_TLS_REJECT_UNAUTHORIZED` and a trust-store edit. |
| N5 | closed | The runner environment object is `dev-runner-process.ts:81-128`. It has no `DEBATEAI_DEPLOYMENT_MODE` key. R2.2 `:64-68` names that record. The cited range starts at `:85`, inside the object. |
| N7 | closed | Step 2 `:196-198` runs `pnpm vitest run tests/unit/v9-deployment-mode.test.ts -t 'declares DEBATEAI_DEPLOYMENT_MODE=local'` and expects two cases. No current test title contains that literal. R2.2b `:70-73` and `PLAN.md:32` name the same file. |
| N8 | closed | Step 3 `:199-201` records the `lsof` PIDs. Step 10 `:220-221` compares them to that record. |
| N9 | closed | R1.8 `:132` names `PES_HOSTED_PROVIDER_SET_RECEIPT_V1=`. The dev prefix is `DEV_DEPLOYMENT_REGISTER_RECEIPT_V1=` at `dev-deployment-register.ts:104-105`. The dev reader requires that prefix at `:324-326`. The receipt fields match the call at `:878-882`. |
| N10 | closed | The parse calls are `apps/api/src/main.ts:300-302` and `apps/runner/src/main.ts:74-76`. `main.ts:305` and `runner/src/main.ts:81-83` are `assertDeploymentProviderTargets`. SPEC-v2 `:39-42` says so. |
| N11 | closed | Intake §10 item (e) at `00-intake.md:114` ends "a debate ask answered". `slices/S01/DECISIONS.md:103` says the acceptance of (e) is the probe, one completion, `max_tokens: 8`. S02 SPEC-v2 `:45-51` says the same and forbids booting the peer stack. `check_n` does not look for N11; this row is from the files. |

Pass-1 B2's four live dependency sentences are absent from the v2 documents. The historical sentences that remain ("the S01 dependency is GONE", "nothing here waits for S01") are negations. `check_b2` on v2 prints pass, and a separate read of those four sites agrees.

## Outside this pass — named, not re-reviewed

- N1 (intake §6–§9). Current `00-intake.md` has headings §6, §7, §8, §9. I did not compare them to the pre-image.
- N2. `packets/REQ.md:24` still ends the mandated range at `configured-provider-set.ts:5-144`. The builder starts at `:177`.
- N6. `slices/S01/DECISIONS.md:83-90` appends the pin at `tests/unit/v9-deployment-mode.test.ts:142`. I did not re-open the test.
- N12. `slices/S01/SPEC-v2.md:229-231` leaves the scratch database on `:55432` to the S01 security lens. I did not connect.
- S03. Not opened for review. A workspace search brushed `slices/S03/DECISIONS.md`; nothing in it was scored.
- Gap table. `INSTRUCTIONS.md:12-18` is still four GAP cells and one GAP/UNVERIFIED. No cell flipped to BUILT. I did not re-run p1's gap greps. The lane SHA is the one p1 measured.
- Spike. Neither SPEC-v2 repeats `PROVIDER_DISCOVERY_TARGETS_PATH`, "no environment switch", or "no VPS path".

## Charges

1. Skills read as the five SKILL.md files in the handoff. Ticket comments at claim: the orchestrator's DISPATCHED comment only (`comments read through: 1`). Re-read at handoff: that comment plus this seat's CLAIM (`comments read through: 2`).
2. REQ packet read. The stale range is the existing N2, not re-scored. This pass's own packet parenthesis is N4.
3. No BUILT cell to re-measure. Scope kept the gap greps at p1's result.
4. The two-coder failures inside the closures are B1 and B2. Banned words: 0 hits in either SPEC-v2 (word-boundary recheck in the probe log). `ui: no` on both, line 3; acceptance is shell. V-1 is honoured by R1.13 (the roster is not read by a booting service). No real key: the fixture token is `pes-s02-fake-vendor-token`. The exact-set code and the parser allow-list stay unedited (`SPEC-v2.md` S01 §2). The four RED-at-base suites stay pinned in S01 §4; S02 R2.4 still names the two that may change.
5. S02 no longer waits on S01 (pass-1 B2 closed). S02's acceptance still has no output that satisfies step 5 and R2.9 together (B2 of this pass). S01's step 2 targets-rejected case has no output the named functions produce (B1).
6. This file. Detectors re-run: v1 FAIL rc=1 (4 failing checks), v2 PASS rc=0. The v2 pass is quoted above as insufficient.
7. No git write, no product edit, no install, no listener, no real key, no board switch. Lane dirty 0.

## Verification

```
python3 probes/REQ-FIX-PES/detectors.py v1
  FAIL B1, B2, B3, N3-N5,N7-N10
  pass banned, pass trace
  v1: FAIL (4 failing checks)  rc=1

python3 probes/REQ-FIX-PES/detectors.py v2
  pass B1, B2, B3, N3-N5,N7-N10, banned, trace
  v2: PASS (0 failing checks)  rc=0

wc -l INSTRUCTIONS.md → 99
git diff --stat 84106e07 -- slices/S0{1,2}/SPEC.md → empty
python walk: buildConfiguredProviderSetDeploymentRow under apps → no match
python walk: DEBATEAI_DEPLOYMENT_MODE under apps → no match
```

The first shell's `rg` was not on PATH. Its "NO HITS" lines are marked non-evidence in the probe log. The parser, builder, publishGeneral, resolver, probe, custody, call sites, and receipt prefix were re-read at the lines cited. `parseProviderDiscoveryTargets` was not executed.

## PREDICTIONS

A reader who starts from `detectors.py` v2 will PASS this pass: every assigned string is present and v1 still fails. They will miss that a duplicate roster throws `CONFIGURED_PROVIDER_DUPLICATE` at `index.ts:255` before `PROVIDER_DISCOVERY_TARGET_DUPLICATE` at `:292`. A security reader will spend the pass on the scratch database on `:55432` (N12) and will not notice that step 5 prints the directory R2.9 forbids. On the rework diff I would check first that the targets-rejected fixture's printed code is the code those functions throw for that roster, and that one directory layout satisfies R2.9 (iii) and step 5 together.

## UNVERIFIED

- The acceptance commands were not run. `pnpm pes:accept-publish-set` and `pnpm pes:accept-hosted` do not exist at this base.
- No connection to `127.0.0.1:55432`. The SQL body of `publish_register_version` was not read.
- No TLS listener. N4's seam was read, not dialed.
- The baseline suites and `pnpm typecheck` were not re-run.
- The REQ-FIX transcript was not opened. The five SKILL.md paths named in that READY comment exist on disk. Existence is not a load.
- `api.localtest.me` was not resolved again. Pass-1 probe 3 did, and R2.6 was not a closure target.
- S03 was not reviewed.

## V-ROW

None.
