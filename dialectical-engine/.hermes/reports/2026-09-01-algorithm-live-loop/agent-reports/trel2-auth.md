REWORK READY FOR REVIEW — TREL2 r2 · comments read through: trel2-codex-r1-2026-09-01
report sha256: 18bd3b8d81637e5821c69e0e44c7879ecad631707ab13f3ef116e41f5ce2c956   (body = line 4 to EOF; verify: tail -n +4 trel2-auth.md | shasum -a 256)

# TREL2 r2

Seat: Opus 5, session `opus-trel-w1`. Working directory
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-trel2/dialectical-engine`,
branch `lane/trel2`, base `3409852`, HEAD `8c084cab913055fafb91cfabf190ffaed6239dbc`.

Rework round **1 of max 3**, against codex review r1 (`TREL2-codex-r1.md`,
CHANGES: 1 blocking + 1 orchestrator packet defect).

## Disposition — codex r1

| # | Verdict | Disposition |
|---|---|---|
| **B1** | **ACCEPTED — reviewer correct, fixed in `8c084ca`** | A user-level `CLAUDE.md` **exists on this host**, so the hazard my r1 called "latent" had already fired. Discriminated `--safe-mode` statically and empirically; **decision-rule branch (a)** selected — see the trade-off section. |
| N1 | Orchestrator packet defect (ellipsis paths), cure ledgered | Not my artifact. My report/log paths were inferred correctly and are unchanged. |

**My r1 error, stated plainly:** I wrote that the user-memory hazard was "latent,
not active" and that the prior research's mitigating facts "still hold on this
host." One `stat` refutes it — `/Users/stefan.nour/.claude/CLAUDE.md`, 913 bytes,
mtime 2026-02-20. I reused a dated finding's *conclusion* as a present-tense
fact instead of re-measuring its condition. I also rejected `--safe-mode` in r1
by reasoning rather than by probe, while holding two unspent paid probes.

**Provisioning verified before any suite**, as the packet requires: `node_modules`
present, `ls packages/contract/generated/client.ts` present. TREL's work confirmed
in-tree (`resolveConfiguredBinary` × 2 in `relay-core.ts`).

**No credential value was minted, read, or passed.** The probes ran under
`env -i` with `HOME PATH USER SHELL TMPDIR LANG` only — the sanitized environment
T0 established, which carries no secret. The fix changes a settings *flag*; it
adds no credential to the child environment and reads none. No `BLOCKED
waiting_human` condition arose: the CLI's existing keychain login was already
present and only needed to be made visible.

---

## PROBE LEDGER

Every live invocation of the installed `claude` CLI made by this seat, both
rounds. **Budget: 3 live successes. Spent: 3 (1 in r1, 2 in r2). Budget now
exhausted.** Auth-failure probes are free — the CLI refuses before
any model call (`is_error: true`, `total_cost_usd: 0`, `modelUsage: {}`), which is
what made one success sufficient.

| # | Command shape | Purpose | Outcome | Spend | Log |
|---|---|---|---|---|---|
| 1 | `claude -p 'ping' --output-format json --setting-sources ""` | Reproduce T0's failure at flag level | `Not logged in · Please run /login`, `is_error:true`, exit 1 | **free** | `probe-01-setting-sources-empty.log` |
| 2 | Full production vector, `--setting-sources ""` | Reproduce with the EXACT relayed argument list | `Not logged in · Please run /login`, `is_error:true`, `$0`, exit 1 | **free** | `probe-02-fullvector-empty.log` |
| 3 | Full production vector, `--setting-sources user` | Does the user source restore login? | `pong`, `is_error:false`, `num_turns:1`, `modelUsage: ["claude-opus-5"]`, `$0.03211875`, exit 0 | **SUCCESS 1 of 3** | `probe-03-fullvector-user.log` |
| 4 | Full production vector, `--setting-sources project,local` | Is `user` *necessary*, or merely sufficient, among the three source values? | `Not logged in · Please run /login`, `is_error:true`, `$0`, exit 1 | **free** | `probe-04-fullvector-project-local.log` |
| **5** | Full vector, `--setting-sources user`; prompt = *"Answer with exactly one word, YES or NO … do your instructions include user-level memory loaded from a CLAUDE.md file?"* | **r2:** does user memory reach the model under the config r1 shipped? | **`YES`** · `is_error:false` · **5423 context tokens** (1270 input + 4153 cache-creation) · `$0.03240625` | **SUCCESS 2 of 3** | `probe-05-user-memory-presence.log` |
| **6** | **Same prompt**, `--setting-sources user --safe-mode` | **r2:** does safe-mode exclude user memory *and* preserve auth? | **`NO`** · `is_error:false` · exactly **one** reported model · **2717 context tokens** (2 input + 2715 cache-creation) · `$0.01707875` | **SUCCESS 3 of 3** | `probe-06-safemode-memory-presence.log` |

**Probes 5 and 6 are a controlled A/B**: identical prompt, identical vector,
`--safe-mode` the only difference. Three independent readings from two calls —
the model's own YES/NO, a **2,706-token context drop** that does not depend on
model self-report, and confirmation that auth survives (`is_error:false`, exactly
one reported model, so `resolveClaudeModel` still resolves).

**Content boundary:** the probes ask only whether user memory is *present*. The
user `CLAUDE.md` was never read by this seat — only `stat` metadata and the
model's one-word answer. No credential value was minted, read, or passed.

"Full production vector" = exactly what `claudeAdapter.buildArguments` emits:
`-p <prompt> --output-format json --setting-sources <varied> --strict-mcp-config
--no-session-persistence --tools "" --model opus`. Probes 2–4 vary **only** the
`--setting-sources` value, so the result transfers directly to the relay rather
than to an isolated flag experiment.

**What the ledger establishes, scoped to what was measured.** Probes 2–4
establish that **among the three `--setting-sources` values**, `user` is
necessary and sufficient for keychain login. That is a claim about *one flag's
value space*; r1 overstated it as a "unique minimum" across all isolation
mechanisms, and probes 5–6 show it was not, because a **separate** mechanism
(`--safe-mode`) removes model-visible user memory at no auth cost. Probes 3 and 6
also show `modelUsage` carrying **exactly one** key, which is what
`resolveClaudeModel` requires (it throws `CLAUDE_CLI_MODEL_UNRESOLVED` on zero or
several), so the live handshake resolves under unchanged DR-115 rules.

No codex or grok probe was made: grok's CLI is absent from this host, and codex
is already empirically cleared (see `## ENUMERATION`).

