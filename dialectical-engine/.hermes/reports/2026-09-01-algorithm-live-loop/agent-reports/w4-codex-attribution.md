READY FOR PEER REVIEW · W4 · comments read through: v-rulings-2026-09-03

SKILLS LOADED: heartbeat (loader), heartbeat-protocol, heartbeat-worker,
superpowers:using-superpowers, superpowers:systematic-debugging,
superpowers:test-driven-development, superpowers:verification-before-completion

# W4 — codex model attribution

## Verdict in one line

The ticket's hypothesis is **refuted by measurement**: codex's output format has not drifted
and live attribution already worked. The RED test was a **test-harness wiring defect** — the
dual-maker proof substituted a fake Codex CLI without substituting that CLI's rollout store,
so the fake's thread id was looked up in the operator's real `~/.codex/sessions`. One option
field fixes it. `FAIR-02 … round-trips one live call` now passes, 2/2, three runs.

## 1. Reproduction (systematic-debugging Phase 1)

The named test fails **differently in the two candidate trees**, and only one of them is the
ticket's failure:

| tree | commit | FAIR-02 result | failing at |
|---|---|---|---|
| dev / lane-w4 | `b5a6b6eb` | 1 failed / 1 passed (2) | `model-shim.ts:136` `CODEX_CLI_MODEL_UNRESOLVED` — **the ticket's failure** |
| mission integration | `7dda3cc0` | 2 failed (2) | `seed-register.ts:123` `SHIPPED_CONTRACT_TEXT_UNRESOLVED:conformance` — a *different*, unticketed defect (finding F-W4-1) |

`model-shim.ts:136` on dev is byte-identical to `model-shim.ts:149` on integration — the line
the ticket cites. The ticket's line number is therefore correct **for the integration tree**,
which is a packet detail worth knowing because the two trees fail for different reasons.

Records: `logs/w4/red-r1-lane-fair02.log` (lane) · `logs/w4/red-r0-dev-fair02.log` (dev) ·
`logs/w4/crossref-integration-fair02.log` (integration).

## 2. Root cause — measured at the boundary, not inferred from a diff

Four measurements, in order:

1. The fake CLI's own stdout: `thread_id = 01a000e7-3ea0-7f91-b166-7104741ef333`.
2. Rollouts for that id under the operator's real root `~/.codex/sessions`: **0**.
3. Rollouts for that id under the fixture root `acceptance/test-fixtures/codex-sessions`: **1**.
4. `grep testOnlySessionsRoot acceptance/dual-maker-proof.ts acceptance/dual-maker-proof.test.ts`
   → **absent from both**.

`runDualMakerProof` (`dual-maker-proof.ts:126–130` at base) forwarded `testOnlyCommand` but not
`testOnlySessionsRoot`, so `startModelShim` fell through to `defaultCodexSessionsRoot()`.
`findRollouts` then returned 0 matches and `parseCodexCompletion` raised
`CODEX_CLI_MODEL_UNRESOLVED`. The lookup logic was never at fault, and neither was codex.

