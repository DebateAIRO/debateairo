# DR-181 — Architecture plan: the panel is discovery, the M-apparatus is dead

**Fired under DR-171** (architecture-consult law) **with DR-175's dual-lineage
law** — this plan is one lineage's position; a Grok lens both authorizes it and
may counter-propose, and genuine splits go to V as options, never pre-converged.
Author: Opus 5 ARCHITECT seat, 2026-08-14. **Status: awaiting Grok
authorization.** This plan writes no product code and binds nothing until an
independent Grok lens authorizes it; only an authorized plan re-enters the
coding loop as ticket scope. Its only real-tree write is this file.

Scope of the read: `decisions-ledger.md` rows DR-115, DR-137, DR-140(b),
DR-157, DR-159, DR-162, DR-162-A, DR-165(3), DR-166, DR-166-B/C, DR-171,
DR-172, DR-172-A, DR-173, DR-174, DR-174-A, DR-175, DR-176, DR-177, DR-178,
DR-179, DR-180, **DR-181**; the M-guard and its admission block
(`apps/runner/src/index.ts:299-302, :338-342, :430-443, :834-848`); the
envelope machinery (`acceptance/seed-register.ts:188-206`,
`packages/register/src/index.ts:103, :150-157, :202-277`, `packages/budget/`,
`migrations/0000_s00.sql:54-56`, `packages/db/src/index.ts:285-302, :486-514`);
the relay/handshake pattern (`acceptance/relay-core.ts`,
`acceptance/claude-relay.ts`, `acceptance/grok-relay.ts`,
`acceptance/model-shim.ts`, `acceptance/run-acceptance.ts:156-192`,
`acceptance/main.ts:157-234`); ASK-01's derivation
(`apps/v2-ui/app/new/defaults.tsx:36-140`); the resilience implementation
(`apps/runner/src/index.ts:179-259, :261-297, :1209-1260, :1304-1359,
:1469-1551`, `migrations/0021_dr174_cooldown_prune.sql`); and
`reviews/ask01-opus-rev1.md` §A2/§A3 — the two-sources warning this plan is
required to answer.

**Working-tree fact, stated first so nothing downstream is confused by it.**
HEAD is `4f06fd5 "DR-181: panel = discovered healthy models; the M apparatus
retired (V ruling)"`. That commit carries the **ledger row and the ASK-01 rev1
work**, not the retirement: `DR159_RATIFIED_MAKER_COUNT = 2` is alive at
`apps/runner/src/index.ts:430`, `deriveRatifiedMakerMaximum` is alive at
`apps/v2-ui/app/new/defaults.tsx:46-90`. **Nothing in the M-apparatus has been
removed yet.** Every citation below is against the live tree.

---

## 0. The architecture, in one sentence

The panel stops being a **number the system defends** and becomes a **fact the
system observes and records**: three CLI probes at ask time produce a list of
`(maker, model id, evidence)`, that list is pinned on the run head, its
`length` is the only maker count that exists anywhere in the system, and the
one remaining ceiling is arithmetic evaluated from that list — never a table,
never a ratification, never a refusal.

Everything else in this plan is bookkeeping on that sentence.

---

## 1. DISCOVERY

### 1.1 The health script is already written — it is called the handshake

DR-181 asks for "a simple health script". The repo already contains one, three
times over, and has since FAIR-02. `acceptance/relay-core.ts:68-109`:

```ts
export async function invokeCli(
  command: CommandSpec, adapter: CliRelayAdapter, prompt: string, timeoutMs: number
): Promise<CliCompletion> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.binary, [...command.prefixArguments, ...adapter.buildArguments(prompt)], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    …
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
    child.once("error", () => reject(new CliRelayFailure("FAILED", adapter.failureCode)));
    child.once("close", (code) => {
      if (timedOut) { reject(new CliRelayFailure("TIMEOUT", adapter.timeoutCode)); return; }
      if (code !== 0) { reject(new CliRelayFailure("FAILED", adapter.failureCode)); return; }
      resolve(adapter.parseCompletion(Buffer.concat(stdout).toString("utf8"), prompt));
    });
  });
}
```

