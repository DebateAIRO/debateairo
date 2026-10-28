import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileCrisisPattern, detectCrisis, normalizeForCrisisCheck, normalizeKeepingAccents } from "@debateai/contract";
import { CRISIS_LEXICONS } from "../../packages/contract/src/crisis-lexicon/index.js";

/* Crisis check, lexicon lint (NV-28, NV-29): `detectCrisis` runs every pattern synchronously on
   the API's event loop, before admission, on any question of up to 8 KB. Each pattern is read
   here as `compileCrisisPattern` compiles it (the source after normalisation) and must have a
   bounded match: no range the fold moves (R1), no unbounded repetition but a space (R2), every
   bound at most 64 (R3), and no repeated group that reads a text two ways (R4). */

type ClassNode = Readonly<{
  kind: "class"; negated: boolean; members: readonly number[];
  ranges: readonly (readonly [number, number])[]; escapes: readonly string[]; src: string;
}>;
type QuantNode = Readonly<{ kind: "quant"; min: number; max: number; body: Node; src: string }>;
type GroupNode = Readonly<{ kind: "group"; group: "cap" | "?:" | "?=" | "?!" | "?<=" | "?<!"; body: Node }>;
type Node =
  | Readonly<{ kind: "alt"; alts: readonly Node[] }>
  | Readonly<{ kind: "seq"; items: readonly Node[] }>
  | GroupNode
  | ClassNode
  | Readonly<{ kind: "char"; cp: number }>
  | Readonly<{ kind: "any" }>
  | Readonly<{ kind: "escape"; name: string }>
  | Readonly<{ kind: "anchor"; anchor: "^" | "$" }>
  | QuantNode;

