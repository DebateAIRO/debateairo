# GitHub settings runbook (decisions V-2, V-5, V-6b, and the four scanner notes)

*Prepared 2026-09-18. Nothing here has been run. Every command below is run only after the owner says "go" in the chat; each is reversible and the "undo" is written next to it. The `gh` CLI on this Mac is signed in as the owner's account, which has admin rights on the repository (`gh api repos/DebateAIRO/debateairo --jq .permissions` → `admin: true`).*

## Measured state, 2026-09-18 (read-only)

| Setting | Now |
|---|---|
| Default branch | `main` (the old V2 engine) |
| Visibility | public |
| Dependabot alerts | on — 12 open alerts, all describing the July `main` code |
| Dependabot security updates (automatic fix PRs) | off |
| Secret scanning | off |
| Push protection (refuse pushes that contain a secret) | off |
| Private vulnerability reporting | off |
| Rulesets / branch protection on `main`, `dev` | none |
| Code scanning alerts open on the default branch | 0 (CodeQL runs only in the security workflow, on the PR) |
| Organisation-wide two-factor requirement | off (changing it needs the web interface; the CLI token has read-only organisation scope) |

## Step 1 — V-5: make `dev` the default branch

Why: GitHub's scanners, dependency graph and alerts describe the default branch; today that is the wrong product. **Never merge `main` into `dev` or `dev` into `main`** — they are separate products until V3 replaces V2 on the new server.

```bash
gh api -X PATCH repos/DebateAIRO/debateairo -f default_branch=dev
```

Undo: the same command with `main`.

**Ruled 2026-09-21 (V-5, option A):** this is a TEMPORARY switch. Run it right after PR #8 merges into `dev`, on the owner's "go". On release day — when V3 reaches `main` as one deliberate, owner-approved step, with V2's last state tagged first — run the undo so the label follows the product back to `main`. Re-measured 2026-09-21: neither `main` nor `dev` carries a `.github/` directory (no scheduled job can stop), and no script on either branch depends on the default-branch setting.

## Step 2 — V-2 / V-6b: the repository switches

Private vulnerability reporting:

```bash
gh api -X PUT repos/DebateAIRO/debateairo/private-vulnerability-reporting
```

Dependabot security updates (automatic fix pull requests; alerts are already on):

```bash
gh api -X PUT repos/DebateAIRO/debateairo/automated-security-fixes
```

Secret scanning and push protection (one call):

```bash
gh api -X PATCH repos/DebateAIRO/debateairo -H "Accept: application/vnd.github+json" --input - <<'JSON'
{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}
JSON
```

Undo for each: the same call with `-X DELETE` (reporting, fixes) or `"status":"disabled"` (scanning).

**Rulings, 2026-09-21/22 — and the order they impose.** All three switches in this step are approved, but not at the same moment:

