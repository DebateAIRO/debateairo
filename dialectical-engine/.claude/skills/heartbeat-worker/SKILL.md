---
name: heartbeat-worker
description: Contract for a seat that writes code or tests in the DebateAI heartbeat graph (v4.0.0) — the BUILD and FIX nodes. Read your cluster only, RED first, the refutation duty, three runs worst wins, hand off on cluster green; no review waits on a cluster — the slice is reviewed once at REV(S). Load after heartbeat-protocol.
---

# Worker contract — BUILD and FIX nodes

You produce code. You do not route, review your own output, mark Done, push or merge.

## 1. Read exactly this, then start

Your packet, in full, from its absolute path · `INSTRUCTIONS.md` · the PLAN steps your packet
names, at the lines it names — never the whole PLAN · the cluster's command and file surface ·
`DECISIONS.md` (a settled choice is settled) · the acceptance oracle: `DONE.md` on a UI slice (V's
definition of done — artboards and steps), the SPEC's acceptance section otherwise · the
TOOLING-TRAPS headings your packet names · your ticket's comments through the cursor.

**Check the packet against reality and stop if it is wrong** (`heartbeat-protocol` §3.7). Every
constant it quotes — base commit, count, path, line — is either verifiable or a defect; an
`allowed` list that omits a deliverable is a defect. Report it in your first handoff; never absorb it.

**Superpowers, at minimum:** `test-driven-development` before you write a line ·
`systematic-debugging` the moment anything is broken (root cause before fixes, no exceptions) ·
`verification-before-completion` before any handoff · `receiving-code-review` on a FIX node. The
whole library is open to you.

## 2. The refutation duty — this is the job, not an extra

A passing test proves nothing until you have tried to break it. Per assertion you add:
1. State the PROPERTY in one sentence, before writing the assertion.
2. Build the mutant the assertion exists to catch. Apply it. Show the suite RED.
3. Revert. Show GREEN. Print `git status --porcelain` after every restore.
4. Build one neighbouring mutant it should NOT catch, and confirm it does not.

If you cannot construct a mutant your test catches, the test pins nothing — say so rather than
shipping it. An assertion that pins the mutant you were shown is not a pin of the property. (Three
consecutive rounds once shipped assertions that caught their demo mutant and nothing behind it.)

## 3. Verification — three runs, worst run wins

Run the cluster's command THREE times; the WORST run is the verdict. Green-green-red is RED: fix
the cause, never re-run until green. Report all three. Measure before you speculate: when the work
turns on a property of an artifact — a byte count, a line, a diagnostic count — measure it FIRST.
On a UI slice `DONE.md` is measured, not interpreted: geometry, colour and copy against the
artboards, in both modes, with the real compiled CSS.

## 4. Bounds

`allowed` is exhaustive; everything else is forbidden, including files you "only" read metadata
from when the packet excludes a zone. No adjacent refactors, no fixes you were not charged with, no
sub-delegation unless the packet grants it. Record your session id at CLAIM so rework resumes THIS
session. Commit on your slice branch, inside your lane, only when the cluster is green three runs.
Never touch the main tree, another cluster's surface, a branch or a worktree.

## 5. Findings you did not expect

Name them all in the handoff with file:line, blocking or not, so they can be ticketed. Do not fix
out-of-contract findings; name them.

## 6. FIX nodes

Reproduce first: the reviewer's probe RED against current code before any edit. Fix the CLASS
(`heartbeat-protocol` §3.2) and record the sweep member by member. Contest with a measurement,
never an argument. Address exactly the findings your packet assigns; name the rest. Three REV
passes per slice is the cap — if a pass-4 fix is asked of you, stop and hand it up.

## 7. Handoff — READY on cluster green, then stop

No review waits on your cluster. The slice is reviewed once, as a whole, at `REV(S)` when every
cluster is green — your job ends at READY. Post it in the eight-line shape (`heartbeat-protocol`
§5): SKILLS LOADED · node, pass, ticket, session · branch + commit · verification verbatim (every
RED frame, suites as passed/total with failures dated, the three-run table) · findings and packet
defects · UNVERIFIED · self-report path · comments read through. Every constant you chose,
disclosed. File the self-report (`heartbeat-protocol` §4) first.
