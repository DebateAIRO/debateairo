CODEX REVIEW TREL2 r2 — APPROVE · comments read through: trel2-r2-2026-09-01

# Verdict

VERDICT: **PASS / APPROVE** — rework round r2. Findings: **0 blocking, 0 non-blocking**.

R1 B1 is resolved. The committed relay now preserves the empirically required user
settings source while independently suppressing user CLAUDE.md memory and other CLI
customizations. Installed-CLI static control flow and the two paid probe envelopes agree;
the DR-115 parsing/model-resolution path is untouched. The r1 packet-path N1 was an
orchestrator finding, not worker rework: this r2 reviewer packet uses literal absolute
paths throughout, so the defect did not recur.

## B1 source-to-sink verification

The r2 delta is commit `8c084cab913055fafb91cfabf190ffaed6239dbc`, exactly three
files under `dialectical-engine/acceptance/`, `40 insertions(+), 4 deletions(-)`.
The only production behavior change from r1 is the additional `--safe-mode` argument in
`claudeAdapter.buildArguments`; the remaining changes are explanation and argument-shape
tests. `git diff --check 0e6be86..HEAD` produced no output, and the lane worktree was
clean.

The installed `/Users/stefan.nour/.local/share/claude/versions/2.1.247` establishes the
current control path without reading the user file:

```text
if(oe())process.env.CLAUDE_CODE_SAFE_MODE="1",process.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS="1",Le("startup_safe_mode")
```

The User-memory loader checks the second variable before testing the user source:

```text
async function AAn(e,t,n){if(V.CLAUDE_CODE_DISABLE_CLAUDE_MDS)return[];...if(Li("userSettings")){..."User"...}}
```

The customization map independently carries `claudeMd:!0`, `hooks:!0`, and
`plugins:!0`; embedded help says safe mode disables CLAUDE.md, skills, plugins, hooks,
MCP, commands/agents, output styles, workflows, themes, and keybindings while auth,
model selection, built-in tools, and permissions continue to work. Thus the original
B1 source (the existing User CLAUDE.md) cannot reach the model-context sink under the
committed vector. The gateway still hashes `JSON.stringify(attemptPacket)` at
`packages/providers/src/index.ts:327`, but the unrecorded user-memory component that made
that identity incomplete is now removed before context construction.

The host premise also reconciles with r1 without exposing contents:

```text
path=/Users/stefan.nour/.claude/CLAUDE.md
size=913
mode=-rw-r--r--
mtime=2026-02-20T09:39:23+0200
```

I did not open or read that file.

## Controlled probe evidence

The two raw r2 logs are each a single JSON result envelope. Normalized fields are:

```text
probe-05-user-memory-presence.log  is_error=false  cost=0.03240625  models=1  context=1270+4153=5423  result=YES
probe-06-safemode-memory-presence.log  is_error=false  cost=0.01707875  models=1  context=2+2715=2717  result=NO
```

Both name only `claude-opus-5` in `modelUsage`. The `NO` result therefore demonstrates
that the safe-mode vector still authenticates and satisfies the unchanged one-model
handshake, while the 2,706-token reduction corroborates that customizations disappeared.
The worker's hash-guarded report records an identical prompt and production vector with
`--safe-mode` as the only varied option. The static loader gate above independently
confirms the mechanism rather than relying on the model's YES/NO alone.

The output logs do not serialize argv or prompt; they independently establish the result,
cost, token, error, and model-count fields, while input-vector provenance is carried by
the worker report. That is an evidence boundary, not an open B1 path: the committed argv
and installed loader can be verified statically, and the packet prohibited a reviewer
provider rerun.

## Why both flags are load-bearing

The controls operate at different layers:

- `--setting-sources user` narrows the settings source set. The installed parser maps
  `user` to `userSettings`; its default source state is
  `userSettings, projectSettings, localSettings, flagSettings, policySettings`. Removing
  this flag therefore restores all three ordinary scopes even when safe mode suppresses
  customization classes inside them.
- `--safe-mode` disables those customization classes after the user source is admitted
  for keychain login. Removing it reopens the existing User CLAUDE.md path.

The r2 mutant logs distinguish those properties:

