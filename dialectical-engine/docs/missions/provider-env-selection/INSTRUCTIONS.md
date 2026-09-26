# INSTRUCTIONS — mission `provider-env-selection` (the compass; pointers, never content)

## The mission

Localhost uses the CLI-relay subscriptions; a VPS uses paid vendor APIs with keys. Measured on
`origin/dev` @ 776359c3, most of that is BUILT (`DEBATEAI_DEPLOYMENT_MODE`, hosted refusing relays,
credential files). This mission codes only the measured GAP, and row **V-6** records that scope.
V's verbatim goal and the origin question: `00-intake.md:3-6`.

## The gap table — one verdict per intake §10 item, re-measured in the lane

| item | verdict | slice |
|---|---|---|
| (a) a hosted provider-set publication path that is not dev-gated | **GAP** | S01 |
| (b) README §11's hosted target example and refusal table are stale | **GAP** | S03 |
| (c) the localhost composition never DECLARES the mode | **GAP** | S02 |
| (d) a paid-endpoint probe cost guard | **GAP in the mechanism · UNVERIFIED in the need** | no slice — documented by S03 R3.6; the floor is row **V-7** |
| (e) a hosted acceptance V can run on this Mac | **GAP** | S02 |

Every verdict's evidence, command and `path:line`: `slices/S01/DECISIONS.md`, the gap table at its
top. It is the one copy; nothing restates it.

## The slice table

| code | name | ui | done oracle |
|---|---|---|---|
| S01 | The hosted provider set is published by a command that declares itself hosted | `no` | `slices/S01/SPEC-v5.md` §5 acceptance, run by V |
| S02 | Both deployments declare themselves, and hosted mode is proved on this Mac against a fake vendor | `no` | `slices/S02/SPEC-v4.md` §5 acceptance, run by V |
| S03 | The VPS kit's §11 says what the shipped code does, and a pin keeps it saying it | `no` | `slices/S03/SPEC-v3.md` §5 acceptance, run by V |

**The SPEC of record is the highest-numbered version:** S01 `SPEC-v5.md` (REQ-FIX pass 6), S02 `SPEC-v4.md`
(pass 4), S03 `SPEC-v3.md` (pass 5), on V's rulings (`V-DECISIONS-PACKET.md`, rulings table). Every earlier version stays
frozen and byte-identical as history (v2 and v3 came from `reviews/REQ-REV-p1.md` and `-p2.md`).

No slice is `ui: yes`, so no slice has a MOCK(S) node, a DONE.md or a V DONE gate. A slice that
grows a browser-visible surface flips to `ui: yes` at a REQ-FIX node, not in place.

**Edges: none. Every slice is independent and V can run its acceptance with no other slice merged.**
S02 composes the shipped discovery resolver in process from literal values
(`apps/api/src/provider-discovery.ts:40-48`) and publishes no register row, so it does not wait on
S01. (v1 of S02 claimed that dependency in three places and contradicted it in its own steps —
`reviews/REQ-REV-p1.md:23-30`; the dependency is withdrawn.)

## Roster and review route

| seat | model | source |
|---|---|---|
| coders (BUILD, FIX) | `codex@gpt-6-astra` (substitute `gpt-5.6-sol` if a seat dies) | V's goal, `00-intake.md:11` |
| reviewers — REQ-REV, ARCH-REV, every REV(S) lens | `grok-4.7`, blind | V's goal, `00-intake.md:12` |
| planning (REQ, ARCH) | `claude-opus-5` subagents | row V-3 |
| orchestrator | Claude Fable 5.1 | V's goal |

One review per vertical slice at `REV(S)`, after every cluster of that slice is green, with two
lenses: correctness/tests and security/data-safety (`risk_tier: medium`, `00-intake.md:17-18`).
Three REV passes per slice, then it is V's — pass 4 does not exist; it is a V DECISIONS PACKET row.

## Table of contents — real files, read at the lines a packet names

