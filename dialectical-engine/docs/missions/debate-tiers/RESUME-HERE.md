# RESUME HERE — mission `debate-tiers`, orchestrator handoff

**You are the orchestrator (Claude-Router seat) of the heartbeat v4.0.0 graph for mission
`debate-tiers`, board `debate-tiers`.** A previous session ran the mission from intake to the
TEST(S01) gate and handed it to you at this file. Read, in this order:

1. Skill `heartbeat-protocol`, then skill `heartbeat-orchestrator` (your contract), then
   `superpowers:using-superpowers` and the floor it names for the orchestrator.
2. `docs/missions/debate-tiers/INSTRUCTIONS.md` (the mission compass).
3. This file, then `docs/missions/debate-tiers/V-DECISIONS-PACKET.md` (every row V owes an answer to)
   and `docs/missions/debate-tiers/reviews/REV-S01-p3-UNION.md` (the last verdict).
4. `.hermes/reports/debate-tiers/LEDGER.md` — tail it; every seat exit and every ruling is there.
5. `grep -n '^## \|^- ' .hermes/TOOLING-TRAPS.md` as an index, plus the headings you need.

All paths below are relative to `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`.

## 1. V's goal, verbatim (the compass — never paraphrase it into a packet)

> use the /heartbeat family if necessary : i want the app to contain two payment tiers when a debate
> is initiated. One would be Free, and the other would be premium. And the model fleet for those
> tiers will be fully added later. For now and for testing purposes, free tier contains GPT 5.6 Luna
> and Sonnet 5. The Premium tier contains a debate with 5.6 Sol, Opus 5 and Grok 4.6 (For now) How
> done looks like: Upon clicking "Start a debate" or when starting a debate, the user gets to choose
> if the debate is free or premium. A UI element above where the question is written will appear. The
> free tier locks all gauges and editing and locks the user at Depth 2 with Sonnet 5 and GPT 5.6
> Luna. Premium enables the user to change effort levels and all the option gauges at will. before
> starting the programming verify if the heartbeat family skill gives me the UI mockup with /taste.
> Also use Codex 5.6 Sol agents for coding. When a vertical slice of this feature is done, the review
> will be done with a Opus 5 Agent.

## 2. Standing laws (V's, binding — preserve them verbatim when you hand off again)

- **Nothing is opened on V's desktop.** No terminals, no windows, no apps, no browser windows. The
  harness's in-app Browser pane is allowed for verification (open your OWN tab, close it after; never
  touch a tab you did not open). The `npx @playwright/mcp` plugin opens a headed Chromium window and
  is therefore FORBIDDEN; Codex seats use headless Chrome over CDP instead.
- **V pushes and merges to the remote. Never the harness.** MERGE(S) is a LOCAL merge into `dev`.
- **A slice is Done only on V's veto after V personally tested it.** No green gate closes a slice.
- **Codex `gpt-5.6-sol` writes code; Opus 5 reviews and fills unnamed seats.** Only V edits the roster.
- **Every finding gets a ticket the same day, and you fix the CLASS**, not the instance.
- SPEC files are frozen: a change is a new `SPEC-v<n>.md`. `PROGRESS.md` is orchestrator-only.
  `DECISIONS.md` is append-only. You hold NO verdict authority.
- **No-touch surface for every seat** (say it in every packet): `.local/**` (provider config with
  authorization headers — never print it), the `:3000` https stack and the API on `:8790` (V's), every
  other mission's dirty file in the main tree (`tests/unit/v2ui-data-layer.test.ts`, `ui_designs/*`,
  the repo-root `.claude/launch.json`), the live dev database on `127.0.0.1:55432`. Never a bare
  `git stash` (the stash stack is shared). Kill only your own PIDs, by PID or port — never
  `pkill -f` a filename another seat may share.

## 3. Where the work is, right now

