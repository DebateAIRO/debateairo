# FIX-12 — Diagnosis proposal, and it waits: a fresh read-only model worker proposes a fix, V is notified, and nothing moves until V approves

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G3 dispatch** · Depends-on for dispatch: **FIX-09 and FIX-10 merged** (adds the `dispatch-arm` region to the daemon and the `approve/deny/reveal-drift` regions to `obsctl`) · Depends-on for acceptance: FIX-11 merged; **RP-3** injection corpus authored by an independent adversarial QA seat and its hash pinned (custodian act — V-2026-08-22 single custody).
Absorbs predecessor tickets: **S27** (diagnosis-worker harness — ticket id not present in the D12 log; orchestrator resolves) · **S18b** (daemon dispatch arm, promoted per H5-06; id not in the log) · **S23** (notifications osascript + sendmail; id not in the log) · **S28 `t_28c5c2e2`** `approve/deny/reveal-drift` regions. R-E3 (Codex CLI per incident), R-E6-09 (research → notify V → approval), DR-179 (relay only), OBS-R087/R088/R089/R102/R103 bind.
D-criteria evidenced: **D10** (first half — it proposes and WAITS), **D9** (the ticket carries the proposal).
Seam obligations: none.

## 1. Intent
Under V-in-charge, the model's only phase-1 role is to THINK, not to touch: a fresh Codex CLI session per incident, read-only, sandboxed, produces a structured FixProposal (diagnosis, proposed fix scope, size label, the RED test it would write) — into `obs.agent_action`, onto the ticket, and to V's screen. `obsctl approve` binds the proposal's content hash. Nothing lands anywhere in this slice.

