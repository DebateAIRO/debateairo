# T0 SELF-REPORT — baseline pin seat (Opus 5, session opus-t00-w0)

Case file, not a diary. Cause named, each finding priced.

---

## 1. The headline cause: the checkout was never `generate:contract`-ed

**Cause.** `packages/contract/package.json` declares `"exports": "./generated/client.ts"`.
`packages/contract/generated/` does not exist in this checkout. That single missing
generated artifact is the root cause of ALL THREE pins being red:

- typecheck: 40 of 157 errors are `TS2307 Cannot find module '@debateai/contract'`, and a
  large share of the remaining `TS7006`/`TS18046` (`implicitly any` / `is of type 'unknown'`)
  are the downstream inference collapse caused by that one unresolved module.
- vitest: 56 of the ~66 error blocks are the same module failing to resolve; 73 test FILES
  never loaded at all.
- ceremony: `ERR_MODULE_NOT_FOUND` on
  `node_modules/@debateai/contract/generated/client.ts`, one second in, before a database,
  a relay, or a single provider token.

The generator exists (`packages/contract/src/generate.ts`, wired as
`generate:contract`) and is the FIRST step of `pnpm run build`
(`build = generate:contract && typecheck && …`). It is not a step of `typecheck` or `test`.
So `pnpm run typecheck` and `pnpm test` are **not runnable in isolation from a clean
checkout** — they silently presuppose a prior `build`.

**Price.** The entire ceremony third of T0 is unreachable, and the ticket cannot meet its
DoD ("the ceremony's settled run id / answer id"). Not fixable from this seat: writing
`packages/contract/generated/client.ts` is a write into the primary checkout, which D5 and
my contract forbid absolutely.

**The upgrade.** Two lines in T0's own packet would have caught this in two seconds:

```
node -e "require.resolve('@debateai/contract')"      # or
./node_modules/.bin/tsx -e "import('@debateai/contract')"
```

A **can-it-import smoke check belongs in every preflight**, ahead of ports and credentials.
The packet's preflight tested three things that were all fine (ports free, credential format,
claude handshake) and none of the one thing that was fatal. Preflights should test the
CHEAPEST FATAL CONDITION FIRST, and "does the entry file resolve its imports" is the
cheapest fatal condition that exists.

---

## 2. What repeatedly cost tokens / wall-clock

| # | Item | Price | Cause |
|---|---|---|---|
| 1 | Nested-CLI hang on the claude handshake | **3 min** hard timeout, 1 wasted attempt | My session exports `ANTHROPIC_API_KEY` + `ANTHROPIC_BASE_URL`; the child `claude` inherited them, reported `[claude-code:unrecognized_model] {"model":"deepseek-v4-flash-sovereign","query_source":"sdk"}` and then hung instead of erroring |
| 2 | Cold `pnpm install` inside the first `pnpm run typecheck` | **42.7s of the 59s** first run | node_modules was not materialized (OneDrive-backed checkout); an unwary seat would have attributed all 59s to `tsc` |
| 3 | Single vitest run | **515.22s** | Embedded PostgreSQL integration tests on a OneDrive-synced path. Makes the §3 three-run rule a ~26-minute commitment for this one cluster |
| 4 | Tracing the relay env/binary seam before spending the ceremony | ~6 min of reads | Necessary and it PAID — see §3 |

Item 1 is the interesting one: **the packet predicted it and prescribed the exact fix**
(`retry ONCE with a sanitized env`), and the fix worked first try. That is a packet doing its
job. Keep that pattern.

---

## 3. What I nearly got wrong

**I nearly spent the one authorized ceremony attempt with my own session env.** The relay
allowlist (`relay-core.ts` `buildCliChildEnvironment`) is
`COMMON = [HOME, PATH, TMPDIR, LANG]` plus, for the claude adapter,
`["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "USER", "LOGNAME"]`. My gateway
`ANTHROPIC_API_KEY` **is** on that allowlist and would have crossed the seam, while
`ANTHROPIC_BASE_URL` is **not** — so the relay child would have received my gateway key
pointed at the default endpoint. That is a contaminated baseline that would have looked like
a product failure. I caught it only because I read the allowlist before running.

**Generalise:** when a harness declares "subprocesses never inherit the API environment",
read the allowlist rather than trusting the comment. It was a partial allowlist, and the one
key it did pass was the one that would have poisoned the measurement.

**I also nearly mis-read the vitest verdict.** `Test Files 83 failed | 134 passed (217)`
against `Tests 15 failed | 1006 passed (1021)` looks contradictory. It is not: 73 files
failed at COLLECTION, so their tests were never counted in the 1021 denominator. Reporting
"15 failures" without that caveat would have understated the damage by an order of
magnitude, and reporting "83 failures" would have overstated the test-level damage. Both
numbers must travel together, always.

---

