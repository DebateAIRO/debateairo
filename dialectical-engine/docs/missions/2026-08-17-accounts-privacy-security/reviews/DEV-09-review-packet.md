# DEV-09 review packet — exact private API environment

Status: **LOCAL IMPLEMENTATION GREEN; RUNTIME AND EXTERNAL REVIEW BLOCKED**

## User-level target

The current wave is complete only when one real local browser journey can:

1. register and finish mandatory MFA;
2. log back in with mandatory MFA;
3. create and durably recover the user's debate; and
4. delete the account with the ruled private/public debate outcome.

DEV-09 does not claim that journey. It owns only the private environment needed
to start the production API after the data plane and Hatchet token exist.

## Change under review

- `pnpm dev:auth:assemble-api-env` reads the exact DEV-03 database-principal
  custody and DEV-10A's one-line Hatchet token file.
- It validates exact owner/mode/single-link custody, eight distinct role-bound
  application credentials, exact local endpoints, and a UUID tenant derived
  from the Hatchet token.
- It renders the exact 29-key input accepted by production
  `loadApiEnvironment()`, with publication/content encryption/evaluator dev menu
  disabled and the exact HTTPS origin and seven-day erasure grace.
- It publishes `.local/dev-auth/api.env` atomically under a private lock,
  fsyncs file and directory, reuses only byte-identical output, and refuses
  drift without overwrite.
- Its return/CLI surface contains only key count and CREATED/REUSED status. It
  never returns or logs passwords, database URLs, token contents, or key bytes.
- It does not mint a Hatchet token, start API/UI/TLS, seed an account, or relax
  any production parser or security contract.

## Evidence

- Reproduce-first: focused integration test failed because
  `apps/runner/src/dev-api-environment.ts` was absent.
- Focused integration gate: `4/4` GREEN.
- Root `pnpm typecheck`: GREEN.
- `git diff --check`: GREEN.
- Real production environment parser accepts the generated values.
- Four concurrent assemblers: one CREATED, three REUSED.

## Mutation evidence

Each mutation was applied alone and restored before the next:

1. remove credential hardlink refusal → linked Hatchet input accepted, test RED;
2. remove UUID validation of token subject → caller-chosen tenant accepted, test RED;
3. remove byte-drift refusal → modified output silently reused, test RED.

Restored source SHA-256:
`fca5ebe593240f96256b80083b5e7f18f0ac960dffbb7c822a920a0349e568c4`.

## Required reviewer verdict

Review the environment/custody/authority boundaries. Return exactly one of:

- `GREENLIGHT` — no P0/P1 and evidence is sufficient for this bounded scope;
- `BLOCK` — list concrete P0/P1 findings with file/line evidence.

Claude Opus 5.0 was requested by the user, but no Claude reviewer/tool is
available in this workspace. No substitute verdict has been fabricated.

## Open gates and residuals

- Docker Desktop currently cannot start its engine because Rosetta installation
  fails before Compose, so the input credentials/token cannot yet be exercised
  as one running stack.
- Hatchet token issuance and workflow-list reachability now have a separate
  bounded implementation, but cannot be exercised until the data plane runs.
- API/UI/TLS lifecycle and the complete browser journey remain unproved.
- The implementation-status row therefore remains `✗`.
