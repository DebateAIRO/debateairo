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

**Change log.** 2026-09-23 — secret scanning + push protection turned ON (owner's "go 1"; the Step 2 call, re-read as `enabled`/`enabled`). 2026-09-24 — Step 6 done on the owner's "go 6": #2, #3, #4 dismissed as false positives with the reason above; two alerts that first appeared when the synced branch was pushed were dismissed too — #15 (`js/insufficient-password-hash` on an HMAC cache key: false positive) and #13 (`js/missing-rate-limiting` on the session-cookie check: **won't fix**, owner's ruling) — reasons in `CODEQL-DISMISSALS-2026-09-23.md`; three `js/polynomial-redos` alerts were FIXED in code, not dismissed. 2026-09-24 05:01 UTC — **PR #8 merged into `dev`** (merge commit `9c5ffd87`) with the verify, secrets and CodeQL checks green. Steps 1, 2 (the two remaining switches), 3, 4, 5 and 7 are still to do, each on the owner's "go".

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

## Step 3 — V-6b: branch rules on `main` and `dev`, as two bundles

**Ruled 2026-09-22: two bundles instead of one.** GitHub's bypass applies to a whole bundle of rules (a "ruleset"), not to single rules. Both accounts that push are repository administrators, and every AI session pushes under one of them — so the original design, one bundle with an administrator bypass, would have bound nobody who actually pushes, not even against the likeliest accident (a force-push over `dev`).

### Bundle 1 — nobody deletes or rewrites `main` or `dev`; no exemptions

Depends on nothing; can be applied at any time, on the owner's "go". It never blocks honest work (the project's own rule is already "merge, never rewrite"), and release day does not need a rewrite: V3 reaches `main` as a normal merge. If a rewrite is ever genuinely needed, an administrator disables this bundle on purpose in the settings — a deliberate, logged act.

```bash
gh api -X POST repos/DebateAIRO/debateairo/rulesets --input - <<'JSON'
{
  "name": "no-delete-no-rewrite",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/main", "refs/heads/dev"], "exclude": [] } },
  "rules": [ { "type": "deletion" }, { "type": "non_fast_forward" } ],
  "bypass_actors": []
}
JSON
```

### Bundle 2 — changes reach `dev` through a pull request with the checks passing; administrators exempt at first

Apply only AFTER PR #8 has merged into `dev`: the two required checks, `verify` (install, compile, the test gate, known-vulnerable packages) and `secrets` (the secret scan), must exist on `dev` before GitHub can require them. Both are pinned to the GitHub Actions app (id 15368, read from PR #8's own check runs on 2026-09-22), so no other integration can report a fake pass under those names. **Tightening at go-live** — administrators also go through pull requests (change `bypass_mode` to `pull_request`, or empty the bypass list) — is a separate "go" from the owner. `main` gets this rule on release day, when it carries the workflow.

```bash
gh api -X POST repos/DebateAIRO/debateairo/rulesets --input - <<'JSON'
{
  "name": "dev-changes-by-pull-request",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/dev"], "exclude": [] } },
  "rules": [
    { "type": "pull_request", "parameters": { "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false, "require_code_owner_review": false, "require_last_push_approval": false, "required_review_thread_resolution": false } },
    { "type": "required_status_checks", "parameters": { "strict_required_status_checks_policy": false, "required_status_checks": [ { "context": "verify", "integration_id": 15368 }, { "context": "secrets", "integration_id": 15368 } ] } }
  ],
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ]
}
JSON
```

(`actor_id: 5` with `RepositoryRole` is GitHub's fixed id for the repository *admin* role — today that is both `nokitel` and `VanillaMint02`.)

List the bundles and their numbers (read-only):

```bash
gh api repos/DebateAIRO/debateairo/rulesets --jq '.[] | {id, name, enforcement}'
```

Undo: delete a bundle by its number. The number comes from the list command above, so the delete command is written out at that moment rather than here — a placeholder in a pasteable command is how accidents happen.

**Note for `main`:** the `verify` and `secrets` checks only exist on branches that carry `.github/workflows/security.yml` — that is `dev` after PR #8 merges. A required check on `main` before then would block `main` entirely, which is why Bundle 2 names `dev` alone.

## Step 4 — organisation two-factor requirement (web interface, owner only)

GitHub → the `DebateAIRO` organisation → Settings → Authentication security → "Require two-factor authentication for everyone in the organisation". Members without 2FA are removed from the organisation when this is switched on; check that every member has it first.

**Ruled 2026-09-22: yes — but only after the second administrator has two-factor on.** Measured that day (read-only): one member, `nokitel` (administrator, 2FA on), and one outside collaborator, `VanillaMint02` (administrator, **2FA off**). Flipping the switch in that state removes `VanillaMint02` immediately. The owner is asking that colleague to enable 2FA; his access level stays administrator by the owner's decision.

Run both checks right before flipping the switch; each must print `0`:

```bash
gh api 'orgs/DebateAIRO/members?filter=2fa_disabled' --jq 'length'
```

```bash
gh api 'orgs/DebateAIRO/outside_collaborators?filter=2fa_disabled' --jq 'length'
```

## Step 5 — pinned Actions requirement (V-6b)

Settings → Actions → General → "Require actions to be pinned to a full-length commit SHA". (The security workflow already pins every action by SHA, so nothing breaks.)

**Ruled 2026-09-22: yes — and a second lock with it.** (a) Require pinning. (b) Restrict which actions may run to GitHub's own plus the one third-party action the workflow uses (`pnpm/action-setup`). Measured 2026-09-22 (read-only): `allowed_actions: all`, `sha_pinning_required: false`; the workflow uses 5 action references, all pinned — `actions/checkout` ×3, `actions/setup-node`, `github/codeql-action` init and analyze, `pnpm/action-setup`. Neither `main` nor `dev` carries a workflow today, so nothing can break between the two calls below.

Both settings can be made from the command line (the repository-level API exposes them), each on the owner's "go". First the policy:

```bash
gh api -X PUT repos/DebateAIRO/debateairo/actions/permissions -F enabled=true -f allowed_actions=selected -F sha_pinning_required=true
```

Then the list of what may run:

```bash
gh api -X PUT repos/DebateAIRO/debateairo/actions/permissions/selected-actions -F github_owned_allowed=true -F verified_allowed=false -f 'patterns_allowed[]=pnpm/action-setup@*'
```

Check both afterwards (read-only):

```bash
gh api repos/DebateAIRO/debateairo/actions/permissions
```

```bash
gh api repos/DebateAIRO/debateairo/actions/permissions/selected-actions
```

Undo, back to today's state:

```bash
gh api -X PUT repos/DebateAIRO/debateairo/actions/permissions -F enabled=true -f allowed_actions=all -F sha_pinning_required=false
```

If GitHub rejects a field, stop and use the web-interface path above instead; do not improvise. Adding a new third-party action later means adding its pattern to the list first — that friction is the point.

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