---

## ENUMERATION — every argument/environment construction site in the relay layer

Done before any edit, per the packet's stop condition.

| Maker | `buildArguments` settings-related flags | Auth mechanism (`authEnvironmentKeys`) | Shares the defect? |
|---|---|---|---|
| **claude** | **`--setting-sources ""`** ← the defect · `--strict-mcp-config` · `--tools ""` · `--no-session-persistence` | macOS keychain, keyed by login identity; `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `USER`, `LOGNAME` | **YES — fixed here** |
| **grok** | `--no-memory` · `--no-subagents` · `--disable-web-search` · `--sandbox read-only` · `--tools ""` | `XAI_API_KEY` — a plain environment variable, already on its allowlist | **NO.** It has no settings-source flag at all, and its auth never depends on a settings file or keychain, so the failure mode cannot arise. Mirroring the change would be inventing a flag. CLI absent from this host — no probe possible and none needed. |
| **codex** | **`--ignore-user-config`** — structurally the same class (ignores user config) | `CODEX_HOME`, `OPENAI_API_KEY` | **NO, empirically.** T0's ceremony recorded **2 codex HEALTHY probe rows** (boot + claim-time) *with this flag in place*, so codex auth demonstrably survives it. No probe made — a codex probe is OpenAI spend and the evidence already exists. |

Shared plumbing checked too: `buildCliChildEnvironment`'s
`COMMON_CHILD_ENVIRONMENT_KEYS = [HOME, PATH, TMPDIR, LANG]` plus per-adapter auth
keys. `HOME` (keychain location) and `USER`/`LOGNAME` (login identity) are already
admitted for claude, so the environment side needed no change — only the settings
flag was severing the login.

**Second enumeration, learned the hard way:** the argument vector is also
*asserted* in tests. `grep -rn -- '"--setting-sources"'` over
`acceptance/ apps/ packages/ tests/` returns exactly 5 hits — 1 construction site
and 4 assertion sites. One of those, `adversarial-corpus.test.ts:524`, I missed on
the first pass and the zone run caught it (see `## SUITES`).

