# ARCH-REV(S02) pass 1 of 3 — blind review of the S02 plan

Seat ARCH-REV-PES-S02-p1 · ticket t_8ba9458e · lane `.worktrees/pes-s02/dialectical-engine` @ `776359c3`, dirty 0, read-only. Plan under review: `docs/missions/provider-env-selection/slices/S02/PLAN.md` (freeze `407a1397..37446fa0`, which touches only `PLAN.md` and `DECISIONS.md`). SPEC of record: `slices/S02/SPEC-v3.md`.

## Verdict

VERDICT REWORK / CONFIDENCE medium / STRONGEST COUNTER: a coder who already knows `util.promisify` will wrap the callback `lookup` in one expression, the tests will go green, and a full architecture pass is a large price for that sentence. The counter loses because the plan's own spike imports the other function (`probes/ARCH-PES-S02/spike-hosted-chain.ts:8`, `promises as dns`), and passing that function to `https.request` as the plan's single `deps.lookup` does not connect: measured `req-timeout` at 2018 ms (`probes/ARCH-REV-PES-S02-p1/promise-lookup-as-https.log`). Two of the three repairs the text suggests do not produce `PES-S02-ACCEPT: PASS`.

## Findings

### B1 — one `deps.lookup` is specified as two Node functions, and the acceptance cannot reach PASS on either stock function

`PLAN.md:623-624` types `lookup` as `LookupFunction` and defaults it to ``node:dns`` `lookup`. That export requires a callback (`node_modules/@types/node/dns.d.ts:125-129`). `PLAN.md:708` calls it with no callback: `deps.lookup(FAKE_VENDOR_HOST, { all: true })`. The same value is handed to `https.request` (`PLAN.md:573`) and `tls.connect` (`PLAN.md:579`, `:711`).

Concrete inputs, measured on node v26.9.0 in this pass:

- Callback `lookup("api.localtest.me", { all: true })` throws `ERR_INVALID_ARG_TYPE` — `The "callback" argument must be of type function. Received undefined` (`probes/ARCH-REV-PES-S02-p1/dns-callback.log`). `PLAN.md:698` maps an unexpected throw to `PES-S02-ACCEPT: FAIL internal` and does not print the message. Case 6 (`PLAN.md:663`) requires the last line `PES-S02-ACCEPT: UNVERIFIED dns ENOTFOUND`. That line is not produced.
- `dns.promises.lookup`, which is what the feasibility spike actually calls (`spike-hosted-chain.ts:8,40`) and what returns `[{address:"127.0.0.1",family:4},{address:"::1",family:6}]`, does not satisfy `https.request`'s callback `lookup`. Passed through as the plan's one value, the request hits its timeout (`promise-lookup-as-https.log`: `req-timeout ms 2018`) and never errors with a DNS code.

`PLAN.md:756` marks S02-S19 done only when `pnpm pes:accept-hosted` ends on `PES-S02-ACCEPT: PASS`. Neither stock function, used as the single `deps.lookup` the plan writes, reaches that line. The test stub is specified as both a return value and a callback (`PLAN.md:504`, `:663`), so the eight cases can go green against a stub while the real CLI does not. The repair the plan has to name: keep `node:dns` `lookup` (the callback) as the value `https.request` and `tls.connect` receive, and await `util.promisify(deps.lookup)(host, { all: true })` for the pre-check, reading each result's `.address` (the `{all:true}` element is `{address, family}`, which case 6 already shows at `:665`). Class: one binding, two call shapes. Swept the other Node calls in S02-S14 and S02-S18 (`spawnSync` for `lsof` and `openssl`, `https.request` itself); this is the only member.

### N1 — the pre-production RED count for dev-api-environment is 10/2, and the plan says 9/3

`PLAN.md:57` says that after S02-S04 and before any production step the suite is **9 passed / 3 failed**, "DEV-09 plus the two S02-S03 cases". `PLAN.md:370` says both new cases fail their `endsWith` assertion.

Case (a) does fail there: its `endsWith` is at `PLAN.md:343`, and the row does not exist before S02-S05. Case (b) (`PLAN.md:350-368`) has no `endsWith`. It writes a chopped file and expects `DEV_API_ENVIRONMENT_DRIFT`. That throw is already what `publishExactFile` does when every previous-source predicate returns false (`apps/runner/src/dev-api-environment.ts:284-287`), and the custody guards in front of it run on the fixture tree, not on `api.env`. Base is 9 passed / 1 failed (DEV-09, `baseline-intake-suites.log:346`). Adding one failing case and one already-green case is **10 passed / 2 failed**.

A seat that rewrites (b) so the checkpoint reads 9/3 changes a test the final pair does not need changed. The final C1 pair `11:1` is still reachable: the nine green DEV-09 siblings build their previous file from a fresh assemble, so once S02-S05 appends the row they keep passing through the existing predicates, and DEV-09 still dies at `tests/integration/dev-api-environment.test.ts:176` on `EVALUATOR_DATABASE_URL`. Fold: correct `:57` and `:370` to 10/2, and leave (b) as a DRIFT test. WHEN: before BUILD codes S02-S03.

