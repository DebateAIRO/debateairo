# REQ-REV-p1 — blind review of the requirements · mission `provider-env-selection`

Seat REQ-REV-PES-p1 · node REQ-REV · pass 1 of 3 · 2026-09-24 · lane `.worktrees/pes-base/dialectical-engine` @ `776359c3` (dirty 0). No product file edited. Probe log: `.hermes/reports/provider-env-selection/probes/REQ-REV-PES-p1/remeasure.txt`.

Class A — the hosted publish command's inputs do not determine the row it must publish. Member: B1.
Class B — S02's acceptance cannot be executed from its own sentences. Members: B2, B3.

## B1 — S01 R1.2 cannot be implemented from the two inputs it allows

`slices/S01/SPEC.md:52-60` composes the hosted set from exactly two inputs: `parseProviderDiscoveryTargets` on the process environment, and a vetting file whose values carry only `data_use_terms_reviewed_on`, `retention_terms_reviewed_on`, and `named_in_privacy_notice`. R1.1 (`SPEC.md:47-50`) requires every entry to carry `providerRef`, `adapterKind`, `maker`, and `vetting`.

The shipped parser does not work that way.

- `packages/providers/src/index.ts:232-234` — `parseProviderDiscoveryTargets(source, configuredProviders)` takes the configured set as its second argument. `apps/api/src/main.ts:300-302` and `apps/runner/src/main.ts:74-77` pass `deploymentMakers.configuredProviders`, the row already published. A ref that is not in that set throws `PROVIDER_DISCOVERY_TARGET_SET_MISMATCH` at `index.ts:295-296`. The parser cannot be the source of a new set; it rejects every ref the set does not already contain.
- `index.ts:264-268` — the JSON allow-list is `provider_ref`, `base_url`, `model`, `authorization_header`, `authorization_file`, `input_price_micros_per_million`, `output_price_micros_per_million`. No `maker`. No `adapterKind`.
- `index.ts:333-336` — the returned sequence is the configured set's order, not the JSON array's order.
- `packages/register/src/configured-provider-set.ts:76-79` — the row is invalid without `adapterKind` and `maker`. `configured-provider-set.ts:178-182` — `buildConfiguredProviderSetDeploymentRow` also requires `requiredDistinctMakers` and a `sealedSourceRef`. Neither is an R1.2 input. Grep of `apps/**/*.ts` finds no caller of that builder (probe 4).

Concrete fork: coder A adds `maker` and `adapter_kind` to the vetting file (contradicts the three-field schema). Coder B hardcodes `openai-compatible-http` and a maker derived from the ref (contradicts "from nothing else"; two adapter kinds exist at `index.ts:807-809`). Coder C changes the parser's allow-list (contradicts "the SHIPPED parser" and the exact-set invariant `SPEC.md:36-37` says stays). All three satisfy a plain reading of some sentence and violate another.

The same class, second member. R1.3 (`SPEC.md:62-64`) refuses with `PES_PUBLISH_SET_ORDER_MISMATCH:` "when the two differ", but the only sequence R1.2 produces is the targets' own sequence, so a command that copies it can never differ. `slices/S01/PLAN.md:9` names a different trigger: the targets and the vetting file disagree. R1.7 (`SPEC.md:77-82`) already maps an absent vetting record to `PROVIDER_VENDOR_NOT_VETTED:`. Acceptance step 2 (`SPEC.md:139`) requires an order-mismatch case anyway. Two coders invent two inputs for one code.

## B2 — S02 acceptance step 5 is two steps, and one of them needs S01

`slices/S02/SPEC.md:7-8`, `INSTRUCTIONS.md:34`, and `slices/S02/PLAN.md:22` say step 5 of §5 publishes the hosted row with S01's command, and that step stays UNVERIFIED until S01 is merged.

`slices/S02/SPEC.md:158-159` is step 5 of §5, and it is the `PES-S02 ADMITTED` / `PES-S02 VENDOR-REQUESTS` lines. It does not publish. No requirement R2.1–R2.11 names S01's command.