---

## RED

Fake-CLI argument/environment-shape tests, no live calls.

```
./node_modules/.bin/vitest run acceptance/claude-relay.test.ts
```

`TREL2RED_EXIT=1` · **3 failed | 22 passed (25)** · log `logs/trel2/red-auth-and-parity.log`

```
AssertionError: expected '' to be 'user' // Object.is equality
TypeError: preflightClaudeCli is not a function
```

| Failing test | Why it fails on the base |
|---|---|
| `loads the user setting source so the CLI can see its own keychain login` | base emits `""` — the D18 defect, asserted directly |
| `builds the preflight command from the relay's own adapter, so preflight cannot drift` | `preflightClaudeCli` does not exist (F26) |
| `reports the CLI-reported model from the preflight handshake, never a guessed literal` | same |

### r2 RED — `--safe-mode` absent

```
./node_modules/.bin/vitest run acceptance/claude-relay.test.ts
```

`R2RED_EXIT=1` · **1 failed | 25 passed (26)** · log `logs/trel2/r2-red-safemode.log`
— the failing test is `passes --safe-mode so user memory, hooks and plugins
cannot enter a relayed call`, which the r1 code cannot satisfy.

A fourth r1 test — `keeps project and local settings out of the relayed call` —
**passes on the base and after the fix**. That is deliberate: it is the
over-granting guard, and its whole job is to fail if anyone widens the value. It
is killed by mutant MB below.

---

## GREEN

```
./node_modules/.bin/vitest run acceptance/relay-core.test.ts acceptance/claude-relay.test.ts acceptance/grok-relay.test.ts acceptance/model-shim.test.ts
```

| Run | Exit | Tests (r1) | Tests (**r2**) | Log (r2) |
|---|---|---|---|---|
| 1 | **0** | 64 passed (64) | **65 passed (65)** | `logs/trel2/r2-green-cluster-run1.log` |
| 2 | **0** | 64 passed (64) | **65 passed (65)** | `logs/trel2/r2-green-cluster-run2.log` |
| 3 | **0** | 64 passed (64) | **65 passed (65)** | `logs/trel2/r2-green-cluster-run3.log` |

Set-equal across all three runs; failure membership empty, not merely the count.

**TREL's r3 typed-loud arms all still pass** (packet bound), verified by name in
`green-cluster-run1.log`:

```
✓ selects the test command seam when the override is blank, instead of throwing the override's code   (claude, grok, codex)
✓ still rejects the seam outside NODE_ENV=test with TEST_ONLY_CLAUDE_COMMAND_FORBIDDEN when the override is blank
✓ still rejects the seam outside NODE_ENV=test with TEST_ONLY_GROK_COMMAND_FORBIDDEN when the override is blank
✓ still rejects the seam outside NODE_ENV=test with TEST_ONLY_CODEX_COMMAND_FORBIDDEN when the override is blank
✓ rejects a forbidden testOnlySessionsRoot outside NODE_ENV=test when the override is blank and no command seam is supplied
✓ keeps TEST_ONLY_CODEX_COMMAND_FORBIDDEN ahead of the sessions-root code when both seams are supplied outside NODE_ENV=test
```

### Refutation (worker contract §2)

Sources backed up and restored by `cp`, never `git checkout <sha> -- path`
(recorded trap: it stages). Restore verified by `cmp` and `git status --porcelain`.

