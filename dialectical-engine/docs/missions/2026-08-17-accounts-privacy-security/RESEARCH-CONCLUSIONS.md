# Research Conclusions — Adversarial Review of Waves 2, 3 and 4

**Produced:** 2026-08-19 · **Method:** three blind seats, each instructed to **refute, not confirm**, each blind to the others. Divergence is signal; convergence is evidence.
**Assets:** `research/RA-crypto-shredding-redteam.md` · `research/RB-retrofit-claim-verification.md` · `research/RC-parallelism-ceiling-verification.md`

> **Why this document exists.** V asked whether each wave had both a research conclusion and an architecture conclusion. It did not. Wave 1 had five independent sweeps; Waves 2–4 had conclusions authored by a single mind (the orchestrator) and **never independently checked** — on a mission carrying `risk_tier: high`. The diamond discipline applied to every coding ticket in this project had been applied to everything except the architecture. This closes that gap.

---

## 1. Verdicts

| Wave | Claim under attack | Verdict |
|---|---|---|
| **W2** | Crypto-shredding satisfies Art. 17 while honouring DR-188 | **WOUNDED** — right choice, wrong *placement*. 3 BLOCKING changes |
| **W3** | Encryption cannot be retrofitted into append-only tables | **TRUE, FOR THE WRONG REASONS** — conclusion stands on stronger ground; stated mechanism was refutable |
| **W4** | True parallelism is capped at 3 lanes | **TOO OPTIMISTIC** — unreachable as specified; 3 unlisted serializers |

**Nothing was confirmed as written.** Every wave took damage. The core direction of each survived.

---

## 2. Convergence — the strongest signal produced

**Two seats, blind to each other, independently found the same defect:** encrypting question text **silently breaks equality-matching lookups**. R-B found it in `packages/memory/src/index.ts:299` (cross-run question matching); R-C found it in **both** memory (`:285-296`) **and** `packages/liveness/src/index.ts:121-127` (`WHERE question_line = $1 AND asker_id = $2`).

Neither slice in Wave 3 accounted for it. Under randomized encryption these predicates never match, so **memory linking, pull records, candidate matching and liveness queries all stop working — with green tests**, because no test asserts a *positive* cross-run match. The plan solved exactly this problem for email (a blind index) and missed the recurrence.

Independent discovery by different routes is the highest-confidence finding in this review.

---

## 3. Wave 2 — research conclusion (from R-A)

**Verdict: WOUNDED. Direction correct; three BLOCKING defects.**

**The headline defect: the shred point is inside the thing that is never deleted.** `identity.user_data_key` lives in the same Postgres cluster that §19 backs up and that **DR-188(3) declares permanent**. §19's *"backups contain ciphertext only"* is **false** — a datadir copy holds the wrapped DEK **and** the ciphertext, i.e. both halves the design keeps apart travel together. Destroying a live row while fifteen immortal archives hold copies is **erasure-shaped, not erasure**; KEK + any archive reverses every past shred, and DR-188 guarantees the archives exist.

**BLOCKING:**
1. **Move the shred point out of the archived cluster** (wrapped DEKs into the secret store).
2. **Add per-debate and per-publication keys** — §9.3 rejected per-debate keys while §11/§15 *promise* per-debate deletion, which a flat per-user DEK makes **unimplementable**, contradicting V's Q12 ruling. Three levels (`KEK → user DEK → per-debate key`) gets the granularity *and* keeps "delete everything" atomic.
3. **Isolate the KEK from LLM subprocess reach** — today the API's UID reads the KEK file and the relays run as that same UID; Wave 1 S5 makes injection-plus-file-read a live path, not a hypothetical.

**Also FAILING (not merely wounded): the publication design.** "Re-encrypted at publication" is impossible in append-only tables — only **dual-write** is buildable. **Unpublish-then-delete cannot ever work** under a shared corpus key (removing one debate would require destroying the key for the entire public corpus). And **third-party personal data in a published debate is unerasable by anyone**: no key to destroy short of the corpus, no row to delete, no owner left to ask. Per-publication keys repair all three.

**"The author link is severed" is false.** `core.run.owner_user_id` is plaintext C4 in an append-only table — the whole public corpus stays partitionable by author after deletion. The audit chain forces a choice the design hasn't made: tamper-evidence *or* severance, not both.

**Legal, with primary sources actually fetched:** EDPB Guidelines 01/2025 ¶22 — *key destruction does not automatically confer anonymity*; ¶21 — *publicly accessible sources count in the effectiveness assessment*; CJEU C-413/23 P — *identifiability assessed from the controller's viewpoint* (helps and hurts). **And a trap caught before it entered our counsel list:** the widely repeated claim that EDPB Guidelines 5/2019 endorses crypto-shredding is **false** — that document is about search-engine delisting and never mentions key destruction. EUR-Lex, ICO, AEPD and EDPS were unreachable; all GDPR quotes are mirror-sourced and marked one step short of primary.

**The premise itself was overstated.** "DR-188 forbids deletion" conflates V's ruling with an engineering trigger — per our *own* S2 research, DR-188 governs **migrations and datadirs, not rows**. The recommended shape is a **hybrid**: real DELETE for identity data (the `identity` schema is already mutable — encrypting deletable data buys nothing), crypto-shredding **only** for debate content (where Wave 1 H4 proves separation is impossible, because the corpus literally contains verbatim echoes of the question), and the shred point outside the archived cluster.

**The objection that survives every fix:** crypto-shredding converts a *legal* risk into an *operational* one, at n=1. Deletion is verifiable by anyone; crypto-shredding is verifiable only by whoever holds the key — and no test can prove that no reachable copy of the wrapped DEK exists anywhere, in a system whose founding law makes archives permanent.

---

