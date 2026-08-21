# PLAN REVIEW — G3 rework-2 (same session)

```yaml
state:
  ticket: G3-DOCKER-GROK
  mission: 2026-08-21-docker-hatchet
  risk_tier: high
  planning_tier: 2
  status: waiting_hermes
  owner: { agent: grok-4.6, session: 01a023d9-93d0-71d0-a5dd-e04a280efc85 }
  loop: architecture
  stage: G3
  rework_round: 2
  comments_read_through: intake
  human_review: yes
```

- **Reviewed artifact:** current `docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md` (C2 rework-2, session `353f7aa5-5955-4e9b-8601-812810039d2b`). Plan.md was not edited by this seat.
- **This seat:** same Grok session `01a023d9-93d0-71d0-a5dd-e04a280efc85` that filed F-1…F-7. Not the orchestrator. Never `--fork-session`.
- **This round:** confirm F-1…F-7 stay flipped on C2-rework-2. Not a new five-lens first pass. Parallel-lens remaining items are not adopted as F-n unless they regress one.
- **Blindness:** the parallel H2 review artifact, H2 ticket files, and sibling rework packets were not opened or used as sources. Plan.md’s `H2-nn` labels are quoted only as C2 text.

## Verdict

**PEER REVIEW APPROVED**

Each of F-1…F-7 was reproduced against current Plan.md. No rework-2 clause undoes an original flip condition.

---

## F-1 · architecture · scheduler vs MB-1/MB-3

**Status: FLIPPED**

**Original flip.** `scheduler` out of the MB-1/MB-3 required-set (D6 receipt-only), **or** long-running with contract-exercising healthchecks, **or** MB-11 disclosure with a named V owner.

**Current Plan.md (quoted):**

> `| \`scheduler\` | **one-shot invocation unit** | **no — AR-15** | three profiled one-shot services, one credential each (§3.5). Completion, not health, is its falsifiable criterion (§2.7.2). Bounded exception owned by **V-11**. |` (§1.1)

> `**AR-15 — \`scheduler\` is a one-shot invocation unit and is not in the MB-1/MB-3 required set.**` / `They are not started by the required-bar \`up\`, they are not expected to report \`healthy\`, and they are **removed from the "every required service is healthy" quantifier**.` (§2.7.2)

> `6. **NEW — \`scheduler\` is not a healthy-\`up\` service in this deployment.**` / `The exception's owner is **V-11**.` (§1.4 item 6)

Rework-2 added exact completion commands in §2.7.2; the ruling that scheduler is outside the quantifier is unchanged. No regression.

---

## F-2 · architecture · AR-2 same-project takeover

**Status: FLIPPED**

**Original flip.** Distinct Compose project (explicit volume owner), **or** sequenced freeze `down` without `-v`, **or** one desired-state `-f` chain as primary.

**Current Plan.md (quoted):**

> `**AR-2 — the mission owns its own Compose project, its own Postgres, and its own volume; it never addresses, reconciles or stops any object it does not own.**` (§1.3)

> `| Compose project | **this mission** | \`docker-hatchet\` … |` / `| \`postgres\` container + volume | this mission | … Compose realizes as \`docker-hatchet_postgres-data\` — **distinct from** \`debateai-v3_postgres-data\` |` (§1.3)

> `**Every mission command is scoped to \`-p docker-hatchet\`.**` (AR-2a clause 4)

C2-rework-2 left AR-2 / AR-2a / §2.8 untouched. Shared-project takeover remains unreachable.

---

## F-3 · architecture · U-2 has no lawful repair

**Status: FLIPPED**

**Original flip.** Idempotent always-run SQL under `deploy/` that does not edit the hashed init file, **or** `BLOCKED` + V-packet, **or** first-boot-only acknowledgement.

**Current Plan.md (quoted):**

> `**AR-17 — the co-tenant database and the four principals are created by idempotent, always-run SQL one-shots that this mission owns.**` (§3.5)

> `*Ruled:* \`deploy/sql/ensure-hatchet-db.sql\` and \`deploy/sql/ensure-principals.sql\` are **idempotent and run on every \`up\`**…` / `**\`deploy/postgres/init-hatchet.sql\` is never used and never edited.**` / `**Not depending on it is the repair.**` (§3.5)

Rework-2 added authorization (V-14) for those SQL operations; the repair mechanism is unchanged. No regression.

---

## F-4 · requirements-trace · MB-3 named only for postgres and runner

**Status: FLIPPED**

**Original flip.** Name an in-container contract-exercising check for each remaining required service (api: a real front-door route; dispatcher: engine readiness; web: published start script), or remove from the MB-3 set. U-8-style blocker if no lawful signal.

**Current Plan.md (quoted):**

> `| \`api\` | \`CMD-SHELL node -e "fetch('http://127.0.0.1:'+process.env.API_PORT+'/v1/session',{headers:{'x-user-dev-token':'healthcheck'}})…\` | routing, the \`preHandler\` auth gate… **Must not be \`/v1/auth/*\`** |` (§2.7.1)

