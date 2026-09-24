# DELTA-CONSOLIDATED — findings on the code that changed on `dev` between `b5a6b6eb` and `7bae9806` (audited 2026-09-18)

Seven read-only lanes (`delta-L1` … `delta-L7`), same schema and rubric as the 2026-09-01 audit. Dispositions: **FIX-NOW** (a package below), **ASK-V** (a new row in `V-DECISIONS-PACKET.md`), **DEFER** (recorded, no package), **DONE** (commit on `security/dev-sync-2026-09-18`).

**Totals:** 58 findings — CRITICAL 0 · HIGH 0 (two conditional: DL4-F2 against a paid gateway, DL7-F2 if the CLI relays ever reach the VPS) · MEDIUM 19 · LOW 30 · INFO 9. Nothing in the delta gives an anonymous caller identity material, keys, another user's private content or unbounded spend; the medium findings are availability, disclosure, containment and privacy gaps in the support chat and the observation agent, plus the drift of the fixed-list controls (guards, escrow, kit) behind the new code.

| ID | Sev | Disposition | Package | Title (short) |
|---|---|---|---|---|
| DL1-F1 | MEDIUM | FIX-NOW | S1 | Non-UUID support ids → 500 + failure telemetry |
| DL1-F2 | MEDIUM | FIX-NOW | S2 | No admission on `/v1/support/*` reads; `/status` aggregate uncached; authenticated session-create unbounded |
| DL1-F3 | MEDIUM | FIX-NOW | S1 | One backward clock observation latches the whole support surface at 429 |
| DL1-F4 | MEDIUM | FIX-NOW | S1 | Anonymous `/status` discloses model identity, limit thresholds, spend (= DL4-F5) |
| DL1-F5 | MEDIUM | FIX-NOW | S1 (TTL, owner binding) + S2 (token off the URL, with DL3-F4) | Case tokens: non-expiring bearers in URLs |
| DL1-F6 | MEDIUM | ASK-V | V-26 | Account erasure never reaches support transcripts (shred is operator-only — and dead, DL2-F1) |
| DL1-F7 | MEDIUM | FIX-NOW (Origin check, per-source share) | S2 | Anonymous model-budget starvation; anon mutating support POSTs need no Origin (= DL4-F6) |
| DL1-F8 | LOW | FIX-NOW | S1 | Unbounded in-memory reservation events |
| DL1-F9 | LOW | FIX-NOW | S1 | Expensive work before the cheap message-size rejection |
| DL2-F1 | MEDIUM | FIX-NOW | DB1 | Support shred takes `FOR UPDATE` on a table its role cannot update → the only erasure path is dead |
| DL2-F2 | MEDIUM | FIX-NOW | DB1 | Shred-integrity guard: singleton row lock + full-schema scan per commit (= DL5-F1) |
| DL2-F3 | LOW | FIX-NOW | S2 | Dead v1 content-envelope downgrade path |
| DL2-F4 | LOW | FIX-NOW | S2 | Support capability tokens hashed with bare unkeyed sha256 (B19 regression) |
| DL2-F5 | LOW | FIX-NOW | DEPLOY1 | Support KEK outside escrow/backup; crypto-shred residual undocumented |
| DL2-F6 | LOW | FIX-NOW | OPS1 | `localeCompare` in operator tools, one compared against C-ordered rows |
| DL2-F7 | LOW | FIX-NOW | S2 | Zeroisation gaps in the support key module |
| DL2-F8 | INFO | DEFER | — | Canonical-JSON DECIMAL-node shape ambiguity (register lane note) |
| DL3-F1 | MEDIUM | DONE `9e065e81` | — | SSR reads all counted as 127.0.0.1 → one shared public-read bucket |
| DL3-F2 | MEDIUM | FIX-NOW | UI2 | Home page N+1: up to 52 sequential decrypting reads per load |
| DL3-F3 | LOW | FIX-NOW | UI2 | Support token + transcript in sessionStorage, survive logout |
| DL3-F4 | LOW | FIX-NOW | S2 + UI2 | Case bearer in the query string (`/help?case=`) — L3-F8's class |
| DL3-F5 | LOW | DONE `f141b474` | — | Proxy forwarded `x-support-session-token` verbatim |
| DL3-F6 | LOW | FIX-NOW | UI2 | Own-context consent toggle shows OFF while the server says ON |
| DL3-F7 | INFO | FIX-NOW | UI2 | Two banners interpolate contract error text |
| DL4-F1 | MEDIUM | DONE `f9d55a65` | — | Model text escaped through Hatchet failure payloads and schema messages |
| DL4-F2 | MEDIUM (HIGH vs paid gateway) | ASK-V | V-28 | Worst-case per-ask spend grew (2748 attempts at p3/d5, ×3 tokens); no per-run token/cost envelope |
| DL4-F3 | LOW | DONE `d710fbc1` | — | Per-attempt ceiling hook never wired |
| DL4-F4 | MEDIUM | pending V-11 | RUN1 | Prompt-injection containment unchanged on every runner-assembled path |
| DL4-F5 | LOW | = DL1-F4 | S1 | |
| DL4-F6 | LOW | = DL1-F7 | S2 | |
| DL4-F7 | INFO | verified OK | — | Support relay has no tools |
| DL5-F1 | MEDIUM | = DL2-F2 | DB1 | |
| DL5-F2 | MEDIUM | FIX-NOW | DB1 | 20 delta relations without TRUNCATE/mutation guards (all `support.*`, `serve.synthesis_round`, `register.required_row*`) |
| DL5-F3 | MEDIUM | FIX-NOW | S2 | Unkeyed `sha256(client_ip)` in two never-pruned tables — reversible pseudonym |
| DL5-F4 | LOW | FIX-NOW | DB1 | Surplus EXECUTE to `debateai_runtime` on three register functions (+ the 0056 surplus) |
| DL5-F5 | LOW | FIX-NOW | DB1 | One function without a `search_path` pin |
| DL5-F6 | LOW | FIX-NOW | OPS1 | P3-01 manifest `inheritOption` drift for the observation agent |
| DL5-F7 | LOW | FIX-NOW | DEPLOY1 | `hardening.sql` grants no CONNECT to the support roles (VPS support API cannot connect) |
| DL5-F8 | LOW | ASK-V | V-29 | `pg_monitor` for the observation agent is broader than its query needs |
| DL5-F9 | LOW | FIX-NOW | DB1 | One delta migration not idempotent; ordering of duplicated-number pairs is lexical |
| DL5-F10 | INFO | DEFER | — | Sealed register versions: immutable, but nothing verifies the persisted snapshot hash at read |
| DL6-F1 | MEDIUM | FIX-NOW | DEPS1 | `pnpm audit` red again (fast-uri, fastify, qs, vitest) → CI verify fails as-is |
| DL6-F2 | MEDIUM | resolved by merging PR #8 + V-5 | — | The gates have observed zero `dev` commits |
| DL6-F3 | MEDIUM | FIX-NOW | DEPS1 | gitleaks path allowlist blinds the gate to `tests/`, `docs/`, `.hermes/` |
| DL6-F4 | LOW | FIX-NOW | OPS1 | One-machine `/Users/…` paths in `.claude/launch.json` and packet templates |
| DL6-F5 | LOW | FIX-NOW (paths) / note (bypass mode) | OPS1 | Orchestrator skill names `~/.local/bin/claude`, `~/.grok/bin/grok` by fixed path |
| DL6-F6 | LOW | DEFER | — | `graph-png/serve.py`: unauthenticated loopback file-drop (dev tooling of the other mission) |
| DL6-F7 | LOW | DEFER | — | Vendored `mermaid.min.js`, unhashed (sha256 now recorded in delta-L6) |
| DL6-F8 | INFO | FIX with V-18 | DEPS1 | 37 release-age exclusions past their dates |
| DL6-F9 | INFO | = custody sites | OPS1 | Observation agent hard-codes the dev custody folder and a dev admin DB URL |
| DL6-F10 | INFO | DEFER (R1) | — | PII-lite in commit metadata; no rewrite |
| DL7-F1 | MEDIUM | FIX-NOW | OBS1 | Observation agent sends the Hatchet tenant token to any URL its config names; its DB role can insert new policy versions (with DL7-F9) |
| DL7-F2 | MEDIUM (LOW locally, HIGH on a VPS) | ASK-V | V-30 | Support text through the CLI relays: the prompt on the vendor CLI's argv |
| DL7-F3 | LOW | FIX-NOW | OBS1 | Agent's sendmail channel broken by the merge; recipient back on argv |
| DL7-F4 | LOW | FIX-NOW | OPS1 | Custody hard-codes: the 13 sites + the daemon launcher |
| DL7-F5 | LOW | FIX-NOW | OBS1 | Launcher execs `node`/`docker` by PATH with no program-header guard under KeepAlive (the 2026-09-17 class) |
| DL7-F6 | LOW | FIX-NOW | DEPLOY1 | Support CLIs' URL grammar refuses both VPS `pg_hba` shapes |
| DL7-F7 | LOW | FIX-NOW | S2 | ~15 boot awaits before the startup owner: KEKs not zeroed on an early failure |
| DL7-F8 | LOW | FIX-NOW | OPS1 | Dev allowlist forwards the support relay bearer to every child |
| DL7-F9 | LOW | FIX-NOW | DB1 (with DL7-F1) | Daemon's DB role may INSERT into the table that rules it |
| DL7-F10 | INFO | note | — | Status page on `127.0.0.1:9797`, unauthenticated loopback |
| DL7-F11 | INFO | FIX-NOW (small) | OPS1 | `support:reply` takes the reply on argv; `support:shred` has no confirmation |
| DL7-F12 | INFO | note | — | Configuration-trust observations |

