import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { TRUST_WORDS, type TrustCounts, type TrustWord } from "@/lib/v4/types";

/*
 * V4 initial (2026-10-28): the four-shade bar (row D decision 2). Sure = solid ink, Sure for the case named = a softer
 * ink, Still argued = gold hatching, Didn't hold = an outline only. Points no second AI checked stay out of the bar
 * (decision 6); they are only named in words.
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

export function V4TrustBar(props: Readonly<{
  counts: TrustCounts;
  unchecked?: number;
  catalog: MessageCatalog;
  size?: "small" | "large";
  showCounts?: boolean;
}>) {
  const { counts, catalog } = props;
  const unchecked = props.unchecked ?? 0;
  const size = props.size ?? "small";
  const total = TRUST_WORDS.reduce((sum, word) => sum + counts[word], 0);
  const words = [...trustCountWords(counts, catalog)];
  if (unchecked > 0) words.push(t(catalog, "v4.bar.unchecked", { count: unchecked }));
  const label = t(catalog, "v4.bar.label", { counts: words.join(", ") });
  return (
    <span className={`v4Bar ${size === "large" ? "v4BarLarge" : "v4BarSmall"}`}>
      <span className={total === 0 ? "v4BarTrack v4BarEmpty" : "v4BarTrack"} role="img" aria-label={label}>
        {TRUST_WORDS.filter((word) => counts[word] > 0).map((word) => (
          <span key={word} className={`v4BarSeg ${SEGMENT_CLASS[word]}`} style={{ flexGrow: counts[word] }} />
        ))}
      </span>
      {props.showCounts === true
        ? <span className="v4BarCounts" aria-hidden="true">{words.join(" · ")}</span>
        : null}
    </span>
  );
}