## 4. Dead ends — do not re-derive these

- **`acceptance/main.ts` is not the ceremony.** goal-prompt and packet both say so. Correct:
  `run-acceptance.ts` is the ceremony, `main.ts` is the server bootstrap. Verified.
- **There is no supported way to point the relays at a different CLI binary.**
  `CLAUDE_BINARY`, `CODEX_BINARY`, `GROK_BINARY` are `as const` string literals;
  `resolveTestGuardedCommand` throws unless `NODE_ENV === "test"`. Do not go looking for an
  env override — there isn't one, by design.
- **Do not reach for the test-only fake CLIs to get a green ceremony.** README is explicit
  that the fake codex/claude live only in `*.test.ts` and `test-fixtures/`, and runtime
  entry points reject those seams outside `NODE_ENV=test`. Using them would be fabricated
  runtime evidence (protocol §5).
- **The `[claude-code:unrecognized_model]` stderr line is harmless to the relay.**
  `relay-core.ts:157` does `child.stderr.resume()` and parses stdout only
  (`Buffer.concat(stdout)` at :188). I checked this specifically so it would not be
  misdiagnosed later as `CLAUDE_CLI_OUTPUT_INVALID`.

---

## 5. Portability defect that will bite the next seat

```
acceptance/claude-relay.ts:27  CLAUDE_BINARY = "/Users/vladmihaimiron/.local/bin/claude"
acceptance/grok-relay.ts:12    GROK_BINARY   = "/Users/vladmihaimiron/.grok/bin/grok"
acceptance/model-shim.ts:15    CODEX_BINARY  = "/Applications/ChatGPT.app/Contents/Resources/codex"
```

Two of the three relay binaries are absolute paths into a **different user's home
directory**. This host has users `Shared`, `administrator`, `stefan.nour` — no
`vladmihaimiron`. Measured: claude MISSING, grok MISSING, codex EXECUTABLE.

Consequence: even with the contract artifact generated, the discovered panel on this host is
**M=1 (codex/OpenAI only)** — not the M=2 that packet §2 and DECISIONS D6 assert, and not
enough for the FAIR-01 fair-debate gate (which needs an attack edge between nodes of
DIFFERENT makers) or the M≥2 global DoD. D6's premise ("grok CLI is absent → panel is
codex + claude, M=2") is **false on this host**: claude is absent from the relay's point of
view too, because the relay does not use `PATH`.

This is the second reason the packet's preflight was not a valid proxy: it tested
`claude -p ping` resolved through **`PATH`**, which succeeds here, while the relay spawns an
**absolute hardcoded path**, which cannot. A preflight must exercise the same resolution
mechanism as the code it is gating.

---

## 6. Where the packet was unclear or wrong

1. **BLOCKED branch is under-specified.** Its only named trigger is a failing claude relay
   handshake. Mine succeeded; the ceremony still could not run, for a cause the packet did
   not contemplate. I applied the prescribed disposition (`waiting_resource` + BLOCKED
   marker + deliver the other two pins) because it plainly fits, and said so openly in the
   report. A packet should state the disposition for "ceremony cannot produce its
   deliverable for ANY reason outside the seat's write contract", not enumerate causes.
2. **D6 asserts a 2-maker panel as fact.** It is not verifiable on this host and is false
   here. Worker contract §1 calls a quoted constant that is not verifiable a defect.
3. **Mission `INSTRUCTIONS.md` does not exist**, and `slices/` is empty — no `SPEC.md`, no
   `PLAN.md`. Worker contract §1 orders me to read all three before writing anything. For a
   pure-measurement ticket the packet was self-contained, so this was non-blocking, but a
   code lane will hit it hard.
4. **`hermes kanban` CLI absent** — already covered by D1; the file board worked fine.
5. **TOOLING-TRAPS.md append is owed but out of contract.** Worker contract §6 tells me to
   append traps I paid for; my `allowed` list is exhaustive and excludes that file. I obeyed
   the allowed list and am naming the traps here instead (§2 items 1–3, §3, §5). Somebody
   with write access owes the append. **This is a standing contradiction between worker
   contract §6 and every narrow `allowed` list** — worth resolving once, globally, rather
   than per-seat.

---

## 7. Toward the one-prompt machine

1. **Preflight the cheapest fatal condition first.** Import-resolution before ports before
   credentials before handshakes. Ordered by (cost to test) ÷ (probability of being fatal).
   Here that ordering alone would have turned a 20-minute investigation into a 2-second
   answer.
2. **Pin the environment, not just the commands.** A baseline ticket should record and
   assert its preconditions — "generated artifacts present", "relay binaries resolvable" —
   because a baseline taken on an unprepared checkout measures the preparation, not the
   product.
