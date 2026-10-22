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

export function maskSqlQuotedLiterals(source: string): string {
  const output = [...source];
  for (let index = 0; index < source.length;) {
    const char = source[index];
    if (char === "'" || char === "\"") {
      const end = quotedSqlEnd(source, index, char);
      for (let cursor = index; cursor < end; cursor += 1) {
        if (output[cursor] !== "\n") output[cursor] = " ";
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

/** A top-level dollar-quoted body: `start`/`end` span its tags, `bodyStart`/`bodyEnd` its text. */
export type SqlDollarBody = Readonly<{ start: number; end: number; bodyStart: number; bodyEnd: number }>;
export type SqlLexed = Readonly<{ code: string; dollarBodies: readonly SqlDollarBody[] }>;

/**
 * ONE pass over SQL in source order (side-by-side spec 2026-10-21 §5, the N-1 audit; A8 review): `--` comments,
 * nested `/* *\/` comments, `'…'` literals (doubled quotes; in an `E'…'` literal also backslash escapes), `"…"`
 * identifiers and `$tag$…$tag$` bodies, each recognized only where it starts outside the others, so a `--` or `/*`
 * inside a literal hides nothing and a quote inside a comment opens nothing. Everything recognized is blanked (offsets
 * and newlines kept; `code` has the source's UTF-16 length); a double-quoted identifier instead stays a plain name, its
 * quotes and every character that cannot stand in one becoming `_` (`identity."user"` reads `identity._user_`).
 * `dollarBodies` lists the top-level dollar-quoted bodies (a nested one is inside its parent's text).
 */
export function lexSql(source: string): SqlLexed {
  const output = source.split("");
  const blank = (from: number, to: number): void => {
    for (let cursor = from; cursor < to; cursor += 1) if (output[cursor] !== "\n") output[cursor] = " ";
  };
  const dollarBodies: SqlDollarBody[] = [];
  const word = /[A-Za-z0-9_$]/u;
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];
    if (char === "-" && next === "-") {
      const end = source.indexOf("\n", index);
      const stop = end < 0 ? source.length : end;
      blank(index, stop);
      index = stop;
    } else if (char === "/" && next === "*") {
      let depth = 1;
      let cursor = index + 2;
      while (cursor < source.length && depth > 0) {
        if (source[cursor] === "/" && source[cursor + 1] === "*") { depth += 1; cursor += 2; }
        else if (source[cursor] === "*" && source[cursor + 1] === "/") { depth -= 1; cursor += 2; }
        else cursor += 1;
      }
      blank(index, cursor);
      index = cursor;
    } else if (char === "'") {
      const escapes = /[Ee]/u.test(source[index - 1] ?? "") && !word.test(source[index - 2] ?? "");
      let cursor = index + 1;
      while (cursor < source.length) {
        if (escapes && source[cursor] === "\\") { cursor += 2; continue; }
        if (source[cursor] === "'" && source[cursor + 1] === "'") { cursor += 2; continue; }
        if (source[cursor] === "'") { cursor += 1; break; }
        cursor += 1;
      }
      blank(escapes ? index - 1 : index, cursor);
      index = cursor;
    } else if (char === "\"") {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\"" && source[cursor + 1] === "\"") { cursor += 2; continue; }
        if (source[cursor] === "\"") { cursor += 1; break; }
        cursor += 1;
      }
      for (let at = index; at < cursor; at += 1) output[at] = word.test(source[at]!) ? source[at]! : "_";
      index = cursor;
    } else if (char === "$" && !word.test(source[index - 1] ?? "") && dollarTagAt(source, index) !== null) {
      const tag = dollarTagAt(source, index)!;
      const close = source.indexOf(tag, index + tag.length);
      const end = close < 0 ? source.length : close + tag.length;
      dollarBodies.push(Object.freeze({ start: index, end, bodyStart: index + tag.length, bodyEnd: close < 0 ? source.length : close }));
      blank(index, end);
      index = end;
    } else {
      index += 1;
    }
  }
  return Object.freeze({ code: output.join(""), dollarBodies: Object.freeze(dollarBodies) });
}
