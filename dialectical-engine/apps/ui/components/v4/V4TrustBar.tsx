import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { howSureKeys } from "@/lib/v4/mapLooks";
import { TRUST_WORDS, type TrustCounts, type TrustWord } from "@/lib/v4/types";

/*
 * V4 initial (2026-10-28): the four-shade bar (row D decision 2). Sure = solid ink, Sure for the case named = a softer
 * ink, Still argued = gold hatching, Didn't hold = an outline only. Points no second AI checked stay out of the bar
 * (decision 6); they are only named in words.
 * V4 screen review (3 Nov): map-f28 drops the number captions ("3 sure · 6 sure for the case named · …"): the bar's words
 * are map-f8's "How sure" sentence, built only from the trust words. dig-d4 B: every word keeps its slot (an empty one
 * has no width), so when a dig moves the shares the bar on a map card slides to the new ones (v4-map-looks.css).
 * V4 start step, Task 61: a chosen path's bar also says its one trust word ("How sure: Sure"), worked out from its points.
 */

const SEGMENT_CLASS: Readonly<Record<TrustWord, string>> = {
  SURE: "v4BarSure",
  SURE_FOR_CASE: "v4BarCase",
  STILL_ARGUED: "v4BarArgued",
  DIDNT_HOLD: "v4BarFell"
};

/** "2 sure · 4 sure for the case named": only the words that have points; the "nothing checked" line when none do. */
export function trustCountWords(counts: TrustCounts, catalog: MessageCatalog): readonly string[] {
  const words = TRUST_WORDS.filter((word) => counts[word] > 0).map((word) =>
    t(catalog, `v4.trustCount.${word}`, { count: counts[word] })
  );
  return words.length > 0 ? words : [t(catalog, "v4.trustCount.none")];
}

/** map-f8: the "How sure" sentence for these counts (no numbers), with the unchecked line when some were not checked. */
export function howSureSentence(counts: TrustCounts, catalog: MessageCatalog, unchecked = 0): string {
  return howSureKeys(counts, unchecked).map((key) => t(catalog, key)).join(" ");
}

export function V4TrustBar(props: Readonly<{
  counts: TrustCounts;
  unchecked?: number;
  catalog: MessageCatalog;
  size?: "small" | "large";
  /** Shows the bar's words under it: "How sure: …" (map-f8; never a count, map-f28). */
  showCounts?: boolean;
  /** Task 61: a chosen path's one trust word, said with the bar ("How sure: Sure"); absent or null: none. */
  word?: TrustWord | null;
}>) {
  const { counts, catalog } = props;
  const unchecked = props.unchecked ?? 0;
  const size = props.size ?? "small";
  const total = TRUST_WORDS.reduce((sum, word) => sum + counts[word], 0);
  const sentence = howSureSentence(counts, catalog, unchecked);
  const word = props.word ?? null;
  const said = t(catalog, "v4.bar.label", { counts: sentence });
  const label = word === null ? said : `${said} ${t(catalog, "v4.paths.trustWord", { word: t(catalog, `v4.trust.${word}`) })}`;
  return (
    <span className={`v4Bar ${size === "large" ? "v4BarLarge" : "v4BarSmall"}`}>
      <span className={total === 0 ? "v4BarTrack v4BarEmpty" : "v4BarTrack"} role="img" aria-label={label}>
        {TRUST_WORDS.map((word) => (
          <span
            key={word}
            className={counts[word] > 0 ? `v4BarSeg ${SEGMENT_CLASS[word]}` : "v4BarSlot"}
            style={{ flexGrow: counts[word] }}
          />
        ))}
      </span>
      {props.showCounts === true
        ? <span className="v4BarCounts" aria-hidden="true">{t(catalog, "v4.panel.confidence")} {sentence}</span>
        : null}
    </span>
  );
}