3. **Make `generate:contract` a pre-hook.** `pretypecheck` and `pretest` scripts would make
   `pnpm run typecheck` and `pnpm test` honest standalone commands and delete this entire
   failure class. Today the dependency exists only inside the `build` script's `&&` chain.
4. **Resolve relay binaries at runtime with a typed loud failure.** `which claude` with a
   `CLAUDE_CLI_BINARY_UNRESOLVED` error beats a hardcoded foreign path that degrades the
   panel silently on every host but one.
5. **Ban PATH-resolved proxies for absolute-path gates.** A preflight must exercise the same
   resolution mechanism as the code it gates, or it is theatre.
6. **Give expensive clusters an explicit run-count budget in the packet.** The §3 three-run
   rule costs ~26 min on this vitest cluster. The packet capped the ceremony at one attempt
   but said nothing about vitest; I ran three and disclosed the cost. Say it in the packet
   so the seat does not have to choose between two binding rules.
7. **Two numbers for vitest, never one.** Mandate `Test Files` AND `Tests` in every report
   skeleton. A collection failure is invisible in the test-level count, and that is exactly
   where this repo's damage lives.
8. **Sanitize the env for any nested vendor CLI, always.** Do not wait for the hang. Make
   `env -i HOME PATH USER SHELL TMPDIR LANG` the DEFAULT for spawning a vendor CLI from an
   agent session, with the dirty-env attempt as the fallback, not the other way round.
   Cost of the current ordering: 3 minutes per seat that touches a CLI relay.

---

# r2 — post-provisioning re-pin

Rework round 2. Scope: re-pin `pnpm run typecheck` and `pnpm test` after the orchestrator
ran `generate:contract` under D9. Ceremony leg parked pending TREL/F8.

## r2.1 The r1 diagnosis was exactly right, and the price of NOT having it was one round

`pnpm run typecheck` went from **exit 1 / 157 errors** to **exit 0 / 0 errors** on the single
`generate:contract` provisioning. Not 157 → a handful. **157 → zero.** Every one of those
errors — including the 58 `TS7006` and 23 `TS18046` that looked like independent sloppiness —
was the downstream inference collapse of one unresolved module, exactly as r1 argued. Nobody
needs to open those files.

Same story in the suite: `@debateai/contract` error occurrences went 77 → **0**, file-level
collection failures 73 → **0**, failing test FILES 83 → 20.

**The number that matters most:** the test denominator went **1021 → 1776**. Provisioning
did not fix 755 tests; it revealed that they were never running. A baseline taken on the
unprovisioned checkout was silently reporting on **57% of the suite**. That is the real cost
of the missing artifact, and it is invisible in any single-number "15 failures" summary.

**Upgrade, restated with force:** a baseline seat must assert its preconditions before it
measures. `node -e "require.resolve('@debateai/contract')"` — two seconds — was the
difference between a true baseline and a 43%-blind one.

## r2.2 The three-run rule earned its keep a SECOND time, in a nastier way

r1 found the count stable at 15 while membership churned. r2 reproduced the same trap and
then broke the count too:

| Run | Tests | Files |
|---|---|---|
| post1 | 26 failed / 1750 passed (1776) | 20 failed / 197 (217) |
| post2 | 26 failed / 1750 passed (1776) | 20 failed / 197 (217) |
| post3 | **23** failed / 1753 passed (1776) | **18** failed / 199 (217) |

post1 and post2 agree on 26 — and **still disagree on WHICH 26**: `mono-panel` and the T9
cadence test failed only in post1, both `grok-relay` tests only in post2. Two out, two in,
total preserved. That is the second time in this ticket that a coincidence has held a count
steady while the underlying set moved.

**This is the durable lesson: a matching failure COUNT is not evidence of a matching failure
SET, and a two-run agreement on counts is the single most dangerous-looking green in this
corpus.** It looks like stability and is not. Any rule of the form "N runs suffice if counts
match" should read "…if the failure SETS match", set-compared, never count-compared. My
packet's resume instruction used the count-or-membership form and I applied the membership
half; a seat reading quickly would have stopped at two runs and shipped a wrong list.

## r2.3 Contention is a first-class measurement hazard here, and it is separable

Five tests were unstable across the three runs. All five **pass solo**:

| Suite | in full runs | solo |
|---|---|---|
| `acceptance/grok-relay.test.ts` (2 tests) | fail in post2 only | **9/9 pass** |
| `acceptance/mono-panel.test.ts` | fails in post1 only | **1/1 pass** |
| `tests/integration/pol03-pool-resilience.test.ts` | fails post1, post2 | **3/3 pass** |
| `tests/integration/registration-database.test.ts` T9 cadence | fails post1 only | **passes** |

Measured load during the full runs: **17 → 27 → 31**. Durations 2770s / 3014s / 2615s
against 515s for the same suite pre-provisioning — a **5x wall-clock inflation**, which is
itself the signature. Every one of the five unstable tests is timing- or
signal-shaped: SIGTERM→SIGKILL escalation, resend cadence windows, idle-backend reset,
depth-4 boot. Those are precisely the assertions that cannot survive an oversubscribed host.