| Switch | When it is turned on (each on the owner's "go") |
|---|---|
| Secret scanning + push protection | **First of all — before the first push of the security branch**, so the local commits are checked on their way up. If a push is stopped, the agent stops and shows the owner what was caught; it never bypasses on its own. |
| Private vulnerability reporting | At the moment PR #8 merges into `dev`, so `SECURITY.md`'s promise and the button appear together. |
| Dependabot security updates | Only after Step 1 has moved the default-branch label to `dev`; earlier, the fix pull requests would target the old engine on `main`. |

## Step 3 — V-6b: branch rules on `main` and `dev`, with an owner bypass

What the rule does: no force-push, no deleting the branch, changes arrive through a pull request with the `verify` check of the security workflow passing. The bypass keeps the owner's own pushes working while the rule catches everything else; remove the bypass later if the team grows.

```bash
gh api -X POST repos/DebateAIRO/debateairo/rulesets --input - <<'JSON'
{
  "name": "protect-main-and-dev",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/main", "refs/heads/dev"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": { "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false, "require_code_owner_review": false, "require_last_push_approval": false, "required_review_thread_resolution": false } },
    { "type": "required_status_checks", "parameters": { "strict_required_status_checks_policy": false, "required_status_checks": [ { "context": "verify" } ] } }
  ],
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ]
}
JSON
```

(`actor_id: 5` with `RepositoryRole` is GitHub's fixed id for the repository *admin* role.) Undo: `gh api -X DELETE repos/DebateAIRO/debateairo/rulesets/<id>`; list ids with `gh api repos/DebateAIRO/debateairo/rulesets`.

**Note for `main`:** the `verify` check only exists on branches that carry `.github/workflows/security.yml` — that is `dev` after PR #8 merges. Until then, a required check on `main` would block `main` entirely. Apply the ruleset to `dev` first; add `main` when its workflow exists (or leave `main` frozen on purpose, since V3 replaces it).

## Step 4 — organisation two-factor requirement (web interface, owner only)

GitHub → the `DebateAIRO` organisation → Settings → Authentication security → "Require two-factor authentication for everyone in the organisation". Members without 2FA are removed from the organisation when this is switched on; check that every member has it first.

## Step 5 — pinned Actions requirement (V-6b)

Settings → Actions → General → "Require actions to be pinned to a full-length commit SHA". (The security workflow already pins every action by SHA, so nothing breaks.)

## Step 6 — the four code-scanning notes on PR #8

Three alerts of the rule `js/missing-rate-limiting` (login, e-mail verification, MFA code check) are false positives: the audit's route table (`findings/L1-api-auth.md`, rows for those routes) records the in-process limiters that guard them, which the scanner cannot recognise. Dismiss each with the reason recorded:

```bash
for n in 2 3 4; do gh api -X PATCH "repos/DebateAIRO/debateairo/code-scanning/alerts/$n" -f state=dismissed -f dismissed_reason="false positive" -f dismissed_comment="In-process limiter guards this route (MfaVerificationLimiter / InProcessAuthRateLimiter); see docs/missions/2026-09-01-security-hardening/findings/L1-api-auth.md route table."; done
```

The fourth (`#1`, a loose HTML-filtering pattern in `tests/integration/s5-ui-security-smoke.mjs`) is fixed in code, not dismissed. Read from GitHub on 2026-09-22: `#1` is `fixed`; `#2`, `#3`, `#4` are `open`.

**Ruled 2026-09-22: dismiss the three, with written reasons, on the owner's "go" at this step.** The false-positive claim was re-verified first-hand on the current branch before the owner was asked:

| Alert | Route | Where the limit check is |
|---|---|---|
| #2 | `POST /v1/auth/login` | `apps/api/src/sessions.ts` — `beginLogin` calls `requireRateBudget` before `verifyPassword`; `completeLogin` calls it before the TOTP / recovery-code check |
| #3 | `POST /v1/auth/verify-email` | `apps/api/src/registration.ts` — `runVerifyEmail` calls `limiter.consume` (per IP and per address) before `consumeVerification` |
| #4 | `POST /v1/auth/mfa/totp/verify` | `apps/api/src/mfa.ts` — `verifyTotp` calls `rateLimit` before the repository read |

**Standing rule for every future code-scanning alert (owner-approved):** check it in the code first; fix the real ones test-first; bring the false ones to the owner with the evidence; dismiss only on the owner's approval — never on the agent's own initiative. Expect new alerts when the synced branch is first pushed: the scanner has never seen the 656 newer commits, and the support chat uses the same in-process limiter the scanner cannot recognise.

## Step 7 — verify (read-only)

```bash
gh api repos/DebateAIRO/debateairo --jq '{default_branch, secret_scanning: .security_and_analysis.secret_scanning.status, push_protection: .security_and_analysis.secret_scanning_push_protection.status}'
```

```bash
gh api repos/DebateAIRO/debateairo/rulesets --jq '.[] | {id, name, enforcement}'
```
