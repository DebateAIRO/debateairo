# PLAN — slice S03

**Revision 2** — ARCH-FIX(S03) pass 2 (ticket `t_2913aad6`, seat ARCH-FIX-PES-S03-p2), from the
verdict `reviews/ARCH-REV-S03-p1.md` (REWORK). Changed: **S03-C1** — C1-1 (N1: the guard-order
assertion; N4: the angle-bracket assertion; the case is now given as code), C1-2 (B1.1: the row count
is a literal command on `^|`; N4: the false guard attribution removed), C1-3 (N1: an EXACT sentence
and a RED case); **S03-C2** — C2-3 (N2: `600_000` accepted, the word ban made family-wide with one
stripped phrase), C2-5 (B1.2: literal command on `^|`), C2-6 (B1.3: a per-line position check replaces
the whole-file count), C2-8 (N2: spelling, word ban and `max_tokens` once; the R3.9 fence clause its
trace row claimed); §1b (N3: the closing property scoped to the eight anchors, every code left outside
them named); §2 (N4: the R3.9 rows re-traced); §3 (verdicts re-run); §4 (acceptance steps 4 and 5
re-stated as position checks). Cluster commands and every expected pair are **unchanged**. Every
count and position oracle was run at its own step boundary on a simulated correct edit and on a
mutant: `.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S03-p2/`.

Filled by ARCH-PES-S03 (node ARCH(S03), pass 1, ticket `t_21a1edcf`) on 2026-09-24 from the frozen
`SPEC.md`. REQ-PES owns the WHAT in `SPEC.md`; every choice below is ARCH's and every one of them is
recorded in `DECISIONS.md`. Measurements were taken in the slice lane
`.worktrees/pes-s03/dialectical-engine` @ `776359c3` (dirty 0); the probe logs are
`.hermes/reports/provider-env-selection/probes/ARCH-PES-S03/`.

**The quantifiability law.** Every step is finite, categoric and mechanically checkable by a
stranger. WRONG: "refresh §11". RIGHT: "`grep -n PROVIDER_TARGET_PRICE_ZERO deploy/vps/README.md`
returns a line between §11's table heading and its next heading, and the widened pin asserts it."

## 1. START frame — measured before the first step, never assumed

| what | where | read by |
|---|---|---|
| suite pairs at base | `.hermes/reports/provider-env-selection/logs/baseline-intake-suites.log` (per-suite table cited at `docs/missions/provider-env-selection/00-intake.md:40`) | every cluster's verification |
| typecheck at base | `.hermes/reports/provider-env-selection/logs/baseline-intake-typecheck.log` — DELTA per file; this slice's expected delta is zero | every cluster's verification |
| the four RED-at-base suites | `docs/missions/provider-env-selection/00-intake.md:41` | SPEC §4 — none is touched |
| §11's current line span | `deploy/vps/README.md:721` to the next `^## ` heading, measured at PLAN time, never assumed from this document | every step that cites a line inside §11 |

**Re-measured in the LANE by this node, 2026-09-24.** These are the numbers the steps below are
written against; a BUILD seat re-measures before its first edit and records any difference.

| fact | value measured in the lane | probe |
|---|---|---|
| `deploy/vps/README.md` length | 873 lines | `wc -l` |
| §11's span | **721 → 873 (EOF)** — there is no `^## ` heading after 721, so `readme.slice(readme.indexOf("## 11. Providers and vendors"))` is §11 exactly | `grep -n '^## '` |
| §11's sub-anchors | `### What the hosted mode refuses, in code` **:768** · `### The credential-file contract` **:784** · `### Adding a vendor — the procedure` **:802** | `grep -n '^### '` |
| the refusal table | header `:770`, separator `:771`, **11 rows `:772`–`:782`** | `awk` |
| the member table | header `:841`, separator `:842`, **4 rows `:843`–`:846`** | `awk` |
| the worked example | `:848` (the `runner.env` JSON line) and `:849` (the `api.env` sentence) | `awk` |
| the support-chat note | `:747`–`:751`, the paragraph whose last sentence names `SUPPORT_MODEL_COST_UNREPORTED` | `awk` |
| the known-stale list | heading `:14`, bullets **B1 `:19-23` · B2 `:24-27` · B3 `:28-31` · B4 `:32-34` · B5 `:35-38`**, closed by `---` at `:40` | `awk` |
| §11's fenced `sh` blocks | two: `:815-823` and `:830-836` — the only blocks `tests/architecture/vps-deployment-baseline.test.ts:378` inspects | `awk` |
| `tests/unit/v9-provider-credential-files.test.ts` at base | **23/0** | `probes/ARCH-PES-S03/c1-base.log` |
| `tests/architecture/vps-deployment-baseline.test.ts` at base | **31/0** | `probes/ARCH-PES-S03/c1-base.log` |
| `pnpm typecheck` at base **in this lane** | rc=1, **1 diagnostic**, `apps/ui/lib/v3/answerExport.ts(2,38) TS2835` — identical to the intake baseline | `probes/ARCH-PES-S03/typecheck-base.log` |
| acceptance step 7's pathspec | `git diff --stat origin/dev...HEAD -- apps packages`, run with cwd = the lane's `dialectical-engine/`, resolves correctly and prints nothing at base. **Proved capable of failing**: the same pathspec over `origin/dev~200...origin/dev` prints `258 files changed`. The git-root-relative spelling `-- dialectical-engine/apps` prints NOTHING over that same range (TOOLING-TRAPS `:873`), so the SPEC's relative spelling is the correct one and must not be "corrected" | `probes/ARCH-PES-S03/accept-base.log` |

**Revision 2 — the base value of every count and position oracle below**, measured with the literal
command on the UNEDITED lane file (`probes/ARCH-FIX-PES-S03-p2/oracles.log`, section "known-hit
proofs"). A BUILD seat re-runs these five before its first edit; a different number means the file
moved and the step's expected number must be re-derived, not assumed.

The commands are in a fenced block on purpose: inside a Markdown table a `|` must be escaped as
`\|`, and a reader who copies the escaped text runs `'^\|'`, which BSD grep refuses with
`grep: empty (sub)expression` and prints NO count (measured: `probes/ARCH-FIX-PES-S03-p2/escape-proof.log`;
TOOLING-TRAPS `:473`, `:565`). Copy them from here. cwd = the lane's `dialectical-engine/`.

```sh
# O1 — refusal-table lines. Base 13: header :770, separator :771, rows :772-:782.
sed -n '/^### What the hosted mode refuses, in code$/,/^### The credential-file contract$/p' deploy/vps/README.md | /usr/bin/grep -c '^|'
# O2 — member-table lines. Base 6: header :841, separator :842, rows :843-:846.
sed -n '/^| Member | Value |$/,/^$/p' deploy/vps/README.md | /usr/bin/grep -c '^|'
# O3 — a worked-example line carrying BOTH price keys, per env file. Base 0 for runner and for api.
/usr/bin/grep '"input_price_micros_per_million":' deploy/vps/README.md | /usr/bin/grep '"output_price_micros_per_million":' | /usr/bin/grep -c '/etc/debateai/runner/providers/acme.header'
/usr/bin/grep '"input_price_micros_per_million":' deploy/vps/README.md | /usr/bin/grep '"output_price_micros_per_million":' | /usr/bin/grep -c '/etc/debateai/api/providers/acme.header'
# O4 — known-stale bullets. Base 5: B1 :19, B2 :24, B3 :28, B4 :32, B5 :35.
sed -n '/^## Known-stale sections/,/^---$/p' deploy/vps/README.md | /usr/bin/grep -c '^- '
# O5 — max_tokens anywhere in the file. Base 0.
/usr/bin/grep -c 'max_tokens' deploy/vps/README.md
```

Why O1 counts 13 and not 12: the separator `|---|---|` begins with `|` but not with `| `. Pass 1's
pattern `'^| '` excluded it, so pass 1's "19" was one more than a correct table produces (ARCH-REV
p1 B1.1; the same for the member table, B1.2). O3 matches the JSON-KEY form (quote, name, quote,
colon), which occurs only on a worked-example line: the member table and bullet B1 write the names in
backticks. Every pattern with a `|` is a BRE run by `/usr/bin/grep` (BSD), where `|` is a literal
pipe. Under `grep -E` the same pattern `'^|'` is refused with the same `empty (sub)expression` error
and no count (`escape-proof.log`), so the binary and the absence of `-E` are part of each command
(TOOLING-TRAPS `:3023`).

