READY FOR PEER REVIEW — LIVEPROOF r1 · comments read through: D20-2026-09-01
report sha256: 0f9e46ee2a1d5dc952bf2acfd7c7f72c341dc04db58fdbefc8b0b250b229cd97  (sha256 of this file with the marker line, this sha line, and the blank line after them removed)

# TREL2 LIVE PROOF (D20)

Bounded addendum executed by the T0 seat under D20. The T0 baseline report
(`t00-baseline.md`, r5) is **frozen and untouched**; this is a new file.

**Result: the ceremony PASSED — `CEREMONY_EXIT=0`.** The mission's first real M≥2 run: a
two-maker discovered panel, an 8-node graph with roots authored by both makers, **4 attack
edges every one of which joins nodes of different makers**, cross-maker review on every node,
and FAIR-01 satisfied on a >1-node graph. This is the first ceremony in the mission to reach
its reporting block at all.

---

## 1. Tree and provisioning (verified before the attempt)

| Check | Result |
|---|---|
| Working tree | `/Users/…/V5/.worktrees/integration/dialectical-engine` |
| Tip | **`a047423`**, branch `mission/2026-09-01-algorithm-live-loop` |
| `packages/contract/generated/client.ts` | present (130 B) |
| `node_modules` / `node_modules/.bin/tsx` | both present |
| TREL2 relay flags | `--setting-sources user` + `--safe-mode` wired at `acceptance/claude-relay.ts:177-178` |
| `ACCEPTANCE_CLAUDE_BINARY` override | wired (`claude-relay.ts:34`) |
| Stale `.pgdata` | ABSENT before the run |
| Post-run tree state | **0 changes**, HEAD still `a047423` |

## 2. Preflight (F26 parity — the relay's own function, not an imitation)

TREL2 shipped `preflightClaudeCli` (`acceptance/claude-relay.ts:226`), which resolves the same
binary, builds the same arguments through the same adapter, and receives the same allowlisted
child environment by going through `invokeCli` exactly as a relayed call does — and
`startClaudeRelay` calls it for its own handshake, so the two cannot drift. **This seat's
preflight called that exported function rather than hand-writing a CLI invocation**, which is
the F26 practice the three earlier divergences (PATH vs absolute path; parent env vs child
allowlist; bare args vs `--setting-sources ""`) were paid for.

Log: `logs/t0/preflight-f26-liveproof.log`

```text
F26_PREFLIGHT=OK
binary: /Users/stefan.nour/.local/bin/claude
args:   []
model:  claude-opus-5
usage:  {"promptTokens":4,"completionTokens":28,"totalTokens":32,"costUsd":0.02744}
PREFLIGHT_EXIT=0
```

**This is the first successful claude relay authentication in the mission.** The r3 blocker —
`--setting-sources ""` severing the CLI's login while the child allowlist carried only
`ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` — is cured by `--setting-sources user
--safe-mode`. The model id is the one the CLI itself reported (`claude-opus-5`), never a
guessed literal (DR-115).

Also preflighted: credential 43 chars matching `/^[A-Za-z0-9_-]{43}$/`; ports 55279–55282
each probed free and confirmed clear again afterwards.

## 3. Ceremony record

Full stdout+stderr: `logs/t0/ceremony3.log`. Recovery transcript:
`logs/t0/ceremony3-recovery.log` (queries `Q1`–`Q14`, each with its verbatim result,
captured **before** deletion). Every field below is re-derivable from those two files.

| Field | Value | Source |
|---|---|---|
| Exit | **0** — ceremony passed | `ceremony3.log` |
| Wall-clock | `2026-09-01T11:21:00Z` → `11:29:07Z` (487s) | `ceremony3.log` |
| **Discovered panel** | **M=2** — `OpenAI`/`gpt-5.6-sol` (`acceptance:codex-cli`) + `Anthropic`/`claude-opus-5` (`acceptance:claude-cli`) | Q3, ceremony log |
| Absent maker | `xAI` — `GROK_CLI_FAILED` (grok CLI absent; expected per D6) | Q1 |
| **Run id** | **`31591934-33fb-48db-9dc6-77fb21148f0c`** | Q3 |
| **Answer id** | **`197b8602-a9f1-4120-8950-2a04c6211c08`** | Q4 |
| **FAIR-01 verdict** | **PASSED** — `8 nodes · 4 attack edge(s)`; makers `Anthropic, OpenAI`; independent attack edges `4` | ceremony log |
| Answer state | terminal `DOWNGRADED` · serve `COMPOSED` · verdict `SUPPORTED` · band `CAPPED` | Q4 |
| **Condition marks on the answer** | `UNSERVED-MAKER-POSITION` · `OWED-CHECK-UNEXECUTED` · `UNRESOLVED-TYPE-FALLBACK` | Q4 |
| Condition-mark rows | **31** = 28× `OWED-CHECK-UNEXECUTED` + 2× `UNRESOLVED-TYPE-FALLBACK` + 1× `UNSERVED-MAKER-POSITION` | Q7, Q8 |
| **Model attempts vs structural ceiling** | **20 / 88** (23% of ceiling) | Q11, Q3, ceremony log |
| **Probe-evidence rows** | **5** — 1 grok ABSENT, 2 boot HEALTHY, 2 claim-time HEALTHY | Q1, Q2 |
| Nodes | **8** — 2 roots at depth 0, 6 children at depth 1 | Q5, Q6 |
| Edges | **8** — 4 `support`, 4 `attack`/`rebutting`, all `magnitude_status: UNKNOWN` | Q13 |
| Distinct persisted makers | **2** | Q10 |
| Artifacts by maker | `Anthropic` 8 + `OpenAI` 12 = **20** (= model attempts) | Q9 |
| UI | `http://localhost:3000/debate/31591934-33fb-48db-9dc6-77fb21148f0c` | ceremony log |