Coder A follows the header and INSTRUCTIONS: S02 has no end V can run until S01 is merged (charge 5: a slice that cannot be accepted without another slice). Coder B follows the numbered steps and R2.8 (`SPEC.md:103-108`): an in-process resolver, no publish, and step 5 is the admit line. Both are faithful to text that is frozen together.

## B3 — R2.9 and acceptance step 4 cannot both hold

`slices/S02/SPEC.md:110-113` (R2.9): no line of stdout or stderr contains the literal, the words `Bearer` or `authorization`, or the credential path.

`slices/S02/SPEC.md:154-157` (step 4) requires those lines to include `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT` and `PROVIDER_AUTHORIZATION_FILE_ABSENT:`. Both contain `authorization`. The run command merges stderr (`SPEC.md:151`, `2>&1`).

`SPEC.md:162-166` (step 7) then excludes `^PES-S02 REFUSED ` lines from the grep, which concedes the words are on stdout. A run that prints the codes fails R2.9. A run that keeps R2.9 fails step 4. There is no output that satisfies both.

## N-findings (WHEN, not WHETHER)

N1. Orchestrator, freeze `c3ade5f1..84106e07`. Regenerating the §5b table deleted intake §6, §7, §8, and §9. `INSTRUCTIONS.md:54` still points at §6, §7, §8. `slices/S01/DECISIONS.md:27` cites "intake §6". Current `00-intake.md` jumps from §5b to §10. WHEN: restore §6–§9, or retarget those two pointers, in one edit. Do not restore §6's sentence "no environment switch exists"; `DEBATEAI_DEPLOYMENT_MODE` is on dev and that sentence was already false. The REQ-REV packet line 9 says the same diff "is EXACTLY what the seat under review wrote"; comment 1 on t_2dde0556 assigns the intake and V-2 edits to the orchestrator. The comment is the reading that matches the diff.

N2. Packet defect, `packets/REQ.md` charge 2. The mandated range `configured-provider-set.ts:5-144` ends before `buildConfiguredProviderSetDeploymentRow` at line 177, which is the row S01 publishes. The seat cited 177 anyway. WHEN: a REQ-FIX packet's range includes the builder signature through line 195. This is how B1's missing fields survived a careful seat.

N3. `slices/S02/SPEC.md:78-80` (R2.5c) says the fixture answers with "an OpenAI-shaped body". `packages/providers/src/provider-probe.ts:103-105` marks the target ABSENT unless `decoded.model` equals the target's model and `choices[0].message.content` is exactly `OK`. A generic 200 body fails R2.8 (`SPEC.md:106-108`). WHEN: quote that body in R2.5 before BUILD.

N4. `slices/S02/SPEC.md:76-77` (R2.5b) requires the fixture to serve TLS and names no trust anchor. `provider-probe.ts:74` calls `fetchImplementation` with no custom CA. Node's default `fetch` verifies the certificate; a self-signed listener makes the probe ABSENT (`provider-probe.ts:115-123`), so the ADMITTED line never happens. WHEN: name the trust mechanism — a fixture-supplied `fetch` that trusts the fixture CA. Not `NODE_TLS_REJECT_UNAUTHORIZED`, and not a trust-store edit on V's Mac.

N5. `slices/S02/SPEC.md:48-49` (R2.2) says the runner environment sets the mode "by the same means" as `DEVELOPMENT_API_ENVIRONMENT_KEYS`. The runner environment is a separate object in `apps/runner/src/dev-runner-process.ts:90-128` and does not carry `DEBATEAI_DEPLOYMENT_MODE`. WHEN: name that record as the place the key is set to `local`.

N6. Citation, not an unpinned BUILT. `slices/S01/DECISIONS.md:29` and `V-DECISIONS-PACKET.md:6` pin the hosted inline refusal on `tests/unit/v9-provider-credential-files.test.ts:110`. That test's body only asserts the file target does not throw. The assertion that hosted inline credentials throw `PROVIDER_INLINE_CREDENTIAL_REFUSED:provider-1` is `tests/unit/v9-deployment-mode.test.ts:142`. WHEN: point the citation at line 142.

N7. `slices/S02/SPEC.md:144-146` step 2 runs "the suite PLAN.md names", then gives an example command. `slices/S02/PLAN.md:30` leaves the step-id cell empty, which charge 6 of the REQ packet required. The frozen acceptance therefore names no file. WHEN: ARCH writes the path into PLAN, and the SPEC's example is replaced with that path.