| what | where |
|---|---|
| V's goal, the R7 election, the contradiction check, the measured state, the baselines, the callers, the spike's staleness, the candidate slicing, what dev already has | `00-intake.md` (§1, §2, §4, §5, §5b, §6, §7, §8, §10) |
| the V rows, numbered from V-1, each default binding until V rules (V-2 is WITHDRAWN as written; V-7 is the probe-floor row) | `V-DECISIONS-PACKET.md` |
| the blind REQ-REV verdicts (v2, v3) and V's rulings (S01 v4 and v5, S02 v4, S03 v2 and v3) | `reviews/REQ-REV-p1.md` · `-p2.md` · `-p3.md` · `V-DECISIONS-PACKET.md` (rulings table) |
| the feasibility spike, verbatim, with its staleness notice | `design/spike-2026-09-23.md` |
| 158 measured `path:LINE` quotes from dev (re-grep before leaning on one) | `design/dev-extracts.md` |
| per-slice SPEC / PLAN / PROGRESS / DECISIONS (record = the highest-numbered SPEC: `SPEC-v5.md` for S01, `SPEC-v4.md` for S02, `SPEC-v3.md` for S03) | `slices/<S>/` |
| the gap table, the rejected alternatives, the rows transcribed as V-2-withdrawn and V-7, and pass 3's `V-ROW: NEW` | `slices/S01/DECISIONS.md` |
| baseline suite pairs and the typecheck baseline | `00-intake.md:40` (§5b) · machine-readable `logs/baselines.tsv` · `logs/baseline-intake-suites.log` · `logs/baseline-intake-typecheck.log` |
| packets (read yours first, then COMMON) | `.hermes/planning/provider-env-selection/packets/` |
| ledger, agent self-reports, probes, review packages | `.hermes/reports/provider-env-selection/` |
| the tooling traps, as an index of headings | `grep -n '^## ' .hermes/TOOLING-TRAPS.md` |

## What binds every seat of this mission

- **Row V-1** — the switch is at PROCESS LAUNCH. No runtime hostname check, no `NODE_ENV`
  inference, and `DEBATEAI_DEPLOYMENT_MODE` is the only switch. No second mechanism.
- **Row V-5** — no seat holds a real API key. Acceptance runs against a fake OpenAI-compatible
  endpoint that refuses a missing or wrong `Authorization: Bearer`. A real key reaches V's hands
  only at TEST(S).
- **The exact-set invariant** `PROVIDER_DISCOVERY_TARGET_SET_MISMATCH` between the env targets and
  the register row stays exactly as it is.
- **The credential-file contract** stays as `deploy/vps/README.md` §11 states it.
- **The sealed v1 row shape** (`packages/register/src/configured-provider-set.ts`) is never altered.
- **NO-TOUCH ports** and the base commit: COMMON §6 of the packets. A seat needing a listener takes
  a port above 4400 it measured free with `lsof`.
- **The four suites RED at base** stay exactly at their pairs unless a slice's SPEC names one
  (`00-intake.md:41`). `pnpm typecheck` is judged by the per-file DELTA, never by its exit code.

## The standing laws, by name

No self-review · a finding is a finding and you fix the CLASS · three REV passes per slice, then
V's · the board is the state · reproduce first, RED before GREEN · verbatim means verbatim · say
what you cannot do, and UNVERIFIED is always legal · the reading floor · the no-terminal law.
Never: push · merge · mark Done · delete product or database data · fabricate evidence · reveal
secrets · cross your `allowed` list · ignore ticket comments · sub-delegate your deliverable · open
anything on V's desktop.
Full text: `heartbeat-protocol` §3 and §6. Authority on a DISPUTE, and only then:
`docs/agent-protocols/debateai-heartbeat-protocol.md` (v4.0.0 amendments win over older text).
## CLOSE — handover to translation (V, relayed 2026-09-26 by "Register form email/password confirmation"; Turn 12 confirmed)
After every slice has V's veto and BEFORE any merge or push: one message to the "Turn 12 localization mission" session naming (1) each slice's branch + final commit, (2) the base (origin/dev a6d6382ba for the rebased slices; 776359c3 for any not rebased), (3) every new/changed string that renders in apps/ui or reaches a user through the support agent (none expected: the slices touch runner/API env, acceptance scripts and the operator README — operator surfaces are English-only per Turn 12), (4) anything else a user sees. Turn 12 merges and pushes; this mission pushes nothing. Turn 12 (relaying V): only app-visible or support-agent strings are translated; operator README/CLI text stays English; a message confirming "none" means no translation, and the Turn 12 push does not wait for this mission.