Critically, the solo pass is **selective, not blanket**: solo `registration-database` still
fails on the S3d RSS tripwire (`:4237`) — the stable-red one — while its T9 sibling in the
same file recovers. So "re-run solo" did not launder the suite green; it separated 5
contention artifacts from 23 real failures. That selectivity is what makes it trustworthy
evidence rather than a re-run-until-green.

**Upgrade:** mark timing/signal/RSS-shaped tests with a tag and give the runner a
`--solo`/serial lane for them, or the fleet will keep paying this tax and, worse, keep
recording contention as product defects in baselines other seats trust.

## r2.4 What cost time in r2, and who caused it

| # | Item | Price | Cause |
|---|---|---|---|
| 1 | Post-run double-run killed mid-flight | **~40 min** of run 2, discarded | Orchestrator janitor sweep misread the detached task's empty stdout as a zombie. Charged to the orchestrator's ledger, not mine. |
| 2 | Second SIGTERM (exit 143) during re-run 2 | **~40 min** again | Same signature. I moved to `nohup` + `disown` + a `.done` sentinel file, and the third attempt survived. |
| 3 | Contention inflation | ~35 min per run × 3 | Five sibling lanes on one host |
| 4 | Mandatory third run | ~44 min | Membership divergence (r2.2) — unavoidable and correct |

**Upgrade (worth more than it looks):** a long-running seat command should write a
**sentinel file on completion** and be launched detached, so liveness is judged by artifacts
on disk rather than by a supervisor's view of stdout. Both kills happened because an empty
stdout was read as death when the real output was going to a log by design. The sentinel
also let me answer the liveness ping with evidence instead of a guess. Make "detached +
sentinel + log" the standard shape for any command over ~5 minutes.

**Second upgrade:** the orchestrator's liveness ping asserted "the host went quiet". Measured
load at that moment was **26.56**. A ping that carries an unverified environmental claim can
push a seat into re-running work under conditions it believes are clean and are not. Pings
should carry measurements or carry nothing.

## r2.5 Where the resume instruction was imprecise

- "2 runs each is acceptable if counts and failure MEMBERSHIP match" — the `and` saved it,
  but the surrounding phrasing invites a count-only reading. See r2.2; make it set-equality,
  explicitly.
- "if you see a failure that smells like resource contention, re-run that suite once solo" —
  good instruction, and it worked. Worth promoting from ad-hoc advice to standing law for
  this repo, with the tagged-suite list from r2.3 so seats do not have to smell anything.
- "solo" was not fully achievable: sibling lanes were still running (load 15 at the start of
  my solo batch, 3 foreign vitest processes present). I report the figure rather than
  claiming a clean room. The results were unambiguous anyway — all five recovered.

## r2.6 Carried forward, unchanged from r1

F8 (relay binaries hardcoded to `/Users/vladmihaimiron/…`) is now a board item with lane TREL
dispatched, and the ceremony leg stays parked. Note for whoever picks it up:
`acceptance/dual-maker-proof.test.ts > FAIR-02 … round-trips one live call through BOTH
makers` is **stable-red in all three post runs** and requires both relays — expect it to move
when TREL lands, and treat it as a TREL acceptance signal rather than an independent defect.
Same for `mono-panel`, which needs a relay to boot and currently only passes solo.

---

# r3 — the ceremony leg (D17)

## r3.1 The headline: TREL's fix worked, and it was not enough

`ACCEPTANCE_CLAUDE_BINARY` resolved correctly — the relay spawned
`/Users/stefan.nour/.local/bin/claude` and got a real JSON envelope back from it. F8 is
genuinely fixed. The claude relay **still** failed, for a second, independent reason that F8
was hiding:

```
"is_error": true, "terminal_reason": "api_error", "modelUsage": {},
"result": "Not logged in · Please run /login"
```

Cause: `claudeAdapter.buildArguments` passes **`--setting-sources ""`**
(claude-relay.ts:130), which severs the CLI's own settings/keychain login. The relay's child
env allowlist (`buildCliChildEnvironment`) admits exactly two credential carriers —
`ANTHROPIC_API_KEY` and `CLAUDE_CODE_OAUTH_TOKEN`. In a correctly sanitized ceremony
environment **neither exists on this host**, so the relay has no credential path at all.

The flag and the allowlist are individually defensible (no ambient config; no API env
inheritance) and jointly fatal: together they forbid every way this host can authenticate.

**A fix that removes one of two stacked blockers looks like a regression when the second one
surfaces.** It is not. Say so explicitly in the report or the next reader will read
"CLAUDE_CLI_FAILED, again" and conclude TREL failed.

