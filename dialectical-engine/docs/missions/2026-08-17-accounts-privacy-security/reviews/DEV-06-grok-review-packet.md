# DEV-06 Grok 4.6 review packet

Verdict requested: `GREENLIGHT` or `BLOCK`, with only concrete P0/P1 issues blocking.

## Ticket

**DEV-06 · Provide a local sendmail-compatible capture sink**

Add a durable dev-only mail capture executable that accepts the production `SendmailMailSender` stdin, stores mode-restricted messages, exposes no network listener, and never writes verification payloads to terminal output.

## Review boundary

Review these paths and their direct runtime dependency only:

- `deploy/dev-auth/sendmail-capture.mjs`
- `tests/integration/dev-mail-capture.test.ts`
- `tests/architecture/dev-mail-capture.test.ts`
- `apps/api/src/mail-channel.ts` (read-only dependency; unchanged by DEV-06)
- `docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.{md,json}`
- the bootable-stack row in `docs/missions/2026-08-17-accounts-privacy-security/IMPLEMENTATION-STATUS.md`

The retrospective ledger is user-requested process evidence and is not part of the product verdict.

## Intended security and behavior invariants

1. The production sender invokes the executable with exactly `-i -f <from> -- <recipient>` and writes the complete RFC-style message to stdin.
2. `DEBATEAI_DEV_MAIL_CAPTURE_DIR` is required. The exact future topology value is `.local/dev-auth/mail`.
3. An absent spool is created mode `0700`. An existing leaf that is not a current-user-owned, non-symlink directory with exact mode `0700` is refused, not repaired.
4. Stdin is bounded to 256 KiB before a message file is created.
5. Each send uses a random UUIDv4 filename unrelated to the recipient/token and publishes one atomic `.eml` file with exact mode `0600`.
6. The file and containing directory are fsynced before success.
7. Success has empty stdout/stderr. Failure emits one fixed operator code only; it does not echo arguments, message body, recipient, token, or path.
8. The executable contains no network imports/listener and is executable from the repository path fixed by the topology.
9. This ticket does not list mail, start API/UI/Postgres, seed an account, weaken HTTPS, or advertise `dev:auth:up` as complete.

## Reproduce-first and mutation evidence

- Before implementation: focused test was `3` failed / `1` passed. The executable was absent; the real production sender returned `SENDMAIL_EXEC_FAILED`, direct invocation had no exit status, and the source contract got `ENOENT`.
- First implementation attempt: `2` failed / `2` passed because a full canonical-path equality check rejected macOS's safe `/var` → `/private/var` system alias. The repair scopes custody to the exact spool leaf owned by this executable; the future root preflight owns ancestor validation.
- Secret-output mutant: inserting `process.stdout.write(message)` made the exact silence assertion RED and printed the synthetic recipient/token only inside the test failure. The line was removed and the source restored before review.

## Final evidence on review bytes

- Focused DEV-06 plus topology: `3` files / `7` tests GREEN.
- Affected sender and mail-route selection: `5` files passed, `1` skipped; `10` tests passed, `59` skipped under the exact title filter.
- Root `pnpm typecheck`: GREEN.
- `pnpm lint`: GREEN (`28` architecture edges, zero violations; source blockers empty) after an identical host-permitted rerun of the sandbox-only `tsx` IPC `EPERM`.
- `git diff --check`: GREEN.
- Source secret scan over the executable/review artifact: zero synthetic verification-token matches.
- Executable mode: `-rwxr-xr-x`.

## Custody hashes

- `deploy/dev-auth/sendmail-capture.mjs` — `a6800c25cd35bc6f8220042caf4ce249762f2833367f119963dc4f7f722b927d`
- `tests/integration/dev-mail-capture.test.ts` — `d39c9f92f722e5d14c6a4f7d37ab6d8d66483fa1a1bad0b8fb5f13f697c5cb89`
- `tests/architecture/dev-mail-capture.test.ts` — `f7c7a76b1ebeb961a1b48c4397df07c1919b0c654bb8be38fd3d2299aaa07133`
- topology Markdown — `5db13ce125b4415fd43256cd05d749fcfe718c9eeb2fefbd45cb11a926b7daf9`
- topology JSON — `ec1ead268cb21ee2a7762224701c3ea51091d6d89e551b103435d2a0d88f4d37`
- implementation status — `f82fa68e6475ab1aaaa9f713a2fa63205a5245f0dd352b2ed06d57d027a88ee3`

## Explicit residual boundary

- Ancestor/root symlink and ownership enforcement belongs to the ordered `PERSISTENT_PATHS` preflight in the future stack orchestrator. This executable refuses unsafe custody at its own leaf but does not claim to replace that root preflight.
- The filesystem is local development custody, not a production mailbox or UI. An operator reads the `.eml` file directly.
- A crash after rename but before the directory-fsync acknowledgement can make the sender observe failure even when a complete captured file is visible. A retry creates another opaque message rather than overwriting or exposing an incomplete file.
- No live full-stack account journey is claimed by this ticket.
