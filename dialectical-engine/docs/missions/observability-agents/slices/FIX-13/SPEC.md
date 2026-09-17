# FIX-13 — Approval-first fix, and it waits: after V approves, a sandboxed worker codes the fix RED→GREEN and presents a pull request that only V can merge

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G4 approval-first fixes** · Depends-on for dispatch: **FIX-12 merged** · Depends-on for acceptance: G4 ENTRY (V acts): if the remote form is chosen (F-14), branch protection + bot identity + required checks verified and their ruleset hash pinned; in every form the IC-3 forge fixture passed.
Absorbs predecessor ticket: **S29 `t_8cf81861`** (fix executor, approval-first arm; sandbox IC-3; landing pipeline; PR template; revert machinery) — with "PR" defined by contested row **F-14**: default in phase 1 = a LOCAL branch `fixagent/<incident-hash>` plus the machine-parseable PR template posted on the ticket (no push — the repo's push law is V-gated, spine v3.4.0 item 6); remote PR into `dev` if V rules so. Never `main`.
D-criteria evidenced: **D10** (fully).
Seam obligations: none. OBS-R095 (RED on clean base, GREEN after), R099–R101, R104, R110, R112–R114, R117, R118, IC-3, RT-22, RT-26, RT-30 bind.

## 1. Intent
"It opens a pull request for a larger fix, and waits." The worker never holds the keys: a separate OS user with NO access to tokens, `KILL`/`ARMED`/proof, keys, bundle originals, manifest, or git credentials; its only output is a patch. The daemon validates, applies in its own workspace, runs the human-owned test catalog in the sandbox, and presents the result to V. It never merges.

## 2. Requirements
- **FIX-13-R01** Mutation is armed only by `obsctl arm --mutation` (custodian token) and defaults OFF after any restart; `quick_arm` stays OFF regardless.
- **FIX-13-R02** Only an `APPROVED(hash)` proposal whose stored hash still matches is coded; a mismatch refuses with `PROPOSAL_TAMPERED`; one active mutation per repository and per fingerprint (OBS-R110).
- **FIX-13-R03** The fix worker (fresh Codex CLI session, separate OS user, sandbox profile denying read/write/create/traverse/stat on the OBS-R104 set and all git credentials, no network) receives the approved proposal and a pinned base SHA, and returns ONLY a patch file.
- **FIX-13-R04** The daemon validates the patch: every touched path matches the allowlist globs and none the floor deny list; exactly one root addressed; no dependency/manifest/register/compose/CI/`tools/**`/zone/obs-own-code path; test changes weaken no assertion, snapshot, lint or gate; the RED test derives from a human-owned invariant (RT-30) and the test command comes from the human-owned catalog (OBS-R101).
- **FIX-13-R05** The daemon applies the patch in an isolated worktree at the pinned base SHA (clean baseline enforced — a dirty tree aborts, OBS-R112), runs the RED test on the base (must FAIL) and after the patch (must PASS), plus the catalog's gates, inside the sandbox; outputs are captured verbatim and attached.
- **FIX-13-R06** Presentation: a branch `fixagent/<incident-hash>` with exactly one self-contained, revertible commit (OBS-R118), and the machine-parseable template (OBS-R114: incident id/fingerprint · root verdict + evidence ids · causal path · RED command and result on base · diff scope · GREEN gates · privacy and forbidden-surface attestations · blast radius · size label · what was deliberately not changed · spend · revert command) posted as a ticket comment and persisted to `obs.agent_action` (`action_kind = 'PR_PRESENTED'`); in the remote form the same appears as a PR into `dev` under the bot identity. No raw error text anywhere.
- **FIX-13-R07** It waits: the daemon holds no merge permission, never approves or closes its own PR, never touches `dev` or `main`; the incident enters `FIXING → PR_PRESENTED` and moves only on V's merge (detected by the daemon as a commit on `dev` containing the branch tip) or V's rejection (`obsctl deny`).
- **FIX-13-R08** Kill mid-flight: `obsctl kill` during coding revokes the lease, kills the worker process group, and no branch is created or pushed; branch-protection ruleset hash mismatch (remote form) trips before dispatch (RT-26).
- **FIX-13-R09** IC-3 forge fixture: an adversarial test file run as the worker attempts to read tokens/`KILL`/`ARMED`/proof/bundle/keys, to mint a fake `ARMED`, plant a proof, plant git credentials, mint a fake bundle, and to open a network socket — all provably contained, and any planted artifact fails signature/keyed verification.
- **FIX-13-R10** Every worker read, tool call, file considered, diff, test, branch, spend unit, denial and kill appends to `obs.agent_action`.
- **FIX-13-R11** A green suite is a milestone; Done is V's veto after §5.

## 3. States
Incident: `APPROVED → FIXING(lease) → PR_PRESENTED → (V merges) FIXED_UNVALIDATED | (V denies) DENIED | (kill) APPROVED(lease revoked)`.

## 4. Copy and vocabulary
"present" (the PR-shaped result V reviews) · "lease" · "human-owned catalog" · "forge fixture". Never "merged" for anything the agent did.

## 5. Acceptance — V runs this personally (FIX-12 merged; G4 entry acts done)
1. `obsctl arm --mutation` → `MUTATION: ON`; `obsctl status` → `quick_arm: OFF`.
2. With an `APPROVED` proposal from FIX-12 step 5 whose root is a real, small code defect (V chooses one; the bad-URL incident is `EXTERNAL_ROOT` and will be REFUSED with `NOT_A_FIX_TARGET` — V checks that refusal first: `obsctl status` shows `incident <id>: EXTERNAL_ROOT — no fix path`).
3. Within the wall-clock cap: `git branch --list 'fixagent/*'` → exactly one branch; `git log dev..fixagent/<hash> --oneline | wc -l` → `1`; `git diff dev..fixagent/<hash> --stat` → only allowlisted paths, ≤ the proposal's declared scope.
4. The ticket's newest comment begins `PR_PRESENTED` and carries every template field; `RED on base:` shows a failing test summary; `GREEN:` shows the passing summary; `revert:` shows a command.
5. `git status --porcelain | wc -l` → unchanged from before step 1 (the daemon's worktree is elsewhere); `git log dev -1 --format=%h` → unchanged (nothing merged).
6. Kill drill: approve a second proposal, run `obsctl kill` within 5 s of `FIXING` appearing in `obsctl status` → `git branch --list 'fixagent/*' | wc -l` unchanged; the ticket shows `LEASE_REVOKED`.
7. `pnpm exec vitest run tests/integration/fix13-forge-fixture.test.ts` → every forge attempt reported `CONTAINED`, planted artifacts `INVALID`.
8. V merges the branch locally (`git merge --no-ff fixagent/<hash>`), tests personally, and observes the incident move to `FIXED_UNVALIDATED` within one daemon cycle.
V vetoes Done only after steps 1–8 match.

## 6. Out of scope
Auto-merge, canary, auto-revert (FIX-14) · pushing (V-gated; the remote form's push is by the bot identity only after V rules F-14) · the diagnosis worker (FIX-12).

## 7. File surface (single-writer) and parallel safety
Allowed: `tools/obs-listener/src/worker-fix/**`, `tools/obs-listener/src/landing/**` (new) · sandbox profile files under `tools/obs-listener/sandbox/**` · `tools/obs-listener/catalog/**` (the human-owned test catalog — V authors its entries; the slice ships the format) · tests `tests/integration/fix13-*.test.ts`.
Read-only: the pinned base SHA · the catalog · the branch-protection ruleset hash (remote form).
Forbidden: the OBS-R104 set · custodian tokens · the diagnosis-worker subtree · `main` · any direct write to `dev`.
Parallel-safe with: FIX-01..08, FIX-16. Must wait for **FIX-12**.