N8. `slices/S02/SPEC.md:168-169` step 9 compares `lsof` PIDs on `:3000` and `:8790` with "the same PIDs they listed before step 3". No earlier step records them. WHEN: add a record step before step 3.

N9. `slices/S01/SPEC.md:84-86` (R1.8) says the receipt line "begins with a named receipt prefix" and never names it. The cited shape `apps/runner/src/dev-deployment-register.ts:878-882` is the returned object. The stdout prefix the dev CLI actually prints is `DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX` (`dev-provider-set-publish-cli.ts:26-28`). WHEN: name the hosted prefix as a literal in R1.8.

N10. `slices/S01/SPEC.md:55-56` cites `apps/api/src/main.ts:305` and `apps/runner/src/main.ts:82` as the parse. Both lines are `assertDeploymentProviderTargets`. The parse calls are `main.ts:300` and `runner/src/main.ts:74`. WHEN: fix the two numbers.

N11. Intake §10 item (e), `00-intake.md:88`, ends "a debate ask answered". S02's acceptance stops at panel join on the probe (one completion, `max_tokens: 8`). No requirement boots a debate, and doing so would touch the NO-TOUCH stack. WHEN: one sentence in `slices/S01/DECISIONS.md` that the probe is the acceptance of (e), so a coder does not start the peer's API.

N12. `slices/S01/SPEC.md:101-106` (R1.12) and acceptance step 4 (`SPEC.md:145-148`) create and drop a database on `:55432`, which COMMON §6 marks NO-TOUCH. The text forbids writing the `debateai` database and forbids a listener. It does not name the role, the URL, or a `finally` drop. WHEN: the security lens at REV(S) checks the drop runs on every exit and the name cannot collide with `debateai`. I did not connect (UNVERIFIED).

## Gap table re-measured (charge 3)

Lane @ `776359c3`. No cell in `slices/S01/DECISIONS.md:12-17` or `INSTRUCTIONS.md:12-18` is BUILT. Each GAP was checked against the code, not against the author's prose.

| item | re-measure | result |
|---|---|---|
| (a) hosted publication path | No `apps` caller of `buildConfiguredProviderSetDeploymentRow`. Dev CLI imports `developmentConfiguredProviderPanel` (`dev-provider-set-publish-cli.ts:12`) and the publisher hard-codes `deployment: "local"` (`dev-deployment-register.ts:873`). README:862 states there is no hosted command. No `"production:` ref under `apps` or `packages`. `publishGeneral` does have dev callers (`dev-deployment-register.ts:865` and `:927`); both pass `deployment: "local"`, so they do not close the gap. | GAP holds |
| (b) README §11 example and table | Price members and the six codes named at README:25-27 occur only in the known-stale notice (README:19-27). The member table (README:841-846) and the worked example (README:848-849) have no price members. The refusal table (README:770-782) does not carry those six codes. The pin constant `PROVIDER_CREDENTIAL_REFUSAL_CODES` is three codes (`index.ts:740-744`) while `index.ts:727-731` says the §11 table cannot drift. | GAP holds |
| (c) localhost never declares the mode | No `DEBATEAI_DEPLOYMENT_MODE` under `apps/`. Absent from `DEVELOPMENT_API_ENVIRONMENT_KEYS` (`dev-api-environment.ts:36-78`). Absent outside production resolves to `local` (`runtime-environment.ts:85-96`), pinned by `tests/unit/v9-deployment-mode.test.ts:264`. | GAP holds |
| (d) probe cost guard | `probe_freshness_ms` is `z.number().int().positive()` (`packages/register/src/index.ts:457`). The probe sends `max_tokens: 8` (`provider-probe.ts:82`). The dev seed publishes `600_000` (`dev-deployment-register.ts:344`). No mode-aware floor. The need stays UNVERIFIED and is V-7, not a slice. | GAP in the mechanism holds; need stays UNVERIFIED |
| (e) Mac-runnable hosted acceptance | No `hosted` hit under `acceptance/`. | GAP holds; the debate-ask clause is N11 |

