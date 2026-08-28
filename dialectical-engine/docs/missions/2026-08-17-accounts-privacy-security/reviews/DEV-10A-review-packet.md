# DEV-10A review packet — supported local Hatchet token authority

Status: **LOCAL IMPLEMENTATION GREEN; RUNTIME AND EXTERNAL REVIEW BLOCKED**

## User-level target

The current wave is complete only when one real local browser journey can
register with MFA, log in with MFA, save/recover a debate, and delete the
account with the ruled debate outcome. DEV-10A does not claim that journey. It
owns one prerequisite: a private, live-attested Hatchet application token.

## Change under review

- `pnpm dev:auth:provision-hatchet-token` requires the exact running
  `hatchet-lite` Compose service and executes the supported
  `./hatchet-admin token create` binary included in the pinned image.
- The fixed token name is `debateai-local-auth`; lifetime is one year. The
  command does not call Hatchet's database directly or scrape UI/log output.
- Before use/publication it requires ES256, exact local issuer/audience/server
  and gRPC broadcast authority, UUID tenant and token IDs, and at least 30 days
  remaining.
- Static parsing is followed by live pinned-SDK reads of the exact tenant and
  workflow list. Failed live attestation publishes nothing.
- `.local/dev-auth/hatchet.env` is an exact one-line, mode-`0600`, owner-only,
  single-linked, atomically renamed/fsynced file. Concurrent first use mints
  once; later callers live-attest and reuse it.
- The function/CLI returns only ATTESTED/REACHABLE and CREATED/REUSED. Token
  bytes, IDs, endpoints, and command output never enter terminal output.

## Evidence

- Reproduce-first: focused test failed because the implementation module was
  absent.
- Focused DEV-08/DEV-09/DEV-10A environment gate: `12/12` GREEN.
- Root `pnpm typecheck`: GREEN.
- `pnpm lint`: GREEN (28 architecture edges, zero violations; zero source blockers).
- `git diff --check`: GREEN.
- Four concurrent calls: one create, three reuse, one issuance, four live
  attestations.
- Failed live attestation: zero credential file.

## Mutation evidence

Each mutation was applied alone and restored before the next:

1. remove exact token `server_url` check → foreign authority accepted, RED;
2. skip live tenant/workflow attestation → publication without service proof, RED;
3. remove single-link custody check → hardlinked credential accepted, RED.

Mutation-checkpoint hashes:

- implementation — `bb235ad28d16ef72ec24a7f2edbce5331bdf8e8ca1401252a520bdc61b94524c`
- CLI — `c01222a0025213a3216fc06710003f299d6460fbba20bab5cd4c2eee51c5de2d`
- focused test — `b426d411a88eb2a0b14855586d32cd852d310264e1ed2bd0849881cea7c371ed`

The first final lint run then found that DEV-08 and DEV-10A read the inherited
process environment outside the register loader. That real architecture defect
was repaired by adding one narrow, whitelisted development-command environment
loader and passing its immutable result explicitly into both operation
factories. Final post-lint hashes are:

- DEV-10A implementation — `5e8437a97f32c7158a499005266aa7333c14f41381970ea7c470e8dbd4318968`
- DEV-10A CLI — `2f8137ecc8ef28fe645abe0f349f7332cfa3d91b28440279d2a523f323fe526c`
- DEV-10A test — `fffe47127afad64e3a1d9948621528b01471473947632f3e4f1aa12dcdd38cdd`
- environment loader — `d159fcbcd2e8c5d78355992fd685904f32b08d797c39a16f0a1266445e677908`

## Required reviewer verdict

Return exactly one of:

- `GREENLIGHT` — no P0/P1 and evidence is sufficient for this bounded scope;
- `BLOCK` — concrete P0/P1 findings with file/line evidence.

Claude Opus 5.0 was requested by the user, but no Claude reviewer/tool is
available in this workspace. No substitute verdict has been fabricated.

## Open gates and residuals

- The real command currently refuses with `DEV_HATCHET_TOKEN_CUSTODY_INVALID`
  because the prerequisite data plane has not created private local custody.
- That data-plane run remains externally blocked by Docker Desktop's failed
  Rosetta installation before Compose.
- A crash after remote token creation but before local publication can leave an
  unused remote token. It cannot expose local credentials or produce a false
  ready receipt; remote token revocation/garbage collection is not implemented.
- API/UI/TLS/runner lifecycle and the complete browser journey remain unproved,
  so the implementation status remains `✗`.