## Packages

| Package | Scope | Files | Status |
|---|---|---|---|
| **S1** | Support API round 1 | `apps/api/src/support/**`, tests | agent running (2026-09-18) |
| **S2** | Support API round 2: admission on support reads + `/status` cache + per-owner session cap (DL1-F2); exact-Origin for anonymous mutating support routes + per-source share of the daily cap (DL1-F7); case token in a header, link token in the fragment (DL1-F5c, DL3-F4); keyed purpose-labelled token hashes (DL2-F4); keyed client-ip pseudonym (DL5-F3); dead v1 envelope (DL2-F3); zeroisation (DL2-F7); early boot stages under the startup owner (DL7-F7) | `apps/api/src/support/**`, `apps/api/src/main.ts`, `packages/db/src/support.ts` (hash paths), `apps/ui/components/support/**` | after S1 |
| **DB1** | Migration `0065_security_delta_guards.sql`: TRUNCATE/mutation guards for the 20 relations, `search_path` pin, surplus EXECUTE revokes (DL5-F4 + the 0056 runtime grant), revoke the daemon's INSERT on `observation.threshold_policy`; shred lock without `FOR UPDATE` (DL2-F1); integrity guard redesign — index + incremental check (DL2-F2/DL5-F1); idempotent delta file (DL5-F9); a test that DISCOVERS append-only relations | `migrations/`, `packages/db/src/support.ts`, `tests/architecture`, `tests/integration` | dispatch |
| **UI2** | Home-page N+1 → `models` in the index item (DL3-F2); support widget token in memory only, cleared on logout, drop-and-retry on 404 (DL3-F3); consent toggle from the server (DL3-F6); banner text (DL3-F7); `/help#case=` (DL3-F4, with S2's header) | `apps/ui/**`, `packages/contract`, the index route in `apps/api/src/index.ts`, `packages/db` index query | dispatch |
| **OBS1** | Observation agent: loopback-pin every URL-valued target/threshold, token file through the custody loader (DL7-F1); sendmail channel on the merged capture contract (DL7-F3); launcher deduces `node`/`docker` and refuses non-programs before exec (DL7-F5) | `apps/observation-agent/**`, `deploy/observation-agent/**` | dispatch |
| **OPS1** | Custody sites (13 + launcher) through `resolveDevCustodyRoot` + generic guard (DL7-F4, DL6-F9); `localeCompare` in operator tools (DL2-F6); P3-01 manifest drift (DL5-F6); `/Users/…` paths out of `.claude/launch.json` and templates (DL6-F4, DL6-F5 paths); narrow the dev allowlist for the relay bearer (DL7-F8); `support:reply` from stdin + `support:shred` confirmation (DL7-F11) | `apps/runner/src/**` (dev-*, support-*-cli), `.claude/launch.json`, docs templates, manifest JSON | dispatch |
| **DEPS1** | fastify 5.12.5, fast-uri/qs overrides, vitest 4.1.11 + floors rows (DL6-F1); gitleaks path allowlist narrowed to fingerprints (DL6-F3); V-18 prune on V's yes | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.gitleaks.toml`, `tests/architecture/dependency-floors.test.ts` | orchestrator |
| **DEPLOY1** | VPS kit refresh: env templates (`SUPPORT_KEK_PATH`, `SUPPORT_DATABASE_URL`, support model target), `backup.sh` fifth escrowed secret (DL2-F5), CONNECT for the support roles (DL5-F7), support CLI URL grammar (DL7-F6), a unit for the observation agent (macOS-only today — see delta-L7), the register-publication step incl. `admissionPolicy`, the nine gaps in delta-L7 | `deploy/**`, `apps/runner/src/support-*-credentials.ts` | with the deployment phase |
| **RUN1** | DL4-F4 + the L4 handoffs (V-11) | `apps/runner/src/index.ts`, `packages/judgement`, `packages/serve` | after V rules V-11 |

## New rows for `V-DECISIONS-PACKET.md`
- **V-26** (DL1-F6): should account erasure cascade to the account's support transcripts and cases? Recommended: yes — wire `shredOwner(ownerRef)` into the erasure coordinator once DB1 makes the shred path live.
- **V-28** (DL4-F2): seal a per-run token/cost envelope (tokens or USD per ask) in the register, enforced by the gateway, so the ask cap bounds money and not only attempt counts. Recommended: yes, before any paid gateway is configured (V-9c).
- **V-29** (DL5-F8): replace the observation agent's `pg_monitor` membership with the narrower grants its one query needs. Recommended: yes, small.
- **V-30** (DL7-F2): the acceptance CLI relays put the prompt on the vendor CLI's argv; on a single-user Mac this is the A4 residual V-10 grades LOW; on the server the relays must never run at all (V-9c: paid API keys through the HTTP gateway). Recommended: rule both; no code change in dev.

---

## Status, 2026-09-19

### Closed on `security/dev-sync-2026-09-18`

| Finding | Commit | Note |
|---|---|---|
| DL1-F1, F3, F4, F5a+b, F8, F9 | `8f3656a2` `9692a18b` `cf374faa` `0033f0af` `44177503` `5e05905c` | Support API round 1 |
| DL2-F1 | `cebf125a` | The shred's `FOR UPDATE` on a table its own role may not update — the only erasure path for support transcripts, dead since it was written |
| DL2-F2 / DL5-F1 | `4e28f1dd` `fef54d98` | Singleton lock + full-schema scan → five deferred per-row triggers scoped to one session or shred target. Two further causes found while measuring: `support."case"` had no usable `session_id` index, and plpgsql's cached generic plan re-created the O(N) commit |
| DL2-F6 | `49fdb0c0` | Principal ordering by code units — the order `name` columns use |
| DL3-F1 | `9e065e81` | |
| DL3-F2, F3 | `390ee559` `f2cf696b` | |
| DL3-F5 | `f141b474` | with B23b |
| DL4-F1, F3 | `f9d55a65` `097f7bbb` `d710fbc1` | |
| DL5-F2, F4, F5, F9 | `cfbc183c` `a6d1e2fe` | Migration 0065; DL5-F9 could not be fixed forward (`migrate()` keys on the file name), so it is pinned with the lexical-ordering fact for B28 |
| DL6-F1, F3, F4 | `6e988cdc` `6d51c6c1` `994d41ec` | |
| DL7-F1, F3, F4, F5, F11 | `54dcc6d4` `31f91360` `10b682bc` `7ce6638e` `96f58512` | |

### DL7-F9 — refused on evidence, and that refusal is the finding

DB1 was asked to revoke the observation daemon's `INSERT` on `observation.threshold_policy`
(the table that rules it). It traced the callers first and declined: `oactl thresholds apply`
is a **live** INSERT caller and opens its pool with `OBSERVATION_DATABASE_URL` — the same
principal the daemon runs as. Revoking would have broken a real operator command; adding a
test asserting the grant still exists would have enshrined the hole. Closing it properly needs
a SECOND principal (an operator role distinct from the daemon role) plus credential wiring in
`apps/observation-agent` and `deploy/` — a DEPLOY1 item, listed there now. The loopback pin
from `54dcc6d4` devalues the grant in the meantime: a poisoned threshold can no longer send
the Hatchet token anywhere off-box.

### Still open

- **S2** — DL1-F2 (no admission on support reads, uncached `/status`, unbounded authenticated
  session-create), DL1-F7 (anonymous model-budget starvation; anonymous mutating support POSTs
  need no Origin), DL2-F3, DL2-F4, DL2-F7, DL5-F3, DL7-F7.
- **UI2** — DL3-F4, DL3-F6, DL3-F7 (in flight).
- **RUN1** — DL4-F4 and the V-11 handoffs, pending V's ruling.
- **DEPLOY1** — the VPS kit refresh, DL5-F7, DL7-F6, DL2-F5, and now DL7-F9's second principal.
- **Owner decisions** — V-26, V-28, V-29, V-30 (and the original V-1…V-25).
- **Deferred** — DL2-F8, DL5-F8, DL5-F10, DL6-F6, DL6-F7, DL6-F10, DL7-F10, DL7-F12; the
  `support.message`/`case_message` row guards and DL5-F6 are named in delta-L5's own
  "left to a later package" list.