Verbatim FAIR-01 / discovery lines from `ceremony3.log`:

```text
ACC-01 run id: 31591934-33fb-48db-9dc6-77fb21148f0c
ACC-01 answer id: 197b8602-a9f1-4120-8950-2a04c6211c08
FAIR-01 graph: 8 nodes · 4 attack edge(s)
FAIR-01 makers: Anthropic, OpenAI · independent attack edges: 4
PRO-01 model calls (all outcomes): 20
DISC-01 panel/ceiling/probe evidence: 2 / 88 / 5
```

### 3.1 Per-node maker lineage (8 nodes, both makers authoring)

| Node | Depth | Child kind | Maker | Model |
|---|---|---|---|---|
| `c4191bb5…` | 0 | (root) | **OpenAI** | `gpt-5.6-sol` |
| `d0fa33f9…` | 0 | (root) | **Anthropic** | `claude-opus-5` |
| `f15e98c7…` | 1 | support | Anthropic | `claude-opus-5` |
| `1c8486b5…` | 1 | defeater | Anthropic | `claude-opus-5` |
| `02a1cfd2…` | 1 | support | OpenAI | `gpt-5.6-sol` |
| `83cc9521…` | 1 | defeater | OpenAI | `gpt-5.6-sol` |
| `ada4cbfe…` | 1 | support | OpenAI | `gpt-5.6-sol` |
| `05236c4c…` | 1 | support | Anthropic | `claude-opus-5` |

Each maker authored its own depth-0 position root, exactly as DR-140(b)/PANEL-01 rule.

### 3.2 Cross-maker attack edges — independently re-derived

FAIR-01 requires at least one attack edge joining nodes of **different** makers. All four do.
Re-derived by this seat from the captured Q13 edge rows joined to the captured per-node
lineage, not taken from the ceremony's own count:

```text
attack 1c8486b5(Anthropic) -> c4191bb5(OpenAI) : CROSS-MAKER
attack 83cc9521(OpenAI)    -> d0fa33f9(Anthropic) : CROSS-MAKER
attack ada4cbfe(OpenAI)    -> d0fa33f9(Anthropic) : CROSS-MAKER
attack 05236c4c(Anthropic) -> c4191bb5(OpenAI) : CROSS-MAKER
CROSS_MAKER_ATTACK_EDGES=4/4
```

This matches the ceremony's own `independent attack edges: 4` from an independent derivation.

### 3.3 Cross-maker node review (XREV-01) — 8/8 reviewed by the other maker

Every node was reviewed by the maker that did **not** author it: OpenAI-authored nodes
reviewed by `claude-opus-5`, Anthropic-authored nodes reviewed by `gpt-5.6-sol`. Outcomes:
**5 `agree`, 3 `dispute`** (disputes on `1c8486b5`, `ada4cbfe`, `05236c4c`). The panel is not
merely present — it disagrees, on the record, with named reviewer lineage and a review
artifact ref per node.

### 3.4 Internal consistency (checked before publication)

| Identity | Check |
|---|---|
| `28 + 2 + 1 = 31` condition-mark rows | Q7 sum = Q8 total ✓ |
| `Anthropic 8 + OpenAI 12 = 20` artifacts | = Q11 model attempts ✓ |
| 4 support + 4 attack = 8 edges | = Q13 rowcount ✓ |
| 2 roots + 6 children = 8 nodes | = Q6 node count ✓ |
| 20 model attempts ≤ 88 ceiling | within structural ceiling ✓ |

### 3.5 What changed versus the M=1 runs

| | r3/r4 runs (M=1) | This run (M=2) |
|---|---|---|
| Panel | 1 (codex only) | **2** (codex + claude) |
| Claude relay | `CLAUDE_CLI_FAILED` | **HEALTHY**, `claude-opus-5` |
| Nodes | 1 | **8** |
| FAIR-01 | refused `FAIR_DEBATE_NODE_COUNT_UNSATISFIED` | **passed** |
| Exit | 1 | **0** |
| Mono marks | `SINGLE-LINEAGE`, `CRITIQUE-UNAVAILABLE` | **absent** — replaced by `UNSERVED-MAKER-POSITION` |
| Probe rows | 4 | 5 |

The disappearance of `SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE` and the appearance of
`UNSERVED-MAKER-POSITION` (DR-161: the served answer names both makers and both root ids
while composing only the primary root) is the engine's own signature that it took the
multi-maker path, not the mono fallback.

