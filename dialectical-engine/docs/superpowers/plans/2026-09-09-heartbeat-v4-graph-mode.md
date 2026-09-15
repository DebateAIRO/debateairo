# Heartbeat v4.0.0 Graph Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the six `heartbeat-*` skills as a graph-mode protocol, add the `heartbeat-mock` contract, ship the packet templates and two scripts, and amend the spine and adapters in the same commit.

**Architecture:** Board tickets are nodes, `hermes kanban link` edges make readiness mechanical, the orchestrator is a scheduler that dispatches every READY node in the background; the code loop's only review is `REV(S)` at the slice gate; UI slices pass through `MOCK(S)` → V's `DONE(S)` before any `BUILD`.

**Tech Stack:** Markdown skills (Claude Code `SKILL.md` with frontmatter), zsh scripts, sqlite3 (Hermes kanban store), git.

**Spec:** `docs/superpowers/specs/2026-09-09-heartbeat-v4-graph-mode-design.md`

## Global Constraints

- Repo root for every path below: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`.
- Installed skills are symlinks: `~/.claude/skills/heartbeat-<role>` → repo `.claude/skills/heartbeat-<role>`; a copy is a defect.
- Role contracts target ≤ ~90 lines after frontmatter (orchestrator may reach ~130); no padding, no real rule cut.
- Laws that stay verbatim in substance: rework cap 3; the murder-case self-report prompt (quoted exactly: "treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better."); `SKILLS LOADED` first line; fix-the-class; SPEC frozen; PLAN uncapped; DECISIONS append-only; PROGRESS orchestrator-only; three runs, worst wins; vertical-slice law; Done = V veto; no push, no remote merge; every finding ticketed same day; Superpowers open to every seat.
- Forbidden phrases anywhere in the family except inside a sentence that revokes them: `osascript`, `tell application`, `Terminal window`, `per-cluster review`, `Four Loops`.
- Packet placeholder marker: `__UPPERCASE__` (regex `__[A-Z][A-Z0-9_]*__`). Paths a seat must create carry ` (new)` after the path on the same line.
- Packet code-quote form: absolute `path:LINE`, then ` — `, then the text in backticks.
- Commit at the end, once, on `dev`; never push.

---

### Task 1: `packet-check.sh` with fixture tests

**Files:**
- Create: `.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh`
- Create: `.claude/skills/heartbeat-orchestrator/scripts/tests/packet-good.md`
- Create: `.claude/skills/heartbeat-orchestrator/scripts/tests/run-tests.sh`

**Interfaces:**
- Produces: `packet-check.sh <packet.md>` → exit 0 dispatchable, exit 1 with `DEFECT …` lines on stdout.

- [x] **Step 1: Write the fixture and test runner (RED first)**

`tests/packet-good.md` is a minimal valid packet (absolute paths that exist, one `path:LINE — \`quote\`` that matches, `rework rounds: max 3`, the verbatim self-report prompt, `SKILLS LOADED`, an `allowed` block containing the self-report path marked `(new)`). `tests/run-tests.sh`:

```zsh
#!/bin/zsh
set -u
D="${0:A:h}"; C="$D/../packet-check.sh"
pass=0; fail=0
t(){ local name="$1" want="$2"; shift 2; out=$("$@" 2>&1); got=$?; if [ "$got" = "$want" ]; then echo "PASS $name (exit $got)"; pass=$((pass+1)); else echo "FAIL $name: want $want got $got"; echo "$out" | sed 's/^/   /'; fail=$((fail+1)); fi; }
t good-packet 0 "$C" "$D/packet-good.md"
tmp=$(mktemp -d)
sed 's/rework rounds: max 3/rework rounds: unlimited/' "$D/packet-good.md" > "$tmp/no-cap.md";           t missing-cap 1 "$C" "$tmp/no-cap.md"
sed 's#agent-reports/PACKET-TEST.md (new)#agent-reports/OTHER.md (new)#' "$D/packet-good.md" > "$tmp/sr.md"; t self-report-outside-allowed 1 "$C" "$tmp/sr.md"
sed 's/murder case/diary/' "$D/packet-good.md" > "$tmp/verbatim.md";                                     t self-report-not-verbatim 1 "$C" "$tmp/verbatim.md"
printf '%s\n' "seat: __SEAT__" >> "$tmp/ph.md"; cat "$D/packet-good.md" >> "$tmp/ph.md";                  t placeholder 1 "$C" "$tmp/ph.md"
sed 's#/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md#/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/nope.md#' "$D/packet-good.md" > "$tmp/path.md"; t missing-path 1 "$C" "$tmp/path.md"
sed 's/`name: debateai-graph-spine`/`name: something-else`/' "$D/packet-good.md" > "$tmp/quote.md";     t stale-quote 1 "$C" "$tmp/quote.md"
rm -rf "$tmp"; echo "passed=$pass failed=$fail"; [ "$fail" = 0 ]
```

