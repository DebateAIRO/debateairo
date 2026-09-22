# GUIDE_ACCOUNT evidence

## Result

PG-3 is implemented at commit `163f15c59bcfb1bf2cb0979f8b0e7d414ebd0703`, based on `479763da1f586a217f36204cc81138aaa81c6f81`. The signed-in global bar's visible **Account** link now opens `/settings`. New debate remains `/new`, the Settings icon remains `/settings`, and the ASKER chip remains a non-interactive presentation placeholder.

The commit contains exactly:

- `apps/ui/components/TopBar.tsx`
- `tests/render/support-topbar.test.tsx`

The final product lane is clean. No other product/source path, service, session, data fetch, Support behavior or interface layout changed.

## TDD evidence

The packet-specified command was captured first:

```text
pnpm exec vitest run tests/render/support-topbar.test.tsx --maxWorkers=1 --minWorkers=1
```

With installed Vitest `4.1.10`, it returned `rc=1` before test collection because `--minWorkers` is not a supported CLI option. That packet defect is preserved in `GUIDE_ACCOUNT-red.log`; it is not presented as the behavioral RED.

The supported single-worker command was then used for both behavior frames:

```text
pnpm exec vitest run tests/render/support-topbar.test.tsx --maxWorkers=1
```

Behavioral RED: `rc=1`, one failed and six passed. The exact failure was Account `href` received `/login` while `/settings` was expected.

Final GREEN: `rc=0`, one file passed, seven tests passed.

The render contract verifies:

- global Account label and `/settings` destination;
- New debate label and `/new` destination;
- Settings icon and `/settings` destination;
- ASKER is a `span`, has no anchor/button ancestor, retains its placeholder title, and causes no `fetch` call;
- `/login`, `/sign-up`, `/verify-email`, and `/enroll-mfa` retain only the minimal auth top bar, with no global Account/New debate/ASKER controls;
- private and public debate routes continue returning no global top bar.

No unchanged broader suite was run, as required by the packet. No checkpoint verdict or owner acceptance is claimed. Usage is UNAVAILABLE.