## r3.2 The preflight was wrong a THIRD time — this is now the ticket's signature defect

My preflight handshake passed. The relay's handshake failed. Same binary, same sanitized
env, same host, minutes apart. The only difference: the relay adds
`--setting-sources "" --strict-mcp-config --no-session-persistence --tools "" --model opus`.

Across this one ticket the packet's prescribed preflight has now diverged from the thing it
gates in three distinct ways:

| Round | Preflight said | Relay actually did | Divergence |
|---|---|---|---|
| r1 | `claude` via **PATH** → OK | spawned a hardcoded **absolute path** | resolution mechanism |
| r1 | (n/a) | child env is an **allowlist**, not the parent env | environment |
| r3 | **bare** `-p ping --output-format json` → OK | adds **`--setting-sources ""`** → not logged in | argument vector |

**The rule this ticket has now paid for three times: a preflight must invoke the exact
binary, the exact argument vector, and the exact environment the gated code will use — or it
is theatre.** The cheap fix is to stop hand-writing preflights: export the adapter's own
`buildArguments` + `buildCliChildEnvironment` and have the preflight call them. Then a
preflight cannot drift from the relay, because it *is* the relay. I would put this above
every other upgrade in this self-report.

## r3.3 Recovering the record from the corpse — worth institutionalising

The ceremony threw at the FAIR-01 gate *before* printing its report, so stdout carried a bare
`FAIR_DEBATE_NODE_COUNT_UNSATISFIED` and nothing the packet actually asked for — no panel, no
run id, no answer id, no probe count, no condition marks.

All of it was still on disk. The ceremony shuts its embedded PostgreSQL down but does **not**
delete `acceptance/.pgdata`. Restarting that data directory (my own caller-owned temp
resource) and querying `core.provider_probe`, `core.run`, `core.node`, `serve.answer` and
`serve.condition_mark` turned a one-line error into the complete `## CEREMONY RECORD` — at
zero additional provider cost, with no second attempt.

**Generalise: when a one-shot, paid-for run dies before it reports, the record is usually
still in its database. Go and get it.** Better still, the ceremony should print the panel,
run id, answer id and probe count *as it establishes them*, not only in a final block after
the gate — a gate failure currently destroys the observability of a run that actually
succeeded in composing an answer. That is a real product finding, filed as F-CEREMONY-REPORT-ORDER
in my report, not merely a convenience for me.

## r3.4 The run settled. Only the gate refused. Do not conflate them.

`CEREMONY_EXIT=1` is easy to read as "no run". False. The run reached terminal
`DOWNGRADED` / `COMPOSED` / `SUPPORTED`, sealed answer
`fed8007d-a838-4148-b049-da2ec9fd200d` for run `67a294c8-3534-4763-bab9-7bc71e984706`, with
honest DR-182 mono disclosures (`SINGLE-LINEAGE`, `CRITIQUE-UNAVAILABLE`) and a `CAPPED`
band at `REASONING_CEILING`. The engine behaved **exactly as ruled** for a one-maker panel.

What failed is the ceremony's FAIR-01 assertion, which requires >1 node — and with M=1 there
is one root and no cross-maker attack edge, so a 1-node graph is the *correct* output of a
mono panel. The gate is right, the engine is right, and the environment is wrong. Three true
statements that a single exit code flattens into "the ceremony failed".

**Report exit codes with their meaning attached, always.** In this corpus an exit code is
the least informative fact in the log.

## r3.5 I was wrong about `.strict()` — F11, corrected

My r1 report asserted the ceremony env schema is `.strict()`, so "an extra key is as fatal as
a missing one". **False, and I verified the correction rather than taking it on assertion.**
`loadAcceptanceCeremonyEnvironment` (main.ts:85-89) projects the environment onto the
schema's own keys *before* parsing:

```ts
const keys = Object.keys(ceremonyEnvironmentSchema.shape);
return ceremonyEnvironmentSchema.parse(Object.fromEntries(keys.map((k) => [k, source[k]])));
```

Extra keys never reach `.parse()`. Proven empirically: passing
`ACCEPTANCE_TOTALLY_BOGUS_EXTRA_KEY=nonsense` alongside the eight real keys parses fine and
returns exactly 8 keys.

**How I got it wrong:** I read `.strict()` on the schema and stopped, without reading the one
function that feeds it. A modifier on a schema tells you what the schema rejects, not what
the caller hands it. **Never characterise validation behaviour from the validator alone —
read the call site.**

**Why it mattered practically:** the false claim would have blocked D17. Passing
`ACCEPTANCE_CLAUDE_BINARY` alongside the eight schema keys is exactly the "extra key" my
report declared fatal; a seat trusting my r1 sentence would have concluded the D17
environment was impossible. **A confidently-wrong sentence in a baseline of record is more
expensive than a gap** — a gap gets investigated, a false certainty gets obeyed.