> `| \`web\` | \`CMD-SHELL node -e "fetch('http://127.0.0.1:'+process.env.WEB_PORT+'/')…\` | the Next server actually **serving** the root page, not a port being bound. |` (§2.7.1)

> `| dispatcher | the exact command **D3a records** in \`deploy/VENDOR-SURFACES.md\` §E, asserting engine readiness… | … | **D3a**, hard predecessor — **U-11** |` (§2.7.1)

> `**Consequence of \`ABSENT\`…** §W ⇒ \`runner\` has no lawful healthcheck and **MB-3 is unmeetable for it — report a blocker (U-8)**; §E ⇒ same for the dispatcher (U-11)` (AR-21)

> `| MB-3 … | **§2.7.1 — one named contract per required unit** (\`postgres\`, \`api\`, \`runner\`, dispatcher, \`web\`) … blockers for \`runner\`/dispatcher if no lawful signal (U-8/U-11) |` (§8.1)

Rework-2 made postgres/api/web probes exact commands rather than classes. That strengthens F-4; it does not put scheduler back into MB-3 or drop a unit. No regression.

---

## F-5 · requirements-trace · V-2 designed-through in the DAG

**Status: FLIPPED**

**Original flip.** Named production-target slice gated on V-2(b)/(c) (static resolved topology, not a live deploy), **or** state that (b)/(c) is C2 rework.

**Current Plan.md (quoted):**

> `#### DP — production-target static-config slice (F-5)` / `- **Entry:** **V-2(b) or V-2(c) only.** Under **V-2(a)** this slice is **not built** and becomes the named successor mission;` / `- **Delivers:** a **static, resolved-configuration proof** — explicitly **not** a live Hetzner/Cloudflare deployment` (§4.2)

> `| \`deploy/compose/prod/00-prod.yaml\`, \`deploy/PRODUCTION-TARGET.md\` | DP | — |` (§4.3)

Rework-2 gave DP owned files and a writer. Gating on V-2(b)/(c) is unchanged. No regression.

---

## F-6 · freeze · runtime takeover of the live security store

**Status: FLIPPED**

**Original flip.** F-2’s distinct-project (or equivalent), plus an explicit freeze sentence: lifecycle commands MUST NOT stop/recreate/re-spec another project’s postgres, or `BLOCKED`.

**Current Plan.md (quoted):**

> `> **FREEZE — file *and* runtime.**` (banner)

> `3. **Stop condition — post \`BLOCKED\` and escalate, do not proceed:** any project other than \`docker-hatchet\` owns a Postgres container or a volume derived from this repo; or a \`debateai-v3\` project exists in any state; …` (AR-2a)

> `**Freeze sentence, stated so a coding seat cannot miss it:** *this mission's lifecycle commands MUST NOT stop, recreate, re-spec, relabel or orphan any container, network or volume owned by another Compose project. If the probe finds one, the ticket posts \`BLOCKED\` and escalates — it does not proceed, and it does not "just use a different name".*` (§1.3)

C2-rework-2 left this clause untouched. No regression.

---

## F-7 · one-writer-per-file · three hashed files in no path class

**Status: FLIPPED**

**Original flip.** Classify: `.env.compose` = generated output (rewrite allowed, new hash recorded, secret-free); `register.bootstrap.json` = MAY EXTEND additive only if V-5(a), else MUST NOT TOUCH; `init-hatchet.sql` = MUST NOT TOUCH (F-3 repair must not edit it).

**Current Plan.md (quoted):**

> `| \`deploy/postgres/init-hatchet.sql\` | \`69b5b4240895ee85\` | 2026-08-07T23:49:18 | **MUST NOT TOUCH** (unused — AR-17) |` (§3.2)

> `| \`.env.compose\` | \`f6bf431d145b821c\` | 2026-08-07T23:57:16 | **GENERATED OUTPUT** |` (§3.2)

> `| \`register.bootstrap.json\` | \`83ce70a26c1495d7\` | 2026-08-07T23:57:07 | **MAY EXTEND** iff V-5(a) / V-12; else **MUST NOT TOUCH** |` (§3.2)

> `| \`.env.compose\` | the **output** of \`pnpm compose:env\`. … stays **derived and secret-free**; its new hash is recorded on completion. **Never hand-edited.** |` (§3.1)

Rework-2 changed path-manifest writer rules; the three classifications are unchanged. No regression.

---

## Residuals (not reopenings)

- Rework-2 exactness/authorization work (health `CMD-SHELL`, D3a vendor surfaces, V-14/V-15/V-16, DP owned files) does not unwind F-1…F-7.
- AC-02 host-wide vs deployment-scoped remains a reading routed to V-2(d).
- This seat does not adopt remaining parallel-lens items as F-n.

---

```
WORKER CLAIM:
- ticket: G3-DOCKER-GROK
- owner CLI session: 01a023d9-93d0-71d0-a5dd-e04a280efc85
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-docker-hatchet / G3-rework-2
- owner CLI session: 01a023d9-93d0-71d0-a5dd-e04a280efc85
- artifact path: docs/missions/2026-08-21-docker-hatchet/architecture/PlanReview.md
- verdict: PEER REVIEW APPROVED
- comments read through: intake
```
