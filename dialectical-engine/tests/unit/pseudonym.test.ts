import { describe, expect, it } from "vitest";
import {
  generatePseudonym,
  PSEUDONYM_ADJECTIVES,
  PSEUDONYM_NOUNS
} from "../../packages/crypto/src/index.js";

// Two capitalised words, then a two-digit number: letters and digits only.
const PSEUDONYM_SHAPE = /^[A-Z][a-z]{2,8}[A-Z][a-z]{2,8}[1-9][0-9]$/;

// Never acceptable anywhere in a handle, even across the word boundary.
const FORBIDDEN_FRAGMENTS = [
  "fuck", "shit", "cunt", "nigg", "fag", "dick", "cock", "porn", "slut", "whore",
  "bitch", "piss", "penis", "vagin", "nazi", "hitler", "sex", "kill"
];

// Words that are harmless alone but can insult, sexualise or point at a group
// once paired with another word.
const FORBIDDEN_WORDS = new Set([
  "ass", "tit", "cum", "rape", "gun", "anal", "butt", "boob", "coon", "spade",
  "gay", "queer", "ape", "monkey", "gorilla", "chimp", "baboon", "pig", "rat",
  "cow", "donkey", "weasel", "snake", "worm", "slug", "leech", "cougar", "beaver",
  "black", "white", "yellow", "brown", "red", "dark", "ebony", "native", "exotic",
  "oriental", "gypsy", "pansy", "cotton", "jungle", "dead", "die", "bomb", "war"
]);

describe("generatePseudonym", () => {
  it("joins two capitalised pool words and a two-digit number, with no special characters", () => {
    for (let draw = 0; draw < 2_000; draw += 1) {
      const pseudonym = generatePseudonym();
      expect(pseudonym).toMatch(PSEUDONYM_SHAPE);
      expect(pseudonym).toMatch(/^[A-Za-z0-9]+$/);
      expect(pseudonym.length).toBeLessThanOrEqual(20);
    }
  });

  it("takes the first word from the adjectives and the second from the nouns", () => {
    expect(generatePseudonym(() => 0)).toBe(
      `${capitalise(PSEUDONYM_ADJECTIVES[0]!)}${capitalise(PSEUDONYM_NOUNS[0]!)}10`
    );
    expect(generatePseudonym((max) => max - 1)).toBe(
      `${capitalise(PSEUDONYM_ADJECTIVES.at(-1)!)}${capitalise(PSEUDONYM_NOUNS.at(-1)!)}99`
    );
  });

  it("draws at random, so a large sample is almost entirely distinct", () => {
    const sample = Array.from({ length: 5_000 }, () => generatePseudonym());
    expect(new Set(sample).size).toBeGreaterThanOrEqual(4_990);
  });
});

describe("pseudonym word pools", () => {
  it("are big: hundreds of words each and tens of millions of handles", () => {
    expect(PSEUDONYM_ADJECTIVES.length).toBeGreaterThanOrEqual(400);
    expect(PSEUDONYM_NOUNS.length).toBeGreaterThanOrEqual(600);
    expect(PSEUDONYM_ADJECTIVES.length * PSEUDONYM_NOUNS.length * 90).toBeGreaterThanOrEqual(20_000_000);
  });

  it("hold only lowercase a-z words of 3 to 9 letters, each listed once, in exactly one pool", () => {
    for (const pool of [PSEUDONYM_ADJECTIVES, PSEUDONYM_NOUNS]) {
      for (const word of pool) expect(word).toMatch(/^[a-z]{3,9}$/);
      expect(new Set(pool).size).toBe(pool.length);
    }
    const adjectives = new Set(PSEUDONYM_ADJECTIVES);
    expect(PSEUDONYM_NOUNS.filter((noun) => adjectives.has(noun))).toEqual([]);
  });

  it("are frozen", () => {
    expect(Object.isFrozen(PSEUDONYM_ADJECTIVES)).toBe(true);
    expect(Object.isFrozen(PSEUDONYM_NOUNS)).toBe(true);
  });

  it("contain no forbidden word, and no pairing spells a forbidden fragment", () => {
    for (const word of [...PSEUDONYM_ADJECTIVES, ...PSEUDONYM_NOUNS]) {
      expect(FORBIDDEN_WORDS.has(word), word).toBe(false);
    }
    const hits: string[] = [];
    for (const adjective of PSEUDONYM_ADJECTIVES) {
      for (const noun of PSEUDONYM_NOUNS) {
        const joined = adjective + noun;
        if (FORBIDDEN_FRAGMENTS.some((fragment) => joined.includes(fragment))) hits.push(joined);
      }
    }
    expect(hits).toEqual([]);
  });
});

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