## r3.6 Price of r3

| Item | Price | Note |
|---|---|---|
| Ceremony attempt | 73s wall, one codex startup handshake + one claim-time probe (4 probe rows) | The only provider spend; single attempt honoured |
| Record recovery from `.pgdata` | ~6 min | Avoided a second spend entirely |
| Relay-argument repro | one tiny CLI call | Turned `CLAUDE_CLI_FAILED` into the actual root cause |
| D17 lookup | ~2 min wasted | My `grep '^D17\.'` missed it: the file uses `## <date> · D17 — …` headings, not `D17.` Decision ids in this mission are not line-anchored — grep for the bare token |

## r3.7 What I would change in the harness, ranked

1. **Preflight by calling the adapter's own `buildArguments` / `buildCliChildEnvironment`.**
   Three divergences in one ticket (r3.2). This is the single highest-value change.
2. **Print panel / run id / answer id / probe count when established, not after the gate**
   (r3.3). A gate failure currently blinds the operator to a run that did settle.
3. **Give the relay a third credential path, or stop passing `--setting-sources ""`.** As
   shipped, a host without `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` cannot ever form
   a 2-maker panel, regardless of F8.
4. **Have the ceremony remove its own `.pgdata` on the failure path**, or say loudly that it
   left one — a standing data dir is the documented `ACCEPTANCE_REGISTER_VERSION_CONFLICT`
   trap for the next run. I removed mine (caller-owned, packet-permitted) after extracting
   the evidence.
5. **Read the call site before characterising a validator** (r3.5).

---

# r4 — first review round (codex T0-r1; D19)

Verdict on the review: **all four findings assigned to me were technically correct.** I
verified each against the artifacts before acting and found nothing to push back on. That is
itself worth recording — a reviewer who lands 4/4 on a report I had already hardened twice is
telling me my *self*-review has a blind spot, and the shape of the misses says exactly where.

## r4.1 The blind spot: I audited my arithmetic, not my epistemics

Both blocking findings against me were the same mistake wearing different clothes.

- **B1**: I labelled five unstable tests "contention artifacts / not defects" and published
  "23 genuine". The probe was one solo PASS per test. Four of those five *already passed in 2
  of 3 full runs*; POL-03 passed in 1. A further pass is exactly what the observed flakiness
  predicts — it discriminates nothing. My solo runs also carried residual load (I recorded
  average 15 and 3 foreign vitest processes myself), so they were never the no-load arm of a
  comparison. **I ran a one-armed experiment and reported a causal conclusion.**
- **B3**: I wrote "24 (…21× OWED-CHECK-UNEXECUTED…)" whose parts sum to 25. The true
  multiplicity is 20; the total 24 was right. A row that fails its own addition, published in
  a baseline of record.

Neither is a reasoning failure about the *system*. Both are failures to apply to my own
conclusions the standard I had already minted for everyone else. I invented the set-equality
rule *in this ticket* precisely because a coincidence-held count hid a moving set — and then
published a mark row whose count and members disagreed, and a causal label my own data
couldn't carry. **The rule I wrote for the fleet did not get pointed at me.**

Concrete upgrade, and I'd make it law: **every causal word in a report must name the
experiment that discriminates it.** "Contention" is a claim about a counterfactual — that the
test would pass without load. Establishing it needs a paired load/no-load probe or repeated
serialized agreement. If I cannot name that experiment in one sentence, the honest label is
`CANNOT-ASSESS`. Cheap to apply, and it would have caught B1 at writing time.

Second, mechanical and free: **any published breakdown must be re-derived by addition before
it ships.** `1+1+21+2=25 ≠ 24` is a lint, not an insight. A reviewer should never be the one
running that sum.

## r4.2 Running the query is not the evidence — capturing it is (B2)

The r3 recovery was real: I restarted the caller-owned `.pgdata`, ran the queries, read the
rows. Then I deleted the directory and wrote the numbers into the report **without ever
teeing the query output to a log**. From outside, that is indistinguishable from assertion —
codex was right to classify every DB-derived fact as CANNOT-ASSESS, and right that the ids
being echoed into DECISIONS.md is downstream transcription, not corroboration.

This is the sharpest lesson of the whole ticket, and it is *not* the same as the r1/r2 log
discipline I thought I already had. I had been careful to tee every **command**. The recovery
was not a command — it was an interactive read — and it slipped the net entirely. **Evidence
discipline has to attach to the FACT, not to the tool that produced it.** Any number that
reaches a report needs a captured provenance, whether it came from a suite runner, a psql
session, or a one-off script.

Cost: one extra authorized ceremony (D19b). I destroyed reviewable evidence with a `rm -rf`
that was itself correct hygiene — the failure was doing it *before* capture, not doing it.
**Ordering was the whole bug**: capture → then delete. The re-run encodes that order in a
script with a sentinel proving it (`PGDATA_AFTER_DELETE=ABSENT` written after the transcript).

