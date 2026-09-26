# TEST(S02) — V's test point (orchestrator, 2026-09-25 20:4x EEST)

**What S02 gives you:** both deployments now SAY which mode they are. Local declares `DEBATEAI_DEPLOYMENT_MODE=local` (it keeps using your subscription CLIs through the relays). Hosted is proved on this Mac, against a FAKE vendor that takes a fake Bearer key. It refuses a relay/loopback target, an inline key, a conflicting Authorization, a missing key file and an unpriced target, and it admits a properly configured HTTPS vendor. No real key is used anywhere.

Lane: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine` @ dfef0de94 (branch `slice/provider-env-selection-s02`, 3 commits on 776359c3; merges cleanly onto today's origin/dev).
Review: both lenses PASS (reviews/REV-S02-p1-UNION.md).

## Steps (SPEC-v4 §5; each starts with `export PATH="/opt/homebrew/bin:$PATH"`)
1. `cd` into the lane above.
2. `pnpm vitest run tests/unit/v9-deployment-mode.test.ts -t 'declares DEBATEAI_DEPLOYMENT_MODE=local'` → 2 passed.
3. `lsof -nP -iTCP:3000 -sTCP:LISTEN; lsof -nP -iTCP:8790 -sTCP:LISTEN | tee /tmp/pes-s02-before.log`
4. `pnpm pes:accept-hosted > /tmp/pes-s02-accept.log 2>&1; echo "exit=$?"` then `cat /tmp/pes-s02-accept.log`
5–6. You should see these lines in this order: SCRATCH-DIR, FAKE-VENDOR, five `PES-S02 REFUSED` lines (LOOPBACK, INLINE_CREDENTIAL, AUTHORIZATION_CONFLICT, AUTHORIZATION_FILE_ABSENT, PRICE_REQUIRED), `PES-S02 ADMITTED …`, and `PES-S02 VENDOR-REQUESTS 1 matched 0 rejected`.
7. `grep -c 'pes-s02-fake-vendor-token' /tmp/pes-s02-accept.log` → 0, and the custody.d grep from SPEC-v4 §5 step 7 → 0.
8. The last line (before any `[ELIFECYCLE]` line) is `PES-S02-ACCEPT: PASS`, with `exit=0`.
9. `test -e "<scratch path from step 5>"; echo $?` → 1.
10. Re-run step 3's `lsof` lines: same PIDs as before.

## Residue shown to you (non-blocking, ticketed t_e3dccd9d)
- Three upgrade branches in `dev-api-environment.ts` and several hosted/fake-vendor outcome branches have no test case of their own. The code behaves correctly (probed); a regression there would go unseen.
- Port race: two `pes:accept-hosted` runs at the same moment can print `UNVERIFIED port bind-raced`. Run it alone.
- The fake vendor accepts a request that carries two Authorization headers when the first is the right one (test fixture only; the product sends one).
- V-19: hosted mode's loopback refusal checks the host as written, so a name like `api.localtest.me` → 127.0.0.1 is admitted. Your acceptance's ADMITTED case relies on this. Default: document it, don't resolve DNS.
- Suites not re-run on today's dev; MERGE(S02) runs the integrated suite.

Your veto = Done → MERGE(S02) into local dev (never pushed). Findings → a FIX node.