/** The lexicon syntax (types.ts), parsed as the `u` flag reads it. Throws on anything else. */
function parse(src: string): Node {
  let i = 0;
  const error = (why: string): Error => new Error(`${why} at ${i} in ${src}`);
  const hex = (digits: string, length?: number): number => {
    if (!/^[0-9a-f]+$/iu.test(digits) || (length !== undefined && digits.length !== length)) {
      throw error(`bad hex escape "${digits}"`);
    }
    return parseInt(digits, 16);
  };
  // i is at a backslash: \xHH, \uHHHH, \u{H…}, a control escape or an identity escape, as one code point.
  const escapedCodePoint = (): number => {
    const next = src[i + 1];
    if (next === undefined) throw error("trailing backslash");
    if (next === "x") { const cp = hex(src.slice(i + 2, i + 4), 2); i += 4; return cp; }
    if (next === "u" && src[i + 2] === "{") {
      const end = src.indexOf("}", i + 3);
      if (end < 0) throw error("unclosed \\u{");
      const cp = hex(src.slice(i + 3, end)); i = end + 1; return cp;
    }
    if (next === "u") { const cp = hex(src.slice(i + 2, i + 6), 4); i += 6; return cp; }
    const control: Readonly<Record<string, number>> = { n: 0x0a, t: 0x09, r: 0x0d, f: 0x0c, v: 0x0b };
    if (control[next] !== undefined) { i += 2; return control[next]!; }
    if (/[\p{L}\p{N}]/u.test(next)) throw error(`unsupported escape \\${next}`);
    const cp = src.codePointAt(i + 1)!;
    i += 1 + String.fromCodePoint(cp).length;
    return cp;
  };
  const parseClass = (): ClassNode => {
    const start = i;
    i += 1;
    const negated = src[i] === "^";
    if (negated) i += 1;
    const members: number[] = [];
    const ranges: [number, number][] = [];
    const escapes: string[] = [];
    // One class atom: a code point, or the name of a class escape (\s \d \w and their upper-case forms).
    const atom = (): number | string => {
      if (i >= src.length) throw error("unclosed class");
      if (src[i] === "\\") {
        const next = src[i + 1] ?? "";
        if ("sSdDwW".includes(next) && next !== "") { i += 2; return next; }
        if (next === "b") { i += 2; return 0x08; }
        return escapedCodePoint();
      }
      const cp = src.codePointAt(i)!;
      i += String.fromCodePoint(cp).length;
      return cp;
    };
    while (src[i] !== "]") {
      const lo = atom();
      if (src[i] === "-" && src[i + 1] !== "]" && i + 1 < src.length) {
        i += 1;
        const hi = atom();
        if (typeof lo !== "number" || typeof hi !== "number") throw error("class escape in a range");
        if (hi < lo) throw error("range out of order");
        ranges.push([lo, hi]);
      } else if (typeof lo === "number") members.push(lo);
      else escapes.push(lo);
    }
    i += 1;
    return { kind: "class", negated, members, ranges, escapes, src: src.slice(start, i) };
  };
  const parseAtom = (): Node => {
    const c = src[i]!;
    if (c === "(") {
      i += 1;
      let group: GroupNode["group"] = "cap";
      for (const prefix of ["?:", "?=", "?!", "?<=", "?<!"] as const) {
        if (src.startsWith(prefix, i)) { group = prefix; i += prefix.length; break; }
      }
      if (group === "cap" && src[i] === "?") throw error("unsupported group");
      const body = parseAlt();
      if (src[i] !== ")") throw error("unclosed group");
      i += 1;
      return { kind: "group", group, body };
    }
    if (c === "[") return parseClass();
    if (c === ".") { i += 1; return { kind: "any" }; }
    if (c === "^" || c === "$") { i += 1; return { kind: "anchor", anchor: c }; }
    if (c === "\\") {
      const next = src[i + 1] ?? "";
      if (next !== "" && "bBsSdDwW".includes(next)) { i += 2; return { kind: "escape", name: next }; }
      return { kind: "char", cp: escapedCodePoint() };
    }
    if ("*+?{}]".includes(c)) throw error(`nothing to repeat or lone "${c}"`);
    const cp = src.codePointAt(i)!;
    i += String.fromCodePoint(cp).length;
    return { kind: "char", cp };
  };
  const parseSeq = (): Node => {
    const items: Node[] = [];
    while (i < src.length && src[i] !== "|" && src[i] !== ")") {
      const start = i;
      const atom = parseAtom();
      let min = -1;
      let max = -1;
      const c = src[i];
      if (c === "*") { min = 0; max = Infinity; i += 1; }
      else if (c === "+") { min = 1; max = Infinity; i += 1; }
      else if (c === "?") { min = 0; max = 1; i += 1; }
      else if (c === "{") {
        const bound = /^\{(\d+)(?:(,)(\d*))?\}/u.exec(src.slice(i));
        if (bound === null) throw error("lone {");
        min = Number(bound[1]);
        max = bound[2] === undefined ? min : bound[3] === "" ? Infinity : Number(bound[3]);
        i += bound[0].length;
      }
      if (min < 0) { items.push(atom); continue; }
      if (src[i] === "?") i += 1;
      items.push({ kind: "quant", min, max, body: atom, src: src.slice(start, i) });
    }
    return { kind: "seq", items };
  };
  const parseAlt = (): Node => {
    const alts = [parseSeq()];
    while (src[i] === "|") { i += 1; alts.push(parseSeq()); }
    return alts.length === 1 ? alts[0]! : { kind: "alt", alts };
  };
  const node = parseAlt();
  if (i !== src.length) throw error("unmatched )");
  return node;
}

