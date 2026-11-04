import { t, type MessageCatalog } from "@/lib/i18n/translate";

/*
 * Owner pick ask-d1 D (3 Nov 2026), the "seed of the map", for first visits only (no debate in the account yet, or not
 * signed in): one solid card labelled "Your question" that mirrors the words as they are typed, three faint dashed cards
 * below it, each holding a star and a "?" (ground nobody has looked into yet), and the line "Your map starts here. You'll
 * choose which of these the AIs look into." Nothing moves: the words change at once as they are typed. The picture
 * repeats the box, so screen readers hear only its line.
 */

const OPEN_GROUND = [0, 1, 2] as const;

export function V4MapSeed({ question, catalog }: Readonly<{ question: string; catalog: MessageCatalog }>) {
  const words = question.trim();
  return (
    <figure className="v4Seed">
      <div className="v4SeedPicture" aria-hidden="true">
        <div className="v4SeedRoot">
          <span className="v4Eyebrow v4SeedLabel">{t(catalog, "v4.ask.seed.question")}</span>
          {words.length === 0 ? <span className="v4SeedWords v4SeedWordsEmpty" /> : <span className="v4SeedWords" dir="auto">{words}</span>}
        </div>
        <div className="v4SeedBranches">
          {OPEN_GROUND.map((at) => (
            <span key={at} className="v4SeedOpen">
              <span className="v4SeedStar">★</span>
              <span className="v4SeedAsk">?</span>
            </span>
          ))}
        </div>
      </div>
      <figcaption className="v4SeedCaption v4Muted">{t(catalog, "v4.ask.seed.caption")}</figcaption>
    </figure>
  );
}
