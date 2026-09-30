# Owner sign-off — the support catalogue with the seven legal pages (SIGNED 2026-09-29)

**Status: SIGNED by the owner on 2026-09-29.** V read the seven entries below (route, English and
Romanian label) in chat and answered "Signed" to fingerprint `ffd72986…`. The manifest's `catalog`
record now points at this file; the two test pins are updated (checklist below).

**Why a signature is needed:** Turn 15 adds seven page routes (the six legal documents, then the
legal notice at `/legal`, added 2026-09-29). The route-coverage test
(`tests/architecture/support-catalog-coverage.test.ts`) requires every page to be a catalogue
capability, so the catalogue's bytes change. The API loads the help corpus at boot with
`requireReviewedRecovery: true` (`apps/api/src/main.ts`), and with the old signature no longer
matching, the corpus admits no article and the load refuses (`SUPPORT_KB_RECOVERY_COMPONENT_INVALID`).
**Until this is signed, the API on this branch does not start.** No agent may sign in V's place.

**What changes in the catalogue (nothing else does):** seven capabilities, each `audience: "any"`,
`availability: "public"`, `disposition: "action"`, **no actions** (the assistant can name the page,
never act through it), backed by the existing `privacy-consent` article pair (no new article text).

| id | route | English label | Romanian label |
|---|---|---|---|
| legal-notice | /legal | Legal notice and company details | Informații legale și datele companiei |
| legal-terms | /terms | Terms of service | Termeni și condiții |
| legal-terms-versions | /terms/versions | Earlier versions of the terms | Versiunile anterioare ale termenilor |
| legal-privacy | /privacy | Privacy policy | Politica de confidențialitate |
| legal-health-data | /privacy/us-health-data | US consumer health data privacy policy | Politica privind datele de sănătate ale consumatorilor din SUA |
| legal-cookies | /cookies | Cookie policy | Politica privind cookie-urile |
| legal-providers | /providers | AI model providers | Furnizorii de modele AI |

Search terms (en / ro) are in `packages/support-kb/src/catalog.ts` next to each entry.

| Record | sha256 |
|---|---|
| The support catalogue before (signed 2026-09-24) | `ebf458f1cceb6aa5681534a391f239466f92d68680e21af448bd4b7225436032` |
| The support catalogue after (to be signed) | `ffd729867aa1ed250d142f1a82aee386f493a56a224193adf387c231da111854` |
| Superseded, never signed (six pages, before the legal notice) | `b018085009479b7f172818b7e30d24d3aa529a97a41a9de55403e8adc218c8c5` |

**Who / when:** V (OWNER), 2026-09-29, in session `d65424e5-27a7-40b7-8a4c-773e60cb404f`
(the legal-notice session), answering "Signed" to the question listing the seven entries and the
fingerprint, before the push of `feat/legal-pages` to `origin/dev`. Applied by the coordinator:
manifest `catalog` record, `CATALOG_REVIEW` in `tests/unit/support-recovery-attestation.test.ts`,
`corpus.kbVersion` = `3ba3bdb5bf4359a412b50054dfd50ae0ed816f492e29656e9bd39ef7726ef881` in
`tests/unit/support-context.test.ts`. After it: `tests/unit/support-*.test.ts` + the coverage test
1721/1721, and the API's boot-time `loadHelpCorpus(..., { requireReviewedRecovery: true })` loads
(46 entries).

## Applying the signature (coordinator checklist, after V answers)

1. `packages/support-kb/reviews/manifest.json` → `catalog`: `sha256` = the "after" digest above,
   `reviewedBy: "OWNER"`, `reviewerSession` = the session where V answered, `reviewedOn` /
   `ratifiedOn` = that date, `ratifiedBy: "V"`, `evidence` = this file's path.
2. The two pins that bind the signed catalogue:
   - `tests/unit/support-recovery-attestation.test.ts` — the expected `catalog` record;
   - `tests/unit/support-context.test.ts:112` — `corpus.kbVersion` (recompute after step 1; it
     binds the manifest's catalogue record, so it is only known once the record is written).
3. Fill in "Who / when" above, then run `tests/unit/support-*.test.ts` and boot the API.

**Measured on 2026-09-29 (temporary local swap of the digest, reverted byte-for-byte):** with the
new digest in the manifest, 139 of the 142 support failures clear; the remaining three are exactly
the pins in step 2 plus the label count, which this branch already moved from 62 to 74 (six
capabilities × en/ro, all passing the neutral-framing check). The legal notice moved it to 76.
The "after" digest is `sha256(SUPPORT_CATALOG_CANONICAL)` from `packages/support-kb/src/catalog.ts`,
recomputed after the seventh entry; the six-page digest above it is superseded and must not be signed.