## r4.3 What the re-run bought beyond compliance

Run 2 independently reproduced every structural fact of run 1 — M=1 panel, identical three
probe outcomes, 4 probe rows, 1-node depth-0 graph, same four answer marks, same
`DOWNGRADED`/`COMPOSED`/`SUPPORTED`/`CAPPED` states, same gate refusal — with different ids.
So the r3 testimony was substantively accurate; it was simply unverifiable. Worth separating
those two judgements when a reviewer refuses evidence: **"unproven" is not "wrong"**, and
saying so plainly keeps the correction honest in both directions.

It also re-confirmed **F-CEREMONY-REPORT-ORDER** from a second angle: grepping `ceremony2.log`
for run id / answer id / panel returns **0** matches. The ceremony knows all of it and prints
none of it before the gate. Every operator who hits this gate will have to do the database
archaeology I just did twice. That finding is now backed by two runs.

## r4.4 Where the reviewer helped most

B2's second half and N1 were packet defects (nonexistent upstream artifact; relative board
path) — not mine, and the orchestrator has taken them as F28 with an existence-check lint.
Worth noting the pattern across this ticket: **three of the process failures were
path/artifact-existence problems** (r1 relative packet paths, N1 relative board path, B2
named-but-absent recovery logs). An existence check at packet-write time is a genuinely
high-yield lint; it would have caught two of the three before dispatch.

Codex's "Predictions" section — naming in advance which checks would falsify an unqualified
approval (recovery-log existence, and the 24-vs-25 arithmetic) — is the single most useful
review device I have seen in this mission. Both predictions were correct. **Adopt it: a
reviewer stating up front what would falsify approval makes the judge's job mechanical.**

## r4.5 Standing items unchanged

F-PREFLIGHT-PARITY (three preflight/relay divergences in one ticket) and the claude relay's
credential dead-end (`--setting-sources ""` versus an allowlist carrying only
`ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN`) are untouched by this round and still owed a
ruling. The M=1 panel is a consequence of the latter, reproduced twice now.

---

# r5 — second review round (codex T0-r2)

One blocking finding, correct, and it is the **same error shape for the third time in this
ticket**. That pattern is the only thing in this round worth writing down.

## r5.1 I keep verifying the instances instead of the invariant

| Round | I verified | The property that actually mattered | Caught by |
|---|---|---|---|
| r2 | failure **counts** matched (26 = 26) | the failure **set** was identical | me, on the third run |
| r4 | the **twelve label sites** I had edited | **no** causal word survives anywhere live | codex |
| r5 | — | the scan itself must be a **token** scan, and must be **shown to work** | me, after codex |

Each time I confirmed the things I had touched and declared the property satisfied. The r4
check was `grep '23 genuine'` and `grep 'not defects'` — fixed, lowercase, phrase-shaped. The
survivor was `### D.1 — Genuine, stable-red…`: same word, capitalised, in a heading, in the
one table that *is* the fleet's classification authority. A phrase grep cannot find a token
it wasn't told to look for, and I wrote the grep from my own edit list, so it could only ever
confirm what I already knew.

**The rule I owe the fleet: verify the PROPERTY, never your diff.** A check derived from the
list of things you changed is a tautology wearing a lab coat. The check has to be derivable
from the requirement — "no live line asserts a withdrawn causal word" — with no reference to
what I happened to edit. That reformulation alone would have caught line 136 in r4.

## r5.2 Publishing the check is a stronger cure than passing it

The packet's instruction to paste the scan into the report is the right correction and I want
to name why: a scan I run privately and summarise is worth nothing — it has exactly the
epistemic status of the uncaptured recovery queries codex refused in r1 B2. **Same failure
mode, second venue.** Running the check is not evidence; publishing the runnable check and
its output is. The report now carries the command, so the reviewer's check and mine are the
same artifact and cannot drift.

## r5.3 The self-referential trap, and the positive control that caught it

Pasting the scan into the report **broke the scan**: the explanatory prose named the banned
words, and the grep pattern itself necessarily contains all of them. First attempt reported
four live matches — from the cure section.

Two ways out: weaken the scan to excuse its own section, or write the section so it passes.
I took the second. Exclusions are now principled rather than convenient — blockquotes (the
retracted wording, quoted and negated) and fenced code blocks (verbatim transcripts, which
are evidence, not assertions) — and the prose was rewritten to refer to "the withdrawn causal
adjective" without naming it.

Then the part I would previously have skipped: **`LIVE_MATCHES=0` over a scanner that skips
155 of 881 lines is exactly the kind of green that means nothing.** A fence-parsing bug — and
the published awk *contains* a fence marker — could silently skip half the report and still
print zero. So I ran the refutation: copied the report, re-injected `Genuine,` into the D.1
heading, re-ran the scan, got `LIVE_MATCHES=1`. The scan demonstrably catches the exact
regression it exists to prevent, and I confirmed 726 live / 42 quote / 89 in-code lines
account for every line in the file.

