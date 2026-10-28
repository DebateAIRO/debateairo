# Terms of Service v2.7 — ownership of the charts we generate (2026-10-28)

**Status: applied on `feature/verdict-pdf-charts`, in all 35 drafts, as section 8's paragraph after "Outputs." Not
merged or published. Released as the Perplexity paragraph was (Terms 2.5): effective date unchanged, re-acceptance
floors unchanged, so nobody is asked to accept again; the paragraph grants users a licence and takes nothing they had.
Before merge: counsel reads the English and Romanian, and the owner confirms that route or raises the TERMS floor to
2.7 (step 2 below). The translations want a native-speaker read, as every release's do.**

The owner decided (2026-10-28) that DMS Merchandise Shop SRL takes ownership of the charts and statistics it generates
for debate reports (design: `docs/superpowers/specs/2026-10-28-verdict-pdf-charts-design.md`). Every chart already
prints "Copyrighted by DMS Merchandise Shop SRL" under it. The Terms must say so, without contradicting what they already
promise about outputs.

## Why this is a release, not an edit

- Section 8 today says: "you may use the output of your own debates for any lawful purpose, and we do not claim
  ownership of generated text." The new clause must sit beside that promise, not take it back.
- Section 14 says a change that reduces a user's rights ("new uses of your content" among them) needs **express
  acceptance at next sign-in**; any other change needs the new version posted with a summary and **emailed at least
  30 days before it takes effect**. Claiming ownership of something drawn from the user's debate is safest treated as
  the first kind, or written so that it takes nothing away (the licence below is meant to do that).
- All 35 language versions move together: `tests/unit/legal-manifest.test.ts` pins one Terms version for every locale,
  the consent manifest records each file's sha256, and the archive keeps 2.6.
- Purely AI-generated material may have no copyright in Romania or the EU (Law 8/1996 protects human authorship; CJEU:
  "the author's own intellectual creation"). The clause claims what the company can own: the selection, arrangement,
  design and drawing of the charts, and the statistics as compiled; it does not claim the user's figures or text.

## The clause (English, section 8, right after "Outputs.")

> **Charts and statistics we generate.** The charts in a debate report, and the statistics we compile for them — their
> selection, arrangement, design and drawing — are made by Dialectical Engine and belong to DMS Merchandise Shop S.R.L.;
> each chart is marked "Copyrighted by DMS Merchandise Shop SRL". This does not extend to the figures a chart shows,
> which come from your debate, or to the text of your debate. We grant you a free, worldwide, non-exclusive and
> perpetual licence to use, copy and share those charts for any lawful purpose, provided you keep the notice and the
> AI-generated label with them. Where the law does not recognise rights in AI-generated material, this clause gives us
> no more than the law allows.

And in the "Outputs." paragraph, "we do not claim ownership of generated text" becomes "we do not claim ownership of
generated text (charts are covered in the next paragraph)".

## The clause (Romanian, secțiunea 8, imediat după „Rezultate.”)

> **Graficele și statisticile pe care le generăm.** Graficele dintr-un raport de dezbatere și statisticile pe care le
> compilăm pentru ele — selecția, aranjarea, designul și desenarea lor — sunt realizate de Dialectical Engine și aparțin
> DMS Merchandise Shop S.R.L.; fiecare grafic poartă mențiunea „Copyrighted by DMS Merchandise Shop SRL”. Acest lucru nu
> se extinde asupra cifrelor pe care le arată un grafic, care provin din dezbaterea dumneavoastră, și nici asupra
> textului dezbaterii. Vă acordăm o licență gratuită, mondială, neexclusivă și perpetuă de a folosi, copia și distribui
> aceste grafice în orice scop legal, cu condiția să păstrați mențiunea și eticheta „generat de AI” alături de ele. Acolo
> unde legea nu recunoaște drepturi asupra materialelor generate de AI, această clauză nu ne conferă mai mult decât
> permite legea.

## Release steps (when the owner says go)

1. Counsel reviews the English and Romanian text above.
2. The owner picks the route under section 14: express re-acceptance at next sign-in (raise the TERMS floor to 2.7), or
   a 30-day emailed notice with an effective date.
3. Edit `apps/ui/legal/en/terms-of-service.md` and `apps/ui/legal/ro/terms-of-service.md`: the clause, version 2.7, the
   effective date, the "In short" line if wanted. Translate into the other 33 drafts.
4. `pnpm run generate:legal` (regenerates `apps/ui/lib/termsOfService.ts`, the per-locale modules and the consent
   manifest; the archive keeps 2.6), then add 2.7 to the versions list in `apps/ui/lib/legal/pages.ts`.
5. Update the pinned version in `tests/unit/legal-manifest.test.ts`; run `pnpm run generate:legal:check` and the legal
   tests.
