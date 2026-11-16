import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * Keyboard audit round 4 (fixer E): jsdom does no layout and no cascade, so the CSS findings pin their rules. This reads
 * a stylesheet with its comments taken out and lists every plain rule with the at-rules it sits in.
 */
export type CssRule = Readonly<{ at: readonly string[]; selectors: readonly string[]; body: string; index: number }>;

export const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

export function rawStylesheet(path: string): string {
  return readFileSync(resolve(import.meta.dirname, "../../apps/ui/app", path), "utf8");
}

export function stylesheet(path: string): string {
  return stripComments(rawStylesheet(path));
}

export function cssRules(css: string): CssRule[] {
  const out: CssRule[] = [];
  const stack: string[] = [];
  let start = 0;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === "{") {
      const head = css.slice(start, i).trim().replace(/\s+/g, " ");
      if (head.startsWith("@")) { stack.push(head); start = i + 1; continue; }
      const end = css.indexOf("}", i);
      out.push({ at: [...stack], selectors: head.split(",").map((s) => s.trim()), body: css.slice(i + 1, end), index: i });
      i = end;
      start = end + 1;
    } else if (ch === "}") {
      stack.pop();
      start = i + 1;
    }
  }
  return out;
}

/** The rules that name this exact selector (as one of a list), optionally only inside an at-rule containing `at`. */
export function rulesFor(css: string, selector: string, at?: string): CssRule[] {
  return cssRules(css).filter((rule) => rule.selectors.includes(selector)
    && (at === undefined ? rule.at.length === 0 : rule.at.some((head) => head.includes(at))));
}