function nodesOf(node: Node): Node[] {
  const out: Node[] = [node];
  if (node.kind === "alt") for (const alt of node.alts) out.push(...nodesOf(alt));
  else if (node.kind === "seq") for (const item of node.items) out.push(...nodesOf(item));
  else if (node.kind === "group" || node.kind === "quant") out.push(...nodesOf(node.body));
  return out;
}
const classesOf = (node: Node): ClassNode[] => nodesOf(node).filter((n): n is ClassNode => n.kind === "class");
const quantsOf = (node: Node): QuantNode[] => nodesOf(node).filter((n): n is QuantNode => n.kind === "quant");
const leavesOf = (node: Node): Node[] => nodesOf(node).filter((n) => !["alt", "seq", "group", "quant"].includes(n.kind));
const shorten = (text: string): string => text.length > 80 ? `${text.slice(0, 80)}…` : text;
const spell = (pattern: string, accents?: "keep"): string =>
  accents === "keep" ? normalizeKeepingAccents(pattern) : normalizeForCrisisCheck(pattern);

/** R1: the classes of the source and of its spelling hold the same ranges, in order. Members may fold. */
function rangeOffences(source: string, accents?: "keep"): string[] {
  const before = classesOf(parse(source));
  const after = classesOf(parse(spell(source, accents)));
  if (before.length !== after.length) return [`${before.length} classes become ${after.length}`];
  return before.flatMap((written, k) => JSON.stringify(written.ranges) === JSON.stringify(after[k]!.ranges)
    ? [] : [`${written.src} -> ${after[k]!.src}`]);
}

/** R2: nothing repeats without bound but `\s` (a normalised question never holds two spaces in a row). */
function unboundedOffences(spelled: string): string[] {
  return quantsOf(parse(spelled))
    .filter((q) => q.max === Infinity && !(q.body.kind === "escape" && q.body.name === "s"))
    .map((q) => shorten(q.src));
}

/** R3: every bound is at most 64. */
function boundOffences(spelled: string): string[] {
  return quantsOf(parse(spelled)).filter((q) => q.max !== Infinity && q.max > 64).map((q) => shorten(q.src));
}

const WORD_LIMIT = 4_096;
/**
 * The finite language of a node, duplicates kept (a multiset), or null when it is infinite, holds
 * more than 4,096 words or reads a class of more than 8 distinct code points. `\b`, anchors and
 * lookarounds read "", `\s` reads " ", and a quantifier is expanded only up to a max of 3.
 */
function wordsOf(node: Node): string[] | null {
  const product = (left: readonly string[], right: readonly string[]): string[] | null => {
    if (left.length * right.length > WORD_LIMIT) return null;
    return left.flatMap((x) => right.map((y) => x + y));
  };
  switch (node.kind) {
    case "char": return [String.fromCodePoint(node.cp)];
    case "class": {
      if (node.negated || node.escapes.length > 0) return null;
      const set = new Set<number>(node.members);
      for (const [lo, hi] of node.ranges) {
        if (hi - lo + 1 > 8) return null;
        for (let cp = lo; cp <= hi; cp += 1) set.add(cp);
      }
      return set.size <= 8 ? [...set].map((cp) => String.fromCodePoint(cp)) : null;
    }
    case "any": return null;
    case "escape": return node.name === "b" ? [""] : node.name === "s" ? [" "] : null;
    case "anchor": return [""];
    case "group": return node.group === "cap" || node.group === "?:" ? wordsOf(node.body) : [""];
    case "alt": {
      const out: string[] = [];
      for (const alt of node.alts) {
        const words = wordsOf(alt);
        if (words === null) return null;
        out.push(...words);
        if (out.length > WORD_LIMIT) return null;
      }
      return out;
    }
    case "seq": {
      let out: string[] | null = [""];
      for (const item of node.items) {
        const words = wordsOf(item);
        if (words === null) return null;
        out = product(out, words);
        if (out === null) return null;
      }
      return out;
    }
    case "quant": {
      if (node.max > 3) return null;
      const words = wordsOf(node.body);
      if (words === null) return null;
      const out: string[] = node.min === 0 ? [""] : [];
      let run: string[] | null = [""];
      for (let k = 1; k <= node.max; k += 1) {
        run = product(run, words);
        if (run === null) return null;
        if (k >= node.min) out.push(...run);
        if (out.length > WORD_LIMIT) return null;
      }
      return out;
    }
  }
}