**Line anchors move.** Every `path:line` in `SPEC.md` was measured at 776359c3. A step that inserts
a row into §11's table moves every line below it, so a later step anchors on TEXT, not on a line
number that an earlier step of the same cluster invalidated. **Every criterion below anchors on a
string.** Line numbers in this document are provenance for a reviewer, never an oracle
(TOOLING-TRAPS `:329`, "Variant 6: an acceptance pinned to ABSOLUTE LINE NUMBERS" — a negative
assertion over a drifted range passes vacuously and ships).

### 1b. The enumeration — R3.5's source anchors, PROVED before they were written down

R3.5 requires the widened pin to read the codes OUT OF THE SOURCE and forbids a list retyped in the
test. The source holds **no single inventory** covering the class, so the enumeration is a list of
NAMED ANCHORS, each a string the reader finds. This is the list R3.5 says PLAN.md names; the BUILD
seat records each one's `path:line` and yielded codes in `PROGRESS.md`.

The extraction is one regex over each anchor's body:

```
/[`"]([A-Z][A-Z0-9_]{4,})(?=[:`"])/gu
```

It matches BOTH quote styles on purpose: the credential and support inventories use double quotes,
and the price codes are raised from BACKTICK templates (`` `PROVIDER_TARGET_PRICE_REQUIRED:${ref}` ``).
A double-quote-only regex silently yields zero for E4 — TOOLING-TRAPS `:3088`, a surface derived
from ONE idiom misses the assertion the SPEC itself names. The regex is proved on a known-hit
fixture in the same run (`probes/ARCH-PES-S03/enumeration.log`, last line).

| id | file | anchor string → terminator | lines @776359c3 | codes yielded |
|---|---|---|---|---|
| E1 | `packages/providers/src/index.ts` | `const PROVIDER_CREDENTIAL_REFUSAL_CODES` → `] as const);` | 740–744 | `SECRET_CUSTODY_INVALID`, `CUSTODY_GROUP_UNRESOLVED`, `PROVIDER_CREDENTIAL_FILE_INVALID` |
| E2 | `packages/providers/src/index.ts` | `const PROVIDER_CREDENTIAL_ABSENT_CODE = ` → `;` | 725 | `PROVIDER_CREDENTIAL_FILE_ABSENT` |
| E3 | `apps/api/src/support/model.ts` | `export const SUPPORT_MODEL_STARTUP_REFUSAL_CODES` → `] as const);` | 41–44 | `SUPPORT_MODEL_PATH_NOT_RATIFIED`, `SUPPORT_MODEL_CREDENTIAL_ABSENT` |
| E4 | `packages/providers/src/index.ts` | `export function assertPricedProviderTargets` → `\n}` | 679–703 | `PROVIDER_TARGET_PRICE_REQUIRED`, `PROVIDER_TARGET_PRICE_ZERO` |
| E5 | `packages/providers/src/index.ts` | `function providerTargetPriceAmount` → `\n}` | 192–198 | `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` |
| E6a | `packages/register/src/cost-envelope-policy.ts` | `export function costEnvelopePolicyFromValue` → `\n}` | 129–146 | `COST_ENVELOPE_POLICY_INVALID` |
| E6b | `packages/register/src/cost-envelope-policy.ts` | `export async function readCostEnvelopePolicy` → `\n}` | 153–170 | `COST_ENVELOPE_POLICY_UNRESOLVED` |
| E7 | `packages/register/src/runtime-environment.ts` | `export class SupportAdmissionScopesNotSealedError` → `\n}` | 175–182 | `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` |

**Measured closing property — of the eight anchors, not of R3.5's class sentence**
(`probes/ARCH-PES-S03/enumeration.log`; re-derived independently by ARCH-REV p1, `measure.log` §3):
the anchors' union is **12 distinct codes**; **6 are already in §11** and **6 are absent**, and the
absent set is character-for-character R3.3's six (`CLOSES WITH SPEC R3.3's SIX? true`). So the widened
pin is RED at base for exactly the six rows R3.3 orders and GREEN when they land. That closure is a
property of the ANCHOR LIST. The anchor list is a deliberate narrowing of R3.5's class ("every
operator-facing refusal code the provider, credential, price and cost-envelope surface can emit"),
and pass 1's "no leftover" overclaimed it (ARCH-REV p1 N3). Every code the narrowing leaves outside is
named below with the measurement or the V row that puts it there.

**What is OUTSIDE the eight anchors, member by member.**

| code(s) | where raised | why outside the table and the 12-code pin | ruled by |
|---|---|---|---|
| `RUN_COST_ENVELOPE_MONEY_REACHED`, `PROVIDER_USAGE_UNREPORTED`, `COST_ENVELOPE_CHARGE_UNREPRESENTABLE`, `DAILY_COST_ENVELOPE_REACHED` | the inventory `PROVIDER_COST_ENVELOPE_REFUSAL_CODES`, `packages/providers/src/index.ts:934-946` (with `RUN_LEVEL_SPEND_STOP_CODES`, `packages/kernel/src/index.ts:409-413`, and `ENVELOPE_STOP_CODES`, `apps/runner/src/index.ts:149`) | raised DURING a run against a ceiling already reached; the table heading is `What the hosted mode refuses, in code` and every row in it is a start-up refusal | **row V-8**, default applied |
| `PROVIDER_DISCOVERY_TARGETS_INVALID`, `PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID`, `PROVIDER_DISCOVERY_TARGET_DUPLICATE`, `PROVIDER_DISCOVERY_AUTHORIZATION_FILE_INVALID` | parse-time throws in `packages/providers/src/index.ts` | R3.3 names six codes; `deploy/vps/README.md:782` already says a malformed API target refuses with the matching `PROVIDER_DISCOVERY_*` code | **row V-9**, default applied |
| `CONFIGURED_PROVIDER_DUPLICATE` | `packages/providers/src/index.ts:255`, while reading the PUBLISHED configured set | not reached through §11's procedure: step 4 publishes through `buildConfiguredProviderSetDeploymentRow`, whose shape check (`packages/register/src/configured-provider-set.ts:155-162`) refuses a duplicate ref at publish; the boot throw is a second guard behind that one | measured here; `DECISIONS.md` Revision 2 row |
| `PROVIDER_LENGTH_RETRY_FAILURE_COUNT_INVALID` | `packages/providers/src/index.ts:1045`, an argument guard in `lengthRetryTokenCeiling` | its only caller (`:1151`) passes an internal retry counter; no configuration an operator writes reaches it, so it is not operator-facing | measured here; `DECISIONS.md` Revision 2 row |

The table holds **10** codes: the four run-time spend codes, plus the **six** that a scan of
`packages/providers/src/index.ts` for `throw new TypeError(` still leaves outside §11 once this slice
lands (the four V-9 codes and the last two rows). That scan finds **16** distinct codes, **9** of them
absent from §11 at base: R3.3's three price codes, which this slice adds, plus those six
(`probes/ARCH-FIX-PES-S03-p2/scan.log`). Pass 1 recorded "15 codes, 8 absent". Both numbers were
wrong, for separate reasons, and the correction is a `DECISIONS.md` row.

## 2. SPEC → step trace skeleton