## 4. Wave 3 — research conclusion (from R-B)

**Verdict: TRUE BUT FOR THE WRONG REASONS. The phase reorder stands, on firmer ground.**

**The stated mechanism was refutable — using a script in this repo.** Wave 3 §0 said *"there is no UPDATE to rewrite it with."* False: **six** retrofit paths exist, and one is a committed, already-executed script (`logs/rebaseline-serve-hash.mts:19`) that does `DISABLE TRIGGER → UPDATE → ENABLE` against a **protected** table under DR-187. Another (`ALTER COLUMN … TYPE … USING`) bypasses the trigger entirely, because table rewrites don't fire DML triggers — and the plan never considered it.

**The real reason is stronger and unfalsifiable:** Postgres never overwrites. MVCC leaves the pre-image in dead tuples; WAL keeps full-page images; and **DR-188(3) makes the plaintext backups legally undeletable**. Empirically confirmed during the review: `strings` over the live datadir found **1,450 natural-language strings and 18 recognisable debate questions**; the **WAL** yielded 837 more; the archived corpus and a backup yielded more still. **No retrofit produces erasure without violating DR-188.** §0's option 3 should be struck, not deprecated.

**Three slices are impossible as written.** S7 (assign ownership), S8 (publish/unpublish), S9 (claim legacy runs) all specify `UPDATE core.run` — the **first** table in the protection loop. The plan's own §0 argument condemns the plan's own slices. They need append-only event tables with latest-wins projections (the codebase's existing pattern) or mutable side tables in `identity`.

**Also:** the arithmetic (77/79) is exactly right, though the attachment sites span 16 migrations not 15; an 80th table (`public.debateai_schema_migration`) exists outside the migration files; **TRUNCATE is not blocked anywhere**; the REVOKE grants are **inert** because every least-privilege role is `NOLOGIN` and the app connects as bootstrap superuser. Unowned work: rate limiting (in test bullets, in no deliverable — **nobody builds it**), KEK rotation, legacy-plaintext marking, secret scanning. S4's operator-passkey line contradicts the Phase 2 charter. S6 should split; its declared dependencies are wrong (needs S5/S7, or a per-run DEK — which is R-A's finding arriving from the other direction).

---

## 5. Wave 4 — research conclusion (from R-C)

**Verdict: TOO OPTIMISTIC. The 3-lane ceiling is unreachable as specified — and simultaneously too pessimistic about depth.**

**A load-bearing factual error:** `apps/api/src/index.ts` is **638 lines, not 311**. The document described only `buildApi` and missed `PostgresAskApplication` (`:408-638`) — which is exactly where five of S6's eleven content carriers are written. **So S6 *does* edit the chokepoint file**, invalidating the one claimed "genuine parallel win" and the schedule's step 4.

**Three serializers were absent from the matrix, two of which conflict silently:**
1. **Migration numbering** — discovery is `readdir().sort()` with no manifest, so two lanes claiming `0031` produce **no git conflict**, just wrong apply order; the applied-set is keyed on filename, so renumbering re-runs migrations. **The failure mode is already live: two different `0025_` migrations exist in the tree.** Wave 4's "migrations → no contention" was its most dangerous sentence.
2. **`tests/architecture/scaffold.test.ts:23`** hard-codes `edgeRowsChecked === 27`; creating `packages/crypto` makes it 28 — **every lane's test suite goes red** until one lane lands a one-line change.
3. **`acceptance/seed-register.ts:298-323`** throws `ACCEPTANCE_REGISTER_VERSION_CONFLICT` the moment any lane adds a register row — **shared database state; worktree isolation does not help.**

**Missing from the matrix entirely:** `packages/liveness` and `packages/evidence` (both S6 carriers; liveness is a *functional* break), and **`web/`** — which holds **byte-identical duplicates** of the two vulnerabilities S5 exists to remove, in a live workspace member whose proxy test is live while `apps/ui`'s is disabled. Fixing only `apps/ui` ships the hole.

**Too pessimistic on depth:** the 8-deep critical path is a *slicing artifact*, not a codebase property. `S4→S5` isn't a real edge (sessions need users, not factors — split the MFA challenge into S5b) → depth 7; `S5→S7` is questionable by Wave 3's own rollback note → depth 6. The **instantaneous** ceiling is **5–6 lanes**, not 3, once S6 is split by package and a UI lane runs against contract schemas. **The binding constraint is not a lane count — it is that three unlisted files must be edited by one lane, first, alone.**

**S0 as specified should not be taken.** It fixes the three *cheap* conflicts (pure appends) and **doubles** the touched-file count for the three expensive ones (S5/S7/S9 rewrite one idiom at 15 sites — splitting into five modules means editing all five). **Replacement, S0′:** land the deny-by-default `preHandler` **first**, collapsing 15 auth sites to 1 under existing semantics; land `packages/crypto` + its edge row + the scaffold count as a standalone commit; establish a migration-number allocator; establish a register-row freeze window.

**Phase 4 is *mostly*, not *fully*, independent** — it needs `vitest.config.ts:14` (claimed by Phase-1 infra), and once the acceptance suite joins the default run, **S9's dev-token removal breaks the default test run on both boards simultaneously.**

---

## 6. What happens to the wave documents

Waves 2, 3 and 4 are **amended, not defended**. Each now carries a correction notice at the top pointing here, and the specific corrections are listed in `AMENDMENTS.md`. The amended positions — not the original text — are what the coding loop builds from.

**Nothing in this review changes V's rulings.** Private-by-default, public-forever/private-per-account, WhatsApp-as-recovery-channel, 18+, prohibit-personal-data-in-questions, build-into-API auth, Hetzner+Cloudflare: all stand. What changed is *how* the architecture must deliver them.