/** Sardinas–Patterson: does the multiset of words read every concatenation one way only? */
function uniquelyDecodable(words: readonly string[]): { ok: boolean; why?: string } {
  const code = new Set<string>();
  for (const word of words) {
    if (word === "") return { ok: false, why: "empty word" };
    if (code.has(word)) return { ok: false, why: `duplicate ${JSON.stringify(word)}` };
    code.add(word);
  }
  const codewords = [...code];
  const dangling = (prefixes: Iterable<string>, wholes: Iterable<string>): Set<string> => {
    const out = new Set<string>();
    const ws = [...wholes];
    for (const prefix of prefixes) for (const whole of ws) {
      if (whole !== prefix && whole.startsWith(prefix)) out.add(whole.slice(prefix.length));
    }
    return out;
  };
  let suffixes = dangling(codewords, codewords);
  const seen = new Set<string>();
  for (;;) {
    for (const suffix of suffixes) if (code.has(suffix)) return { ok: false, why: `dangling suffix ${JSON.stringify(suffix)} is a codeword` };
    const key = [...suffixes].sort().join("\u0000");
    if (suffixes.size === 0 || seen.has(key)) return { ok: true };
    seen.add(key);
    suffixes = new Set([...dangling(codewords, suffixes), ...dangling(suffixes, codewords)]);
  }
}

/** R4a: a group quantified with max > 1 reads no word twice (no duplicate alternatives after the fold). */
function duplicateOffences(spelled: string): string[] {
  return quantsOf(parse(spelled)).filter((q) => q.max > 1 && q.body.kind === "group").flatMap((q) => {
    const words = wordsOf(q.body);
    if (words === null) return [];
    const seen = new Set<string>();
    const twice = new Set<string>();
    for (const word of words) { if (seen.has(word)) twice.add(word); seen.add(word); }
    return [...twice].map((word) => `duplicate ${JSON.stringify(word)}`);
  });
}

/** A single-word slot: one literal space and one class quantifier whose class excludes the space, in either order. */
function isWordSlot(node: Node): boolean {
  if (node.kind !== "group" || node.body.kind !== "seq" || node.body.items.length !== 2) return false;
  const [first, second] = node.body.items as [Node, Node];
  const space = (n: Node): boolean => n.kind === "char" && n.cp === 0x20;
  const word = (n: Node): boolean => n.kind === "quant" && n.body.kind === "class" && !new RegExp(n.body.src, "u").test(" ");
  return (space(first) && word(second)) || (word(first) && space(second));
}

/** R4b: a group allowed more than 3 repetitions is a uniquely decodable code, or a single-word slot. */
function ambiguityOffences(spelled: string): string[] {
  return quantsOf(parse(spelled)).filter((q) => q.max > 3 && q.body.kind === "group").flatMap((q) => {
    if (isWordSlot(q.body)) return [];
    const words = wordsOf(q.body);
    if (words === null) return [`repeats a group of infinite or over 4,096 words: ${shorten(q.src)}`];
    const verdict = uniquelyDecodable(words);
    return verdict.ok ? [] : [`${verdict.why}: ${shorten(q.src)}`];
  });
}

type Entry = Readonly<{ id: string; language: string; index: number; pattern: string; accents?: "keep"; signal: string }>;
const ENTRIES: readonly Entry[] = CRISIS_LEXICONS.flatMap((lexicon) => lexicon.patterns.map((entry, index) => ({
  id: `${lexicon.language}#${index}`, language: lexicon.language, index, signal: entry.signal,
  pattern: entry.pattern, ...(entry.accents === undefined ? {} : { accents: entry.accents })
})));

function lexiconOffences(rule: (entry: Entry) => readonly string[]): string[] {
  return ENTRIES.flatMap((entry) => rule(entry).map((offence) => `${entry.id}: ${offence}`));
}
function tally(offences: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const offence of offences) {
    const language = offence.slice(0, offence.indexOf("#"));
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return `${offences.length} offenders (${[...counts].map(([language, n]) => `${language} ${n}`).join(", ")})`;
}