| requirement | what it constrains | step ids | cluster |
|---|---|---|---|
| R3.1 | the two price members in §11's member table | C2-1, C2-5 | S03-C2 |
| R3.2 | the two price members in the worked example, both env forms | C2-1, C2-6 | S03-C2 |
| R3.3 | the six refusal rows, each with the condition and the source `path:line` | C1-1, C1-2, C1-3 | S03-C1 |
| R3.4 | the support-chat ceiling sentence | C2-2, C2-7 | S03-C2 |
| R3.5 | the widened drift pin, codes read out of the source, sweep recorded | C1-1, C1-4 | S03-C1 |
| R3.6 | the paid-probe cost paragraph, numbers from the tree, no recommended value | C2-3, C2-8 | S03-C2 |
| R3.7 | the two known-stale bullets removed; the other three re-read and recorded | C2-4, C2-9 | S03-C2 |
| R3.8 | `vps-deployment-baseline.test.ts` GREEN; any changed assertion named | C1-4, C2-10 | both |
| R3.9 | no angle-bracket placeholder in a §11 shell block | C1-4, C2-6, C2-8, C2-10 | both |

**Reverse trace — every step to a requirement, zero orphans.** (One line, so a line-based parser and
a block parser read the same relation.)
C1-1 → R3.3, R3.5 · C1-2 → R3.3 · C1-3 → R3.3 · C1-4 → R3.5, R3.8, R3.9 · C2-1 → R3.1, R3.2 · C2-2 → R3.4 · C2-3 → R3.6 · C2-4 → R3.7 · C2-5 → R3.1 · C2-6 → R3.2, R3.9 · C2-7 → R3.4 · C2-8 → R3.6, R3.9 · C2-9 → R3.7 · C2-10 → R3.8, R3.9
Forward: every one of R3.1–R3.9 appears in at least one step id above. **Gaps: zero, both ways.**
Revision 2 re-traced R3.9 (ARCH-REV p1 N4): R3.9 binds §11's fenced ```` ```sh ```` blocks only
(`SPEC.md:104-105`). C1-2 writes table rows and carries no fence clause, so it no longer claims R3.9.
C1-4 does: its command re-runs `tests/architecture/vps-deployment-baseline.test.ts:378` after C1's §11
edits. C2-8 now carries the fence clause its row always claimed. C1-1 now also serves R3.3, because
its case pins C1-3's sentence and the house style of C1-2's rows.

### 2b. The steps

Order is binding within a cluster. Each step's done-criterion is satisfiable at that step's own
boundary — no criterion needs a later step. A RED step's criterion is a measured failing pair; a
document step's criterion is the named case turning GREEN, which is why each document step names
the case that goes RED when it is omitted.

Revision 2: pass 1 broke that rule once (C2-6's count was true only after C2-9) and derived two
table counts by arithmetic that no run had checked (C1-2, C2-5; ARCH-REV p1 B1). Every count and
position oracle below has now been RUN at its own step boundary on a simulated correct edit, and on
a mutant built to fail it (`probes/ARCH-FIX-PES-S03-p2/oracles.log` for the shell commands,
`simulate.log` for the test cases). A number in a done-criterion is a measured output, never a sum.

#### Cluster S03-C1 — §11's refusal table names every start-up refusal, and the pin says so

Write surface: `tests/unit/v9-provider-credential-files.test.ts` · `deploy/vps/README.md`
**only between** the string `### What the hosted mode refuses, in code` and the string
`### The credential-file contract`. No other region of the README, no file under `apps/` or
`packages/`.

**C1-1 · RED — the widened pin exists and fails for the right six codes.**
Add exactly ONE `it(...)` case to the existing
`describe("V-9 the kit names every refusal the credential path can emit")` block (the block opens at
`tests/unit/v9-provider-credential-files.test.ts:396`). Do not alter the two cases already in it. The
case is given in full, because the ORDER of its assertions decides which message a stranger sees at
each step boundary, and one of them is only correct when it reads the text BELOW the table:

```ts
it("names every start-up refusal the price and cost-envelope surfaces can raise", async () => {
  const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
  const providers = await read("packages/providers/src/index.ts");
  const support = await read("apps/api/src/support/model.ts");
  const envelope = await read("packages/register/src/cost-envelope-policy.ts");
  const runtime = await read("packages/register/src/runtime-environment.ts");
  // slices/S03/PLAN.md §1b, rows E1…E7 in order. Anchors are strings, never line numbers.
  const anchors: ReadonlyArray<readonly [string, string, string]> = [
    [providers, "const PROVIDER_CREDENTIAL_REFUSAL_CODES", "] as const);"],
    [providers, "const PROVIDER_CREDENTIAL_ABSENT_CODE = ", ";"],
    [support, "export const SUPPORT_MODEL_STARTUP_REFUSAL_CODES", "] as const);"],
    [providers, "export function assertPricedProviderTargets", "\n}"],
    [providers, "function providerTargetPriceAmount", "\n}"],
    [envelope, "export function costEnvelopePolicyFromValue", "\n}"],
    [envelope, "export async function readCostEnvelopePolicy", "\n}"],
    [runtime, "export class SupportAdmissionScopesNotSealedError", "\n}"]
  ];
  const union = new Set<string>();
  for (const [source, from, until] of anchors) {
    const start = source.indexOf(from);
    expect(start, from).toBeGreaterThanOrEqual(0);
    const body = source.slice(start, source.indexOf(until, start + from.length) + until.length);
    const codes = [...body.matchAll(/[`"]([A-Z][A-Z0-9_]{4,})(?=[:`"])/gu)].map((match) => match[1]!);
    expect(codes.length, from).toBeGreaterThan(0);
    for (const code of codes) union.add(code);
  }
  expect(union.size).toBe(12);
  const readme = await read("deploy/vps/README.md");
  const section = readme.slice(readme.indexOf("## 11. Providers and vendors"));
  const refusal = readme.slice(
    readme.indexOf("### What the hosted mode refuses, in code"),
    readme.indexOf("### The credential-file contract")
  );
  // (1) ARCH-REV p1 N4 — the house style of C1-2's rows has a guard of its own.
  expect(refusal, "no angle-bracket placeholder in §11's refusal table").not.toMatch(/<[a-z-]+>/u);
  // (2) R3.5 — every enumerated code is in §11.
  for (const code of union) expect(section, code).toContain(code);
  // (3) ARCH-REV p1 N1 — C1-3's sentence, read BELOW the table only (see "why below" in C1-3).
  const lines = refusal.split("\n");
  const belowTable = lines.slice(lines.map((line) => line.startsWith("|")).lastIndexOf(true) + 1).join("\n");
  for (const token of ["PROVIDER_DISCOVERY_TARGET_PRICE_INVALID", "PROVIDER_TARGET_PRICE_REQUIRED"]) {
    expect(belowTable, `guard-order sentence below the table: ${token}`).toContain(token);
  }
  expect(belowTable, "guard-order sentence below the table: before").toMatch(/\bbefore\b/u);
});
```

The RED sequence this order produces, measured on simulated README states
(`probes/ARCH-FIX-PES-S03-p2/simulate.log`): at base the case fails on (2) with the message
`PROVIDER_TARGET_PRICE_REQUIRED`; after C1-2 it fails on (3) with
`guard-order sentence below the table: PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`; after C1-3 it passes.
- **Done when:** the CLUSTER command
  `LOG=<abs> run-suites.sh tests/unit/v9-provider-credential-files.test.ts:24:0 tests/architecture/vps-deployment-baseline.test.ts:31:0`
  prints `tests/unit/v9-provider-credential-files.test.ts rc=1 passed=23 failed=1 (expect 24/0)`,
  `tests/architecture/vps-deployment-baseline.test.ts rc=0 passed=31 failed=0 (expect 31/0)` and the
  marker `CLUSTER_RED`, and the log carries the failing message `PROVIDER_TARGET_PRICE_REQUIRED`.
  (Revision 2: pass 1 ran `run-suites.sh …v9…:23:1` here and expected `CLUSTER_RED`. The runner
  prints `CLUSTER_GREEN` whenever every measured pair EQUALS its expected pair —
  `.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh:23` clears `ok` only on a mismatch, and
  `:25` prints GREEN while `ok` holds — so on a correct RED state that command prints GREEN and the
  step could not be marked done as written. That is the B1 failing outcome, in a member ARCH-REV p1's
  table did not list; this pass's class sweep found it.)
- **Mutant check for (1), at this step's boundary — (1) never fails on a correct build, so this is
  its only RED evidence:** insert the one line
  ``| `PROVIDER_TARGET_PRICE_REQUIRED:<ref>` | mutant |`` directly under the table's
  `SUPPORT_MODEL_PATH_NOT_RATIFIED` row, run the cluster command, and see the log carry
  `no angle-bracket placeholder in §11's refusal table`; then delete exactly that line and confirm
  `git diff --stat -- deploy/vps/README.md` prints nothing. The README carries no other edit yet at
  this boundary, which is why the check runs here and not later.