## 4. Honest notes

1. **`CAPPED` band and `DOWNGRADED` terminal are expected, not a defect.** The ceiling basis
   is `REASONING` only (no `RAN`/`LOOKED_UP` evidence in a depth-1 prototype ask), and
   `OWED-CHECK-UNEXECUTED` × 28 records battery rows whose owed checks have no recorded
   execution — the DR-139 ruling-4 honest-disclosure path, not a silent pass.
2. **Q14 in the recovery transcript is a malformed query** — it joins `core.node` to
   `ledger.raw_artifact` on `run_id` alone, producing a 160-row cartesian product rather than
   a node→maker map. It is left in the transcript unedited because the transcript is evidence.
   The authoritative per-node lineage is the ceremony's own `PRO-01 per-node maker lineage`
   line, which is captured in `ceremony3.log`, and §3.2 uses that.
3. **Grok remains absent** (`GROK_CLI_FAILED`), as D6/D20 expect. M=2 is the full lawful panel
   on this host.
4. **One attempt, as authorized.** No retry was needed; no second ceremony spend occurred.

## 5. Replay

```bash
cd /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/integration/dialectical-engine
git rev-parse --short HEAD                        # a047423
test -f packages/contract/generated/client.ts

CRED=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
printf '%s' "$CRED" | grep -qE '^[A-Za-z0-9_-]{43}$' || exit 1
read DB API SHIM GROK <<<"$(node -e '
const net=require("net");const g=[];(async()=>{while(g.length<4){
const p=await new Promise(r=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const q=s.address().port;s.close(()=>r(q));});});
if(!g.includes(p))g.push(p);}console.log(g.join(" "));})();')"

# preflight: call the relay's OWN preflight (F26 parity), sanitized env
env -i HOME="$HOME" PATH="$PATH" USER="$USER" SHELL="$SHELL" TMPDIR="$TMPDIR" LANG="${LANG:-en_US.UTF-8}" \
  ACCEPTANCE_CLAUDE_BINARY=/Users/stefan.nour/.local/bin/claude \
  ./node_modules/.bin/tsx -e 'import("./acceptance/claude-relay.ts").then(m=>m.preflightClaudeCli({timeoutMs:180000})).then(r=>console.log(r.command.binary, r.handshake.model))'

# ONE ceremony attempt
env -i HOME="$HOME" PATH="$PATH" USER="$USER" SHELL="$SHELL" TMPDIR="$TMPDIR" LANG="${LANG:-en_US.UTF-8}" \
  ACCEPTANCE_DB_PORT="$DB" ACCEPTANCE_API_HOST=127.0.0.1 ACCEPTANCE_API_PORT="$API" \
  ACCEPTANCE_SHIM_PORT="$SHIM" ACCEPTANCE_GROK_RELAY_PORT="$GROK" \
  ACCEPTANCE_STRANGER_SAMPLE_RATE=1 ACCEPTANCE_BATTERY_VERSION=acceptance-v1 \
  ACCEPTANCE_SETTLEMENT_WATCH_HANDLE=acceptance:t0-trel2-liveproof \
  ACCEPTANCE_CLAUDE_BINARY=/Users/stefan.nour/.local/bin/claude \
  ./node_modules/.bin/tsx acceptance/run-acceptance.ts --service-credential "$CRED" < /dev/null
```

The sanitized `env -i` is still required from an agent session: `ANTHROPIC_API_KEY` is on the
relay's child allowlist while `ANTHROPIC_BASE_URL` is not, so an inherited gateway key would
cross the seam and be used against the wrong endpoint. `ACCEPTANCE_CLAUDE_BINARY` is a ninth
variable beyond the eight schema keys and is safe because
`loadAcceptanceCeremonyEnvironment` projects the environment onto the schema's own keys
before parsing (F11).

Recovery, if a future run fails before its reporting block — D19b order, non-negotiable:
restart `acceptance/.pgdata` on the DB port, **tee every query and its result**, query
`core.provider_probe` / `core.run` / `serve.answer` / `core.node` / `core.edge` /
`serve.condition_mark` / `ledger.raw_artifact` (mark multiplicity needs `group by mark`
**and** a separate `count(*)`, or the row is not self-checking), stop the server, and only
then delete the directory.

## 6. Capture logs

| Path | Bytes | Contents |
|---|---|---|
| `logs/t0/ceremony3.log` | 8,218 | full ceremony stdout+stderr incl. the reporting block |
| `logs/t0/ceremony3-recovery.log` | 24,005 | Q1–Q14, each with SQL + verbatim rows, captured before deletion; ends `PGDATA_AFTER_DELETE=ABSENT` |
| `logs/t0/preflight-f26-liveproof.log` | — | F26-parity preflight through the relay's own function |

Capture order proven by the sentinel: the recovery transcript is written in full, then the
caller-owned `.pgdata` is deleted, then `PGDATA_AFTER_DELETE=ABSENT` is appended. Post-run:
integration tree **0 changes** at `a047423`, ports 55279–55282 all clear.