| Thing | Value |
|---|---|
| main tree | `dev` at `481ea356`, UNPUSHED, ~99 dirty files that are NOT yours (other missions) |
| S01 lane | `.worktrees/tiers-s01/dialectical-engine`, branch `slice/tiers-s01`, head `9ddbb1ef`, 0 dirty |
| S02 lane | `.worktrees/tiers-s02/dialectical-engine`, branch `slice/tiers-s02`, head `d2a58e9a` (C1 only), 0 dirty |
| lens worktrees | `.worktrees/rev-s01-p1-{correctness,product}` detached at `9ddbb1ef`, `…-security` at `f6c147cc` |
| slice tickets | S01 `t_11abead2`, S02 `t_e4b4ab3a` (both close ONLY on V's veto) |
| S02 build nodes | C2 `t_1675b61f`, C3 `t_7273eea5` (blocked until S01 merges), C4 `t_05227ae2` (todo) |
| all ticket ids | `.hermes/reports/debate-tiers/logs/tickets.env` — source it, never retype an id |
| graph | `scripts/graph.sh debate-tiers .hermes/reports/debate-tiers/mission-graph.md` (see §7) |

**S01 is built and reviewed to the cap.** Five BUILD clusters, then three REV passes (correctness/tests,
security/data-safety, product-truth), two FIX passes. Pass 3 = REWORK on two blocking findings, and
3.3 says pass 4 does not exist, so both became V rows. Product-truth confirmed the Free lock itself in
the real DOM in both modes (native `disabled` on all 14 controls, trusted click/keys/type-ahead all
refused, every DONE.md measurement matched, SPEC-v2 §2 steps 1–12 pass, 12/12 cluster runs green).

## 4. What the mission is waiting on: V, at the TEST(S01) gate

The gate message was sent. Nothing proceeds on S01 until V answers. Pending rows (full text and
recommended defaults in `V-DECISIONS-PACKET.md`; the default binds until V rules):

| Row | The smallest yes/no |
|---|---|
| V-7 | Will V add the three fleet targets (Luna, Sonnet 5, Grok 4.6 are not in the provider config) before S02's test point? |
| V-20 | Should the server refuse a `free` ask that carries non-Free gauges? |
| V-21 (**blocking**) | May a Premium run's durable provenance say `machine:plan-tier-free`? |
| V-22 | May S01 ship to production before S02? |
| V-23 | Is it right that choosing Premium unlocks five gauges the run contract never sends? |
| V-24 | In Free, is it enough that a locked gauge never CHANGES, even if the dropdown still opens? |
| V-25 (**blocking**) | Should the page's own code also refuse to change a locked Free gauge — belt as well as braces? |
| V-26 | May S01 go to V's test point now, as built, with the V-25 restoration done after the veto? |

**V's test steps** are `slices/S01/SPEC-v2.md` §2 (lines 232–266), once in Terracotta and once in
Chamber. The one step no test can see: Free chosen → `⚙ OPTIONS` → click `Fixed ▾` (nothing opens,
no focus ring). **Serve only when V says "serve S01"**: the launch entry `tiers-s01-ui`
(repo-root `.claude/launch.json`) runs the S01 lane's `apps/ui` on `:4010` against the API on `:8790`
— and that API must be built FROM THE S01 LANE, because `AskRequestSchema` is `.strict()` and gains
`plan_tier` at `packages/contract/src/index.ts:118`; an API built from today's `dev` answers 400.

## 5. The graph from here — do these in order, each gated as written

1. **TEST(S01) — V's node.** Wait. When V rules the rows and vetoes the slice, fold every ruling into
   `slices/S01/DECISIONS.md` and the V-DECISIONS rows (append-only), and close `t_11abead2` ONLY on
   V's veto.
2. **ONE post-veto FIX(S01)** — a Codex `gpt-5.6-sol` seat in the S01 lane, carrying whatever V ruled
   on V-21 (the `tier_provenance_ref` expression at `apps/ui/app/new/defaults.tsx:74` plus the two
   premium rows in `tests/unit/tier01-ask-wire.test.ts:63-68`), V-24 and V-25 (restore the four
   `if (planTier === "free") return;` guards at `apps/ui/app/new/page.tsx:290,309,500,551` and the
   three S01-29 assertions). One node, because the file surfaces overlap. RED before GREEN.
3. **MERGE(S01)** — local merge of `slice/tiers-s01` into `dev`, then the INTEGRATED suite on `dev`.
   A cross-slice defect there is a FIX on the owning slice plus a scoped REV pass against that
   slice's cap. Never push.
4. **S02-M rebase** — rebase `slice/tiers-s02` onto the merged `dev`, re-measure its baselines, and
   sync the lane's `.codex/skills` mirror (`scripts/sync-codex-skills.sh`) BEFORE dispatching; the
   mirror sync is a housekeeping commit and must NOT land on the slice branch.
5. **BUILD S02-C2 / C3 / C4** on Codex Sol, parallel where the surfaces are disjoint (C4 after C1+C2).
   Pointers cite only the `.claude` skill path.
6. **GATE(S02) → REV(S02)**, three lenses in parallel (S02 is `risk_tier: high`), each blind, each in
   its own detached worktree at the slice head, each with its own ports and process names and the
   listener baseline recorded in the dev-stack recipe. Cap of three passes.
7. **TEST(S02)** (V) → **MERGE(S02)** (local) → **WHOLE** (V tests merged `dev`, then V pushes) →
   **CLOSE** (closure report, every self-report collected, the graph rendered and SENT).

## 6. Residue V sees at the test point (ticketed, do not silently fix)

Consent bar covering `/new`'s action row (pre-existing, consent-ui surface) · only 2 of 10 Free hints
explain the lock · the S01-29 test name promising activation while measuring focus · a diagnostic
region-reader guard · the pre-existing 500 on asks over ~1 MB · the pass-1 security rows (V-20/V-22).
`hermes kanban --board debate-tiers list` shows 32 open finding tickets, all linked under their node.

## 7. Machinery you inherit (all proven in this mission)

- **Freeze** at every READY, verdict and gate: `git add` explicit paths, a staged-count guard, then
  `docs(debate-tiers): …`. Protocol changes are `fix(protocol): …`. `.log` files are gitignored, so
  copy a summary to `.txt` when it must be committed.
- **Packets** come from `.claude/skills/heartbeat-orchestrator/templates/<NODE>.md`, and
  `scripts/packet-check.sh <packet>` must exit 0 BEFORE dispatch. A packet defect is a finding
  against you.
- **Codex transport:** `codex exec -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"'
  "<short pointer naming the ABSOLUTE packet path>" </dev/null > <log> 2>&1 &`, launched from the lane
  by a launcher written fresh, read back and grepped for the values it must carry. Codex AUTO-LOADS
  `.codex/skills/*/SKILL.md` from the cwd — keep the mirror synced or the seat reads stale law.
- **Opus lenses:** the Agent tool, background, blind, fresh session (this harness has no SendMessage,
  so rework is a fresh session with the predecessor's handoff in the packet).
- **SKILLS LOADED is verified against the transcript BODY**, never the handoff line:
  `scripts/skills-check.sh <transcript> <skill…>` (it accepts `superpowers:`-prefixed names).
  Claude subagent transcripts:
  `~/.claude/projects/-Users-vladmihaimiron-Documents-DebateAIRO/<session>/subagents/agent-*.jsonl`.
- **Watchdog:** `.hermes/reports/debate-tiers/logs/watchdog.sh` with `watchdog.paths`, or the harness's
  Monitor tool. Judge a seat by disk and board, never by log silence.
- **The graph, for V:** `scripts/graph.sh debate-tiers .hermes/reports/debate-tiers/mission-graph.md`
  writes `mission-graph-nodes.mmd` (work nodes, slice tickets blue) and `mission-graph-full.mmd`;
  render them to PNG with `scripts/graph-png/` (make-pages.py + serve.py, driven through the Browser
  pane — headless Chrome hangs on this machine) and SEND the PNGs with SendUserFile. V cannot open
  `.mmd`, and a repo path in a message is not an attachment.

## 8. Never (the short list)

Push · merge to the remote · mark a slice Done · re-ask a V gate V already answered · dispatch a seat
without a packet-check · draw a conclusion from a running seat · touch another mission's files ·
open anything on V's desktop.
