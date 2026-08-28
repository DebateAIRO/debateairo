# P4-12 Grok 4.6 review packet

## Review scope

Review only Kanban card `t_ea75cfaf`, **P4-12 · Design the adversarial relay-injection corpus**.
This is a design-only ticket. No corpus payload has been sent to a vendor CLI, external service, database, or non-loopback address.

Ticket-owned files:

- `docs/missions/2026-08-17-accounts-privacy-security/P4-12-adversarial-relay-corpus.json`
- `tests/architecture/p4-adversarial-corpus-spec.test.ts`

## Required design outcome

- Versioned, machine-readable corpus contract.
- Explicit coverage of role forgery, delimiter confusion, control bytes, size boundaries, secret exfiltration, absent database/filesystem capabilities, cross-request state, and Claude/Grok argv tricks.
- Execution restricted to repository fake CLIs, ephemeral loopback relays, and in-memory spies; real vendors, external network, databases, real secrets, and persistent user data are forbidden.
- Each case has exact expected outcomes, non-vacuous oracles, and at least one named one-at-a-time mutation control.
- Required evidence includes exact request/response, spawn count, argv, environment, scratch custody, DB/filesystem/state oracles, and RED-to-restored-GREEN mutation receipts.
- Honest limit: the design permits adversarial text to influence model output and does not claim semantic prompt-injection elimination or broader OS sandboxing.

## Design summary

The corpus contains 10 cases and 10 matching mutation controls:

1. `ROLE-01` — forged system-role marker remains one user-content value.
2. `DELIM-01` — forged labels/tags remain inside the closed judge/review data field.
3. `CTRL-01` — NUL/CR/US/DEL deny before spawn; TAB/LF remain allowed.
4. `SIZE-01` — exact message/count/body boundaries pass and max+1 denies before spawn; a 32,768 × `é` boundary plus one ASCII byte pins UTF-8 byte counting below the 65,536-code-unit threshold.
5. `SECRET-01` — public secret sentinels remain absent from child env/argv/prompt/response except the maker's ruled locator.
6. `DB-01` — no database is opened and an in-memory DB capability spy remains zero.
7. `FS-01` — a test-owned outside-scratch sentinel remains unchanged and scratch is removed.
8. `STATE-01` — separate child/scratch custody and no request-one canary in request two.
9. `CLAUDE-ARGV-01` — adversarial flags remain solely in the `-p` value; exact containment argv is unchanged.
10. `GROK-ARGV-01` — adversarial flags remain solely in the `--single` value; exact containment argv is unchanged.

Mutations cover flattened transcripts, raw field interpolation, control/size bypass, incorrect UTF-16 code-unit sizing, whole-env inheritance, local DB/filesystem spy capability wiring, request-state reuse, and tokenized untrusted argv appends.

## Non-vacuous RED / GREEN

- RED: the focused architecture test failed with `ENOENT` because the versioned corpus contract did not exist.
- GREEN: the same test passes `1/1` and proves exact format/policy/category coverage, unique cases, local-only targets, nonempty oracles, valid mutation references, nonempty killed-by sets, and the required evidence inventory.
- Root `pnpm run typecheck`: exit 0.
- `git diff --check`: exit 0.

## Custody

- corpus spec: `6bdd6e00dbe2bdc54074ce1ce9168e0296d92d65bfb99fff36411fc7d7782b57`
- architecture test: `80b69a1028d79a61a75b2a5207faf46c032f0a55bdcfab2d58a8c1ad76a0c8d8`

## Requested verdict

Inspect the two ticket-owned files in the working tree. Return exactly one of:

- `GREENLIGHT` if P4-12 is complete with no bounded-scope P0/P1 issue; or
- `BLOCK` with concrete file/line evidence, an omitted attack/evidence path, and the smallest required design repair.