This is the same defect the TREL seat derived independently and filed as **F10**
(`board/F10-dualmaker-proof-hardcode.md`: *"one option field; the correct fixture already
ships"*). W4 closes F10.

## 3. The ticket's hypothesis, tested directly — ONE live codex call

Codex was spawned with the shim's exact arguments, cwd and filtered environment, raw stdout
captured, then that stdout fed to the **production** `parseCodexCompletion`
(`logs/w4/live-probe-1.log`):

```
{"type":"thread.started","thread_id":"01a066c9-7475-7c20-8728-242b4390a666"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"OK"}}
{"type":"turn.completed","usage":{...}}
event types  : ["thread.started","turn.started","item.completed","turn.completed"]
LIVE-PARSE-OK model="gpt-5.6-sol"
LIVE-PARSE-OK content="OK"
```

`thread.started` is present, the id is well-formed, the rollout is found and the model resolves.
**Codex's output has not drifted.** Session store 179 → 180, so exactly one call.

## 4. The fix

`acceptance/dual-maker-proof.ts` gains `testOnlyCodexSessionsRoot?: string` and forwards it with
the same conditional-spread shape already used for `testOnlyCodexCommand`; the test passes the
fixture root. **Unset — the live case — is byte-identical to base**: the spread contributes no
key, so `startModelShim` receives exactly the object it received before.

18 added lines across the two files. Patch: `logs/w4/w4-code.patch` — verified to apply cleanly
to the mission integration branch `7dda3cc0` (`git apply --check`).

## 5. Live end-to-end proof — the outcome the ticket actually asks for

The patched `runDualMakerProof` run with the **codex leg fully live** (no codex seams at all;
only the Anthropic leg faked, because `CLAUDE_BINARY` on this baseline still points at another
user's machine — F8/D10, pre-existing). `logs/w4/live-dual-maker-proof.log`:

```
{"providerRef":"acceptance:codex-cli","maker":"OpenAI","model":"gpt-5.6-sol",
 "rawArtifactRef":"137030fe-eac4-4e1f-bfc1-2eef7e1ccf25",
 "ledgerEntryRef":"23e068be-d93b-45f4-a5c4-63d89f54cc11","content":"OK"}
distinct persisted makers: Anthropic, OpenAI
```

A live codex reply, attributed to a named model, persisted as real maker lineage with a
MODEL_CALL ledger entry. Two live codex calls (handshake + relay call); store 180 → 182.

## 6. Refutation evidence (worker contract §2)

**PROPERTY**, stated before the assertion: *when the proof substitutes a test-only Codex CLI,
the Codex model id it records is read from the rollout store belonging to that CLI — the store
the caller names — never from the operator's real tree and never from a constant.*

| mutant | what it does | expected | observed | record |
|---|---|---|---|---|
| M1 | delete the forwarding spread | RED | **RED** `CODEX_CLI_MODEL_UNRESOLVED`, 1 failed/1 passed | `mut-M1-forwarding-removed.log` |
| M2 | point the seam at `test-fixtures/` | RED | **GREEN — mutant mis-built** (see below) | `mut-M2-wrong-store.log` |
| M2b | point the seam at the real `~/.codex/sessions` | RED | **RED** `CODEX_CLI_MODEL_UNRESOLVED` | `mut-M2b-disjoint-store.log` |
| M3 | change the model id **in the fixture rollout** | RED, showing the new value | **RED**, received `w4-provenance-probe` | `mut-M3-fixture-model-changed.log` |
| N1 (neighbour) | change a non-model fixture field (`effort`) | GREEN | **GREEN** 2/2 | `mut-N1-neighbour-effort.log` |

**M2 is disclosed as mis-built, not as a defect.** `test-fixtures/` is the *parent* of
`codex-sessions/` and `findRollouts` recurses, so I fed the test a superset store, not a wrong
one — it found the same rollout and correctly passed. Rebuilt as M2b against a genuinely
disjoint store, which is also exactly the pre-fix behaviour. This is the "read what the search
actually matched" ruling: I had to read what `findRollouts` matched before believing the count.

**M3 is the one that answers F10's hardcode worry.** Changing the value *in the store* changed
the value the test received, so the model id demonstrably flows from the rollout store; no
constant in the shim can satisfy it.

Every mutant was reverted from a pristine copy and verified byte-identical by sha256, with
`git status --porcelain` printed after each restore — it returned to exactly
`M dual-maker-proof.test.ts` + `M dual-maker-proof.ts` every time.

## 7. Cluster verification — three runs, worst run wins

`acceptance/dual-maker-proof.test.ts`, final tree:

| run | result |
|---|---|
| 1 | **2 passed (2)** |
| 2 | **2 passed (2)** |
| 3 | **2 passed (2)** |

Worst run = 2 passed (2). Records `green-final-run{1,2,3}-fair02.log`. An earlier identical
3-run cluster is at `green-cluster-run{1,2,3}-fair02.log`.

## 8. Suites, verbatim

| gate | result | record |
|---|---|---|
| FAIR-02 file (the ticket's gate) | **2 passed (2)** | `green-final-run1-fair02.log` |
| acceptance typecheck `-p acceptance/tsconfig.json` | **EXIT 0**, no output | `green-final-acceptance-tsc.log` |
| neighbours: model-shim + relay-core + seed-register | **12 passed (12)**, 3 files | `green-r3-neighbours.log` |
| **full acceptance project** | **71 passed / 72**, 12 of 13 files | `green-r4-acceptance-suite.log` |

The **one** acceptance failure is
`adversarial-corpus.test.ts > P4-13 … > executes DB-01 with no database locator or capability
call`: `expected [ 'HOME','OLDPWD','PATH',…] to deeply equal [ 'HOME','LANG','OLDPWD',…]`.
That is the pre-existing `LANG` mismatch the ticket itself names as unrelated. **It predates
me** and my diff cannot reach it: I changed only `dual-maker-proof.{ts,test.ts}`, and
`dual-maker-proof` has exactly one importer in the whole repo — its own test. Independently
corroborated: `LANG` is not set in this host's environment at all (presence check, §10), and my
live probe recorded the child env keys as `["HOME","OLDPWD","PATH","PWD","TMPDIR"]`.

Root `tsc --noEmit` is RED on this baseline with 8 pre-existing errors, all in
`tests/unit/s14-ui.test.ts`, all from the absent `web/` tree (W5 records `web/` as gone at the
new dev). Untouched by me. Record `red-r2-typecheck.log`.

## 9. Gate-record integrity

`tools/stamp-check.sh` against the lane tip `b5a6b6eb`:
`red-` 5 records / 0 failures · `green-` 11 records / 0 failures · `mut-` 5 records / 0 failures.

**Fed the bad case before citing it**, per the ruling:
- a record stamping another tree (`crossref-integration-fair02.log`, tip `7dda3cc0`) checked
  against the lane tip → `STALE … -> 7dda3cc0…`, exit 1;
- a glob matching nothing → `REFUSING: the glob matched no records — an empty result is not a
  pass`, exit 3.

The check fails for both reasons it exists.

## 10. Findings

**F-W4-1 (BLOCKING the closing run, high) — the acceptance register seeder is regex-coupled to
runner prompt text that T9B changed, and it fails the whole acceptance surface on the mission
branch.** `acceptance/seed-register.ts:121-124` scrapes
`apps/runner/src/index.ts` for exactly two `content: "Return only JSON {conforms,findings|pass}…"`
strings. On dev those two exist (`index.ts:2337`, `:2359`). On integration `7dda3cc0` there are
**zero** — T9B replaced them with one `"Return only JSON {satisfied,objection,criteria}…"`
contract at `index.ts:4113`. `computeContractHashes` throws
`SHIPPED_CONTRACT_TEXT_UNRESOLVED:conformance` before any provider call. Blast radius is every
acceptance entry point that seeds: `ceremony.test.ts:217`, `mono-panel.test.ts:87`,
`dual-maker-proof.{ts:124,test.ts:107}`, `run-acceptance.ts:16` — i.e. the ceremony the Global
DoD depends on. It appears in no mission record I could find (`DECISIONS.md`, `PROGRESS.md`,
`LEDGER.md` all silent). **Out of my contract; not fixed.** Consequence for this ticket: FAIR-02
cannot be green on the mission branch until this clears, regardless of my change.

**F-W4-2 (high, security) — two fake CLI fixtures echo the entire child environment as their
reply content, and that content is persisted as raw artifact lineage.** Class swept in full:

| fixture | echoes `process.env` as content? | auth keys its adapter forwards | affected on this host |
|---|---|---|---|
| `test-fixtures/fake-codex-cli.mjs` | no — prompt + argv only | `CODEX_HOME`, `OPENAI_API_KEY` (`model-shim.ts:144`) | **no** |
| `test-fixtures/fake-claude-cli.mjs:62` | **yes** (`environment: process.env`) | `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `USER`, `LOGNAME` (`claude-relay.ts:119`) | **YES — observed** |
| `test-fixtures/fake-grok-cli.mjs:12` | **yes** (`environment: process.env`) | `XAI_API_KEY` (`grok-relay.ts:77`) | not today — `XAI_API_KEY` unset here; leaks wherever it is set |

`ANTHROPIC_API_KEY` **is set on this host**, so every FAIR-02 run writes a live credential value
into `ledger.raw_artifact.content` in the acceptance database, and any log that prints artifact
content leaks it. I hit this: my own live-proof log captured the value. **I redacted it in place
and verified 0 remaining matches, and deleted the 73 MB `acceptance/.pgdata` the run left in the
lane, which held the same value in a row.** I did **not** reproduce the value anywhere.

Remedy shape (§2.2 — open key set, so redact, do not enumerate): the fixtures exist so tests can
assert *which* keys crossed the seam, and four test files do exactly that
(`claude-relay.test.ts:190,205`, `grok-relay.test.ts:173,188`,
`adversarial-corpus.test.ts:401,441`, `model-shim.test.ts:134,146-150`) — several comparing
*values*, not only key sets. So "echo key names only" would break landed assertions. The
shape-correct fix is for each fixture to echo its environment with its own adapter's
`authEnvironmentKeys` values replaced by a sentinel: every existing key-set and non-auth-value
assertion survives, and no credential can ever become artifact content. **Out of my contract;
not fixed.**

**Credential hygiene note for V:** because a live `ANTHROPIC_API_KEY` value did transit a log
file on disk before I redacted it, a key rotation is the safe call. That is a human action; I
did not and will not touch any credential.

**F-W4-3 (non-blocking) — a false-positive secret scan almost became a false finding.** A loose
`sk-[A-Za-z0-9_-]{16,}` grep flagged `logs/trel2-codex-r1.log`. Printing the match showed it was
a minified CSS property-name blob (`mask-composite`, `mask-size`, …) where `sk-` is the tail of
`mask-`. **There is no pre-existing credential in the mission logs.** Recorded because the
near-miss is the lesson, and because the precise pattern is now in `TOOLING-TRAPS.md`.

**F-W4-4 (non-blocking) — `pnpm typecheck` cannot see `acceptance/`.** Root `tsconfig.json`
`include` omits it; `acceptance/tsconfig.json` is a separate project. My type-level RED frame
(`TS2353 … 'testOnlyCodexSessionsRoot' does not exist`) was invisible to the root run. Any
acceptance-only type error ships green today. Recorded in `TOOLING-TRAPS.md`.

## 11. Packet defects (worker contract §1)

1. **`allowed: []` is empty** while the ticket requires me to produce a fix, gate records and a
   self-report. Per §1 an `allowed` list that omits a file I must produce is a defect. I chose
   the minimum surface the outcome needs and disclose it here in full: `dual-maker-proof.ts`,
   `dual-maker-proof.test.ts`, `.hermes/TOOLING-TRAPS.md` (mandated by §6), and
   `logs/w4/` + `agent-reports/w4-*`.
2. **`worktree: { path: tbd, branch: tbd }`** — no worktree assigned. I created
   `.worktrees/lane-w4` on `lane/w4` from `b5a6b6eb`.
3. **No `packets/W4*.md` exists**; the board ticket was the whole dispatch.
4. **`model-shim.ts:149` is the integration line, not the T0/dev line** (dev: `:136`). Both name
   the same statement, but the two trees fail for *different* reasons, so the citation quietly
   points at the tree where the ticket's stated failure does **not** reproduce.
5. The ticket says the test *"round-trips one live call"*. It does not: both makers are faked at
   base. The "live" in FAIR-02 is the real HTTP relay, real child process and real Postgres
   gateway, not a live vendor. I closed that gap separately with §5.

## 12. Bounds, and what I did not do

- **Nothing committed, nothing pushed, nothing merged, no branch moved** (§7). The change sits
  uncommitted in `.worktrees/lane-w4`; `logs/w4/w4-code.patch` is the mergeable artifact.
- The traps append is split into `logs/w4/w4-traps.patch` because it does **not** apply cleanly
  to integration — several lanes append to that file's tail. It needs a 3-way merge.
- I did not touch `seed-register.ts`, the runner prompts, the fixtures, `claude-relay.ts`,
  `grok-relay.ts` or `relay-core.ts`.
- **Live codex calls made: 3** — one diagnostic probe, two in the live dual-maker proof.
  No live Anthropic or xAI calls beyond the fake CLI.
- I read `TOOLING-TRAPS.md` late rather than before starting, as §6 requires. Declaring it per
  §2.7 instead of hiding it; two of the four traps I appended would have been avoided by
  reading it first — the other two are new.
