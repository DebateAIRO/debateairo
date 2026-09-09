# COMMON — binding for every seat of mission `__MISSION__`. Read it in full (it is short by law), then your own packet.

- repo root, the cwd for every command: __REPO_ROOT__ (the git root is one level up)
- mission root: __MISSION_ROOT__ · intake record: __MISSION_ROOT__/00-intake.md · V rows: __MISSION_ROOT__/V-DECISIONS-PACKET.md (each row's default binds until V rules)
- spine v4.0.0: __REPO_ROOT__/docs/agent-protocols/debateai-heartbeat-protocol.md · role contracts: __REPO_ROOT__/.claude/skills/heartbeat-<role>/SKILL.md
- packets: __PACKET_DIR__ · reports: __REPORTS__ (LEDGER.md, agent-reports/, probes/, review-packages/) · tooling traps index: `grep -n '^## \|^- ' __REPO_ROOT__/.hermes/TOOLING-TRAPS.md`
- base: `dev` @ __BASE__ · the main tree carries other missions' uncommitted work — never touch, revert, stash or "clean" it; slice lanes are __REPO_ROOT__/.worktrees/<slice>/

## 1. Skills — in this order, then anything else in Superpowers that fits
`superpowers:using-superpowers` → `heartbeat-protocol` → the role contract your packet names → your role floor (`heartbeat-protocol` §1). Non-Claude seats read them as markdown under ~/.claude/plugins/cache/claude-plugins-official/superpowers/<newest>/skills/<name>/SKILL.md and __REPO_ROOT__/.claude/skills/<name>/SKILL.md. Your handoff OPENS with `SKILLS LOADED: <every skill you actually loaded>`; naming one you did not load is a fabrication finding, an honest shortfall costs a line.

## 2. Board `__MISSION__` (Hermes kanban store — the board flag goes BEFORE the verb)
- your ticket: `~/.local/bin/hermes kanban --board __MISSION__ show <ticket> --json` (long text truncates: slice the JSON)
- comment: `~/.local/bin/hermes kanban --board __MISSION__ comment <ticket> "<body>" --author <SEAT>` (body is positional; add `--max-len 80000` above ~20k)
- never `boards switch`; never change a ticket's status, assignee or links — the orchestrator moves tickets, you comment on YOUR ticket only
- markers, each carrying `comments read through: <n>`: CLAIM (first comment: seat, node, start time, session id, HEAD + dirty count) · HEARTBEAT · BLOCKED · READY (your handoff) · MOCK READY · PASS / REWORK / BLOCKED (verdicts)

## 3. Laws (text: `heartbeat-protocol` §3, spine v4.0.0 amendments)
No self-review · a finding is a finding and you fix the CLASS (file:line, ticketed the same day; non-blocking sets WHEN, never WHETHER) · three REV passes per slice, then it is V's · the board is the state · reproduce first, RED before GREEN on every pass · verbatim means verbatim · say what you cannot do (UNVERIFIED is always legal) · the reading floor · the no-terminal law.
NEVER: push · merge · mark Done · delete product or database data · fabricate runtime data or evidence · reveal secrets · cross your `allowed` list · ignore ticket comments · sub-delegate your deliverable · open a terminal, window or app on V's desktop.
Git writes: requirements, architecture, mock and review seats make NONE. Coding seats commit only on their slice branch, inside their lane, only when the cluster is green three runs.

## 4. Evidence and writing
Cite repo claims as `path:line`. Every recommendation or contested choice carries `VERDICT / CONFIDENCE (high|medium|low) / STRONGEST COUNTER`. Banned in any criterion: improve, better, robust, handle, appropriate. Suites as `passed/total`, every failure named and dated pre-existing or yours. QA is V personally: acceptance steps are numbered browser steps in both modes. Write every artifact to disk the moment it is ready — never batch writes to the end of a run.

## 5. Self-report — before your handoff, at __REPORTS__/agent-reports/<SEAT>.md (inside your allowed list). The question it answers, VERBATIM from V, on one line:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
A case file, not a diary, at most ~1,500 words: name the CAUSE, not the symptom · PRICE each finding (wall-clock, tokens, retries) · say what you NEARLY got wrong · name DEAD ENDS · say where THIS packet was unclear, and exactly where. Rank your upgrades by tokens saved.

## 6. Mission facts (measured by the orchestrator at intake, with the command that measured them; re-measure before you lean on one)
| fact | value | command | measured |
|---|---|---|---|
| __FACT__ | __VALUE__ | __COMMAND__ | __WHEN__ |