- **Catches:** a pin that was never widened; a pin widened with a retyped list (a retyped list passes
  at base, so `failed=1` could not happen); a `<ref>` written into any refusal row (1); C1-3's
  sentence missing or placed inside the table (3).
- **Does NOT catch:** a widened pin whose anchor terminator is wrong in a way that still yields a
  non-empty set — e.g. E4 terminated on the first `}` of the `for` body instead of the function's.
  `expect(union.size).toBe(12)` is what closes that, and it is in the case for that reason.
- **Mutant class the cluster command detects:** any edit that removes a code from §11, narrows an
  anchor (both drop the union below 12 or fail a `toContain`), writes an angle-bracket placeholder
  into the refusal span, or drops the sentence below the table.

**C1-2 · six rows in the refusal table.**
Insert six rows into the table that begins at the line `| Code | Meaning |` after
`### What the hosted mode refuses, in code`. One row per code, in this order, appended after the
existing `SUPPORT_MODEL_PATH_NOT_RATIFIED` row. Each row's **Meaning** cell states the condition
taken from the source line named here; the BUILD seat records the `path:line` in `PROGRESS.md`.

| Code cell (EXACT text, including the trailing colon where a ref follows) | condition the Meaning cell states | source `path:line` |
|---|---|---|
| `` `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` `` | one of the two price members is declared without the other, **or** a declared amount is not an integer in `[0, Number.MAX_SAFE_INTEGER]`. Raised while the targets are PARSED, before any hosted rule runs | `packages/providers/src/index.ts:278` and `:195` |
| `` `PROVIDER_TARGET_PRICE_REQUIRED:` `` and the provider ref | hosted mode, and a debate target declares no price pair at all | `packages/providers/src/index.ts:687` (and again at `apps/runner/src/main.ts:117`, which cannot be reached while `:687` stands — its own comment `:103-107` says so) |
| `` `PROVIDER_TARGET_PRICE_ZERO:` `` and the provider ref | hosted mode, and a declared input or output amount is below 1 micro-unit per million tokens | `packages/providers/src/index.ts:700` |
| `` `COST_ENVELOPE_POLICY_UNRESOLVED` `` | no `costEnvelopePolicy` row exists at the resolved `REGISTER_VERSION` | `packages/register/src/cost-envelope-policy.ts:165` |
| `` `COST_ENVELOPE_POLICY_INVALID` `` | the row exists but does not parse, or its `source_ref` is blank | `packages/register/src/cost-envelope-policy.ts:133` |
| `` `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` `` | hosted start-up, and the support admission scopes row is not sealed | `packages/register/src/runtime-environment.ts:176` |

House style, binding: a code that carries a ref is written `` `CODE:` `` **followed by the words**
"and the provider ref", exactly as rows `:774`–`:778` do. **Never `<ref>`.** The one guard that
implements this rule is C1-1's assertion (1). Pass 1 credited two others that do not implement it
(ARCH-REV p1 N4): `tests/unit/v9-provider-credential-files.test.ts:418` forbids the single string
`PROVIDER_AUTHORIZATION_FILE_UNUSABLE:<ref>:KEK_UNRESOLVED`, and
`tests/architecture/vps-deployment-baseline.test.ts:378` inspects fenced ```` ```sh ```` blocks only.
A table cell reading `` `PROVIDER_TARGET_PRICE_REQUIRED:<ref>` `` passes both. The rule is house style
for R3.3's rows. It is not R3.9, which binds shell blocks only.
- **Done when:** both commands print what their comments state, run in the lane's
  `dialectical-engine/`:

```sh
# each of the six codes sits on at least one TABLE line of the refusal span: six lines, each ending in a number >= 1
for c in PROVIDER_DISCOVERY_TARGET_PRICE_INVALID PROVIDER_TARGET_PRICE_REQUIRED PROVIDER_TARGET_PRICE_ZERO COST_ENVELOPE_POLICY_UNRESOLVED COST_ENVELOPE_POLICY_INVALID SUPPORT_ADMISSION_SCOPES_NOT_SEALED; do printf '%s ' "$c"; sed -n '/^### What the hosted mode refuses, in code$/,/^### The credential-file contract$/p' deploy/vps/README.md | /usr/bin/grep '^|' | /usr/bin/grep -c "$c"; done
# the refusal span holds exactly 19 table lines: prints 19
sed -n '/^### What the hosted mode refuses, in code$/,/^### The credential-file contract$/p' deploy/vps/README.md | /usr/bin/grep -c '^|'
```

  Members of the 19: the header `:770`, the separator `:771`, the eleven rows `:772`–`:782`, the six
  added. Base 13 (O1, §1). Measured (`probes/ARCH-FIX-PES-S03-p2/oracles.log`, section B1.1): a
  simulated correct C1-2 gives 19; with C1-3's sentence added it is still 19, because the sentence
  does not start with `|`; with five rows instead of six, 18; pass 1's `'^| '` on the correct edit,
  18 — the B1.1 defect. The per-code loop prints 0 for all six at base.
- **RED when omitted:** C1-1's case fails on (2) with `PROVIDER_TARGET_PRICE_REQUIRED`; the cluster
  command reads `passed=23 failed=1`.
- **Catches:** a code written into §11's prose instead of its table (the per-code line must start
  with `|`); a row missing or a row too many (the count); a `<ref>` in any row (C1-1's (1)).
- **Does NOT catch:** a Meaning cell whose CONDITION is wrong while the code is right. Nothing
  mechanical can. That is why the `path:line` per row is mandatory in `PROGRESS.md` and why
  `REV(S03)`'s correctness lens re-reads each cited line against its cell.

**C1-3 · one sentence stating the guard order.**
Below the table (one blank line after its last row, so Markdown ends the table there), and before
`### The credential-file contract`, this sentence, **EXACT**:

```text
`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised while the targets are parsed, before any hosted rule runs and before `PROVIDER_TARGET_PRICE_REQUIRED` or `PROVIDER_TARGET_PRICE_ZERO` can be: a target whose price is malformed refuses with the first code and never reaches the other two.
```

It claims only the order that was measured, in both services: `parseProviderDiscoveryTargets`
(`apps/api/src/main.ts:300`, `apps/runner/src/main.ts:74`) → `assertDeploymentProviderTargets`
(`:305`, `:81`) → `assertPricedProviderTargets` (`:312`, `:87`). A MALFORMED price (one member without
the other, or an amount outside `[0, Number.MAX_SAFE_INTEGER]`) throws inside the parse
(`packages/providers/src/index.ts:278`, `:195`). A price of `0` is well-formed at parse and refuses
later, at `:700`. No price at all refuses at `:687`. Revision 2 narrowed pass 1's wording ("then the
hosted rules in the rows above"), which implied an order for rows such as `DEPLOYMENT_MODE_*` that the
environment loader raises before any target is parsed.
- **Done when:** C1-1's case passes. The cluster command prints
  `tests/unit/v9-provider-credential-files.test.ts rc=0 passed=24 failed=0 (expect 24/0)`, the
  baseline at `31/0`, and `CLUSTER_GREEN` — one run; C1-4 is the three-run gate.
- **RED when omitted (ARCH-REV p1 N1):** after C1-2 and without this sentence, the cluster command
  reads `passed=23 failed=1` and the log carries
  `guard-order sentence below the table: PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` — C1-1's (3).
  Measured on a simulated state (`simulate.log`, "NEW @S1"). The pass-1 case PASSES on that same state
  ("OLD @S1"), which is the N1 finding reproduced.
- **Why (3) reads only the text BELOW the table:** the `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` row's
  own Meaning cell says "before any hosted rule runs", and the rows carry both codes. A check over the
  whole refusal span therefore passes the moment C1-2 lands, and this step would again have no RED
  case. Measured: the whole-span check PASSES after C1-2 with no sentence (`simulate.log`, "NAIVE
  whole-span guard @S1").
- **Catches:** the sentence missing, or written inside the table instead of below it.
- **Does NOT catch:** a sentence carrying the three tokens in the WRONG order ("…REQUIRED is raised
  before …INVALID"). The case checks presence, not order; the EXACT text fixes the order, and
  `REV(S03)` reads it against the three call sites above.

**C1-4 · the cluster goes GREEN, three runs.**
- **Done when:** `LOG=<abs> run-suites.sh tests/unit/v9-provider-credential-files.test.ts:24:0
  tests/architecture/vps-deployment-baseline.test.ts:31:0` prints `CLUSTER_GREEN` on **three**
  consecutive runs, worst run wins, and `pnpm typecheck` shows a per-file delta of **zero** against
  `apps/ui/lib/v3/answerExport.ts(2,38) TS2835` being the only diagnostic.
- **Catches:** a widened pin that passes only because §11 was edited outside C1's write surface.
- **Does NOT catch:** a change to `deploy/vps/README.md` outside §11 — that is C2's surface and
  `git diff --stat` at `REV(S03)` is what bounds it.

#### Cluster S03-C2 — §11's target example, its cost exposure, and the stale list

Runs **after** C1 is green: both clusters write `deploy/vps/README.md` and
`tests/unit/v9-provider-credential-files.test.ts`, so they are SEQUENTIAL and the single-writer rule
holds trivially. C2 owns the whole README **except** the block between
`### What the hosted mode refuses, in code` and `### The credential-file contract`.
C2's line anchors are re-measured after C1 lands (TOOLING-TRAPS `:3076` — a cluster's base moves
when its predecessor lands); every criterion below is a string anchor, so the re-measure is
provenance, not a dependency.

**Where C2's four cases live, and why it is not the kit suite.** They go in a new
`describe("S03 §11 says what the shipped code does")` block appended to
`tests/unit/v9-provider-credential-files.test.ts`, taking it from 24 to **28**.
`tests/architecture/vps-deployment-baseline.test.ts` is left **byte-identical** at 31/31. The reason
is the frozen SPEC: §5 step 2 (`SPEC.md:128-132`) requires "the reported pair for
`tests/architecture/vps-deployment-baseline.test.ts` is its base pair from the intake's baseline
table" — 31/31. Adding cases there would make it 35/35 and step 2 could not pass as written;
re-reading "its base pair" as "base plus what this slice adds" would be a quiet reinterpretation of a
frozen requirement, which `heartbeat-architecture` §1 forbids. Putting the cases in `v9` satisfies
step 2 literally (step 2 pins no number for `v9`, only "every case passing"), keeps R3.8 trivially
true — zero changed assertions in the kit suite — and, because step 2's one command runs both files,
V's acceptance exercises **every** case this slice adds. The rejected alternative, a third test file,
would satisfy step 2 too but would not be run by any acceptance step.

**C2-1 · RED — the price-member case.** One new `it("README §11's hosted target carries both price
members, in the member table and in both env forms")`. It slices §11 with the same
`indexOf("## 11. Providers and vendors")`, then asserts: the member table (the span from
`| Member | Value |` to the next blank line) contains `input_price_micros_per_million` and
`output_price_micros_per_million`; and **two** distinct lines of §11 match
`/"input_price_micros_per_million":\s*\d+/u`, one containing `/etc/debateai/runner/providers/` and
one containing `/etc/debateai/api/providers/`.
- **Done when:** `tests/unit/v9-provider-credential-files.test.ts` reads `passed=24 failed=1` and the cluster command prints `CLUSTER_RED`; `tests/architecture/vps-deployment-baseline.test.ts` stays `31/0`.
- **Catches:** price members written into only one of the two env forms.
- **Does NOT catch:** a price value of `0` in the example, which `assertPricedProviderTargets` would
  refuse at `:700`. C2-5's criterion pins the value's floor for that reason.

