# Owner sign-off — the support catalogue with the six legal pages (DRAFT, NOT SIGNED)

**Status: awaiting the owner.** Nothing in `packages/support-kb/reviews/manifest.json` points at
this file yet. It becomes the record only after V reads the entries below in chat and answers
"signed"; the coordinator then fills in the session line and updates the manifest's `catalog`
record (`sha256`, `reviewedBy: "OWNER"`, `reviewerSession`, `reviewedOn`, `evidence` = this
file, `ratifiedBy: "V"`, `ratifiedOn`).

**Why a signature is needed:** Turn 15 adds six page routes. The route-coverage test
(`tests/architecture/support-catalog-coverage.test.ts`) requires every page to be a catalogue
capability, so the catalogue's bytes change. The API loads the help corpus at boot with
`requireReviewedRecovery: true` (`apps/api/src/main.ts`), and with the old signature no longer
matching, the corpus admits no article and the load refuses (`SUPPORT_KB_RECOVERY_COMPONENT_INVALID`).
**Until this is signed, the API on this branch does not start.** No agent may sign in V's place.

**What changes in the catalogue (nothing else does):** six capabilities, each `audience: "any"`,
`availability: "public"`, `disposition: "action"`, **no actions** (the assistant can name the page,
never act through it), backed by the existing `privacy-consent` article pair (no new article text).

| id | route | English label | Romanian label |
|---|---|---|---|
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
| The support catalogue after (to be signed) | `b018085009479b7f172818b7e30d24d3aa529a97a41a9de55403e8adc218c8c5` |

**Who / when:** _(filled in after V answers)_

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
capabilities × en/ro, all passing the neutral-framing check).