Intake §10's BUILT bullets, which are not gap-table cells: the mode switch is pinned by the cases at `v9-deployment-mode.test.ts:248-273` (names match S02 R2.3). The credential-file contract is shipped (`index.ts:757-760` is the file-to-header function; README:784 is the contract heading; `runner.env.example:52-55` says the credential is a file and an inline header is refused). The inline refusal itself is pinned at `v9-deployment-mode.test.ts:142`, not at the line the V packet cites (N6). `v20-optional-primary-provider-keys.test.ts:155-161` pins `DEBATEAI_DEPLOYMENT_MODE=hosted` and `PROVIDER_DISCOVERY_TARGETS_JSON` in `runner.env.example`. I did not re-run the suites; the intake pairs stand as cited, not as a fresh run.

No requirement repeats the spike's stale claims ("no VPS path", "no environment switch", inline keys, `PROVIDER_DISCOVERY_TARGETS_PATH`). The DECISIONS rows reject them. `api.localtest.me` resolves to `127.0.0.1` and `::1` on this Mac today, and `isRefusedHostedProviderHost` (`index.ts:584-592`) decides on the literal and admits a name that is not in the localhost list. R2.6's admission claim matches the code. S03's greps are a beginning and an end V can run with no other slice; it is vertical.

## Charges

1. Skills read as markdown, listed in the handoff. Ticket comments read: orchestrator DISPATCHED, then this seat's CLAIM. Author REQ-PES READY names using-superpowers, heartbeat-protocol, heartbeat-requirements, brainstorming. Home copies of the two heartbeat skills are byte-identical to the repo copies. Floor met. No fabrication finding.
2. REQ packet ranges matched the intake at `c3ade5f1` (`:82` callers, `:97` spike stale, `:100` slicing, `:108` what dev has). They do not match today's intake, because N1 deleted those sections after the seat ran. The short builder range is N2.
3. Gap table re-measured above. No false BUILT. No GAP the code already covers. N6 is a wrong line for a real pin.
4. Requirements are numbered. Banned words occur only in `slices/S01/PLAN.md:7-9` and `slices/S02/PLAN.md:7-9`, as the named counter-example, in no criterion. `ui: no` on all three SPECs; acceptance is shell, not a browser. V-1..V-6 held: one switch, no hostname check, no second composition path, no real key, exact-set code and credential-file contract and sealed v1 constants (`R1.10`) left untouched. The four RED-at-base suites are pinned at their pairs in S01 and S03; S02 R2.4 names the two that may change and the two that stay. B1 and B3 are the requirements two coders cannot build the same way.
5. S01 and S03 are vertical. S02 is not, under the header reading (B2).
6. This file. Probe log written. No new V row.
7. No git write, no product edit, no install, no NO-TOUCH listener, no real key, no board switch.

## PREDICTIONS

A second reader who starts from the gap table and the `ui:` flags will PASS: (a)–(e) re-measure as real gaps and the compass is under 100 lines. They will miss that `parseProviderDiscoveryTargets` cannot mint the set R1.2 asks it to publish. A security-minded reader will spend the pass on the scratch database on `:55432` (N12) and will not notice that R2.9 forbids a word step 4 must print. On the rework diff I would check first that `maker` and `adapterKind` gained exactly one named source, that the parser allow-list at `index.ts:264-268` is untouched, and that one S02 step-5 sentence remains.

## UNVERIFIED

- The three acceptance commands (`pnpm pes:accept-publish-set`, `pnpm pes:accept-hosted`, the S03 vitest line) were not run. The first two scripts do not exist at this base. Marking a step runnable means the text names a command and an expected line, not that a process was started.
- No connection to `127.0.0.1:55432`. Whether this Mac's dev role can `CREATE DATABASE` is unchecked (N12).
- No TLS listener. The certificate failure in N4 is read off `provider-probe.ts:74` and Node's default `fetch`, not observed on a socket.
- The 36 baseline suites and `pnpm typecheck` were not re-run. Pairs are the intake's, dated 2026-09-24 13:34–13:37.
- The author's transcript was not opened. The SKILLS LOADED paths were compared to files on disk (probe 10).

## V-ROW

None.