## 2. Requirements
- **FIX-12-R01** The dispatch arm defaults OFF after every supervisor restart; `obsctl arm --dispatch` (custodian token) turns it to `REPORT_ONLY_PROPOSAL`; there is no other value in phase 1.
- **FIX-12-R02** Per eligible incident (verdict `CODE_ROOT`, floor `FLOOR_CLEAR`, not `ui_client`, not zone): the daemon spawns ONE fresh Codex CLI session (`codex exec … < /dev/null`, never `resume`), read-only profile, no network beyond the CLI's own relay, no credentials, no subagents, fixed tool/query allowlist, bounded paths, deadline-killed; zero idle calls.
- **FIX-12-R03** The worker's input is the validated incident packet only (ids, codes, normalized frames, chain codes, the root); no occurrence free text exists to include; the worker's output is parsed against the FixProposal schema — any field not derivable from the input set, any tool call outside the allowlist, any path outside bounds = a VIOLATION recorded to `obs.agent_action` and the proposal is discarded.
- **FIX-12-R04** FixProposal (fixed template) fields: incident id, root, diagnosis (enumerated defect class + template parameters), proposed change scope (files as repo-relative paths within the allowlist globs), size label, RED test plan (which human-owned invariant it derives from — RT-30), estimated blast radius (computed by the daemon from the module graph, not by the model), spend units; persisted to `obs.agent_action` (`action_kind = 'PROPOSAL'`, content hash in `action_ref`).
- **FIX-12-R05** Notification to V on every proposal regardless of severity: macOS `osascript` notification naming incident id and proposal id; a comment on the incident's ticket with the template; `sendmail` optional per §K row 7. Notification failure is itself an occurrence (`runtime = 'listener'`, `capture_point = 'self'`), never blocking.
- **FIX-12-R06** `obsctl approve <proposal-id>` binds the stored content hash (records `APPROVED(hash)`); `obsctl deny <proposal-id> [reason-code]` records `DENIED`; a tampered proposal (hash mismatch at any later read) is refused with `PROPOSAL_TAMPERED`; `obsctl reveal-drift` compares the live zone manifest hash to the bundle slot locally.
- **FIX-12-R07** Usage telemetry or fail-closed: if the CLI relay returns no usage data, the daemon records `TELEMETRY_MISSING` and stays in `REPORT_ONLY_PROPOSAL` with dispatch suspended until the custodian re-arms; caps `obs.listener.callsPerDay`, `wallClockPerDiagnosisMs`, `maxConcurrentDiagnoses` are register rows (seeds 20 / 600 000 ms / 1; numbers V's).
- **FIX-12-R08** Injection corpus clean: the pinned corpus (RP-3) run through the worker yields ZERO violations; targets include the worker prompt, the ticket text and the notification text.
- **FIX-12-R09** Nothing lands: after any number of proposals and approvals, `git status --porcelain` and `git branch --list 'fixagent/*'` are unchanged; no push, no PR, no file under `apps/**`/`packages/**` modified.
- **FIX-12-R10** If V lifts DR-179, only the adapter behind the CLI seam changes; no authority, cap, or approval rule changes (OBS-R090).
- **FIX-12-R11** A green suite is a milestone; Done is V's veto after §5.

## 3. States
Incident: `TICKETED → RESEARCHING(worker) → PROPOSED(hash) → APPROVED(hash) | DENIED | (tampered) PROPOSED_INVALID`. Dispatch arm: `OFF → REPORT_ONLY_PROPOSAL`.

## 4. Copy and vocabulary
"proposal" (the approval object — NOT a PR) · "approve" binds a hash · "violation" (injection scorer). Never "the agent fixed".

## 5. Acceptance — V runs this personally (FIX-09/10/11 merged; RP-3 pinned)
1. `obsctl arm --dispatch` → `DISPATCH: REPORT_ONLY_PROPOSAL`.
2. Cause FIX-03's real failed run (unreachable provider) → within `wallClockPerDiagnosisMs` a macOS notification appears naming `incident <id>` and `proposal <id>`; the incident's ticket on the F-2 board gains a comment beginning `PROPOSAL <id>`.
3. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT action_kind, action_ref, action_payload->>'size_label', action_payload->>'root' FROM obs.agent_action WHERE action_kind='PROPOSAL' ORDER BY occurred_at DESC LIMIT 1"` → `PROPOSAL|<sha256>|QUICK or PR_FIX|<repo-relative path:symbol>`; `SELECT count(*) FROM obs.budget_usage WHERE component='diagnosis-worker'` → `1`.
4. `git status --porcelain | wc -l` → the same number as before step 1; `git branch --list 'fixagent/*'` → empty.
5. `obsctl approve <id>` → `APPROVED <id> <hash>`; the ticket gains a comment `APPROVED`; still nothing in `git status`/branches (approval alone lands nothing — FIX-13 is not merged, or is unarmed).
6. `docker exec … -c "UPDATE obs.agent_action SET action_payload = action_payload || '{\"root\":\"x\"}' WHERE …"` → `ERROR: permission denied` or trigger refusal (append-only: tampering is impossible in place); instead V runs the slice's tamper drill `pnpm exec vitest run tests/integration/fix12-tamper.test.ts` → prints `PROPOSAL_TAMPERED` for the seeded mismatch.
7. `pnpm exec tsx tools/obs-listener/src/worker-diagnosis/injection-drill.ts` (reads the pinned corpus) → `violations: 0 / <n> cases`.
V vetoes Done only after steps 1–7 match.

## 6. Out of scope
Coding the fix, branches, PRs (FIX-13) · QUICK (FIX-14) · the corpus authorship (independent QA seat) · the ObservationAgent's notifications (its SPEC).

## 7. File surface (single-writer) and parallel safety
Allowed: `tools/obs-listener/src/worker-diagnosis/**` (new) · `tools/obs-listener/src/notify/**` (new) · `tools/obs-listener/src/daemon/**` region `dispatch-arm` ONLY · `tools/obs-listener/src/obsctl/**` regions `approve`, `deny`, `reveal-drift` · tests `tests/integration/fix12-*.test.ts`, `tests/unit/fix12-*.test.ts`.
Read-only: `acceptance/relay-core.ts` (spawn precedent) · the pinned corpus · `obs.budget_usage`, `obs.agent_action`.
Forbidden: every FIX-09 daemon region · FIX-10's `status/kill/arm` regions · `worker-fix`, `landing` (FIX-13) · authoring the corpus · any write/credential/network beyond the CLI relay · any product source.
Parallel-safe with: FIX-01..08, FIX-11, FIX-16. Must wait for **FIX-09 and FIX-10** to merge.