- [x] **Step 2: Run the tests — expect every case FAIL (script missing)**

Run: `zsh .claude/skills/heartbeat-orchestrator/scripts/tests/run-tests.sh`
Expected: `FAIL good-packet` (no such file) and 6 more FAILs.

- [x] **Step 3: Write `packet-check.sh`**

```zsh
#!/bin/zsh
# packet-check.sh <packet.md> — mechanical pre-dispatch check (heartbeat v4.0.0).
# Exit 0 = dispatchable. Exit 1 = every DEFECT listed. Never edits the packet.
set -u
P="${1:?usage: packet-check.sh <packet.md>}"
[ -f "$P" ] || { echo "DEFECT no such packet: $P"; exit 1; }
rc=0; fail(){ echo "DEFECT $1"; rc=1; }
# 1. fill markers left behind
if grep -nE '__[A-Z][A-Z0-9_]*__' "$P" >/dev/null; then grep -nE '__[A-Z][A-Z0-9_]*__' "$P" | sed 's/^/   /'; fail "placeholder marker present"; fi
# 2. every absolute path resolves, unless the line marks it (new) or it holds a <placeholder>
grep -nEo '(/Users|/private|/tmp)[A-Za-z0-9_./~-]*' "$P" | while IFS=: read -r ln path; do
  line=$(sed -n "${ln}p" "$P")
  case "$line" in *"(new)"*) continue;; esac
  case "$path" in *'<'*) continue;; esac
  p="${path%%:[0-9]*}"; p="${p%.}"; p="${p%,}"
  [ -e "$p" ] || echo "DEFECT path does not resolve (line $ln): $p"
done | tee /dev/stderr | grep -q DEFECT && rc=1
# 3. every `path:LINE — `quote`` matches the file at that line
grep -nEo '(/Users|/private)[A-Za-z0-9_./~-]+:[0-9]+ — `[^`]+`' "$P" | while IFS= read -r hit; do
  ln="${hit%%:*}"; rest="${hit#*:}"; file="${rest%%:*}"; rest2="${rest#*:}"; n="${rest2%% — *}"; q="${rest2#* — }"; q="${q#\`}"; q="${q%\`}"
  [ -f "$file" ] || { echo "DEFECT quote names a missing file (line $ln): $file"; continue; }
  sed -n "${n}p" "$file" | grep -Fq -- "$q" || echo "DEFECT stale quote (line $ln): $file:$n does not contain \`$q\`"
done | tee /dev/stderr | grep -q DEFECT && rc=1
# 4. required lines
grep -q 'rework rounds: max 3' "$P" || fail "missing 'rework rounds: max 3'"
grep -q 'SKILLS LOADED' "$P" || fail "missing the SKILLS LOADED handoff rule"
grep -q 'treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.' "$P" || fail "self-report instruction is not verbatim"
# 5. the self-report path sits inside the allowed block
sr=$(grep -Eo '(/Users|/private)[A-Za-z0-9_./~-]*agent-reports/[A-Za-z0-9_.-]+\.md' "$P" | head -1)
[ -n "$sr" ] || fail "no self-report path (…/agent-reports/<SEAT>.md)"
if [ -n "$sr" ]; then
  awk 'BEGIN{IGNORECASE=1} /allowed/{inb=1} /forbidden|^## /{if(inb&&!/allowed/)inb=0} inb{print}' "$P" | grep -Fq -- "$sr" || fail "self-report path is not inside the allowed block: $sr"
fi
[ $rc = 0 ] && echo "OK dispatchable: $P"
exit $rc
```

- [x] **Step 4: Run the tests — expect 7 PASS**

Run: `chmod +x .claude/skills/heartbeat-orchestrator/scripts/*.sh .claude/skills/heartbeat-orchestrator/scripts/tests/*.sh && zsh .claude/skills/heartbeat-orchestrator/scripts/tests/run-tests.sh`
Expected: `passed=7 failed=0`.

### Task 2: `graph.sh` — render a board as Mermaid

**Files:**
- Create: `.claude/skills/heartbeat-orchestrator/scripts/graph.sh`

**Interfaces:**
- Produces: `graph.sh <board-slug> [out.md]` → a ```mermaid flowchart (nodes = tasks, edges = `task_links`, class = status) to stdout or `out.md`.

- [x] **Step 1: Find where a board's rows live**

Run: `sqlite3 "file:$HOME/.hermes/kanban.db?immutable=1" "SELECT tenant,count(*) FROM tasks GROUP BY tenant;"` and `ls ~/.hermes/kanban/boards/`.
Expected: boards are either a `tenant` in the main db or a `boards/<slug>/kanban.db`; the script tries the per-board file first, then the main db filtered by tenant.

- [x] **Step 2: Write the script**

```zsh
#!/bin/zsh
# graph.sh <board-slug> [out.md] — the mission graph rendered FROM the board (never drawn by hand).
set -u
B="${1:?usage: graph.sh <board-slug> [out.md]}"; OUT="${2:-}"
DB="$HOME/.hermes/kanban/boards/$B/kanban.db"; W=""
[ -f "$DB" ] || { DB="$HOME/.hermes/kanban.db"; W="WHERE t.tenant='$B'"; }
[ -f "$DB" ] || { echo "no kanban db for board $B" >&2; exit 1; }
U="file:$DB?immutable=1"
render(){
  echo '```mermaid'; echo 'flowchart LR'
  sqlite3 -separator '|' "$U" "SELECT t.id, t.status, replace(replace(t.title,'\"',''),'|','/') FROM tasks t $W ORDER BY t.created_at;" \
    | awk -F'|' '{printf "  %s[\"%s\"]:::%s\n", $1, substr($3,1,70), $2}'
  sqlite3 -separator '|' "$U" "SELECT l.parent_id, l.child_id FROM task_links l JOIN tasks t ON t.id=l.child_id $W;" \
    | awk -F'|' '{printf "  %s --> %s\n", $1, $2}'
  echo '  classDef done fill:#dfe9df,stroke:#3E7A4E'; echo '  classDef running fill:#f3ece0,stroke:#A8823E'
  echo '  classDef ready fill:#fdfbf6,stroke:#6E675C'; echo '  classDef blocked fill:#f4e5de,stroke:#B0432F'
  echo '  classDef todo fill:#efe9e0,stroke:#6E675C'; echo '  classDef review fill:#e6e8e8,stroke:#3D5A80'
  echo '```'
  echo; echo "_rendered $(date '+%Y-%m-%d %H:%M') from board \`$B\` ($DB)_"
}
if [ -n "$OUT" ]; then render > "$OUT"; echo "wrote $OUT"; else render; fi
```

- [x] **Step 3: Run it against a real board**

Run: `zsh .claude/skills/heartbeat-orchestrator/scripts/graph.sh consent-ui | head -8` and `zsh … graph.sh consent-ui | grep -c ':::'`
Expected: a `flowchart LR` header and a node count equal to `hermes kanban --board consent-ui list --json | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))'` (archived excluded either way — compare like with like).

### Task 3: Packet templates

**Files:**
- Create: `.claude/skills/heartbeat-orchestrator/templates/{COMMON,REQ,REQ-REV,ARCH,ARCH-REV,MOCK,BUILD,REV,FIX,ELEMENT}.md`

**Interfaces:**
- Produces: each template ≤ 40 lines; fill markers `__SEAT__`, `__TICKET__`, `__SLICE__`, `__LANE__`, `__BASE__`, `__PACKET_DIR__`, `__MISSION__`; each carries `rework rounds: max 3`, the verbatim self-report prompt, the `SKILLS LOADED` rule, and an `allowed:` block whose last bullet is the self-report path marked `(new)`.

- [x] **Step 1: Write the ten templates** (content in Task 3 of the executor's session; shape per the Interfaces line; COMMON holds only: repo root, mission root, board commands, the markers, the laws by pointer, the reading floor, the no-terminal law, and the token/harness facts table headers).
- [x] **Step 2: Verify shape**

Run: `for f in .claude/skills/heartbeat-orchestrator/templates/*.md; do printf '%s %s lines; markers=%s\n' "$f" "$(wc -l <"$f")" "$(grep -cE '__[A-Z][A-Z0-9_]*__' "$f")"; done`
Expected: every file ≤ 40 lines (COMMON ≤ 60), ≥ 1 marker each. Then fill BUILD.md with real consent-ui values into a temp file and run `packet-check.sh` on it → exit 0.

### Task 4: `heartbeat-protocol` (router) rewrite

**Files:**
- Modify: `.claude/skills/heartbeat-protocol/SKILL.md` (whole file)

- [x] **Step 1: Write the file with exactly these sections**: frontmatter (description names graph mode and the six contracts) · one-line opening ("You are one node in a graph…") · §1 role table with six rows (`heartbeat-mock` added) + Superpowers-mandatory paragraph + the floor table (mock row: `design-taste-frontend`, `design`) + non-Claude read path + sources-of-truth order · §2 the graph in one paragraph (node, edge, READY, handoff, "you know your node and its inputs, never the route") · §3 laws 3.1–3.9: no self-review · a finding is a finding + fix the class · three rework passes then V · the board is the state · reproduce first · verbatim means verbatim · say what you cannot do · the reading floor · the no-terminal law · §4 self-report (verbatim prompt) + SKILLS LOADED (three sentences) · §5 the handoff shape (eight lines) · §6 Never.
- [x] **Step 2: Verify**

Run: `wc -l .claude/skills/heartbeat-protocol/SKILL.md; grep -c 'heartbeat-mock' .claude/skills/heartbeat-protocol/SKILL.md; grep -n 'osascript\|Terminal window\|Four Loops\|per-cluster review' .claude/skills/heartbeat-protocol/SKILL.md`
Expected: ≤ ~100 lines; ≥ 2 mock mentions; forbidden phrases only inside the revoking sentence of §3.9.

### Task 5: `heartbeat-orchestrator` rewrite

**Files:**
- Modify: `.claude/skills/heartbeat-orchestrator/SKILL.md` (whole file)

- [x] **Step 1: Write the file with exactly these sections**: §1 intake (one prompt → intake record, R7 election, contradiction check, slice tickets with `ui:` flags, worktree per slice, transport probes incl. resume, watchdog, TOOLING-TRAPS index) · §2 the node table (compact, 16 rows) and the readiness rule (`hermes kanban link`, `list --status ready`) · §3 the tick (four steps) · §4 transports — background only (table: Claude / Codex / Grok / watchdog / dev server) + the no-terminal law + launch verification · §5 packets: templates, `packet-check.sh` before every dispatch, reading scope (cluster steps by id, TRAPS by heading), COMMON ≤ 120 and replace-not-append · §6 the slice gate and `REV(S)`: package contents, lens table by tier + UI product-truth, union/re-check, FIX split by surface, cap 3 → V row, MERGE runs the integrated suite · §7 rework transport (same session first) · §8 V gates: `DONE(S)` message shape, `TEST(S)` serve-on-word, `WHOLE`, decisions packet thresholds; the vertical-slice law in seven short items · §9 ledger at seat exit, SKILLS body check, reports, `graph.sh` at every V gate · §10 version discipline.
- [x] **Step 2: Verify**

Run: `wc -l .claude/skills/heartbeat-orchestrator/SKILL.md; grep -c 'packet-check.sh\|graph.sh' .claude/skills/heartbeat-orchestrator/SKILL.md; grep -n 'osascript\|Terminal' .claude/skills/heartbeat-orchestrator/SKILL.md`
Expected: ≤ ~135 lines; both scripts named; `osascript` only in the revoking sentence.

### Task 6: `heartbeat-worker` and `heartbeat-reviewer` rewrites

**Files:**
- Modify: `.claude/skills/heartbeat-worker/SKILL.md`, `.claude/skills/heartbeat-reviewer/SKILL.md` (whole files)

- [x] **Step 1: Worker sections**: read scope (packet, INSTRUCTIONS, your cluster's steps by id, DECISIONS, `DONE.md` on UI slices, TRAPS index + named headings) · packet-against-reality · refutation duty (four steps, one sentence of why) · three runs worst wins · bounds (allowed exhaustive, no sub-delegation, rework returns to your session) · findings you did not expect · handoff: "READY on cluster green — no review waits on your cluster; the slice is reviewed at `REV(S)` once every cluster is green" + the eight-line shape + self-report.
- [x] **Step 2: Reviewer sections**: packet first · probe never read · the slice review: your lens, the whole slice, own fixtures, both modes on UI, cross-cluster and cross-slice mounts, `DONE.md` measured not argued · findings B/N with file:line · one verdict per pass (PASS / REWORK / BLOCKED), pass number named, pass 3 → V row · planning reviews: one pass, fold rule (N → DECISIONS via the orchestrator; only B spawns rework) · blind-lens rules + predictions paragraph · handoff + author's SKILLS LOADED check.
- [x] **Step 3: Verify**

Run: `wc -l .claude/skills/heartbeat-worker/SKILL.md .claude/skills/heartbeat-reviewer/SKILL.md; grep -n 'cluster' .claude/skills/heartbeat-reviewer/SKILL.md`
Expected: each ≤ ~90 lines; the reviewer's only "cluster" mentions say the review unit is the slice.

### Task 7: `heartbeat-requirements`, `heartbeat-architecture`, `heartbeat-mock`

**Files:**
- Modify: `.claude/skills/heartbeat-requirements/SKILL.md`, `.claude/skills/heartbeat-architecture/SKILL.md`
- Create: `.claude/skills/heartbeat-mock/SKILL.md`; symlink `~/.claude/skills/heartbeat-mock`

- [x] **Step 1: Requirements sections**: the two length laws · INSTRUCTIONS ≤ 100 · the four slice files + the `ui:` line as the first line under SPEC's title (`ui: yes` when acceptance runs in a browser) + the `DONE.md` placeholder for UI slices · clusters = build units, one command each, "review unit is the slice" · quality gates · handoff.
- [x] **Step 2: Architecture sections**: read · PLAN uncapped, stranger test · cluster map = build units (three-run) + the slice verification list `REV(S)` runs · boundaries/DDD/ADR/DECISIONS · the `MOCK` handoff block for UI slices (screen and state list, component inventory it names, tokens it introduces) · refute your plan · bounds · handoff.
- [x] **Step 3: Mock contract**: role (you produce the mock, no code, no product-file edits) · inputs (SPEC, PLAN's screen list, design of record, `globals.css` token blocks, the named components, live screenshots via the harness's own browser) · skills (`design-taste-frontend` with dials pinned to redesign-preserve, `design`) · the provenance rule (nothing invented; `NEW` rows) · both modes, one artboard per screen and state · `MOCK.md` contents · open questions as smallest yes/no, never asked in chat · handoff `MOCK READY` + URL · never.
- [x] **Step 4: Symlink and verify**

Run: `ln -s /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-mock ~/.claude/skills/heartbeat-mock && for s in ~/.claude/skills/heartbeat-*; do echo "$s -> $(readlink "$s")"; done && wc -l .claude/skills/heartbeat-*/SKILL.md && head -4 .claude/skills/heartbeat-mock/SKILL.md`
Expected: seven symlinks into the repo; mock ≤ ~70 lines; frontmatter present.

### Task 8: Spine v4.0.0 amendment and adapter blocks

**Files:**
- Modify: `docs/agent-protocols/debateai-heartbeat-protocol.md:4` (version), the header paragraph after the title, and append `## v4.0.0 amendments — graph mode (V order, 2026-09-09)` BEFORE `## v3.4.0 amendments`.
- Modify: `docs/agent-protocols/{claude,codex,grok}-heartbeat-adapter.md`, `docs/agent-protocols/codex-heartbeat-orchestrator.md`, `docs/agent-protocols/grok-heartbeat-orchestrator.md` — insert `## v4.0.0 — graph mode (read this first)` immediately after the H1.

- [x] **Step 1: Spine amendment items (numbered)**: 1 graph not loops (vocabulary, readiness, the tick; supersedes "The Four Loops and the Grand Loop" as dispatch order, H0–H9 as a chain, planning tiers except Tier-0's ARCH-REV skip) · 2 review per slice (supersedes the per-ticket review diamond, §9 review lanes, and "clusters are the review unit" in v3.3.0 item 12; lens table; cap 3 per slice) · 3 the UI gate (MOCK + DONE; `/taste` = design-taste-frontend; Claude Design canvas; V's yes opens BUILD; supersedes v3.2.0 item 5's hand-drawn SVG — `graph.sh` renders from the board) · 4 the no-terminal law (revokes v3.2.0 item 2 and the visible-launch paragraphs; transports; on-demand rule; dashboard on demand) · 5 rework transport · 6 verbosity law (reading floor, COMMON cap, TRAPS index, templates, `packet-check.sh`, handoff shape) · 7 what stays (list).
- [x] **Step 2: Verify**

Run: `sed -n 4p docs/agent-protocols/debateai-heartbeat-protocol.md; grep -n '^## v4.0.0' docs/agent-protocols/*.md`
Expected: `version: 4.0.0`; six files carry a v4.0.0 heading.

### Task 9: Verification sweep, memory, commit

- [x] **Step 1: Spec §8 sweep**

Run:
```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
for s in ~/.claude/skills/heartbeat-*; do echo "$s -> $(readlink "$s")"; done
for f in .claude/skills/heartbeat-*/SKILL.md; do head -3 "$f" | grep -q '^name: ' && echo "frontmatter ok $f"; done
wc -l .claude/skills/heartbeat-*/SKILL.md
grep -rn 'osascript\|tell application\|Terminal window\|per-cluster review\|Four Loops' .claude/skills/heartbeat-*/SKILL.md
zsh .claude/skills/heartbeat-orchestrator/scripts/tests/run-tests.sh
zsh .claude/skills/heartbeat-orchestrator/scripts/graph.sh consent-ui | grep -c ':::'
sed -n 4p docs/agent-protocols/debateai-heartbeat-protocol.md; grep -c '^## v4.0.0' docs/agent-protocols/*.md
```
Expected: 7 symlinks · 7 frontmatters · counts within targets · forbidden phrases only in revoking sentences · `passed=7 failed=0` · node count > 0 · `version: 4.0.0` and 6 headings.

- [x] **Step 2: Memory** — write `~/.claude/projects/-Users-vladmihaimiron-Documents-DebateAIRO/memory/heartbeat-v400.md` (type: project; the ratified rules and file locations, dated 2026-09-09); edit `agent-fleet-cli-setup.md` to revoke the visible-terminal line; add the index line to `MEMORY.md`.
- [x] **Step 3: Commit (never push)**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO
git add dialectical-engine/.claude/skills/heartbeat-* dialectical-engine/docs/agent-protocols/*.md dialectical-engine/docs/superpowers/specs/2026-09-09-heartbeat-v4-graph-mode-design.md dialectical-engine/docs/superpowers/plans/2026-09-09-heartbeat-v4-graph-mode.md
git commit -m "feat(protocol): heartbeat v4.0.0 — graph mode ..."
```