type Fixture = Readonly<{ language: string; positive: readonly string[]; negative: readonly string[] }>;
const FIXTURE_DIRECTORY = new URL("./crisis-check-fixtures/", import.meta.url);
const fixtureQuestions = (): string[] => readdirSync(FIXTURE_DIRECTORY)
  .filter((name) => name.endsWith(".json"))
  .flatMap((name) => {
    const fixture = JSON.parse(readFileSync(new URL(name, FIXTURE_DIRECTORY), "utf8")) as Fixture;
    return [...fixture.positive, ...fixture.negative];
  });

describe("crisis lexicon lint — the parser", () => {
  it("parses every pattern", () => {
    let classes = 0;
    for (const entry of ENTRIES) {
      expect(() => parse(entry.pattern), entry.id).not.toThrow();
      classes += classesOf(parse(spell(entry.pattern, entry.accents))).length;
    }
    expect(ENTRIES.length).toBeGreaterThanOrEqual(1_500);
    expect(classes).toBeGreaterThanOrEqual(1);
  });

  it("reads \\xHH as one code point, in and out of classes", () => {
    const classes = classesOf(parse(String.raw`[\x61-я]`));
    expect(classes.map(({ ranges, members, escapes }) => ({ ranges, members, escapes })))
      .toEqual([{ ranges: [[0x61, 0x44f]], members: [], escapes: [] }]);
    expect(leavesOf(parse(String.raw`\x61`))).toEqual([{ kind: "char", cp: 0x61 }]);
  });
});

describe("crisis lexicon lint — bounded matching (NV-28)", () => {
  it("leaves every range as written: the fold moves no endpoint (NV-28)", () => {
    const offences = lexiconOffences((entry) => rangeOffences(entry.pattern, entry.accents));
    expect(offences, tally(offences)).toEqual([]);
  });

  it("bounds every repetition but a space (NV-28)", () => {
    const offences = lexiconOffences((entry) => unboundedOffences(spell(entry.pattern, entry.accents)));
    expect(offences, tally(offences)).toEqual([]);
  });

  it("a normalised question never holds two whitespace characters in a row", () => {
    const texts = [...fixtureQuestions(), " a \t\n\u{A0}\u{2003}\u{3000}\u{2028} b  "];
    expect(texts.length).toBeGreaterThan(2_000);
    expect(texts.filter((text) => /\s\s/u.test(normalizeForCrisisCheck(text)) || /\s\s/u.test(normalizeKeepingAccents(text))))
      .toEqual([]);
  });

  it("bounds every {m,n} at 64", () => {
    const offences = lexiconOffences((entry) => boundOffences(spell(entry.pattern, entry.accents)));
    expect(offences, tally(offences)).toEqual([]);
  });

  it("NV-28: the Bulgarian method pattern (bg.ts:53) scans at most 32 characters per class", () => {
    const entries = ENTRIES.filter((entry) => entry.language === "bg" && entry.pattern.includes("(?:лес|бърз|"));
    expect(entries.map((entry) => entry.id)).toEqual(["bg#31"]);
    const entry = entries[0]!;
    expect(quantsOf(parse(spell(entry.pattern, entry.accents))).filter((q) => q.max === Infinity).map((q) => q.src)).toEqual([]);
    expect(compileCrisisPattern(entry.pattern, entry.accents).source).toContain(String.raw`[\x61-я-]{0,32}`);
  });

  it("R1 flags a range the fold moves and passes one written as it folds", () => {
    expect(rangeOffences(String.raw`[а-я]+`)).toHaveLength(1);
    expect(rangeOffences(String.raw`[\x61-я]{1,32}`)).toEqual([]);
  });

  it("R2 flags unbounded classes, groups and open bounds, and passes \\s* and bounded classes", () => {
    for (const source of ["[a-z]+", "(?:a )*", "x{2,}"]) expect(unboundedOffences(spell(source)), source).toHaveLength(1);
    for (const source of [String.raw`\s*`, "[a-z]{0,32}"]) expect(unboundedOffences(spell(source)), source).toEqual([]);
  });

  it("R3 flags a bound over 64", () => {
    expect(boundOffences(spell(".{0,65}"))).toHaveLength(1);
    expect(boundOffences(spell(".{0,64}"))).toEqual([]);
  });
});

