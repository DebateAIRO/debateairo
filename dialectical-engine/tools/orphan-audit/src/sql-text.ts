/**
 * SQL text helpers of the migration audits (tools/orphan-audit): the replay-safety audit (index.ts) and the N-1 audit
 * (migration-n1.ts, side-by-side spec 2026-10-21 §5) read migrations through the same masks, so a comment, a quoted
 * literal or a dollar-quoted body never reads as SQL to one audit and as text to the other.
 */
export function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

export function maskSqlComments(source: string): string {
  return source
    .replace(/--[^\n]*/g, (comment) => " ".repeat(comment.length))
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

export type SqlDoBlock = {
  readonly start: number;
  readonly end: number;
  readonly bodyStart: number;
  readonly bodyEnd: number;
};

function dollarTagAt(source: string, index: number): string | null {
  return /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u.exec(source.slice(index))?.[0] ?? null;
}

function quotedSqlEnd(source: string, index: number, quote: "'" | "\""): number {
  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === quote && source[cursor + 1] === quote) {
      cursor += 1;
      continue;
    }
    if (source[cursor] === quote) return cursor + 1;
  }
  return source.length;
}

export function sqlDoBlocks(source: string): readonly SqlDoBlock[] {
  const blocks: SqlDoBlock[] = [];
  for (let index = 0; index < source.length;) {
    const char = source[index];
    if (char === "'" || char === "\"") {
      index = quotedSqlEnd(source, index, char);
      continue;
    }
    const before = source[index - 1] ?? "";
    const after = source[index + 2] ?? "";
    if ((source.slice(index, index + 2).toUpperCase() === "DO")
      && !/[A-Za-z0-9_$]/u.test(before)
      && !/[A-Za-z0-9_$]/u.test(after)) {
      let open = index + 2;
      while (/\s/u.test(source[open] ?? "")) open += 1;
      const tag = dollarTagAt(source, open);
      if (tag !== null) {
        const bodyStart = open + tag.length;
        const bodyEnd = source.indexOf(tag, bodyStart);
        if (bodyEnd < 0) break;
        let semicolon = bodyEnd + tag.length;
        while (/\s/u.test(source[semicolon] ?? "")) semicolon += 1;
        if (source[semicolon] === ";") {
          blocks.push(Object.freeze({
            start: index,
            end: semicolon + 1,
            bodyStart,
            bodyEnd
          }));
          index = semicolon + 1;
          continue;
        }
        index = bodyEnd + tag.length;
        continue;
      }
    }
    if (char === "$") {
      const tag = dollarTagAt(source, index);
      if (tag !== null) {
        const close = source.indexOf(tag, index + tag.length);
        if (close < 0) break;
        index = close + tag.length;
        continue;
      }
    }
    index += 1;
  }
  return blocks;
}

/**
 * Blanks every quoted literal and dollar-quoted body, offsets and newlines kept. With `identifiers: "name"` (the N-1
 * audit, which compares relation names) a double-quoted identifier stays a name instead: its quotes and every
 * character that cannot stand in a plain name become `_` (`identity."user"` reads `identity._user_`).
 */
export function maskSqlQuotedLiterals(source: string, identifiers: "mask" | "name" = "mask"): string {
  const output = [...source];
  for (let index = 0; index < source.length;) {
    const char = source[index];
    if (char === "'" || char === "\"") {
      const end = quotedSqlEnd(source, index, char);
      for (let cursor = index; cursor < end; cursor += 1) {
        if (char === "\"" && identifiers === "name") output[cursor] = /[A-Za-z0-9_$]/u.test(output[cursor]!) ? output[cursor]! : "_";
        else if (output[cursor] !== "\n") output[cursor] = " ";
      }
      index = end;
      continue;
    }
    if (char === "$") {
      const tag = dollarTagAt(source, index);
      if (tag !== null) {
        const close = source.indexOf(tag, index + tag.length);
        if (close < 0) return output.join("");
        const end = close + tag.length;
        for (let cursor = index; cursor < end; cursor += 1) {
          if (output[cursor] !== "\n") output[cursor] = " ";
        }
        index = end;
        continue;
      }
    }
    index += 1;
  }
  return output.join("");
}