**C2-2 · RED — the support-note case.** One new `it("README §11's support-chat note names the
sealed-envelope refusal, not a daily cap ceiling")`. Asserts §11 does **not** match
`/the daily call cap is the only ceiling/u`, and that the paragraph containing
`SUPPORT_MODEL_COST_UNREPORTED` also contains `COST_ENVELOPES_NOT_SEALED`.
- **Done when:** `v9` reads `passed=24 failed=2` (C2-1's case is still red), `CLUSTER_RED`.
- **Capable of failing:** the negative half fails at base, because the phrase is live at
  `deploy/vps/README.md:749`. That is the proof TOOLING-TRAPS `:329` demands of a negative assertion.
- **Does NOT catch:** the phrase reappearing somewhere in the README **above** line 721 — the slice
  reads §11 only. Known-stale bullet B3 quotes it, and C2-9 removes B3 for exactly that reason.

**C2-3 · RED — the cost-paragraph case.** One new `it("README §11 states the paid-probe cost
exposure in the tree's own numbers")`. Its assertions, in this order (`section` is §11, sliced as in
C1-1):

```ts
expect(section.match(/max_tokens/gu) ?? [], "max_tokens appears once in §11").toHaveLength(1);
const paragraph = section.split(/\n[ \t]*\n/u).find((block) => block.includes("max_tokens")) ?? "";
for (const token of ["probe_freshness_ms", "panelDiscoveryPolicy"]) expect(paragraph, token).toContain(token);
// ARCH-REV p1 N2.1 — the seed line is `probe_freshness_ms: 600_000`; SPEC R3.6 spells it 600000. Both pass.
expect(paragraph, "the seed's 600000").toMatch(/\b600_?000\b/u);
// ARCH-REV p1 N2.2 — R3.6's own phrase is allowed; every other form of recommendation is not.
const withoutSpecPhrase = paragraph.replace(/no recommended value/giu, "");
for (const word of [/\brecommend\w*/iu, /\bsuggest\w*/iu, /\bshould be\b/iu]) {
  expect(withoutSpecPhrase, `no recommended value: ${word}`).not.toMatch(word);
}
```

Measured on seven versions of the paragraph (`probes/ARCH-FIX-PES-S03-p2/simulate.log`, section N2).
The oracle PASSES: the faithful paragraph with `600000`; with `600_000`; with R3.6's own sentence
"It states no recommended value." It FAILS: "The recommended value is 600000."; "We suggest raising
it."; "It should be at least 600000."; and `6000000` written for `600000`. Pass 1's substring oracle
failed the second and third, the two ARCH-REV p1 N2 names. The reviewer's suggested whole-word ban,
implemented literally, passes "The recommended value is 600000." (`\brecommend\b` does not match
`recommended`) and `6000000` (a substring test finds `600000` inside it). Both are the violation the
check exists to catch, so the family patterns, the one stripped phrase and the `\b` bounds are
deliberate (`DECISIONS.md`, Revision 2).
- **Done when:** `v9` reads `passed=24 failed=3`, `CLUSTER_RED`. At base `grep -n max_tokens deploy/vps/README.md`
  returns rc=1 with no output (`probes/ARCH-PES-S03/accept-base.log`), so the count assertion fails
  on a measured zero, not on a guess.
- **Catches:** a paragraph that names the window without the spend, or the spend without the window;
  a recommendation in any inflection; `6000000` for `600000`.
- **Does NOT catch:** a wrong number beside the right name, e.g. `max_tokens: 16`. The case checks the
  name `max_tokens`, not its value. `REV(S03)` reads the value against
  `packages/providers/src/provider-probe.ts:82`. (Pass 1's example here, "eight tokens" in prose,
  would in fact fail the `max_tokens` count, so it has been replaced.)

**C2-4 · RED — the known-stale case.** One new `it("README's known-stale list no longer carries the
bullets §11 now answers")`. Asserts the span from `## Known-stale sections` to the next `\n---\n`
contains **none** of `§11's hosted provider target example`, `§11's refusal-code table is
incomplete`, `the daily call cap is the only ceiling`; and still contains both
`KEK rotation is not implemented` and `deploy/vps/env/api.env.example`.
- **Done when:** `v9` reads `passed=24 failed=4` — the four RED events of this cluster are now all written, which is the shape TOOLING-TRAPS `:3067` requires of a BUILD packet. `CLUSTER_RED`.
- **Catches:** a removal that deletes the whole list, and a removal that takes a survivor with it —
  the two positive assertions are there for that.
- **Does NOT catch:** the two removed bullets being re-added below the `---`. `REV(S03)` reads the
  diff.

**C2-5 · the two price rows in the member table.** Add two rows to the table opening at
`| Member | Value |`, after the `model` row and before the `authorization_file` row. Their first cells
are **EXACT** `` `input_price_micros_per_million` `` and `` `output_price_micros_per_million` ``, in the
backticked style of the four existing rows. Each Value cell states the shipped rule from
`packages/providers/src/index.ts:679`: an **integer**, at least **1**, at most
`Number.MAX_SAFE_INTEGER`, in micro-USD per million tokens; and that declaring one without the other
refuses with `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` (`:278`).
- **Done when:** the three commands print `1`, `1` and `8`, run in the lane's `dialectical-engine/`:

```sh
sed -n '/^| Member | Value |$/,/^$/p' deploy/vps/README.md | /usr/bin/grep -c '^| `input_price_micros_per_million` |'
sed -n '/^| Member | Value |$/,/^$/p' deploy/vps/README.md | /usr/bin/grep -c '^| `output_price_micros_per_million` |'
sed -n '/^| Member | Value |$/,/^$/p' deploy/vps/README.md | /usr/bin/grep -c '^|'
```

  Members of the 8: the header `| Member | Value |`, the separator `|---|---|`, the rows
  `provider_ref`, `base_url`, `model`, `authorization_file`, and the two added. Base 6 (O2, §1).
  Measured (`oracles.log`, section B1.2): 8 after a simulated correct C2-5, in both prose variants;
  7 with one row added instead of two; pass 1's `'^| '` gives 7 on the correct edit — the B1.2
  defect. Pass 1 also wrote the base as "6 lines beginning `| `", which is 5 under that pattern.
  Revision 2 replaced pass 1's "C2-1's member-table half passes" with the two first-cell commands. A
  stranger could only judge the old clause by reading which of C2-1's assertions had failed.
- **RED when omitted:** C2-1 fails its member-table assertion.

**C2-6 · the worked example, both env forms written out in full.** Replace the single `runner.env`
JSON line and the `api.env` sentence with **two** JSON lines, each introduced by the env file it
belongs to. The `runner.env` line, **EXACT**:

```
{"provider_ref":"vendor:acme","base_url":"https://api.acme.example/v1","model":"acme-large","input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000,"authorization_file":"/etc/debateai/runner/providers/acme.header"}
```

The `api.env` line is the same object, **EXACT**, with `authorization_file` set to
`/etc/debateai/api/providers/acme.header`. One sentence after them states that the two amounts are
the vendor's own published rate in micro-USD per million tokens and are replaced per vendor.
Neither line sits inside a fenced ```` ```sh ```` block: R3.9 binds those blocks, and
`tests/architecture/vps-deployment-baseline.test.ts:378` checks them. Neither line contains `<`. The
EXACT text above guarantees that; no test checks for `<` outside a fence, and Revision 2 no longer
credits `:378` with it (ARCH-REV p1 N4's class).
- **Done when:** C2-1 passes in full, and both commands print `1`, run in the lane's
  `dialectical-engine/`:

```sh
/usr/bin/grep '"input_price_micros_per_million":' deploy/vps/README.md | /usr/bin/grep '"output_price_micros_per_million":' | /usr/bin/grep -c '/etc/debateai/runner/providers/acme.header'
/usr/bin/grep '"input_price_micros_per_million":' deploy/vps/README.md | /usr/bin/grep '"output_price_micros_per_million":' | /usr/bin/grep -c '/etc/debateai/api/providers/acme.header'
```

  Each command counts the one worked-example line for that env file that carries BOTH price keys in
  JSON-key form. Base 0 and 0 (O3, §1).
  Revision 2 replaced pass 1's whole-file count (ARCH-REV p1 B1.3). "`grep -c
  input_price_micros_per_million` returns 3" was true only after C2-9 removes bullet B1 (`:20`); at
  this step's boundary it is 4. The corrected number is no oracle either, because it depends on the
  member table's prose. Measured (`oracles.log`, section B1.3): variant A of C2-5's Value cells gives
  4. Variant B gives 5: its `output_price…` cell says "declaring it without
  `input_price_micros_per_million` refuses…", which C2-5's own instruction invites. The per-line
  commands give 1 and 1 on both variants, and 0 on the api line when its output price is dropped.
- **RED when omitted:** C2-1's two-env-form assertion fails.
- **Catches:** an example that carries the prices in one file's form only, or carries only one of the
  two price keys on either line (each command requires both keys on the same line).
- **Does NOT catch:** the two amounts being implausible for a real vendor. They are illustrative by
  construction, alongside `vendor:acme` and `api.acme.example`; the sentence saying so is the remedy.

**C2-7 · the support-chat note.** Rewrite the paragraph at the string `**What the support chat
cannot tell you yet.**` so it no longer says the daily call cap is the only ceiling and instead
states what `packages/register/src/runtime-environment.ts:144,147` does: a hosted deployment refuses
to start until the cost envelopes are sealed, with the code `COST_ENVELOPES_NOT_SEALED` that the
table already carries at `:779`. The sentence recording
`SUPPORT_MODEL_COST_UNREPORTED` for a reply that carries no cost stays.
- **Done when:** C2-2 passes.
- **RED when omitted:** C2-2's negative assertion fails on the live phrase.

**C2-8 · the paid-probe cost paragraph.** Add one paragraph to §11 stating, with the tree's own
numbers and **no recommended value**: the probe spends `max_tokens: 8` per target per staleness
window (`packages/providers/src/provider-probe.ts:82`); the window is the `panelDiscoveryPolicy`
register row's `probe_freshness_ms`, validated only as a positive integer
(`packages/register/src/index.ts:457`); the development seed publishes `600000`
(`apps/runner/src/dev-deployment-register.ts:344`); and hosted mode enforces no minimum, so the
number an operator publishes is the whole control. Four rules on the wording, each matching C2-3's
oracle so that a seat who follows this step passes it (ARCH-REV p1 N2):
1. Write `600000`, the spelling SPEC R3.6 uses. The TypeScript seed writes `600_000`, a numeric
   separator. The register row an operator publishes is JSON, and JSON has no numeric separators.
   C2-3 accepts either spelling, so quoting the source is not a failure.
2. Use no word beginning `recommend` or `suggest`, and not the phrase `should be`. The one allowed
   exception is R3.6's own phrase `no recommended value`, which C2-3 strips before it checks.
3. `max_tokens` appears exactly once in the paragraph and nowhere else in the README, because
   acceptance step 6 reads one hit and C2-3 counts one.
4. The paragraph is prose, not inside a fenced ```` ```sh ```` block (R3.9).
- **Done when:** C2-3 passes, and acceptance step 6's
  `/usr/bin/grep -n 'max_tokens' deploy/vps/README.md` returns exactly **one** line, that line's
  number is greater than the line of `## 11. Providers and vendors`, and the paragraph containing it
  also names `probe_freshness_ms`.
- **RED when omitted:** C2-3 fails its `max_tokens` count assertion (zero at base).
- **Does NOT catch:** the paragraph implying a value without the banned words — e.g. "the seed's
  600000 is a sensible starting point". `REV(S03)` reads the paragraph; row V-7 binds the default
  that no floor is stated.

**C2-9 · the known-stale list.** Runs **after C2-7**, because B3's verdict depends on it.
Measured re-read of the three bullets R3.7 leaves to judgement, each against the tree in this lane:

| bullet | claim | measured | verdict |
|---|---|---|---|
| B3 `:28-31` | "the daily call cap is the only ceiling" (§11's support note) is out of date | C2-7 removes that sentence from §11, so the bullet describes a staleness that no longer exists | **REMOVE**, `path:line` = the paragraph C2-7 rewrote |
| B4 `:32-34` | "KEK rotation is not implemented" (§10) is false; it shipped as `pnpm keys:rotate-kek` | §10 still carries the false sentence at `deploy/vps/README.md:703`; `keys:rotate-kek` exists at `package.json:27`; §3 "Changing a master key" exists at `:259` | **LEAVE EXACTLY AS IT IS** — the bullet is true |
| B5 `:35-38` | `api.env.example` lacked the two support keys (now present); §3's layout table still lists neither `support-kek.bin` nor the support database principal | both keys present (`deploy/vps/env/api.env.example:35` and `:57`); §3's layout table `deploy/vps/README.md:148-167` lists neither | **LEAVE EXACTLY AS IT IS** — the bullet is true |

Remove B1, B2 and B3. Leave B4 and B5 byte-identical.
- **Done when:** C2-4 passes; and the span from `## Known-stale sections` to the next `\n---\n`
  contains exactly **2** lines beginning `- `. Named members: B4's first line, B5's first line.
- **RED when omitted:** C2-4 fails on `§11's hosted provider target example`.
- **Catches:** removing too few or too many bullets.
- **Does NOT catch:** B4 or B5 being edited in place rather than left. The `git diff` at `REV(S03)`
  is what shows that, and `PROGRESS.md` records the verdict per bullet.

**C2-10 · the cluster goes GREEN, three runs.**
- **Done when:** `LOG=<abs> run-suites.sh tests/unit/v9-provider-credential-files.test.ts:28:0
  tests/architecture/vps-deployment-baseline.test.ts:31:0` prints `CLUSTER_GREEN` on **three**
  consecutive runs, worst run wins; `pnpm typecheck`'s per-file delta is **zero**; and
  `git diff --stat origin/dev...HEAD -- apps packages` (cwd = the lane's `dialectical-engine/`)
  prints nothing.
- **R3.8 duty:** every assertion of `tests/architecture/vps-deployment-baseline.test.ts` that reads
  the README — `:333`, `:351`, `:378-379`, `:446`, `:459`, `:463`, `:480`, `:500` — is re-run by this
  command, against the edited README. **Zero of them change, because this slice does not write that
  file at all**: `git diff --stat origin/dev...HEAD -- tests/architecture/` prints nothing, and
  `PROGRESS.md` records that sentence as R3.8's answer. Each of the eight was read at PLAN time and
  none asserts a string this slice removes; the one closest to the edits is `:359`
  (`COST_ENVELOPES_NOT_SEALED` appears in the README), and C2-7 ADDS a second occurrence rather than
  moving the one at `:779`.
- **Catches:** any of the eight pre-existing README assertions broken by the edits.
- **Does NOT catch:** an edit to a README section outside §11 and outside the known-stale list.
  `REV(S03)` reads the full diff.

## 3. Cluster table — build units, one verification command each

Two clusters, **sequential** (C1 → C2): both write `deploy/vps/README.md`, in disjoint regions, and
the single-writer rule is per file. No cluster is reviewed on its own; `REV(S03)` reviews the slice
once, after both are green.

| cluster | steps | write surface | one verification command | RED event written first | base verdict, measured |
|---|---|---|---|---|---|
| **S03-C1** | C1-1 … C1-4 | `tests/unit/v9-provider-credential-files.test.ts` · `deploy/vps/README.md` between `### What the hosted mode refuses, in code` and `### The credential-file contract` | `LOG=<abs> zsh .claude/skills/heartbeat-orchestrator/scripts/run-suites.sh tests/unit/v9-provider-credential-files.test.ts:24:0 tests/architecture/vps-deployment-baseline.test.ts:31:0` | **C1-1** — the widened pin, failing on `PROVIDER_TARGET_PRICE_REQUIRED` | **`CLUSTER_RED`** — `v9 rc=0 passed=23 failed=0 (expect 24/0)`, `baseline rc=0 passed=31 failed=0 (expect 31/0)`. Not BROKEN: both files exist and both printed a summary line. Log: `probes/ARCH-PES-S03/c1-after-pair-at-base.log`. **Re-run for Revision 2, command unchanged:** the same three lines, `CLUSTER_RED` — `probes/ARCH-FIX-PES-S03-p2/c1-cluster.log` |
| **S03-C2** | C2-1 … C2-10 | `tests/unit/v9-provider-credential-files.test.ts` · `deploy/vps/README.md` **everywhere except** C1's block | `LOG=<abs> zsh .claude/skills/heartbeat-orchestrator/scripts/run-suites.sh tests/unit/v9-provider-credential-files.test.ts:28:0 tests/architecture/vps-deployment-baseline.test.ts:31:0` | **C2-1, C2-2, C2-3, C2-4** — the four new cases, written before any document step | **`CLUSTER_RED`** — `v9 rc=0 passed=23 failed=0 (expect 28/0)`, `baseline rc=0 passed=31 failed=0 (expect 31/0)`. Not BROKEN. Log: `probes/ARCH-PES-S03/c2-after-pair-at-base.log`. **Re-run for Revision 2, command unchanged:** the same three lines, `CLUSTER_RED` — `probes/ARCH-FIX-PES-S03-p2/c2-cluster.log` |

Both commands were also run at the **base pairs** (`v9:23:0`, `baseline:31:0`) and printed
`CLUSTER_GREEN` — `probes/ARCH-PES-S03/c1-base.log`, re-run for Revision 2 with the same result
(`probes/ARCH-FIX-PES-S03-p2/base-pairs.log`). The RED above is therefore the pin's TDD-red and not a
broken lane. Revision 2 added assertions only INSIDE C1-1's one case, so no expected pair moved.

**Why the pairs are the discriminator.** Both clusters name the same two suites; the expected pair
is what tells them apart. C1 takes `v9` from 23 to **24** (one added case). C2 takes `v9` from 24 to
**28** (four added cases) and so requires C1's 24 to have happened. `baseline` is **31/0 in both
rows and after the slice** — it is never edited, which is what makes SPEC §5 step 2 pass as frozen.
A cluster that adds a different number of cases fails its own command, which is the intended gate:
R3.5 can be built as one added case or as an edit to the existing one, and two coders would choose
differently — the pair forbids the fork.

**Mutant class each command detects.** C1's: any change that removes one of the 12 enumerated codes
from §11, narrows an anchor so its slice yields fewer codes, or replaces the source-read with a
retyped list (the list would not be RED at base, so the `24:0` pair could never have been reached
through a RED step); since Revision 2 also an angle-bracket placeholder anywhere in the refusal span,
and C1-3's sentence missing from below the table. C2's: any edit that leaves a price member in one env form only, restores the
daily-cap sentence, drops one of the three cost numbers, or removes the wrong known-stale bullet.

**No cluster starts a process, opens a port or reaches the network.** No `pnpm install`. No listener
on the NO-TOUCH ports (COMMON §6). No fixture endpoint is needed by either cluster, so no step
creates one.

**Paths created by a step and therefore omitted from a base run:** none. Both suites exist at base
and both were run.

## 4. Verification list

What `REV(S03)` runs once both clusters are green:

- `tests/unit/v9-provider-credential-files.test.ts` — **28/28** (base 23/23, +1 from C1-1, +4 from
  C2-1…C2-4)
- `tests/architecture/vps-deployment-baseline.test.ts` — **31/31**, its base pair, from a file this
  slice leaves byte-identical
- `pnpm typecheck`, as a per-file DELTA against the baseline log — **expected delta zero**; the
  baseline is one diagnostic, `apps/ui/lib/v3/answerExport.ts(2,38) TS2835`, re-measured in this lane
  at PLAN time (`probes/ARCH-PES-S03/typecheck-base.log`)
- the four RED-at-base suites, unchanged at their pairs (SPEC §4, `00-intake.md:41`):
  `tests/integration/dev-api-environment.test.ts` **9/10** ·
  `tests/integration/dev-api-process.test.ts` **5/10** ·
  `tests/integration/dev-provider-panel.test.ts` **3/4** ·
  `tests/integration/t16-algorithm-register.test.ts` **20/21**.
  This node did **not** re-run them (UNVERIFIED); the pairs are the intake's. No step of this plan
  writes a file any of the four reads.
- the sweep of R3.5, recorded member by member: the eight anchors of §1b (E1, E2, E3, E4, E5, E6a,
  E6b, E7 — E6 is two, one per function), each with its
  `path:line` measured in the lane at BUILD time and the codes it yielded, in `PROGRESS.md`. The
  reviewer re-runs `probes/ARCH-PES-S03/enumeration.mjs` and compares.
- `git diff --stat origin/dev...HEAD -- apps packages` (cwd = the lane's `dialectical-engine/`)
  prints nothing — and the reviewer confirms the command is capable of printing something, per the
  START frame's capability proof, before accepting the empty output.
- `git diff --stat origin/dev...HEAD` names exactly **two** files: `deploy/vps/README.md` and
  `tests/unit/v9-provider-credential-files.test.ts`, plus the mission records under
  `docs/missions/provider-env-selection/`. `tests/architecture/vps-deployment-baseline.test.ts` is
  **not** among them — `git diff --stat origin/dev...HEAD -- tests/architecture/` prints nothing.
- every literal done-when command of C1-2, C2-5, C2-6 and C2-8, run against the BUILT README, prints
  what its step states. Revision 2 ran each one at its own step boundary on a simulated correct
  edit, and on a mutant that must fail (`probes/ARCH-FIX-PES-S03-p2/oracles.log`), so a divergence
  on the built file is a finding against the build, not against the plan
- the acceptance of SPEC §5, run once end to end, captured through
  `.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh`. Base answers for steps 3–7 are
  recorded in `probes/ARCH-PES-S03/accept-base.log`, so each step's AFTER answer is compared against
  a measured BEFORE rather than against an expectation:

| §5 step | answer at base (measured) | answer required after |
|---|---|---|
| 2 | v9 23/23, baseline 31/31 | v9 **28/28**, baseline **31/31** — its base pair exactly, as the frozen step requires, because no case is added to that file and no assertion in it changes |
| 3 | 4 lines — `:22`, `:25`, `:26`, `:27`, every one inside the known-stale notice, none in §11 | ≥ 6 lines, each with a number greater than §11's heading line, and none inside the removed bullets. Measured on the simulated final state: every hit is below the §11 heading (`probes/ARCH-FIX-PES-S03-p2/oracles.log`, "S7 §5 step 3") |
| 4 | 1 line — `:20`, inside bullet B1 | a hit on the `input_price_micros_per_million` row of the member table, and a hit on each worked-example line (`runner.env`, `api.env`) — SPEC §5 step 4's own words. Revision 2 dropped pass 1's "3 lines": the total depends on the member table's prose, 3 or 4 once C2-9 has run (`oracles.log`, section B1.3), so it is not an oracle |
| 5 | 5 bullets in the `14,40p` window | 2 lines beginning `- ` (B4, B5) and no line carrying `hosted provider target example` or `refusal-code table is incomplete`. Once C2-9 removes 13 lines, the fixed window also covers original lines 42–53 (the `## 1. Topology` heading, its first sentence, the top of its diagram). Measured: none of them begins with `- `, so the count stays 2 (`oracles.log`, "S7 §5 step 5") |
| 6 | no hit, rc=1 | exactly 1 hit, inside §11, in a paragraph naming `probe_freshness_ms` |
| 7 | empty; proved capable of printing (258 files over a moved range) | empty |

## 5. Boundaries, DDD impact, ADRs

**No product boundary moves, and no bounded context changes.** This slice writes one runbook section
and two test files. No module gains or loses a responsibility, no domain term is introduced, no
invariant changes owner. The invariants named in `INSTRUCTIONS.md` — the exact-set invariant
`PROVIDER_DISCOVERY_TARGET_SET_MISMATCH`, the credential-file contract, the sealed v1 row shape in
`packages/register/src/configured-provider-set.ts` — are read by this slice and written by none of it.

**The forbidden set for every BUILD and FIX packet of S03:** everything under `apps/` and
`packages/`; `deploy/vps/env/*`; `deploy/vps/systemd/*`; **every test file except
`tests/unit/v9-provider-credential-files.test.ts`** — including
`tests/architecture/vps-deployment-baseline.test.ts`, which R3.8 requires GREEN and which this slice
therefore reads and never writes; every other slice's files; the four RED-at-base suites. SPEC §2
states the `apps/`+`packages/` half and acceptance step 7 measures it.

**The write surface of the whole slice is TWO files:** `deploy/vps/README.md` and
`tests/unit/v9-provider-credential-files.test.ts`.

**Single-writer:** C1 and C2 write both of those files, in disjoint regions, so they do not run
concurrently. Nothing else in this slice shares a file.

**The one architectural question the scaffold posed — where the enumeration of operator-facing
refusal codes lives.** Answered: **several inventories, each beside the code that raises it, and the
pin reads the union of a NAMED anchor list.** The alternative — one new inventory constant in
`packages/providers/src/index.ts` — is the shape a reader expects, and it is rejected: SPEC §2 and
`DECISIONS.md` (2026-09-24, row 6) forbid this slice from touching any file under `apps/` or
`packages/`, and acceptance step 7 measures the prohibition. The house has already chosen several
inventories anyway, twice, with the reason written down — `packages/providers/src/index.ts:727-731`
and `apps/api/src/support/model.ts:34-39` both describe an inventory owned by the surface that emits
it. Six of the twelve enumerated codes have no inventory at all and are read from their function or
class body instead; that asymmetry is the cost of the prohibition and is recorded in `DECISIONS.md`.

**ADR: none written.** The candidate — "a new operator-facing refusal code must appear in §11 and in
an inventory the pin reads" — outlives the mission in principle, but it is already enforced by a
mechanism stronger than a document: the widened pin fails the moment a code is added to a named
anchor and not to §11. An ADR restating a live test would be a second copy that drifts, which is the
exact defect R3.5 exists to close. The next free number is **ADR-0025**
(`ls docs/architecture/01-decisions/` at PLAN time: the highest is ADR-0024), recorded here so a
later node does not re-measure.

**Standing ADRs read and respected:** `ADR-0011:103-143` (the register's write and read surfaces; a
deferred capability is not written where the pack says it does not ship — this slice writes no gate),
`ADR-0015:86-131` (**no threshold, no interval and no probe budget is stated outside the register** —
which is why R3.6 documents the probe exposure and states no floor, and why row V-7's default binds),
`ADR-0018:117-141` (selecting a provider is a register-row change, not an import — unchanged here).

**DDD impact: none.** No aggregate, entity, value object or domain service is added, moved or
renamed. The only artefact that crosses a package boundary is a TEST that READS source text from
`packages/providers`, `packages/register` and `apps/api`. That is a documentation pin, not a runtime
dependency: it adds no import to any product module and no edge to the dependency graph
`ADR-0018:117-141` constrains.
