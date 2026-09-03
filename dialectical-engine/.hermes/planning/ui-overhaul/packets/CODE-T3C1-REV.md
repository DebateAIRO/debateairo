# CODE-T3C1-REV — blind review of Wave 1 cluster T3-C1 (frozen target: commit af50e34)

You are a FRESH Opus 5 blind review seat for mission `ui-overhaul`, board `ui-overhaul`,
ticket **t_9d3f1f2d**. The codex worker shipped the signed-in library chrome, the TopBar
mode mount, and the anonymous chrome-suppression rule. Judge the COMMIT. Verdict:
`PASS — T3-C1 MERGED-READY` or `REWORK — <blocking list>` (budget 3, same worker session).

## 0. Read order
1. This packet.
2. `docs/agent-protocols/debateai-heartbeat-protocol.md` §9/§11 + v3.3.0 amendments;
   `.claude/skills/heartbeat-protocol/SKILL.md`; `.claude/skills/heartbeat-reviewer/SKILL.md`.
3. The worker's handoff on t_9d3f1f2d (01:31) — claims are your hypothesis list. Note its
   declared safety fix (artboard pseudonym removed for a truthful ASKER chip) and its
   declared packet-defect handling (ran the canonical 12-path command, not the packet's 10).
4. The contract stack: `dispatch-order.md` row 3 + §T3-C1-4 (AM6/charge 2 — read the whole
   two-toggles rationale) + §"Landing query convention"; `slices/T3/SPEC.md` R1/R2/R8 +
   S1–S4; `slices/T3/PLAN.md` T3-C1 (its 3-file command is superseded by row 3's 12-path);
   `ADR-002` (mount enumeration + JSX law), `ADR-001` (AM3 range-pair oracle), `ADR-006`
   (fail-loud canonical gate — run from the workspace root).
5. The diff: `git show --stat af50e34` then `git diff af50e34^..af50e34`.
Open every board write with `SKILLS LOADED: <list>`.

## 1. What to verify (probe; worst run of 3 is the verdict)
- The canonical 12-path row-3 command 3x (expect 92/92).
- RED reproduction: roll the product files back to af50e34^ (keep tests), confirm the RED
  shape per cell, restore byte-exactly.
- Rebuild the worker's strongest mutants YOUR way: ☾ mount removed; :has() rule removed;
  selector broadened to unconditional; signed-in landing marker added; composer label
  changed. Each RED.
- Devise at least TWO of your own — at least one structural/positional, and at least one
  against the SUPPRESSION mechanism's edges (candidates: does anything pin that the
  suppression is `display:none` rather than `visibility`/removal? a `[data-landing-section]`
  element OUTSIDE .appShell? the rule's position inside globals.css vs the token-block
  oracle exclusion? TopBar's toggle still reachable/visible on signed-in after suppression
  CSS loads?). Judge tiers honestly.
- Two-toggles adjudication conformance: TopBar mounts `<ModeToggle />` and NOTHING else
  storage-wise (run the two absence guards); anonymous first paint per AM6 = landing chrome
  only. If you can render the real anonymous document with the real stylesheet: assert
  .topBar computed display none. (jsdom 30 supports :has() through getComputedStyle — AM6
  measured it.)
- ASKER chip: confirm the shipped chrome contains NO sample/pseudonym identity from the
  design bundle (the worker says it removed cobalt-falcon-0fa351 — verify by grep) and the
  chip renders a truthful role label.
- Copy: T3-S2 strings exact; Q-04's three deliberately-distinct strings NOT unified.
- s8 pins: file untouched (SHA in the handoff); its tests green; page.tsx diff is copy-only
  in the library half (no JSX out).
- Gates: fail-loud canonical gate from the workspace root (0-new; one run from git toplevel
  must rc=2); AM3 oracle over the worker's product files (0) and confirm the suppression
  rule sits OUTSIDE the token blocks with zero colour literals; render suite (expect 20
  files / 89 tests); root typecheck 0.
- Tree: `git show --stat af50e34` = exactly 6 files; byte-clean at verdict except manifested
  dirt (`web/app/public/debate/[id]/page.tsx`) + .hermes.
- Worker skills line vs floor; body-grep its rollout if in doubt.

## 2. Isolation
cp backup + SHA-256 restore per mutant; `git diff HEAD -- <path>` empty per touched path at
verdict; delete backups; read-only git; no git writes. Tree otherwise idle.

## 3. Bounds
Writes: `.hermes/reports/ui-overhaul/agent-reports/CODE-T3C1-REV-claude.md` (self-report
before handoff) + board comments on t_9d3f1f2d. Nothing else.

## 4. Verdict format (final board comment — LAST write, freeze law)
VERDICT line + per-item CONFIRMED/REFUTED + your mutants' results + gate outputs +
CONFIDENCE + STRONGEST COUNTER + `SKILLS LOADED:` + `comments read through:`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
