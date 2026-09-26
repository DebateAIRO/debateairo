# ARCH-REV-PES-S02-p1 self-report

treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause

The plan and the probe that "proved" it name different Node functions and call both of them `lookup`. `spike-hosted-chain.ts:8` imports `promises as dns` and awaits `dns.lookup(host, { all: true })`. `PLAN.md:624` defaults `deps.lookup` to `node:dns` `lookup`, the callback export, and `PLAN.md:708` calls that export with the promise signature. The same value is then passed to `https.request`, which only invokes a callback. A reviewer who reads the spike log (`SPIKE DNS api.localtest.me -> 127.0.0.1/v4,::1/v6`) and stops there will sign the plan. The log is true of the promises API. It is not a run of the call the plan writes.

## Price

- B1, the split lookup. If BUILD types `PLAN.md:708` as written, the first `pnpm typecheck` fails (the callback overload wants three arguments) and the first real `pnpm pes:accept-hosted` prints `FAIL internal`. If they instead copy the spike's import, which is the evidence the plan tells them to trust, `https.request` sits until timeout: measured 2018 ms on a dead port, and the acceptance's own probe timeout is 5000 ms, so every failed guess looks like a TLS problem. That is the expensive misdiagnosis: an hour or more inside the certificate and the trusting fetch, which already work (spike re-run, 253 ms, seam admitted). The repair is one sentence (`util.promisify` on the callback lookup; `.address` on each result). A rework pass is the right place for it only because the plan text and the spike disagree; folding the sentence into a BUILD comment is cheaper if the orchestrator will actually edit the line BUILD reads. Tokens: one architecture pass versus one hung debug loop. The hung loop costs more, because it reads `provider-probe.ts` and the certificate code to explain a timeout whose cause is the lookup argument.
- N1, the 9/3 checkpoint. Hand-written. Case (b) already gets `DEV_API_ENVIRONMENT_DRIFT` from the code that exists today, so the pre-production count is 10/2. A seat that "fixes" the test to make the plan's sentence true edits a correct test. Price: one RED/GREEN cycle on `dev-api-environment`, tens of minutes, zero product change. A script that classifies each new `it` as fail-before-production or already-green would have printed 10/2.
- N2, the unlabelled `{"error":"SESSION_REQUIRED"}`. Minutes. A same-sentence EXACT/CONTAINS check on any line containing `{"` catches it. I swept the file; it is the only one.
- N3, "newest `agent-*.jsonl`". Already paid once: the architecture seat spent a comment identifying its own transcript because three agents started within a second. It will pay again on every parallel dispatch. The generator has the agent id when it launches the seat. Writing "newest file" is the bug.

## What I nearly got wrong

I nearly passed the DNS line. The re-run spike log matches the seat's log on all five refusal codes, the admission panel, and `1 matched 0 rejected`. That agreement is real and it does not cover `PLAN.md:708`. The catch was opening the spike's import, then calling the callback `lookup` with two arguments (throws `ERR_INVALID_ARG_TYPE`) and passing the promises `lookup` to `https.request` (times out). Either measurement alone is the wrong function; together they show no stock function satisfies both call sites.

I also nearly filed the `register-support-publication` source pin as a cluster that cannot go green. `:350-355` only forbids `SUPPORT_CONFIG_OPERATOR_DATABASE_URL` inside the key list. Adding `DEBATEAI_DEPLOYMENT_MODE` leaves the pair at 14/1, which C1's re-run already shows (14 passed / 1 failed, the unrelated snapshot hash). Same dead end for `dev-runner-process`: the green case uses `toMatchObject`, so an extra key does not move 8/0. And for `dev-custody-root`: it forbids the text `0o700` in `dev-api-environment.ts`, and the plan does not put `0o700` there. Those three readings took most of the pass and produced no finding. They were the right readings. The cluster's final pairs are reachable.

## Dead ends, so the next seat does not repeat them

- Key list length is 41 (`dev-api-environment.ts:36-78`). Appending one key is 42. The "41 to 42" sentence is not a line-count gate; the done-criterion is the row.
- The nine green DEV-09 cases rebuild the previous file from a fresh assemble. After the new row exists they still match the old predicates. DEV-09 stays red at `:176` because `EVALUATOR_DATABASE_URL` is still not a key. Final pair 11/1 does not depend on fixing DEV-09.
- The five red DEV-10B cases fail at `EVALUATOR_DEV_MENU_ENABLED` (`"true"` in the default fixture, `"false"` in the pin), which is before the new exact-map entry. They stay five failures. The new case is on the support-preview profile, which already passes. Final pair 6/5 holds.
- `support-config-principals.test.ts:202` compares assembled keys to the constant, so it stays aligned, and it names `:55432`. The plan is right to leave it unrun.
- C2 and C3 paths are absent at base. Running `run-suites.sh` on them would print BROKEN. That is why the plan omits them. Not a defect.
- V-12's pnpm fact reproduced: with `node_modules` present, `[ELIFECYCLE]` is on stdout and the banner is on stderr. An empty `node_modules` adds a `[WARN]` after that line; the lane has `node_modules`, so the acceptance does not.

## Where this packet was unclear

Charge 3 says re-run every cluster command. The input list says re-run the architecture seat's probes and never trust them. Those are different sets. I did both: C1 from my own `.sh`, the six-path absence check, the spike, and the pnpm streams. The DNS finding is not in either set; it is a call in the plan that the spike log appears to cover and does not. A packet that said "a measured call proves the import it names, not a different import" would have aimed the pass at `spike-hosted-chain.ts:8` versus `PLAN.md:624` immediately.

Charge 5's "V-1..V-13 honoured" includes six rows that do not touch this slice (V-8, V-9, V-10, V-11, V-13, and V-3's roster). Honouring them is "do not contradict", which is a short check, but the sentence reads like each row changes S02.

`PLAN.md:498` "12 names" looked like an off-by-one until `FakeVendor` in the `where` clause was counted as the twelfth. Not a finding. A packet that asks for an export list should require the list as names, not a count plus a prose block.

## Upgrades, by tokens saved

1. One import per measured call. If a probe awaits `dns.promises.lookup`, the plan's default is that import, and a second call site that needs the callback form is a second parameter. This single rule saves the hung-TLS debug and would have made B1 impossible to write down.
2. Name the agent id in the packet. "Newest jsonl" is wrong whenever two seats share a session. Already paid, will pay again.
3. Generate the pre-production RED count from the new tests' assertions (does this `it` expect a throw the current code already makes?) instead of a hand-written fraction. Saves the false 9/3 and the test edit it invites.
4. A one-line lint: every plan line containing `{"` must contain EXACT or CONTAINS. Saves N2 and every repeat of it.