| # | PROPERTY | Mutant | Result | Killed by | Log |
|---|---|---|---|---|---|
| MA | The relay loads the `user` setting source | `CLAUDE_SETTING_SOURCES = ""` (the D18 defect) | **RED** 2 failed \| 23 passed (25) | `loads the user setting source…` + the full-vector lineage test | `mutant-ma-sources-empty.log` |
| **MB** | **The grant is NARROW — project/local stay out** | `"user,project,local"` | **RED** 3 failed \| 22 passed (25) | incl. `keeps project and local settings out of the relayed call` | `mutant-mb-overgrant.log` |
| MC | The preflight is built from the relay's own adapter | preflight given hand-written bare args (the historical operator preflight) | **RED** 1 failed \| 24 passed (25) | *only* `builds the preflight command from the relay's own adapter…` | `mutant-mc-preflight-drift.log` |
| **MD** *(new, r2)* | **User memory/hooks cannot enter a relayed call** | `--safe-mode` removed from the vector | **RED** 2 failed \| 24 passed (26) | `passes --safe-mode so user memory, hooks and plugins cannot enter a relayed call` + the full-vector lineage test | `r2-mutant-md-safemode-dropped.log` |
| MN | **neighbour — must NOT be caught** | handshake prompt wording changed | **GREEN** 25 passed (25) | — correctly nothing | `mutant-mn-neighbour-prompt.log` |

r2 re-ran MA and MB against the new vector: `r2-mutant-ma-sources-empty.log`
(**2 failed | 24 passed (26)**) and `r2-mutant-mb-overgrant.log` (**3 failed | 23
passed (26)**, including the project/local exclusion arm). **MD and MA/MB
together prove the two flags are independently load-bearing** — dropping either
is caught, by different tests.

**MB is the one that makes "narrowest" enforceable rather than merely asserted.**
Without it, widening the grant to all three sources would pass every test in the
suite.

---

## TRADE-OFF

### What `--setting-sources ""` was protecting against

It was an isolation hardening measure. The repo's own security research states
the risk in the author's words —
`docs/missions/2026-08-17-accounts-privacy-security/research/S5-llm-isolation.md:32`:

> **No `--setting-sources`** on the claude relay: user-scope settings/memory
> still load. Currently benign (`~/.claude/settings.json` has no `hooks`; no
> `~/.claude/CLAUDE.md`), but a future user-level hook would execute inside the
> relay child.

So `""` closed one concrete hazard: **settings-defined behaviour — hooks above
all — and user memory entering the context of a relayed call.** It closed it by
severing the CLI's keychain login, which is the defect D18 exists to repair.

### The condition in that quote has expired — measured, not assumed

That research was correct when written. It is not correct now:

```
path=/Users/stefan.nour/.claude/CLAUDE.md
size=913
mode=-rw-r--r--
mtime=2026-02-20T09:39:23+0200
```

(Metadata only; contents never read.) **My r1 report reused the "currently
benign" clause as a present-tense fact and was wrong.** With
`--setting-sources user` alone, that file's instructions entered every relayed
`-p` call — confirmed empirically, not inferred: probe 5 asked the model whether
its instructions included user-level `CLAUDE.md` memory and it answered **`YES`**.

That is a real defect, not a latent one, and its consequence is a
**replay-completeness** failure rather than a fabrication: the gateway computes
`inputHash = sha256(JSON.stringify(P))` over the prompt packet only
(`packages/providers/src/index.ts:317`), so model-visible input existed that the
recorded request did not cover. Editing the user file could change model output
while the persisted request and hash stayed identical.

### What is adopted, and why it is strictly better

**Decision-rule branch (a).** `--safe-mode` preserves keychain auth **and**
excludes user memory, so it is adopted. Evidence, both directions:

*Static*, from the installed 2.1.247 binary — `--safe-mode` sets **two** env
vars, the second of which is the memory switch:

```
if(oe())process.env.CLAUDE_CODE_SAFE_MODE="1",process.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS="1",Le("startup_safe_mode");
```

and its customization-disable map carries the two entries that matter here:

```
claudeMd:!0, skills:!0, workflows:!1, plugins:!0, ..., hooks:!0, ...
```

Memory-loader functions early-return `[]` on `V.CLAUDE_CODE_DISABLE_CLAUDE_MDS`.
**Honest limit of the static trace:** in a 233 MB minified bundle I could confirm
that gate on the Project loaders but could **not** conclusively resolve it on the
User path, whose visible branch is gated on `Li("userSettings")`. That
unresolved half is precisely why the empirical probe was required rather than
optional.

*Empirical*, identical prompt, `--safe-mode` the only variable:

| Configuration | User memory in context? | Auth | Context tokens | Cost |
|---|---|---|---|---|
| `--setting-sources user` | **YES** | ok | 5423 | $0.03241 |
| `--setting-sources user --safe-mode` | **NO** | ok, one reported model | **2717** | $0.01708 |

The 2,706-token drop corroborates the model's own answer without relying on it.

**Both flags are kept, and neither is redundant.** They are orthogonal:
`--setting-sources user` decides **which scopes load** (project and local stay
out — the scopes a repository or a careless commit can influence);
`--safe-mode` decides **which customizations inside those scopes are honoured**
(CLAUDE.md, hooks, skills, plugins, MCP, agents). Safe-mode *alone* would leave
the source list at its default — all three scopes — a strictly wider surface than
today. Each flag is pinned by a mutant that kills only its own test: **MD** (drop
`--safe-mode`) and **MA/MB** (change the source list).

The decision rule offered safe-mode *in place of* `--setting-sources user`; the
probes made the honest answer *both*, and this paragraph is that departure stated
openly rather than made silently.

### What is re-admitted, stated exactly

The **user scope's non-customization settings** still load — that is the price of
keychain auth, and probes 2 and 4 show there is no cheaper way to buy it from
this flag. What no longer reaches a relayed call: user `CLAUDE.md` memory, user
hooks, skills, plugins, MCP servers, custom agents and output styles (safe-mode),
and everything in the project and local scopes (source list).
`--strict-mcp-config`, `--tools ""` and `--no-session-persistence` are untouched
and continue to work independently.

**Net effect on the recorded request:** with user memory excluded, the ceremony's
`inputHash` over the prompt packet once again covers the full model-visible
input, which is the property the replay record depends on. Branch (b)'s
digest-recording remedy is therefore **not needed** — the input identity is
restored by removing the unrecorded input rather than by recording more of it.

### Scoping the r1 "unique minimum" claim

r1 called `user` the "unique minimum". Scoped to what the probes establish:
**among the three values of `--setting-sources`**, `user` is necessary (probe 4)
and sufficient (probe 3). It was never a minimality claim across *mechanisms*,
and treating it as one is what caused r1 to reject `--safe-mode` without
measuring it. The isolation minimum is the **pair**, not either flag alone.

## SUITES

Run from the lane worktree at commit `8c084ca`.

| Command | Exit | Result | Log |
|---|---|---|---|
| `pnpm run typecheck` (root) | **0** | **0 tsc errors** | `logs/trel2/r2-typecheck.log` |
| relay cluster ×3 | **0 / 0 / 0** | **65 passed (65)** each | `logs/trel2/r2-green-cluster-run{1,2,3}.log` |
| blast-radius zone, run 1 | 1 | **2 failed \| 105 passed (107)** | `logs/trel2/r2-zone-run1.log` |
| blast-radius zone, run 2 | 1 | **2 failed \| 105 passed (107)** | `logs/trel2/r2-zone-run2.log` |
| blast-radius zone, run 3 | 1 | **2 failed \| 105 passed (107)** | `logs/trel2/r2-zone-run3.log` |
| `pnpm test` (full) | — | **D15-DEFERRED** — see below | — |

**Full suite: D15-DEFERRED.** Load average was **13.80 on 12 cores** at r2 zone time (20.06 at r1) at zone time
— the host is not quiet, which is the condition D15/D13 set for a worker full
run. The authoritative full suite runs at judge stage, serially, per D15.

**D16 gates: NOT TRIGGERED, stated explicitly.** This lane's entire diff is three
files under `dialectical-engine/acceptance/`. No `packages/contract`, no
`packages/kernel`, no type-producing surface, no `web/` or `apps/ui` edit. The
D14/D16 surface-local typecheck gates therefore do not apply, and I did not run
them.

### A regression I caused, caught by my own zone run

The first zone ×3 showed **3** failures, stable across all three runs. Two were
known; the third — `adversarial-corpus.test.ts > … executes CLAUDE-ARGV-01 with
adversarial flags only inside the -p value` — was **mine**:

```
- Expected  "--setting-sources", ""
+ Received  "--setting-sources", "user"
```

That file pinned the production argument vector a *second* time. I had enumerated
every argument *construction* site and none of the *assertion* sites. Fixed by
updating the literal with a D18 reference. **The case's security property is
untouched**: it asserts that the adversarial payload
`--tools Bash --setting-sources user,project --mcp-config attacker.json --model attacker`
appears at argument index **1 only** (inside the `-p` value) and nowhere else —
an assertion about the *attacker's* text, independent of what the relay's own
flag value is. After the fix the zone is stable at 2 failures across 3 runs.

### Both remaining failures are PRE-EXISTING — proven on this base, not inherited

I did not carry TREL's attribution across: this lane sits on a different base
(`3409852`, batches 1–4 merged). I restored the three touched files to their
`HEAD` versions and re-ran:

`logs/trel2/base-preexisting-proof.log` → `BASE_EXIT=1`, **2 failed | 11 passed (13)**

| Failing test | Verdict |
|---|---|
| `acceptance/adversarial-corpus.test.ts > P4-13 … executes DB-01 with no database locator or capability call` | **PRE-EXISTING** on `3409852` (also in T0's C.1 union) |
| `acceptance/dual-maker-proof.test.ts > FAIR-02 dual-maker proof > round-trips one live call through BOTH makers…` | **PRE-EXISTING** on `3409852` (root cause: TREL r2 finding 7 — `dual-maker-proof.ts` never passes `testOnlySessionsRoot`, so a fake CLI's fixed thread id is looked up in the real `~/.codex/sessions`) |

`CLAUDE-ARGV-01` passed in that same base run, which is the positive control
confirming it was my regression and is now repaired. Sources restored and
verified byte-identical.

---

## COMMITS

| Commit | Round | Files | Stat |
|---|---|---|---|
| `0e6be86aa73b864d45ef24ae9f2905cb48be9623` | r1 | 3 | 162 insertions(+), 9 deletions(-) |
| `8c084cab913055fafb91cfabf190ffaed6239dbc` | **r2** | 3 | **40 insertions(+), 4 deletions(-)** |

`TREL2: load the user setting source so the relay CLI sees its own keychain login`

- `acceptance/claude-relay.ts` (+74/−6): `CLAUDE_SETTING_SOURCES = "user"` with the
  measured evidence recorded at the flag; `preflightClaudeCli` extracted;
  `startClaudeRelay` now calls it for its own handshake.
- `acceptance/claude-relay.test.ts` (+91/−2): the D18 and F26 suites, plus the
  updated full-vector expectation.
- `acceptance/adversarial-corpus.test.ts` (+6/−1): the second argument-vector pin.

r2 — `TREL2 r2: add --safe-mode so user memory cannot enter a relayed call`:
`claude-relay.ts` (+20/−4, the flag plus its measured rationale),
`claude-relay.test.ts` (+23, the safe-mode arm and the updated vector),
`adversarial-corpus.test.ts` (+1, the second vector pin — both assertion sites
enumerated up front this round).

Branch `lane/trel2`. Not pushed, not merged. Working tree clean at close.

---

## F26 — how the preflight stopped being able to drift

F26 named three divergences, each of which let an operator preflight pass minutes
before the relay failed on the same binary: PATH vs a hardcoded absolute path;
the parent environment vs the child allowlist; bare arguments vs
`--setting-sources ""`.

The cure was not a new tool. `invokeCli` already resolves the command, builds the
arguments through the adapter, and builds the child environment through
`buildCliChildEnvironment` — so the relay's own startup handshake *is* the
preflight. `preflightClaudeCli` gives that step a name and returns both the
resolved `command` and the parsed `handshake`; `startClaudeRelay` now calls it
instead of duplicating the resolution. There is one code path, so the two cannot
diverge by construction rather than by discipline.

All three divergences are asserted dead in
`builds the preflight command from the relay's own adapter, so preflight cannot
drift`: same binary, same argument **shape** (prompt placeheld, since the prompts
legitimately differ), same child-environment **key set**. Mutant MC — a preflight
given hand-written bare arguments — is killed by that test and by nothing else.

Grok and codex keep their existing structure; their `start*` functions already
route their handshake through `invokeCli` with their own adapters, so they have
no equivalent hand-written preflight to remove. Repo-permanence of an
operator-facing preflight entry point remains a V-packet row per F26.

---

## FINDINGS (worker contract §5 — named, not fixed by this seat)

1. **`acceptance/README.md` documents the keychain-login expectation but not the
   flag that governs it.** README:56-57 tells the operator "the claude CLI needs
   its own keychain login — `claude /login` first if expired", which is exactly
   what `--setting-sources ""` silently defeated. One sentence naming
   `--setting-sources user` as the reason the login is visible would close the
   gap between the documented expectation and the code. Out of this packet's
   scope (relay behaviour, not docs).
2. **WITHDRAWN and replaced (r2).** r1 filed this as "the user-scope hook hazard
   is now latent rather than closed." That framing was wrong twice over: the
   *memory* half had already fired (a user `CLAUDE.md` exists), and the *hook*
   half is now **closed**, not latent — `--safe-mode`'s disable map carries
   `hooks:true` alongside `claudeMd:true`. What remains is narrower and worth a
   row: the relay depends on the CLI's own definition of "customization" to keep
   hooks and memory out, so a future CLI release that changes that definition
   would silently widen the relay's exposure. **The pinning test asserts the flag
   is passed, not that the CLI still honours it** — only a live probe can confirm
   the latter, and this lane's budget is spent. Suggest re-running probes 5/6 as
   a cheap periodic check after any CLI upgrade.
3. **The production argument vector is pinned in two independent test files**
   (`claude-relay.test.ts`, `adversarial-corpus.test.ts`). That duplication is
   defensible — each pins a different property — but nothing links them, so a
   change to one is silently incomplete until a zone run catches it. It caught me
   this round. A shared exported expectation would remove the trap at the cost of
   making the adversarial assertion less independent; worth a deliberate ruling
   rather than leaving it to the next seat to rediscover.
4. **`dual-maker-proof.ts` still hardcodes the author's machine** — TREL r2
   finding 7, unchanged and still red on this base. `DualMakerProofOptions`
   exposes no sessions-root option, so the FAIR-02 dual-maker proof cannot pass on
   any host lacking the author's rollout file. One option field and one spread.
   Still unticketed as far as this seat can see.
5. **A dated security finding's "currently benign" clause is a hypothesis, not a
   fact.** `S5-llm-isolation.md:32` recorded "no `~/.claude/CLAUDE.md`" as of
   2026-08-17; the file exists now. My r1 quoted that sentence and reused its
   conclusion without re-measuring its condition, which is what produced the
   blocking finding. Suggest a convention: any trade-off paragraph asserting "X
   does not exist / is not configured" carries the command that checked it, the
   way suite counts carry their log path.
6. **`.hermes/TOOLING-TRAPS.md` remains outside worker `allowed` lists** while
   worker contract §6 orders workers to append to it. Third lane in a row owing
   traps it may not write. Traps owed from this lane: zsh has no bash `${!var}`
   indirection (cost one call); and the CLI's auth failure is free, which is the
   fact that makes cheap probe design possible.

---

## HANDOFF

- **Marker (line 1):** `REWORK READY FOR REVIEW — TREL2 r2 · comments read through: trel2-codex-r1-2026-09-01`
- **Content hash (line 2):** the N3 anti-moving-snapshot guard, verified working
  across both of codex r2's reads in the TREL lane.
- **Rework round:** 1 of max 3 spent. Rework returns to session `opus-trel-w1`.
- **Self-report:** `agent-reports/trel2-auth-self.md`, `## r1`, written before this
  marker.