### N2 — one JSON example is unlabelled

`PLAN.md:382` embeds `{"error":"SESSION_REQUIRED"}` with no EXACT or CONTAINS on the line or the three lines above it. Every other `{"…"}` example in the plan is marked EXACT (the parser listed them at `:516`, `:517`, `:521`, `:601-605`, `:714`). This one is the mock body the existing support-preview case already uses; label it EXACT. WHEN: the same fold as N1.

### N3 — packet defect: "the newest agent jsonl" does not name the seat

`packets/ARCH-S02.md:23` tells the architecture seat its transcript is the newest `agent-*.jsonl` under the orchestrator's `subagents/` directory. Three seats were dispatched together. At this review the newest file is `agent-a03aa13cd0b01b6b1.jsonl` (mtime 2026-09-25 09:40); the S02 transcript the author claimed is `agent-a19b961f9def28575.jsonl` (09:39). The author already reported the collision on t_b4187218. The generator should name the agent id. This does not by itself force the plan rework; B1 does. The author's `SKILLS LOADED` line names the architecture floor (using-superpowers, heartbeat-protocol, heartbeat-architecture, brainstorming, writing-plans). I did not open that transcript's body.

## What was checked and held

Cluster command of `PLAN.md` §3, re-run from `probes/ARCH-REV-PES-S02-p1/C1-base.sh` at `776359c3`. Marker `CLUSTER_RED`. Counts agree with the architecture seat's `C1-base-run2.out` line for line: v9 201/0 against 203/0, dev-api-environment 9/1 against 11/1, dev-api-process 5/5 against 6/5, and the other five already at their pairs (8/0, 7/0, 16/0, 3/0, 14/1). Not BROKEN.

C2 and C3 name only paths the plan creates. `run-suites.sh` marks a missing file BROKEN, so the base run is the absence check (`C2-C3-absent.out`): all six paths `ABSENT-AT-BASE`. The omission stands.

The hosted-chain spike re-run (`spike-hosted-chain.log`, 253 ms) agrees with the seat's log: the five R2.7 messages match, admission panel is `vendor:a` / `Acme` / `fake-model`, vendor counts `1 matched 0 rejected`, scratch removed, port 4460 free afterwards. No disagreement with a recorded verdict.

pnpm 11.20.0, with `node_modules` present so the fixture matches theirs (`pnpm-streams-with-modules.out`): a failing script's stdout is `FAIL` then `[ELIFECYCLE] Command failed with exit code 1.`; the `$` banner is on stderr. V-12's measurement holds, and S02-S19's exit-0 default follows it. V-13's opposite rule is S01's and stays per slice.

Trace, own parser over SPEC headings `R2.1`–`R2.11` (including `R2.2b`), PLAN §2, and PLAN §10: 12 requirements and §5 each have at least one step; all 20 steps `S02-S01`–`S02-S20` have a requirement; zero gaps, zero orphans.

V-1 through V-13: the plan declares the mode at assembly time and does not sniff a hostname (V-1); it adds no second key path (V-2); it pins no probe-freshness floor and uses the existing `600000` (V-7); the credential is the fixed literal `Bearer pes-s02-fake-vendor-token` (V-5). V-8, V-9, V-10, V-11 and V-13 name other slices and the plan does not contradict them. The four RED-at-base suites: the two R2.4 names move only by the new cases (final pairs `11:1` and `6:5`, base failures kept); `dev-provider-panel` `3:1` and `t16-algorithm-register` `20:1` stay in §4 V2. No real key in the plan. Listeners at review time: `:4310` and `:55432` only. The fixture's candidates are 4460–4499, excluding the NO-TOUCH set and 4455 (`PLAN.md:486-488`). `ui: no`; there is no `## Screens` block to omit.

Production steps S02-S05, S06, S07, S08, S14, S18 and S19 each name a case that goes RED when the step is omitted. S02-S03 (b) and S02-S04 (ii) name the guard and the guards that fire first; the five refusal guards are at `PLAN.md:607-617`. No done-criterion depends on a later cluster: C3 starts after C2, and S02-S19 is after S02-S18 in the same cluster. Banned words appear only in the counter-example paragraph (`PLAN.md:12-14`).

## PREDICTIONS

A security pass on this plan will clear the fake token and the `0700`/`0600` layout and will not open `dns.d.ts`. A tests pass will re-run C1, see `CLUSTER_RED` match the recorded log, and accept the 9/3 sentence because it was never executed. The check that separates those from this pass is whether they treated `node:dns` `lookup` and `dns.promises.lookup` as one function.

## V-ROW

None.

## UNVERIFIED

The post-change tree was not executed. The plan creates it, and this seat writes no product code. The claim that C1's final pairs `11:1` and `6:5` are reachable is a reading of the current predicates and the nine green DEV-09 cases plus the five green DEV-10B cases, not a vitest run of the edited files. The author's transcript body was not opened, so the `SKILLS LOADED` line was checked against the floor by the names in the READY comment only. `receiving-code-review` was not loaded: no finding is contested.