This is the worker contract's §2 refutation duty applied to a **verification script**, which I
had not been doing. I have been mutating product code to test assertions all mission while
accepting my own check scripts on faith. **A verification script is an assertion and needs its
mutant like any other.**

## r5.4 Codex's predictions are two for two

r1 predicted the judge would miss the recovery-log absence and the 24-vs-25 arithmetic; both
landed. r2 predicted the judge would "count the twelve corrected label sites, see the clean
Q1–Q8 record, and miss the thirteenth causal word in the D.1 heading" — precisely what
happened, including the mechanism.

A reviewer who states in advance which checks would falsify approval converts review from
judgement into a checklist, and it has now caught four findings in this ticket that a reading
pass did not. **Make the Predictions section mandatory in the reviewer contract.** It is the
highest-yield process change I have seen in this mission, and it costs the reviewer three
sentences.

## r5.5 Round status

Rework round 2 of max 3 consumed; codex names r3 the last lawful round. Nothing else in the
report changed: the 23 stable-red set, the record-grade ceremony facts (Q1–Q8), the
testimony-grade r3 ids, and both pins are untouched. Standing unresolved items are unchanged
— F-PREFLIGHT-PARITY and the claude relay credential dead-end that forces M=1.

---

## liveproof — D20 TREL2 M≥2 ceremony (bounded addendum)

Filed separately at `agent-reports/t00-trel2-liveproof.md`; the T0 report stays frozen at r5.
**Result: `CEREMONY_EXIT=0`** — panel M=2, 8-node graph, 4/4 cross-maker attack edges,
FAIR-01 passed. First green ceremony of the mission.

**The finding chain closed end-to-end, and that is the story.** r1 named the hardcoded
`/Users/vladmihaimiron/…` binaries (F8) → TREL shipped the env override → r3 spent the
attempt and found the *second* blocker hiding behind the first (`--setting-sources ""`
severing the CLI login while the child allowlist carried only two credential keys) → TREL2
replaced it with `--setting-sources user --safe-mode` → this run authenticated on the first
try and produced a real two-maker debate. **Two stacked blockers, each invisible until the
one in front of it was removed.** Worth generalising: when a fix "doesn't work", the default
hypothesis should be *next blocker*, not *bad fix* — r3 would have read as a TREL regression
to anyone not holding the typed error.

**F26 shipped and I used it as intended.** `preflightClaudeCli` is now exported and
`startClaudeRelay` calls it, so preflight and relay cannot drift. My preflight called that
function rather than hand-writing a CLI invocation — the first time in this ticket the
preflight was the same code path as the thing it gates. It passed, and so did the relay. The
three earlier divergences (PATH vs absolute path, parent env vs child allowlist, bare args vs
`--setting-sources ""`) are structurally impossible now. **This is the single fix in the
mission I would point to as highest-leverage per line changed.**

**Capture discipline held with no prompting.** D19b order executed by script — ceremony teed,
recovery teed before deletion, sentinel appended after. The recovery is 24 KB of SQL+rows, so
every published number is re-derivable. I also applied the r5 lesson unprompted: rather than
quote the ceremony's own `independent attack edges: 4`, I re-derived the cross-maker property
from the captured edge rows joined to the captured lineage and got 4/4 independently. **Do
not take the artifact's word for the property the artifact exists to prove.**

**Honest defect in my own evidence.** Recovery query Q14 is malformed — it joins
`core.node` to `ledger.raw_artifact` on `run_id` alone and returns a 160-row cartesian
product instead of a node→maker map. I left it in the transcript unedited (the transcript is
evidence, not a draft) and said so in the report, using the ceremony's own captured lineage
line instead. Cost: nothing, because the ceremony log carried the same facts. **The lesson is
that a generous recovery script bought redundancy** — had I queried only the minimum, a
single bad join with a deleted database would have cost a second spend. When the source of
truth is about to be destroyed, over-query.

**What I would still change:**
1. The ceremony *now* prints panel/run id/answer id — but only because it reached its
   reporting block. F-CEREMONY-REPORT-ORDER stands: emit those facts when established, so a
   gate failure does not blind the operator. Two of three ceremonies this mission died before
   the block.
2. `OWED-CHECK-UNEXECUTED` × 28 on a passing run is a lot of honest disclosure. Not a defect
   (DR-139 ruling 4), but if that count is routine, the battery's owed-check execution path
   deserves its own ticket rather than living permanently in condition marks.
3. Spend was modest and worth recording for planning: 20 model attempts against an 88
   structural ceiling (23%), 487s wall-clock, on a depth-1 default ask with M=2.