```text
MD drop --safe-mode:       2 failed | 24 passed — shared full-vector pin + safe-mode-specific test
MA sources back to "":     2 failed | 24 passed — shared full-vector pin + user-source test
MB sources all three:     3 failed | 23 passed — shared full-vector pin + both source-bound tests
```

At the property-specific layer, MD does not fail either source-list test, and MA/MB do
not fail the safe-mode test. All three also failing the shared exact-vector test is
intentional redundant coverage, not cross-coupling. This is the precise sense in which
the mutants prove orthogonality.

The worker's withdrawn hook finding is also correctly replaced: for installed CLI
2.1.247 the hook and CLAUDE.md paths are closed now. The residual is version-semantic
drift—tests pin that `--safe-mode` is passed, but a future CLI could redefine what the
flag disables. That belongs in the upgrade/conformance packet, not as a present defect.

## Ledger, content boundary, and trade-off

All six probe envelopes reconcile:

```text
#1 empty sources          is_error=true   cost=0          models=0  Not logged in
#2 full vector, empty     is_error=true   cost=0          models=0  Not logged in
#3 full vector, user      is_error=false  cost=0.03211875 models=1  pong
#4 project,local          is_error=true   cost=0          models=0  Not logged in
#5 user, memory question  is_error=false  cost=0.03240625 models=1  YES
#6 user + safe mode       is_error=false  cost=0.01707875 models=1  NO
```

That is three paid successes plus three free pre-model auth failures, total
`$0.08160375`; the three-success authorization is exhausted. The probe-5/6 JSON keys
contain no prompt or argv field and their only answer bodies are `YES` and `NO`.
Inspection of the worker report and self-report found only the permitted path, metadata,
presence question, and one-word outcomes—no dumped CLAUDE.md body or credential value.
The diff reads, mints, and passes no credential value.

The rewritten trade-off matches the shipped design: user-scope non-customization
settings are re-admitted because that source carries keychain visibility; project/local
sources remain excluded; safe mode suppresses user memory, hooks, skills, plugins, MCP,
agents, and other customizations. Existing `--strict-mcp-config`, `--tools ""`, and
`--no-session-persistence` controls remain unchanged.

## Supplied verification reconciled

Per the static-only packet I did not rerun tests or builds. I checked the worker's
verbatim artifacts:

- r2 RED: `1 failed | 25 passed (26)`, solely the absent-safe-mode arm.
- relay cluster runs 1–3: `65 passed (65)` each. Both F26 parity tests and the dedicated
  safe-mode argument test are named green in every run.
- TREL r3 typed-loud arms are named green for Claude, Grok, and Codex in run 1, including
  blank-override selection and all production seam guards.
- r2 zones 1–3: the same two pre-existing failures and `105 passed (107)` each; neither
  failure intersects this three-file r2 change.
- typecheck log: `tsc --noEmit`, `TYPECHECK_EXIT=0` (with the disclosed Node engine
  warning).
- Worker report body SHA-256 recomputes to
  `18bd3b8d81637e5821c69e0e44c7879ecad631707ab13f3ef116e41f5ce2c956`.
- Worker self-report `## r2` mtime (`14:03:20+0300`) precedes the revised report marker
  (`14:07:37+0300`).

## Not verified

I made no provider call, ran no test/build command, and changed no product or git state,
as required. I did not independently replay the worker's paid A/B or inspect credential
stores, hook values, or the contents of the user CLAUDE.md. I also did not validate a
future Claude CLI: the approval is for the installed 2.1.247 behavior and the committed
flag-pinning design.

## PREDICTIONS

I predict another lens may call `--setting-sources user` redundant after seeing safe
mode; its first check should be the installed default `Ei()` source array and which
non-customization settings safe mode leaves operational. A second likely error is to
reject mutant orthogonality because the shared exact-vector test kills MD, MA, and MB;
the discriminating check is cross-membership of the dedicated safe-mode versus source
tests. Finally, a lens may say the raw probe files themselves prove identical inputs.
They do not—the one-line envelopes prove outputs, while the hash-guarded report supplies
input provenance. I would require self-describing redacted argv/prompt digests on the
next version-upgrade probe.