describe("crisis lexicon lint — one reading per repeated group (NV-29)", () => {
  it("reads no word twice in a repeated group, after the fold (NV-29)", () => {
    const offences = lexiconOffences((entry) => duplicateOffences(spell(entry.pattern, entry.accents)));
    expect(offences, tally(offences)).toEqual([]);
  });

  it("reads a group that may repeat more than three times one way only (NV-29)", () => {
    const offences = lexiconOffences((entry) => ambiguityOffences(spell(entry.pattern, entry.accents)));
    expect(offences, tally(offences)).toEqual([]);
  });

  it("R4a flags a duplicate alternative and passes distinct ones", () => {
    expect(duplicateOffences(spell("(?:(?:a|[aa]) )*"))).toEqual([`duplicate "a "`]);
    expect(duplicateOffences(spell("(?:(?:a|b) )*"))).toEqual([]);
  });

  it("R4b flags a group that reads a text two ways and passes a code", () => {
    for (const source of ["(?:ab|a|b){0,8}", "(?:(?:a b|a|b) ){0,8}"]) {
      expect(ambiguityOffences(spell(source)), source).toEqual([expect.stringMatching(/^dangling suffix /u)]);
    }
    expect(ambiguityOffences(spell("(?:(?:ab|cd) ){0,8}"))).toEqual([]);
  });

  it("R4b exempts a single-word slot, and only a slot whose class excludes the space", () => {
    expect(ambiguityOffences(spell("(?: [a-z]{1,32}){0,4}"))).toEqual([]);
    expect(ambiguityOffences(spell("(?:[a-z ]{1,32}){0,4}"))).toHaveLength(1);
  });

  it("NV-29: the two Polish method patterns read 'najlatwiej' one way", () => {
    const facts = Object.fromEntries([
      [String.raw`\bjak (?:(?:moge|`, "|najlatwiej|"],
      [String.raw`\bjak (?:(?:najszybciej|`, "(?:najszybciej|najlatwiej|"]
    ].map(([prefix, deleted]) => {
      const entry = ENTRIES.find((candidate) => candidate.language === "pl" && candidate.pattern.startsWith(prefix!));
      const spelled = normalizeForCrisisCheck(entry?.pattern ?? "");
      return [entry?.id ?? `pl: none starts ${prefix}`, {
        spellings: spelled.match(/naj(?:l|\[ll\])atwiej/gu)?.length ?? 0,
        deletedAlternative: spelled.includes(deleted!)
      }];
    }));
    expect(facts).toEqual({
      "pl#38": { spellings: 1, deletedAlternative: false },
      "pl#41": { spellings: 1, deletedAlternative: false }
    });
  });

  it("NV-29: the Polish method patterns still detect, and read no harmless question as a method", () => {
    const method = { crisis: true, signal: "method", language: "pl" };
    expect(detectCrisis("Jak najłatwiej się zabić?")).toEqual(method);
    expect(detectCrisis("jak najlatwiej umrzec")).toEqual(method);
    // A four-word adverb stack, within the group's bound of 8.
    expect(detectCrisis("jak najszybciej najłatwiej bezboleśnie po prostu się zabić")).toEqual(method);
    // Harmless questions through the same adverb group: the fix must not widen the pattern.
    expect(detectCrisis("Jak najszybciej i najłatwiej schudnąć?")).toEqual({ crisis: false });
    expect(detectCrisis("Jak najłatwiej umrzeć ze starości?")).toEqual({ crisis: false });
  });
});