and its use as a liveness probe, `acceptance/claude-relay.ts:106-118` (doc
comment `:99-105`, verbatim: *"The handshake proves the CLI is alive and
captures the CLI-reported model id for lineage … A dead or unauthenticated CLI
refuses to start — loud, never a dead maker silently serving (DR-115)"*):

```ts
const handshake = await invokeCli(command, claudeAdapter, CLAUDE_HANDSHAKE_PROMPT, options.timeoutMs);
const server = await startCliRelayServer({ port: options.port, timeoutMs: options.timeoutMs, command, adapter: claudeAdapter });
```

**This plan does not invent a discovery mechanism. It promotes the existing
one from a boot precondition to a first-class, per-provider, failure-tolerant
observation, and gives its result a persisted home.** Three defects stand
between what exists and what DR-181 requires, and they are the whole of §1.4.

### 1.2 What "up and running" means, precisely

A provider is **PRESENT** when its declared binary path exists and is
executable. `acceptance/claude-relay.ts:26` — `/Users/vladmihaimiron/.local/bin/claude`;
`acceptance/grok-relay.ts:12` — `/Users/vladmihaimiron/.grok/bin/grok`;
`acceptance/model-shim.ts:11` — `/Applications/ChatGPT.app/Contents/Resources/codex`.
Absence surfaces today as `child.once("error")` → `CliRelayFailure("FAILED", …)`.

A provider is **HEALTHY AND AUTHENTICATED** when a real handshake completion
returns: exit code 0, a parseable maker-specific envelope, non-empty content,
and **exactly one** CLI-reported model id. All four conditions are already
enforced — `acceptance/claude-relay.ts:50-68`, `acceptance/grok-relay.ts:17-43`.
Authentication is proven **only** indirectly, and that is correct under DR-179:
no key material is read, requested or stored anywhere; an expired OAuth makes
the CLI exit nonzero (`claude-relay.ts:20-21` records the empirical
observation), which is indistinguishable from — and treated identically to —
any other death. **"Authenticated" is not a separate check and must never
become one**; inventing an auth probe is the fastest route to key material
entering the system.

So the probe's positive result is exactly a `CliCompletion`:
`{ content, model }` where `model` is **the id the CLI itself reported** — never
a literal (DR-115; `CLAUDE_CLI_MODEL_UNRESOLVED` at `claude-relay.ts:64-66`
refuses zero-or-several rather than picking).

**"Up and running" is therefore: a completed round-trip through the real CLI
within the deadline, yielding one unambiguous model id.** Nothing weaker
(process listing, binary stat, port check) is admissible, because none of them
can produce the model id that DR-165(2) requires on every card and DR-115
requires on every artifact.

### 1.3 The freshness window — an unruled VALUE, and why it exists

A probe is a real model call: it spawns the CLI, burns a completion, and on
this machine takes seconds. Probing all three providers on the critical path of
every ask would put multiple seconds and three completions between V's click on
**Start** and the run being admitted — for a fact that changes on the timescale
of quota walls and laptop sleeps, not milliseconds.

So discovery is **probe + remember**, and the remembering has a lifetime:

> A discovery record is trusted for `probeFreshnessMs`. An ask reads the newest
> record per provider; any record older than the window is **re-probed for that
> provider only**, bounded to one attempt, before the panel is decided. A
> re-probe that fails removes that provider from this ask's panel. **A stale
> record never refuses an ask and never silently serves.**

`probeFreshnessMs` is an **unruled VALUE**: register row, V's number, never a
literal — the DR-174-A/DR-176 discipline applied again (V's `cooldown_ms`
600 000 and `hiddenNodeScoreThreshold` 0.35 are the precedents;
`acceptance/seed-register.ts:172-187`). §8 proposes the row and §9 puts the
number in front of V with its consequences. Per AC-76 any number this plan
computes is a **proposal, never a seed**.

### 1.4 The seams — where discovery lives, file by file

**Three defects to close.** Each is a named, cited line; none is speculative.

**D1 — the codex leg has no handshake and a hardcoded model id.**
`acceptance/model-shim.ts:56-68` goes straight to `startCliRelayServer` with no
`invokeCli`, and `:12`/`:52` hardcode `ACCEPTANCE_MODEL = "gpt-5.6-sol"`. It is
the one maker that can boot dead and be discovered only at first real call, and
the one whose lineage is a literal rather than a CLI report — a standing DR-115
soft spot that discovery makes load-bearing. **Fix:** give `model-shim.ts` a
handshake exactly as `claude-relay.ts:106-118` has one, and take its model id
from the CLI's own report. If the codex CLI's output shape cannot yield an
unambiguous id, that is a finding for V, not a licence for the literal.

**D2 — boot is all-or-nothing.** `acceptance/run-acceptance.ts:169-175` uses
`Promise.all`; the `catch` at `:319-322` tears the whole ceremony down. One
dead CLI out of three kills every debate — the precise inverse of DR-181(2).
(A second, smaller bug rides along: on rejection the destructuring at `:169`
never executes, so the surviving relay's handle is never assigned and
`closeAll` receives `null` — a leaked listening server.) **Fix:**
`Promise.allSettled`, per-provider results, handles captured individually.

**D3 — the register row is the authority, discovery is not.**
`acceptance/main.ts:176-180` throws `ACCEPTANCE_PROVIDER_RELAY_UNRESOLVED`
when a seeded `providerRef` has no relay. Under DR-181 the seeded list is the
**set of CLI shapes to look for**; the panel is what answered. **Fix:** a
seeded provider with no healthy relay is an ABSENCE (recorded), not a throw.

**The new module — `acceptance/discovery.ts`** (single new file; the transport
is reused, not rebuilt):

```
export interface ProbeTarget    { providerRef; maker; command: CommandSpec; adapter: CliRelayAdapter }
export interface DiscoveredProvider
  = { providerRef; maker; state: "HEALTHY"; modelId; probedAt; probeEvidenceRef }
  | { providerRef; maker; state: "ABSENT";  failureCode; probedAt }

export async function probeProvider(target, timeoutMs): Promise<DiscoveredProvider>
export async function discoverPanel(targets, timeoutMs): Promise<readonly DiscoveredProvider[]>
```

`probeProvider` is `invokeCli(target.command, target.adapter, HANDSHAKE_PROMPT,
timeoutMs)` wrapped so a `CliRelayFailure` becomes an `ABSENT` record carrying
its existing loud code (`CLAUDE_CLI_FAILED`, `GROK_CLI_TIMEOUT`, …) instead of
propagating. `discoverPanel` is `Promise.allSettled` over the targets. Both are
pure of persistence.

`ProbeTarget`s are assembled from the **`configuredProviderSet` register row**
(`acceptance/seed-register.ts:241-267`) joined to the per-maker adapter each
relay module already exports — so onboarding a model stays a registration
(DR-178) and never touches discovery.

**The probe evidence — a new append-only table** (migration `0022`):

```sql
CREATE TABLE IF NOT EXISTS core.provider_probe (
  probe_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_ref  text NOT NULL CHECK (length(btrim(provider_ref)) > 0),
  maker         text NOT NULL CHECK (length(btrim(maker)) > 0),
  state         text NOT NULL CHECK (state IN ('HEALTHY','ABSENT')),
  model_id      text CHECK (model_id IS NULL OR length(btrim(model_id)) > 0),
  failure_code  text CHECK (failure_code IS NULL OR length(btrim(failure_code)) > 0),
  probed_at     timestamptz NOT NULL,
  CHECK (state <> 'HEALTHY' OR (model_id IS NOT NULL AND failure_code IS NULL)),
  CHECK (state <> 'ABSENT'  OR (model_id IS     NULL AND failure_code IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS provider_probe_ref_at ON core.provider_probe (provider_ref, probed_at DESC);
```

The two CHECKs are the DR-115 enforcement: a healthy probe **cannot** exist
without a model id, and an absent one **cannot** exist without a named reason.
`probe_id` is the `probeEvidenceRef` the run head cites.

**The ask-time seam** — `apps/api/src/index.ts:313-337`, `evaluateAskAdmission`.
It already has exactly the right shape: a settings-injected resolver
(`RunCreationSettings.resolveDeploymentMakerAvailability`, `:321`) whose result
feeds `assertMakerAdmission` (`:323`). One member is added beside it:

```ts
readonly resolveDiscoveredPanel: () => Promise<readonly DiscoveredProvider[]>;
```

composed in `acceptance/main.ts` (the only live composition root) as: read the
newest probe per `provider_ref`; re-probe any older than `probeFreshnessMs`;
return the `HEALTHY` subset. `evaluateAskAdmission` returns the panel alongside
`risk` and `envelopeBasis`, and `PostgresAskApplication.submit`
(`apps/api/src/index.ts:358-386`) pins it.

**A boundary this plan draws deliberately.** `apps/runner/src/main.ts` (the
Hatchet worker) wires none of `runDeathPolicy`, `holdRecorder`,
`judgementPolicy` or `servePolicy` and cannot complete a run today. Discovery
is **not** wired there. Bringing that path to parity is its own ticket; a
DR-181 ticket that pretends to serve it would be a second F1.

### 1.5 How the panel is recorded on the run head

Migration `0022`, on `core.run`:

```sql
ALTER TABLE core.run
  ADD COLUMN IF NOT EXISTS discovered_panel jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE core.run
  ADD CONSTRAINT run_panel_count_identity
    CHECK (agent_count = jsonb_array_length(discovered_panel));
```

`discovered_panel` carries one object per healthy member:
`{ provider_ref, maker, model_id, probe_evidence_ref, probed_at }`.

**The CHECK is this plan's answer to the Opus lens's §A2.** The lens's warning,
verbatim from `reviews/ask01-opus-rev1.md`:

> "These are the same *number* today … But they are two independently editable
> places. **Drift hazard:** reseeding the envelope to the M=3 ceilings without
> bumping the runner literal would make the form derive 3 and every ask refuse
> again — this ticket's exact defect, relocated."

Both editable places die (§2.1, §2.4). What replaces them is not a third
source but an **identity the database refuses to let drift**: `agent_count` is
`jsonb_array_length(discovered_panel)` or the row does not exist. The write
side makes it unwriteable independently — `packages/db/src/index.ts:288-299`
stops binding `agentCount` as a parameter and writes
`jsonb_array_length($n::jsonb)` from the panel itself, so `StartRunInput` loses
`agentCount` (`:205`) and gains `discoveredPanel`. **After this, there is
exactly one maker count in the system and no code path that can author a
second.** The lens's §A3 (*"'healthy' is not modelled … Naming it so the word
'healthy' in the ledger is not mistaken for shipped behaviour"*) is answered by
the probe table: healthy becomes a recorded observation with evidence, not a
word.

`readFrozenHead` (`packages/db/src/index.ts:486-514`) gains `discovered_panel`
and `depth_params` in its SELECT (`:501`). The second is needed because the
runner currently learns depth **only** through
`envelopeBasis.derivedFrom.depthParams` (`apps/runner/src/index.ts:832-833`)
while `core.run.depth_params` has existed all along
(`migrations/0000_s00.sql:53`, written at `apps/api/src/index.ts:372`) — the
envelope was a redundant depth carrier, and §2.3 cuts that dependency.

### 1.6 Mid-run model death — RESIL-01 composes; verified, not redesigned

**Discovery is an admission-time fact and must never be re-taken mid-run.** A
mid-run rescan would silently change the panel the answer claims, which is a
DR-115 provenance break: the served answer would name a panel it did not
debate with. The pinned panel is the truth of the run; a member dying inside
the run is a **transport** event, and DR-174/DR-174-A/DR-176 already own it.

Verification of the composition, per failure scope
(`apps/runner/src/index.ts:179-259`, `withCooldownRetry`):

| Scope | Site | Behaviour today | Composes with a discovered panel? |
|---|---|---|---|
| `MAKER_POSITION` | `JUDGE`, `JUDGE:root:secondary`, `JUDGE:root:${i}` (`:901`, `:1164`, `:1189`) | 3 attempts → 10-min hold → 4th attempt → `MAKER_POSITION_UNAVAILABLE`, run dies loud | **Yes.** DR-176(3) ruled die-loud for a dead maker position after the full courtesy. Panel size is irrelevant to the rule. |
| `EXPANSION` | `JUDGE:${role}:root${r}:r${n}:p${p}` (`:1244`), `JUDGE:cross-root:…` (`:1280`) | halted; planned subtree pruned from the walk (`:1253-1258`); `UNAUTHORED-BRANCH-HALTED` (`:1552-1567`) | **Yes.** `subtreeIndices` closure is index-based and M-agnostic. |
| `REVIEW` | `JUDGE:review:${nodeId}` (`:1314`) | class H; `excludeHiddenSubtrees` (`:261-297`); `HIDDEN-UNJUDGEABLE`, excluded from the served number (`:1520-1535`) | **Yes.** DR-176(4) retired the loud stop precisely so one dead review hides one subtree. |

Hold accounting is run-wide, not per-maker (`countCooldownHolds`,
`max_cooldown_holds_per_run: 2`) — unaffected by panel size. **No redesign is
required and none is proposed.** One consequence must be stated plainly for V:
at a panel of 3+, losing one maker mid-run costs its root subtree and its
reviews, and the run serves the rest with marks; it does not cost the debate.
That is DR-176 working as ruled, and discovery makes it more likely to be
exercised, not less.

### 1.7 The boundary nobody has named: admission → execution

There is a gap between the ask pinning a panel and the runner claiming the work
item. Today the runner enforces:

```ts
if (this.#configuredMakers.length < run.agentCount) {
  throw new TypedDomainError("RUN_MAKER_CONFIGURATION_MISMATCH",
    `The run requests ${run.agentCount} maker(s), but only ${this.#configuredMakers.length} real maker gateway(s) are configured`);
}                                                    // apps/runner/src/index.ts:840-844
```

**This is a second refusal over panel size, and no ledger row has ever named
it.** DR-181(2) — *"No lawful debate is ever refused over panel size again"* —
kills it as surely as it kills the M-guard. Under discovery it would fire
whenever a CLI dies in the seconds between admission and claim, destroying a
run at zero spend over a hiccup.

It cannot simply be deleted: the runner must still resolve *which* gateways
serve the pinned panel. The replacement is a **match, not a count**, and the
slice at `:846` (`this.#configuredMakers.slice(0, run.agentCount)`) goes with
it — a prefix slice silently assumes the gateway array's order matches the
panel's, which is exactly the ordering coupling that already makes
`policy.providers[0]` the hardcoded primary (`acceptance/main.ts:174-199`).
Gateways are selected by `providerRef` identity against
`run.discovered_panel`. Members with no gateway at claim time are the subject
of **VROW-5** (§9) — this plan recommends the DR-174 courtesy then a recorded
absence, not a refusal, but it is a genuine dual-lineage split and V rules it.

---

## 2. THE KILL LIST

Verdict vocabulary: **RETIRE** (deleted), **REPURPOSE** (survives with a
different job), **RECORD-ONLY** (survives as a persisted fact, never an input).

### 2.1 The M-guard cluster — RETIRE, entire

| Site | Verdict | Consequence named |
|---|---|---|
| `apps/runner/src/index.ts:430` `const DR159_RATIFIED_MAKER_COUNT = 2` | **RETIRE** | The literal the lens called an independently editable source. Gone, not relocated. |
| `:433-443` `assertRatifiedMakerCount` | **RETIRE** whole function | Its `M < 1` branch (`RUN_MAKER_COUNT_INVALID`, `:435`) is **not** lost: an independent throw survives at `:562` in `buildCrossRootExchangePlan`, and the new DDL identity plus `agent_count > 0` (`migrations/0000_s00.sql:54`) enforce positivity structurally. |
| `:439` typed code `RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE` | **RETIRE** | **No vocabulary edit needed** — `TypedDomainError.code` is a bare `string` (`packages/kernel/src/index.ts:280-285`); there is no union or enum to prune. It dies at its one throw site plus test literals. |
| `:299-302` `TEST_ONLY_UNRATIFIED_MAKER_COUNT_BYPASS`, `:338-342` settings field, `:834-839` call | **RETIRE** | The bypass exists solely to let tests exceed the ceiling. With no ceiling it is dead weight and a standing invitation to reintroduce one. `tests/integration/database.test.ts:28, :1609` follow it. |
| `:840-844` `RUN_MAKER_CONFIGURATION_MISMATCH` | **REPURPOSE** → §1.7 | The unnamed second panel-size refusal. Becomes gateway resolution by `providerRef` + VROW-5's disposition. |
| `:846` `slice(0, run.agentCount)` | **RETIRE** | Replaced by identity match; removes a hidden ordering assumption. |

**DR-165(3) and DR-115 at any panel size.** Nothing above touches either. The
no-unjudged-opinion law lives entirely in the review loop and the class-H
exclusion (`:1304-1359`, `:1396-1397`, `excludeHiddenSubtrees` `:261-297`);
honest provenance lives in the CLI-reported model id (`claude-relay.ts:62-67`)
and per-artifact `(maker, model_id, provider_ref)` lineage. The M-guard
protected a **cost table**, never an integrity law — DR-162-A said so
explicitly: *"The guard is a COST boundary, not an algorithmic one."* Removing
it removes a cost boundary.

### 2.2 `agent_count` — the INPUT dies, the FACT survives

| Site | Verdict |
|---|---|
| `packages/contract/src/index.ts:114` `agent_count: z.number().int().positive()` in `AskRequestSchema` | **RETIRE from the ask.** DR-180 removed it from the user surface; DR-181 removes it from the wire. An ask that carries it is no longer meaningful, because the panel is not the asker's to choose. |
| `apps/v2-ui/lib/api.ts:319`; `apps/v2-ui/app/new/page.tsx:57, :63, :82-85, :101, :126, :139-141, :157` | **RETIRE** with the field |
| `web/app/new/page.tsx:19, :22, :34, :59` (legacy app) | **RETIRE** — a user-typed agent count, dead twice over |
| `acceptance/run-acceptance.ts:83` `--agent-count` flag | **RETIRE** — the ceremony discovers its panel like everyone else |
| `apps/api/src/index.ts:373` `agentCount: ask.agent_count` | **REPURPOSE** — becomes the discovered panel, and the count is derived at the write |
| `packages/db/src/index.ts:205, :288, :298` (`StartRunInput.agentCount`, INSERT) | **REPURPOSE** — input becomes `discoveredPanel`; the column is written as `jsonb_array_length(...)` so drift is unrepresentable |
| `migrations/0000_s00.sql:54` `core.run.agent_count` | **RECORD-ONLY** — survives as the recorded fact of the discovered panel, now bound by `run_panel_count_identity` (§1.5) |
| `packages/db/src/schema.ts:24`, `:488-514` `readFrozenHead` | **RECORD-ONLY** — read as a fact |
| `apps/runner/src/index.ts:838, :840, :843, :846` | **RETIRE** (see §2.1) |

**Answering the question as posed:** yes — `agent_count` survives as a recorded
FACT of the discovered panel while dying as an INPUT, and the DDL identity is
what makes "recorded fact" mean something stronger than "a number somebody
wrote".

### 2.3 The envelope cluster

| Site | Verdict | Reasoning |
|---|---|---|
| `acceptance/seed-register.ts:188-206` `runCostEnvelope` row (Set A, 60/108/204/396/780) | **RETIRE (row removed)** | It is a per-depth **ceiling table derived for M=2** — precisely what DR-181(2) retires, along with "every future ceiling-ratification ceremony". |
| `packages/register/src/index.ts:150-157, :202-242` schema + `readRunCostEnvelopePolicy` (`RUN_COST_ENVELOPE_UNRESOLVED` / `_INVALID` / `_PROVENANCE_MISSING`) | **RETIRE** | Loaders for a row that no longer exists. |
| `packages/register/src/index.ts:253-277` `resolveRunCostEnvelopeBasis` | **REPURPOSE** → `computeStructuralCeilingBasis(panelSize, depth, bounds, deathPolicy)` (§3). Same seam, same call sites (`apps/api/src/main.ts:37`, `acceptance/main.ts:296-299`), same frozen-object return. |
| `:262-265` `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED` | **RETIRE** | This is *"your (depth, tier) has no ratified member — refused"*, surfaced as HTTP 422 (`apps/api/src/index.ts:134-141`). It is a lawful debate refused because a table did not cover it. A computed ceiling has no members and cannot be unresolved. **Side benefit:** the standing `casual`-tier trap dies with it — no `casual` member is seeded, and casual asks work today only because the deployment `riskTier` floor escalates them (`seed-register.ts:71`). |
| `migrations/0000_s00.sql:56` `core.run.envelope_basis` | **REPURPOSE, column unchanged** | Now carries `{ kind: "COMPUTED_STRUCTURAL_CEILING", max_model_attempts, panel_size, depth, per_site_attempts, hold_cap, final_retry_attempts, formula_version, bounds_source_ref }`. `NOT NULL` and the single write site are preserved. The serve disclosure (`packages/serve/src/index.ts:1367-1372` → `AnswerHonestyDrawer.tsx:199-204`, which renders `JSON.stringify(basis)`) needs **no code change** and becomes strictly more honest: it stops disclosing "a ratified number" and starts disclosing a formula with its inputs. |
| `packages/budget/src/index.ts:42-78` `parseCostEnvelopeBasis` | **REPURPOSE** — parses the new shape; `RUN_COST_ENVELOPE_UNRESOLVED` there stays as a corruption guard on the pinned basis (not a ratification refusal). |
| `packages/budget/src/index.ts:246-273` counters + `assertModelAttemptAllowed` + `RUN_COST_ENVELOPE_EXHAUSTED` | **REPURPOSE as the tripwire** (§3) — **no rename, no new typed code.** See §3.3 for why churn is refused here. |
| `apps/v2-ui/lib/v3/adapter.ts:625-690`, `apps/v2-ui/lib/runCostEnvelopeSelection.ts`, `apps/v2-ui/app/new/page.tsx:120-131, :265-269, :400` (the "up to N model attempts" ask-surface disclosure) | **RETIRE** | A ratified ceiling was a promise to the user; a bug tripwire is not. Showing a computed backstop on the ask surface would resurrect exactly the machine-facing disclosure DR-180 removed. |
| `acceptance/grok01-envelope-derivation.ts` + `.test.ts` | **RETIRE** | The M=3 ceiling **proposal** machinery. DR-181 abolishes the ceremony it fed. Its arithmetic is not lost — it is the tripwire's formula (§3.2), which is where it always belonged. |
| `acceptance/main.ts:205-207` `maximumRunAttempts` (drives `claimMs`) | **REPURPOSE** — claim length must derive from the computed ceiling at the worst supported `(panel, depth)`, not from a table's max. **Must not shrink**: a claim shorter than a run with two 10-minute holds loses the work item mid-run (`assertClaimCoversCall`, `apps/runner/src/index.ts:725-733`). |

### 2.4 The ASK-01 derivation — the second source, RETIRED

`apps/v2-ui/app/new/defaults.tsx`:

| Lines | Symbol | Verdict |
|---|---|---|
| `:36-37` | `SET_A_HEADROOM_MULTIPLIER`, `HEALTHY_FIXED_MODEL_CALLS` | **RETIRE** |
| `:39-44` | `ratifiedEnvelopeAttempts` | **RETIRE** — a second, independent copy of the engine's structural formula, living in the browser |
| `:46-90` | `deriveRatifiedMakerMaximum` (brute-force inversion at `:69-77`, four `ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE` throws) | **RETIRE** — the second M source the lens named |
| `:92-140` | `deriveAgentCountDefault`, incl. `lawfulMakerCount = Math.min(...)` at `:135` and the provenance string at `:138` | **RETIRE** — the form supplies no count at all |
| `:162, :175-179, :189` | `NewDebateAskDefaults.agentCount`, `ASK_AGENT_COUNT_INVALID`, `agent_count` in `buildNewDebateAskConfig` | **RETIRE** |

What survives in that file, untouched: `deriveSessionAskDefaults` (`:17-28` —
DR-166-A asker-relative owners), `deriveRiskTierDefault` (`:142-154`),
`tier_source`/`tier_provenance_ref` PROV-01 wiring (`:185-186`).

**The `/new` surface after this is exactly DR-166-C/DR-180's:** QUESTION · RISK
· BUDGET · DEPTH DIAL · START — and it now has **no maker-count code path at
all**, so no future reseed of anything can make bare Start refuse. That is the
property DR-180 asked for and DR-181 makes structural rather than arithmetic.

### 2.5 Register rows and the roster

| Row | Verdict |
|---|---|
| `configuredProviderSet` (`seed-register.ts:241-267`) | **REPURPOSE — meaning only, value unchanged.** It becomes the **probe-target registry**: the CLI shapes discovery scans for (DR-178 registration-not-engineering; DR-179 CLI shapes only). Keeping the value byte-identical keeps its `source_ref` and avoids a needless hash bump; only its documentation changes. Its `requiredDistinctMakers: 1` remains DR-137's mono floor input. |
| `packages/critique/src/index.ts:244-289` `readDeploymentMakerCapability` | **REPURPOSE** — same reader, but the admission input becomes the **discovered** makers, not the configured ones. |
| `:324-338` `assertMakerAdmission` | **REPURPOSE — and it gets more honest.** Today the high-stakes ≥2-maker floor passes on *configured* makers even if both are dead. Fed by discovery, DR-137's anti-monoculture floor finally means what it says. Whether it still **refuses** at a discovered panel of 1 is **VROW-2**. |
| `:340-355` `applyCriticUnavailableCap` | **SURVIVES** — already the exact degrade shape (`serves: true`, `SINGLE-LINEAGE` + `CRITIQUE-UNAVAILABLE`, band cap, lift condition). It is the mechanism VROW-2's recommended answer uses. |
| `acceptance/fair-debate.ts:68-74` `FAIR_DEBATE_MAKER_COUNT_UNSATISFIED` | **RECORD-ONLY, unchanged** — a DR-140(b) *acceptance report* assertion, not a run refusal. On a machine where discovery finds one model it reports honestly that no fair debate was possible that day. That is a true statement, not a defect. |
| `acceptanceOrganCostBounds` (`:160-171`), `runDeathPolicy` (`:172-183`), `hiddenNodeScoreThreshold` (`:184-187`) | **UNCHANGED** — and the first two become explicit, cited inputs to the computed ceiling (§3.2), which is a tightening of provenance, not a loosening. |

**Reseed consequence, stated because it is V's ceremony.** Removing the
`runCostEnvelope` row changes the register hash, so DR-172's ruled
backup-then-reseed flow applies at the next boot. The seed integrity guard
(`acceptance/seed-register.ts:300-327`, `ACCEPTANCE_REGISTER_CONFLICT:${row_key}`)
will otherwise stop loudly on the standing DB — by design.

### 2.6 The mono-maker composition, named explicitly

DR-181 makes a panel of **one** reachable in ordinary production for the first
time. Its interaction with DR-137 is not a special case bolted on; it is the
N-generic algorithm (DR-162-A) evaluated at N=1. Three facts, each cited:

1. **DR-137 already legalizes it.** Mono-model runs are lawful for casual and
   standard; the ≥2 floor survives for high-stakes only
   (`packages/critique/src/index.ts:328-332`). Discovery finding one healthy
   model therefore **meets** the DR-137 mono rules with no new law.
2. **The engine already composes it.** `effectiveMakerCount === 1` emits
   `SINGLE-LINEAGE` + `CRITIQUE-UNAVAILABLE` on the fact bundle
   (`apps/runner/src/index.ts:1469-1471, :1482`) and as full condition-mark
   records with `liftPath: "RUN_DIFFERENT_MAKER_CRITIQUE"` (`:1496-1514`). A
   mono answer is **visibly** mono — DR-137's own promise, DR-115 satisfied.
3. **DR-165(3) is satisfied by construction at M=1, and that is why the tree is
   empty.** The review loop is skipped (`:1309`) because
   `selectDifferentMakerReviewer` cannot exist mono-lineage
   (`DIFFERENT_MAKER_REVIEWER_UNAVAILABLE`, `:101-115`), and the expansion plan
   is `[]` (`:1209-1210`; `buildMultiMakerExpansionPlan` refuses M<2 at
   `:532-538`). No opinion goes unjudged because **no opinion beyond the single
   root position is ever authored.** Serving unjudged children is the thing
   DR-165(3) forbids; not authoring them is the lawful alternative.

**The honest defect this exposes — and it is real.** At M=1 the run authors one
root and stops, *regardless of the depth V chose*. V sets the DR-157 dial to 5
and gets one node, with nothing on the answer saying why. That is a DR-115
break waiting for the first single-model machine, and DR-181 is what makes it
reachable. It must be closed in the same ticket. The recommended close is a
disclosure, not a refusal and not an engine rewrite — **VROW-3** (§9).

### 2.7 What this plan does not touch, deliberately

`buildMultiMakerExpansionPlan` (`:527-557`), `buildCrossRootExchangePlan`
(`:559-569`), `selectDifferentMakerReviewer` (`:101-115`), the review loop
(`:1304-1359`), `excludeHiddenSubtrees` (`:261-297`), `withCooldownRetry`
(`:179-259`), the whole condition-mark vocabulary
(`packages/kernel/src/index.ts:67-109`), every DR-176 mark and its DDL
(`migrations/0021`). All are already M-parameterised (PANEL-01 rev1's Opus lens
verified the planner; DR-162-A recorded it). **The engine needs no change to
run a discovered panel** — which is the whole point of DR-162-A, and the
strongest evidence that DR-181 is a removal, not a build.

---

## 3. THE TRIPWIRE

### 3.1 The ceiling was always computed; the ceremony froze it and called it a ruling

This is the finding on which the recommendation rests.

Set A's ratified members are not judgement calls. They are the output of the
engine's own structure, evaluated at M=2. Reading the planner
(`apps/runner/src/index.ts:527-557`), the exchange builder (`:559-569`), the
review loop (`:1304-1359`) and the derivation
(`acceptance/grok01-envelope-derivation.ts:26-43`), then evaluating:

| depth | nodes/root `2^(d+1)−1` | authored `M·nodes + M(M−1)` | reviews | +4 fixed | healthy | **×3** | **seeded** |
|---|---|---|---|---|---|---|---|
| 1 | 3 | 8 | 8 | 4 | 20 | **60** | **60** |
| 2 | 7 | 16 | 16 | 4 | 36 | **108** | **108** |
| 3 | 15 | 32 | 32 | 4 | 68 | **204** | **204** |
| 4 | 31 | 64 | 64 | 4 | 132 | **396** | **396** |
| 5 | 63 | 128 | 128 | 4 | 260 | **780** | **780** |

Ten members, ten exact matches (`acceptance/seed-register.ts:192-203`). And the
`×3` is not headroom in any discretionary sense — it is
`acceptanceOrganCostBounds.*.maxAttempts = 3` (`seed-register.ts:165-167`), the
per-call-site attempt bound, multiplied through.

**So the ratified table was `structure × attempt-bound` all along.** The
ceremony consisted of computing that, freezing it into ten literals, and
requiring a V card before any new panel size could use arithmetic that was
already true. DR-178(3) had already flagged that this cannot scale to a market
of models; DR-181 finishes the thought. **The tripwire is not a new mechanism —
it is the table's own generator, evaluated at run time instead of at
ratification time.**

### 3.2 `f`, from the real call-site inventory

Every term is a cited code fact, not an invention:

```
branchingFactor  = 2                            // apps/runner/src/index.ts:547
                                                //   for (const polarity of ["support","attack"])
nodesPerRoot(d)  = 2^(d+1) − 1                  // planner :540-553, breadth-first, d rounds
authored(M,d)    = M · nodesPerRoot(d)          // one complete subtree per root, :539-555
                 + M · (M − 1)                  // ordered distinct pairs, buildCrossRootExchangePlan :559-569
authored(1,d)    = 1                            // M=1: empty plan (:1209-1210), no cross-root pairs
reviews(M,d)     = authored(M,d)   for M ≥ 2    // exactly one elected reviewer per authored node, :1304-1359
reviews(1,d)     = 0                            // :1309 guard
judgeSites(M,d)  = authored + reviews           // every one of them is a JUDGE-bound call site
fixedSites       = maxRecompose · (1 + segmentCap + 1)
                 = 2 · (1 + 2 + 1) = 8          // COMPOSER:${a} :1654; CONFORMANCE:${a}:${s} :1705
                                                //   (segmentCap 2 — runner :78); POST_COMPOSE_R9:${a} :1727
                                                //   maxRecompose 2 — acceptance/main.ts:242
A_judge          = judgeBound.maxAttempts       // register: acceptanceOrganCostBounds.JUDGE.maxAttempts = 3
A_organ          = max(composerBound.maxAttempts, conformanceBound.maxAttempts)   // = 3
finalRetryTotal  = maxCooldownHoldsPerRun × finalRetryAttempts
                 = 2 × 1 = 2                    // register: runDeathPolicy, seed-register.ts:172-183
                                                //   run-wide, not per site — withCooldownRetry :250-256
                                                //   and the per-site clamp remainingProviderAttempts :175-177

ceiling(M,d)     = judgeSites(M,d) · A_judge + fixedSites · A_organ + finalRetryTotal
```

Every input is either a register row (attempt bounds, death policy) or a fact
about the code (branching factor, segment cap, recompose cap, fixed-organ
count). **The code facts must be derived from exported constants and pinned by
test, never re-typed into the formula** — that is the mistake
`defaults.tsx:39-44` made, and it is the mistake that let a browser file hold
an opinion about the engine's shape.

Worked values (`A_judge = A_organ = 3`, `fixedSites = 8`, `finalRetryTotal = 2`):

For M ≥ 2 this reduces to `6·authored(M,d) + 26`; for M = 1 to `3·1 + 26`.

| M \ depth | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| **1** | 29 | 29 | 29 | 29 | 29 |
| **2** | 74 | 122 | 218 | 410 | 794 |
| **3** | 116 | 188 | 332 | 620 | 1196 |
| **4** | 170 | 266 | 458 | 842 | 1610 |

(M=1 is depth-invariant precisely because the tree is empty — §2.6's defect,
visible in the arithmetic. These are illustrative evaluations of `f`, not
proposed seeds: nothing here is ratified, and T7 recomputes them from the
engine's own plan objects rather than trusting this table.)

### 3.3 Where it is computed, what fires, and why nothing is renamed

**Computed** at admission, in `evaluateAskAdmission`
(`apps/api/src/index.ts:313-337`), at the seam
`resolveRunCostEnvelopeBasis` occupies today — same injected-resolver shape,
same frozen return, same two composition roots (`apps/api/src/main.ts:37`,
`acceptance/main.ts:296-299`). Inputs: `discovered_panel.length`, the ask's
depth, and the two register rows. **Pinned** into `core.run.envelope_basis`
(§2.3), so the run's ceiling is immutable for its lifetime and fully
reconstructible from its own record.

**Enforced** unchanged: `BudgetRepository.assertModelAttemptAllowed`
(`packages/budget/src/index.ts:265-273`) already compares
`countRunModelAttempts` against `basis.maxModelAttempts` before every call, in
the budget-guarded gateway (`apps/runner/src/index.ts:1944-1946`).

**On breach:** `RUN_COST_ENVELOPE_EXHAUSTED` — **the existing typed code, kept
deliberately.** This plan refuses the rename, and says why: retiring that code
would drag `decideBudgetPressure`'s `ENVELOPE_EXHAUSTED` condition mark (a
**closed** kernel vocabulary, `packages/kernel/src/index.ts:67-109`, minted
once by AC-65 authority), the contract's `cost_envelope.state` enum
`["WITHIN","ENRICHMENT_SKIPPED","EXHAUSTED"]`
(`packages/contract/src/index.ts:438-443`), `packages/battery/src/index.ts:390`
terminal reasons, and every consumer of all three — a large, entirely cosmetic
blast radius. **DR-181 asked for an apparatus to die, not for a renaming
ceremony to replace it.** What changes is the *basis content* and the words
around it; the wire and the vocabulary hold still. The breach is nonetheless a
**BUG signal, not a budget event**, and the pinned basis carries
`formula_version` and every input so a breach report names exactly which
structural assumption the engine violated.

### 3.4 It cannot refuse a normal run — and that is a test obligation, not a claim

`ceiling(M,d)` is by construction the sum of every call site the plan can
contain times the attempts each is lawfully allowed, plus the run-wide final-retry
allowance. A run reaching it must have made a call the structure does not
permit. The proof obligation (§5): for M ∈ 1..8 × d ∈ 1..5, `ceiling(M,d)` ≥
the enumerated worst-case lawful attempt count, computed independently in the
test from the plan objects the engine actually builds — not from a restatement
of the formula.

Note what the table in §3.2 shows against Set A: the computed ceiling is
**higher everywhere** (74 vs 60, 794 vs 780). The apparatus DR-181 retired was
tighter than the structure it claimed to bound, which is §3.6.

### 3.5 The honest case for killing it — V is open to this, so it gets a fair hearing

**For killing it.** Total spend is *already* structurally finite. Every call
site is hard-bounded by a ledger count keyed on
`(runId, workItemId, contractHash, callSiteKey)`
(`packages/ledger/src/index.ts:517-531`) clamped through
`remainingProviderAttempts` to `CALL_BUDGET_EXHAUSTED`
(`apps/runner/src/index.ts:1948-1955`). The plan is a finite list built once
(`:527-557`) and the walk is a `for` over that list (`:1244`). Under those two
facts a run cannot spend unboundedly, and the run-total ceiling adds nothing a
correct engine needs.

**For keeping it.** The per-site bound is keyed **by call-site key**. A bug that
mints *new* keys — an off-by-one in `nextNodeIndex` (`:542`), a re-planning
loop, a resumption path that re-derives keys differently — escapes every
per-site bound while each individual site stays innocently within 3. That is
exactly the runaway class, and it is the only class the per-site bound cannot
see. Two supporting facts: the run-total counter
(`countRunModelAttempts`, `packages/budget/src/index.ts:246-254`) exists and is
disclosed to the user as `consumed_model_attempts` whether or not it has a
bound — an instrumented counter with no bound is strictly worse than one with a
bound that cannot fire; and the cost is one integer comparison per call against
data already in hand.

**RECOMMENDATION: KEEP**, as a computed bug tripwire with no ceremony, no user
surface, and no ratification. It dies on V's word and this plan will not
re-argue it; killing it costs the runaway-bug backstop and nothing else. If V
kills it, the clean deletion is `assertModelAttemptAllowed`'s comparison only —
the counter, the basis and the disclosure all stay, because they are honest
facts about what a run spent.

### 3.6 A finding that falls out of the arithmetic: Set A was short

At every ratified depth and any M, Set A equals `3·judgeSites + 12`, while the
lawful worst case is `3·judgeSites + 24 + 2`. Two causes:

1. **DR-174's final retry was never added to the ceiling.** DR-172 ratified Set
   A on 2026-08-13; DR-174/DR-174-A added `final_retry_attempts: 1` with
   `max_cooldown_holds_per_run: 2` on 2026-08-14. Nobody re-derived. Deficit:
   **2 attempts**, exactly.
2. **Recompose was counted once.** Set A's `healthyFixedCalls = 4` is one
   compose round; `maxRecompose: 2` (`acceptance/main.ts:242`) permits two, so
   the lawful fixed-site count is 8, not 4. Deficit: **12 attempts**.

Total: a lawful run could exhaust its ratified envelope **14 attempts before its
lawfully-bounded retries were spent** — refusing a legal debate, at depth, after
real spend. Not observed yet because reaching it needs near-total transport
failure plus a recompose. **This is the M-apparatus's failure mode in miniature:
a frozen number silently drifting from the structure it claimed to bound, with
a ratification ceremony standing between the defect and its fix.** A computed
ceiling makes the class unrepresentable. Recorded here as evidence for DR-181,
and it needs no separate fix — the retirement is the fix.

---

## 4. Depth stays V's dial; the coverage guard, reconciled honestly

**Depth is untouched.** DR-157's 1..5 lives in `resolveExpansionDepth`
(`apps/runner/src/index.ts:515-525`, `RUN_DEPTH_PARAMS_INVALID`), which stays
exactly as it is. Its input moves from `envelopeBasis.derivedFrom.depthParams`
to `run.depthParams` (§1.5) — same value, one indirection fewer.

**The coverage guard must be deleted, and the honest reason is not
"duplication".** `assertReviewCoverageEnvelopeRatified`
(`apps/runner/src/index.ts:117-129`, called `:848`) reads:

```ts
  // DR-172 ratifies envelope Set A (60/108/204/396/780), sized by XREV-01's
  // audited arithmetic to carry TOTAL cross-maker review coverage (DR-165(3))
  // at depths 1..5. …
  if (depth > 5) {
    throw new TypedDomainError("NODE_REVIEW_COVERAGE_ENVELOPE_UNRATIFIED",
      `DR-172: total cross-maker review coverage is ratified for depths 1..5; depth ${depth} has no ratified member`);
  }
```

Its stated basis is *"no ratified member exists to carry their coverage"*. When
the ratified table dies, that sentence has no referent. But the guard's **real**
job under DR-165(3) was: *if the ceiling cannot fit total cross-review at this
depth, stop loudly rather than serve unjudged opinions.* Under a computed
ceiling that condition is **structurally unreachable** — `ceiling(M,d)` is
derived from `reviews(M,d) = authored(M,d)`, i.e. total coverage is an *input*
to the ceiling, so the ceiling can never be too small to hold it. The guard is
not merely redundant; it is a check on a condition that can no longer occur.

Deleting it leaves DR-157's `resolveExpansionDepth` as the single depth
authority — and it already fires **first** (`:833` before `:848`), which is why
DR-172-A recorded that the coverage guard is unreachable in production anyway.

**The DR-159 hazard is acknowledged and answered.** The ledger warns
(`decisions-ledger.md:985`): *"the guard is correct but deleting it leaves the
whole suite green."* Deleting a guard whose absence no test detects is exactly
that hazard. So the deletion is paired, in the same commit, with the
replacement pin: `tests/unit/xrev01-node-review.test.ts:41-53` is re-pointed at
`resolveExpansionDepth` keeping both mutation kills (delete-the-bound → depth 6
passes; narrow-the-bound → depth 3 throws), **plus** a new coverage-sufficiency
pin (§5, T7) asserting `ceiling(M,d) ≥ 2·authored(M,d)` for all supported M and
d — which is the property the retired guard was gesturing at, now stated
directly and unable to silently rot.

---

## 5. Test obligations (mutation-proof, P1)

Every pin below names the mutation it kills. The house precedents for
structural pins are `tests/unit/dr174-resilience.test.ts:51` (asserts runner
source text) and `acceptance/runtime-policy.test.ts:84-93` (asserts the shipped
policy source contains no local arithmetic) — both are appropriate here, since
several obligations are "this code must not exist".

**T1 — the panel is discovered, and discovery is N-generic.** Fixtures for
panels of **1, 2, 3 and 4**. Four is required: without it, "3 is the new 2" is
a surviving mutation. *Kills:* any reintroduced ceiling; any `>= 2` assumption
in admission.

**T2 — a dead CLI costs one member, not the debate.** Three probe targets, one
failing. Assert: panel length 2, the failed provider absent from
`discovered_panel`, its `ABSENT` probe row present with its loud failure code,
and the run **admitted and served**. *Kills:* the `Promise.all` regression
(`run-acceptance.ts:169`); "refuse when a configured provider is missing"
(`main.ts:180`); a silent absence with no evidence row.

**T3 — lineage honesty.** A healthy probe records the **CLI-reported** model id;
a probe reporting zero or several ids yields `ABSENT` with
`*_CLI_MODEL_UNRESOLVED`, never a pick. *Kills:* hardcoding a model id (the
live `model-shim.ts:12` defect, D1); `reportedModels[0]` without the length
check.

**T4 — the count identity cannot drift.** A repository test attempting to write
`agent_count` inconsistent with `discovered_panel` must be rejected by
`run_panel_count_identity`. *Kills:* reintroducing an independently writable
count — the lens's §A2 hazard, now killed by the database rather than by
discipline.

**T5 — freshness.** A record inside the window is reused with no CLI spawn; a
record outside it triggers exactly one re-probe for that provider only; a
re-probe failure removes that member and **never** refuses the ask. *Kills:*
"refuse when stale"; "serve stale silently"; "re-probe everything every ask"
(assert the spawn count).

**T6 — mono panel (§2.6).** Panel of 1 → run serves, carrying `SINGLE-LINEAGE`
+ `CRITIQUE-UNAVAILABLE` records with `liftPath: "RUN_DIFFERENT_MAKER_CRITIQUE"`,
and — per VROW-3 — the depth disclosure. *Kills:* "M=1 refuses"; "M=1 claims the
requested depth"; dropping the mono marks.

**T7 — the tripwire cannot refuse a normal run.** For M ∈ 1..8 × d ∈ 1..5:
`ceiling(M,d)` ≥ the worst-case lawful attempt count computed **from the plan
objects the engine actually builds** (`buildMultiMakerExpansionPlan`,
`buildCrossRootExchangePlan`) times the register bounds — never from a
restatement of `f`. Plus `ceiling(M,d) ≥ 2·authored(M,d)` (§4's coverage
sufficiency). *Kills:* lowering the formula; dropping the final-retry or
recompose terms — the two defects §3.6 found in Set A.

**T8 — the formula's code facts are the engine's code facts.** Assert
`branchingFactor`, `segmentCap`, `maxRecompose` and the fixed-organ count used
by `f` equal the values the runner actually uses. *Kills:* the
`defaults.tsx:39-44` class of defect — a second copy of the engine's shape
drifting silently.

**T9 — the M-apparatus stays dead.** Source-level assertions that
`DR159_RATIFIED_MAKER_COUNT`, `assertRatifiedMakerCount`,
`RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE`,
`TEST_ONLY_UNRATIFIED_MAKER_COUNT_BYPASS`, `deriveRatifiedMakerMaximum` and
`ratifiedEnvelopeAttempts` appear **nowhere** in shipped source. *Kills:*
resurrection, in any file, including a browser one.

### The in-flight ASK-01 rev2 work — what survives, what dies, and the sequencing

The rework (`docs/.../logs/run-ask01-rev2.sh`, tests-only, resuming codex
session `01a00017-…`) carries three items against
`tests/render/ux01-new-debate-form.test.tsx`:

| Item | Fate under DR-181 |
|---|---|
| **R1** — the restored DR-166-A dual-token page proof (two tokens, real submit, `decision_owner`/`action_owner` user-relative and distinct, the five machine fields absent from the DOM) | **SURVIVES INTACT.** It pins DR-166-A and DR-180, neither of which DR-181 touches. The `"agentCount"` entry in its machine-field loop **stays** — the field must still be absent, and after §2.4 its absence is structural rather than conditional. One strengthening is added, not substituted: assert the submitted payload carries no `agent_count` key at all. |
| **R2** — the `M7` exactness pin on `deriveRatifiedMakerMaximum` (ceiling 109 vs 108 → `ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE`) | **DIES WITH THE FUNCTION IT PINS.** It is a correct test of code DR-181 retires. It must be removed **in the same commit that removes `deriveRatifiedMakerMaximum`**, citing DR-181 — never earlier (that would be an unpinned deletion), never later (that would be a red suite). |
| **R3** — the `aria-controls="additionalRunOptions"` a11y pin | **SURVIVES, untouched.** |

**Sequencing, recommended:** let ASK-01 rev2 land first, exactly as scoped —
it is tests-only, it unblocks a BLOCKING review from both lenses, and it
restores a load-bearing DR-166-A proof that is currently deleted (the mutation
"owners not user-relative" survives all 587 tests today). **Do not widen the
in-flight worker's scope to DR-181.** The DR-181 ticket then removes R2 as part
of its own kill list, with the removal justified by the ruling rather than by
convenience.

---

## 6. NON-goals (explicitly out of scope)

1. **No evaluator.** Model-selection-by-debate-kind is FUTURE work in V's own
   words (DR-181(4)), gated on accumulated data; it belongs to the harness
   mission's intake seed. This plan selects nothing — it takes every healthy
   model it finds, which is exactly what V ruled.
2. **No API keys.** DR-179 is absolute. Discovery scans CLI shapes only; no key
   material enters repo, register, environment or config. The probe proves auth
   only as a side effect of a real CLI round-trip (§1.2), and no auth-specific
   probe is designed.
3. **No scheduler rework.** `claimMs` derivation follows the ceiling (§2.3)
   because it must, but Hatchet, the dispatcher and the work-item lifecycle are
   untouched. `apps/runner/src/main.ts` stays as it is — a known-dead engine
   path, named in §1.4 and not pretended into service.
4. **No generic provider-registration layer.** DR-178's adapter-shape
   convergence is the harness mission's; this plan reuses the three
   hand-built relays exactly as they are.
5. **No new condition-mark members** unless VROW-3/VROW-5 force one; the
   default position is that DR-176's family already covers every case.
6. **No UI beyond deletion.** The ask surface loses its count machinery and
   gains nothing (DR-180). Answer-side panel disclosure already exists via
   DR-165(2) lineage cards.

---

## 7. File-level touch list

**New:**
- `acceptance/discovery.ts` — probe targets, `probeProvider`, `discoverPanel`
- `migrations/0022_dr181_discovery.sql` — `core.provider_probe`;
  `core.run.discovered_panel`; `run_panel_count_identity`
- `tests/unit/dr181-discovery.test.ts`, `tests/unit/dr181-ceiling.test.ts`

**Modified:**
- `apps/runner/src/index.ts` — delete `:299-302`, `:338-342`, `:430-443`,
  `:117-129`; rewrite `:834-848`; depth from `run.depthParams`
- `apps/api/src/index.ts` — `evaluateAskAdmission` `:313-337`;
  `submit` `:358-386`; `RunCreationSettings` `:290-299`
- `packages/register/src/index.ts` — `:103`, `:150-157`, `:202-277`
- `packages/budget/src/index.ts` — `:42-78` basis shape
- `packages/db/src/index.ts` — `:205`, `:285-302`, `:486-514`;
  `packages/db/src/schema.ts`
- `packages/contract/src/index.ts` — `:114` (`agent_count` off the ask)
- `packages/critique/src/index.ts` — admission fed by discovery `:244-338`
- `acceptance/model-shim.ts` (D1), `acceptance/run-acceptance.ts:83, :156-192`
  (D2), `acceptance/main.ts:157-234, :296-299` (D3), `acceptance/seed-register.ts:188-206`
- `apps/v2-ui/app/new/defaults.tsx` `:36-140, :162, :175-189`;
  `apps/v2-ui/app/new/page.tsx`; `apps/v2-ui/lib/api.ts:319`;
  `apps/v2-ui/lib/v3/adapter.ts:625-690`;
  `apps/v2-ui/lib/runCostEnvelopeSelection.ts`
- `web/app/new/page.tsx` (legacy agent-count field)

**Deleted:** `acceptance/grok01-envelope-derivation.ts` + `.test.ts`

**Tests re-pinned:** `tests/unit/pro01-runner-tree.test.ts:15-20`;
`tests/integration/database.test.ts:28, :1329-1340, :1609`;
`tests/unit/xrev01-node-review.test.ts:41-53`;
`tests/render/ux01-new-debate-form.test.tsx` (R2 removal, §5);
`tests/unit/register-s09.test.ts`; `tests/unit/pol01-policy.test.ts:75-91`;
`tests/unit/api.test.ts:153-157`; `acceptance/seed-register.test.ts:120-138`

---

## 8. Register rows proposed

| Row | Status | Value | Provenance |
|---|---|---|---|
| **`panelDiscoveryPolicy`** | **NEW — requires V's number** | `{ kind: "PANEL_DISCOVERY_POLICY", probe_freshness_ms: <VROW-1>, probe_max_attempts: 1 }` | `acceptance:DR-181:V-approved` once V rules |
| `configuredProviderSet` | **UNCHANGED value, repurposed meaning** (probe-target registry) | as seeded, `seed-register.ts:241-267` | `acceptance:DR-177:V-approved` — unchanged, no hash churn |
| `acceptanceOrganCostBounds` | **UNCHANGED** — now an explicit cited input to `f` | `seed-register.ts:160-171` | unchanged |
| `runDeathPolicy` | **UNCHANGED** — now an explicit cited input to `f` (fixing §3.6's first deficit) | `seed-register.ts:172-183` | unchanged |
| `runCostEnvelope` | **REMOVED** | — | reseed ceremony required (§2.5) |

**Deliberately NOT a register row: the tripwire's formula constants.** Branching
factor, segment cap, recompose cap and fixed-organ count are **facts about the
code**, not values V rules. Seeding them would recreate a ratification surface
for numbers V never chose, and would let the seed drift from the engine — the
exact `defaults.tsx` defect. They are derived from exported runner constants and
pinned by T8. The probe **timeout** likewise: it reuses
`acceptanceOrganCostBounds.JUDGE.deadlineMs`, as every relay handshake already
does (`run-acceptance.ts:164, :170, :173`).

---

## 9. V DECISIONS PACKET

Six rows. Each is a value or a policy this plan cannot lawfully decide. Per
DR-175, contested rows carry both lineages' positions once Grok's are taken;
the recommendations below are **one lineage's**, marked as such.

**VROW-1 — the probe freshness window (`probe_freshness_ms`).** How long a
healthy probe is trusted before the next ask re-probes that provider.
*Consequences:* short (e.g. 60 s) → the panel tracks reality closely, at the
cost of a CLI spawn and a burned completion on most asks, adding seconds to
Start. Long (e.g. 1 h) → Start is instant, but a model that died an hour ago is
pinned onto a run and discovered dead at first call — which lands in DR-176's
degrade path, not a crash, but costs real spend. Middle (e.g. 5–10 min) → at
most one probe per provider per ten minutes of active use. *Opus position:*
**10 minutes**, matching `runDeathPolicy.cooldown_ms` (600 000) so the two
recovery timescales agree — a provider that died is re-probed on the same
rhythm the engine already waits on. Proposal, not a seed (AC-76).

**VROW-2 — high-stakes with a discovered panel of one.** DR-137 keeps the ≥2
anti-monoculture floor for high-stakes; fed by discovery it would refuse a
high-stakes ask on a single-model machine. *Options:* (a) **refuse** — DR-137
status quo, and the only surviving refusal that mentions panel size; (b)
**serve with the existing cap** — `applyCriticUnavailableCap`
(`packages/critique/src/index.ts:340-355`) already returns `serves: true` with
`SINGLE-LINEAGE` + `CRITIQUE-UNAVAILABLE` + a confidence-band cap + the lift
condition. *Opus position:* **(b)** — it is more consonant with DR-181(2), the
mechanism already exists, and a capped, visibly-mono high-stakes answer is more
useful to V than a refusal. But this **narrows a DR-137 integrity floor**, so it
is V's, not the architect's.

**VROW-3 — mono panel and V's depth dial (§2.6's defect).** At M=1 the engine
authors one root and ignores depth entirely. *Options:* (a) **serve with a loud
disclosure** — the answer states depth did not expand because cross-review
coverage cannot exist mono-lineage; reuses the existing `CRITIQUE-UNAVAILABLE`
record with a new `reason` (`MONO_LINEAGE_DEPTH_NOT_EXPANDED`), no new mark
member, no engine change; (b) **refuse the ask at depth > 1 on a mono panel** —
a panel-size refusal, against DR-181(2); (c) **let the single maker expand and
self-review** — forbidden by DR-165(3) (no opinion goes unjudged; same-maker
review is not cross-review), listed only to be excluded. *Opus position:* **(a)**.
If V prefers a distinct mark member over a reason string, that is a kernel mint
and this plan will revise.

**VROW-4 — the tripwire itself (§3).** Keep as a computed, never-ratified,
never-user-visible bug backstop, or kill it. *Opus position:* **keep** — the
argument for killing is in §3.5 and is genuinely respectable; the deciding fact
is that per-site bounds cannot see a bug that mints new call-site keys.

**VROW-5 — a pinned panel member unreachable when the runner claims the work.**
(§1.7, the boundary nobody had named.) *Options:* (a) **DR-174 courtesy, then
drop with a recorded absence and serve** — one hiccup costs one position, not
the debate; (b) **die loud**, consistent with DR-176(3)'s dead-maker-position
ruling. *Opus position:* **(a)**, on the ground that DR-176(3) ruled die-loud
*after the full hold + final-retry courtesy had been spent*, and at claim time
none has been; refusing before the courtesy would be a panel-size refusal
wearing a transport costume. Flagged as the **most likely genuine dual-lineage
split** in this packet.

**VROW-6 — a passive "models found" indicator on `/new`.** DR-180 removed the
machine fields from the surface entirely. *Opus position:* **no indicator** —
the panel is disclosed where it is earned, on the answer's lineage cards
(DR-165(2)). Raised only because V may want to *see* the health script's result
before clicking Start.

---

## 10. Adjacent findings — reported, not fixed here

1. **`RUN_MAKER_CONFIGURATION_MISMATCH` is an unrecorded second panel-size
   refusal** (`apps/runner/src/index.ts:840-844`). No ledger row has ever named
   it; DR-181(2) kills it. Handled in §1.7/VROW-5 because it is squarely in
   scope, but recorded here because it means the M-apparatus had a member nobody
   had inventoried.
2. **Set A is 14 attempts short of the lawful worst case** at every ratified
   depth (§3.6). No fix proposed — the retirement is the fix.
3. **`model-shim.ts` hardcodes its model id** (`:12`, `:52`) and has no
   handshake (`:56-68`) — the OpenAI leg is the one maker that cannot self-report
   its lineage. A standing DR-115 soft spot that discovery makes load-bearing.
   Fixed as D1 (§1.4), reported because it predates this ticket.
4. **`acceptanceOrganCostBounds.maxAttempts` is register-carried in acceptance
   but ENV-carried in production** (`acceptance/main.ts:212-214` vs
   `apps/runner/src/main.ts:27-29`, `packages/register/src/runtime-environment.ts:47`),
   never cross-checked — already flagged at
   `handoffs/ENV-01-codex-handoff.md:211`. It now feeds the ceiling formula, so
   the drift acquires a new consequence. Out of scope; worth its own ticket.
5. **`apps/runner/src/main.ts` cannot complete a run** — no `judgementPolicy`,
   `servePolicy`, `runDeathPolicy` or `holdRecorder`. The acceptance harness is
   the only live engine path. Explicitly not served by this plan (§6.3); the
   parity decision is V's to schedule.
6. **`run-acceptance.ts:169` leaks a listening relay on partial boot failure**
   (the destructuring never runs, so `closeAll` receives `null`). Fixed
   incidentally by D2; recorded so the fix is not mistaken for scope creep.
7. **The `casual` risk tier has no envelope member** and works only through the
   deployment floor's escalation (`seed-register.ts:71`). Dies with the table
   (§2.3), recorded because it was a live trap.

---

PLAN READY FOR GROK AUTHORIZATION
