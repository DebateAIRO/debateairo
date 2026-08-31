# PLAN — T9 Landing page

> Packet REQ-01 binds Requirements to author WHAT-proves clusters here.
> Architecture still owns HOW (modules, token extraction, file surfaces).
> Quantifiability law binds both seats.

**Goal:** Anonymous `/` is the TURN 9 landing (translated app-vocab copy);
signed-in `/` stays library; stub nav; mode toggle; static placeholders;
anonymous `Start a debate` → auth → New debate.

**Spec:** `docs/missions/ui-overhaul/slices/T9/SPEC.md` v2

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW / file
surfaces / exact acceptance commands.

## Quantifiability law

- Every step markable done / not-done with no judgement call.
- Forbidden acceptance words: the vague set banned by `heartbeat-requirements` §4 (do not use those adjectives in acceptance lines).
- Every step names: cluster id · acceptance test · file surface (ARCH fills
  surfaces).
- Every PLAN step traces to a SPEC sentence; every SPEC R has ≥1 step.
- Three-run law on each cluster verification command.
- UNVERIFIED is a valid answer.
- Acceptance cells name literal strings, controls, or measurable markers — never bare `Assert`.

## Clusters (WHAT each proves)

### T9-C1 — Route split: anonymous landing vs signed-in library

**Proves:** R1, R2 — `/` content depends on session presence as V ruled.

| Step | SPEC | WHAT | Acceptance (automatable) |
|---|---|---|---|
| T9-C1-1 | R1 | Logged-out `/` document contains hero headline `Find the weakest claim in your own argument.` | Render/route test: no-session `/` includes that exact string |
| T9-C1-2 | R2 | Signed-in `/` shows library chrome, not landing-only hero | Render/route test: session `/` includes `Your debates` or `+ New debate` AND excludes hero headline `Find the weakest claim in your own argument.` as primary body |

**Cluster verification command (ARCH finalizes):** three runs of the T9 landing
vs library route tests; worst run is verdict.

### T9-C2 — Landing chrome, CTAs, stub nav

**Proves:** R4, R5 — nav labels and CTAs exist; stubs do not hard-crash; anonymous Start path is auth→New debate.

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T9-C2-1 | R4 | Labels `Method`, `Transcripts`, `Pricing` are in the landing document | Assert all three strings present on anonymous `/` |
| T9-C2-2 | R5 | `Start a debate` and `Read a scored transcript` are present | Assert both strings on anonymous `/` |
| T9-C2-3 | R4 | Stub nav click does not hard-crash the document | Interaction test: click each of Method/Transcripts/Pricing; assert document still has `DebateAI` wordmark and no uncaught error boundary |
| T9-C2-4 | R5 | Logged-out `Start a debate` enters auth with return to New debate | Assert CTA target is sign-in or sign-up URL/route that includes a return path resolving to New debate after auth (ARCH documents param name); mutant `href="#"` alone without auth entry = RED |

**Cluster verification command (ARCH finalizes):** three runs of T9 chrome/CTA/stub tests; worst run is verdict.

### T9-C3 — Mode toggle + design tokens applied

**Proves:** R3 — Terracotta ↔ Chamber toggle; named fonts/palette applied to landing surfaces.

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T9-C3-1 | R3 | A mode control exists on landing | Assert toggle control present (role/label ARCH pins) |
| T9-C3-2 | R3 | Activating toggle changes a measurable mode attribute/class/token set between Terracotta and Chamber | Assert before/after mode marker differs |
| T9-C3-3 | R3 | Named tokens are applied on landing surfaces (not orphan CSS) | Assert computed style or data-token on landing root/card uses Fraunces or Plus Jakarta Sans AND a palette value resolving to `#C15F3C` or `#3F7466` or `#E7E2D8`/`#f0eee6` or `#111111` (ARCH-documented aliases OK); orphan `tokens.css` unused by landing = RED |

**Cluster verification command (ARCH finalizes):** three runs of T9 mode/token surface tests; worst run is verdict.

### T9-C4 — Method ledger, sample cards, placeholders

**Proves:** R6, R7, R8 — method 01–04, full R6 card anatomy, static placeholders.

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T9-C4-1 | R7 | Method steps include titles `Models argue`, `They review each other`, `You challenge`, `Verdict with receipts` | Assert all four strings on anonymous `/` |
| T9-C4-2 | R6 | Sample block shows full R6 anatomy on ≥1 card | Assert in landing sample region: stance or type chip (`PRO`/`CON`/`REASONING`), `BASE`, `FINAL`, a model attribution line (e.g. contains `·`), and `REVIEW AGREED BY:` or `REVIEW DISPUTED BY:` — BASE/FINAL alone = RED |
| T9-C4-3 | R8 | Placeholder slots remain static `[PLACEHOLDER]` glyphs this mission | Assert `[PLACEHOLDER] debates argued this week` OR pricing strip still contains literal `[PLACEHOLDER]`; live numeric counter without V DECISIONS closure = RED |
| T9-C4-4 | R7/copy | Binding marketing paragraphs present (translated) | Assert hero body substring `softest point in your reasoning` AND closing `weakest claim` AND `Four steps, then you do it again tomorrow.` |

**Cluster verification command (ARCH finalizes):** three runs of T9 method/sample/placeholder tests; worst run is verdict.

### T9-C5 — Render-pin migration bind

**Proves:** R9 — OLD UI pins for this surface are not the mission bar.

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T9-C5-1 | R9 | ARCH names the `tests/render/**` files that pinned OLD `/` or home chrome for the replaced surface | DECISIONS or PLAN appendix lists those paths under `tests/render/` |
| T9-C5-2 | R9 | Those tests pass against NEW translated landing strings / signed-in split | Three-run vitest on the named files |

**Cluster verification command (ARCH finalizes):** three runs of the named `tests/render/**` files; worst run is verdict.

## Open dependencies

- ARCH documents auth return-path param and contrast threshold pin for R3.
- T3 library markers used in T9-C1-2 must match T3 SPEC copy.