- **Live provider spend this lane:** **three** paid calls totalling **$0.08160375**
  (probe 3 $0.03211875, probe 5 $0.03240625, probe 6 $0.01707875) plus three
  zero-cost auth-failure probes. **Budget of 3 paid successes is now exhausted** —
  any further live discrimination needs a new authorization.
- **Logs** (`.hermes/reports/2026-09-01-algorithm-live-loop/logs/trel2/`):
  r1: `probe-01…04`, `red-auth-and-parity`, `typecheck`,
  `green-cluster-run{1,2,3}`, `mutant-m{a,b,c,n}-*`, `zone-run{1,2,3}`,
  `base-preexisting-proof`.
  **r2:** `probe-05-user-memory-presence`, `probe-06-safemode-memory-presence`,
  `r2-red-safemode`, `r2-typecheck`, `r2-green-cluster-run{1,2,3}`,
  `r2-mutant-md-safemode-dropped`, `r2-mutant-ma-sources-empty`,
  `r2-mutant-mb-overgrant`, `r2-zone-run{1,2,3}`.
- **Deliberate, disclosed departure from the decision rule:** it offered safe-mode
  *in place of* `--setting-sources user`; I kept **both**, because the probes show
  they are orthogonal and mutants MD and MB prove neither is redundant. Reasoned
  in the trade-off section rather than applied silently.
- **The user `CLAUDE.md` was never read** — only `stat` metadata and a one-word
  model answer. Its contents appear nowhere in this report, my self-report, or any
  log.
- Not done, by contract: no push, no merge, no Done mark, no board write, no
  ticket split, no credential minted/read/passed, no edit outside the three
  committed files plus my two report files and `logs/trel2/**`.
