// Readers of TypeScript source text for the drift guards (moved from tests/unit/preview-practice-wiring-drift.test.ts by
// V4 start step Task 86, so tests/unit/r22-world-api-drift.test.ts reads tests/support/r22-world.ts and apps/api/src/main.ts
// the same way). They read text only: nothing is imported, compiled or run.

/** Removes comments (line comments only where `//` starts a comment, not inside a string). */
export function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").split("\n").map((line) => {
    let quote: string | null = null;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]!;
      if (quote !== null) { if (char === "\\") index += 1; else if (char === quote) quote = null; continue; }
      if (char === "\"" || char === "'" || char === "`") { quote = char; continue; }
      if (char === "/" && line[index + 1] === "/") return line.slice(0, index);
    }
    return line;
  }).join("\n");
}

/** The text of the balanced group that opens at `open` (inclusive), skipping strings. */
export function group(source: string, open: number): string {
  const pairs: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  const stack: string[] = [];
  let quote: string | null = null;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote !== null) { if (char === "\\") index += 1; else if (char === quote) quote = null; continue; }
    if (char === "\"" || char === "'" || char === "`") { quote = char; continue; }
    if (pairs[char] !== undefined) stack.push(pairs[char]!);
    else if (char === "}" || char === ")" || char === "]") {
      if (stack.pop() !== char) throw new Error("unbalanced source");
      if (stack.length === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error("unterminated group");
}

/**
 * The keys an object literal sets: its own top-level keys, plus the keys of every object a top-level conditional
 * spread `...(cond ? { a } : { b })` may add.
 */
export function objectKeys(objectText: string): Set<string> {
  const keys = new Set<string>();
  const body = objectText.slice(1, -1);
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (quote !== null) { if (char === "\\") index += 1; else if (char === quote) quote = null; continue; }
    if (char === "\"" || char === "'" || char === "`") { quote = char; continue; }
    if (depth === 0 && body.startsWith("...(", index)) {
      const spread = group(body, index + 3);
      const inner = spread.slice(1, -1);
      let innerDepth = 0;
      for (let at = 0; at < inner.length; at += 1) {
        const c = inner[at]!;
        if (c === "{" && innerDepth === 0) { const object = group(inner, at); for (const key of objectKeys(object)) keys.add(key); at += object.length - 1; continue; }
        if (c === "(" || c === "[" || c === "{") innerDepth += 1;
        if (c === ")" || c === "]" || c === "}") innerDepth -= 1;
      }
      index += 3 + spread.length - 1;
      continue;
    }
    if (char === "{" || char === "(" || char === "[") { depth += 1; continue; }
    if (char === "}" || char === ")" || char === "]") { depth -= 1; continue; }
    if (depth === 0) {
      // A key (`name:`), a shorthand property (`name,` or the last `name`) or a method (`name(...) {`).
      const match = /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?::|,|$|\()/u.exec(body.slice(index));
      const before = index === 0 ? "," : body.slice(0, index).trimEnd().at(-1);
      if (match !== null && (before === "," || before === "{" || before === undefined)) {
        keys.add(match[1]!);
        index += match[0].length - (match[0].endsWith("(") ? 2 : 1);
      }
    }
  }
  return keys;
}

/** The keys of the object literal whose `{` ends `anchor` (or is the first after it), in the source without comments. */
export function objectAfter(source: string, anchor: string): Set<string> {
  const clean = withoutComments(source);
  const at = clean.indexOf(anchor);
  if (at < 0) throw new Error(`anchor not found: ${anchor}`);
  return objectKeys(group(clean, clean.indexOf("{", at + anchor.length - 1)));
}
