import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error jsdom is a runtime test dependency without root-level declarations.
import { JSDOM } from "jsdom";

const stylesheetPath = resolve(process.cwd(), "apps/ui/app/globals.css");

function stylesheet(): string {
  return readFileSync(stylesheetPath, "utf8");
}

function declarationBlock(selector: string): string {
  const source = stylesheet();
  const selectorStart = source.indexOf(selector);
  if (selectorStart < 0) throw new Error(`TOKEN_SELECTOR_MISSING:${selector}`);
  const openingBrace = source.indexOf("{", selectorStart + selector.length);
  if (openingBrace < 0) throw new Error(`TOKEN_BLOCK_MISSING:${selector}`);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace + 1, index);
    }
  }
  throw new Error(`TOKEN_BLOCK_UNCLOSED:${selector}`);
}

function tokenNames(block: string): readonly string[] {
  return [...block.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((match) => match[1]!);
}

/** Loads apps/ui/app/globals.css into a fresh jsdom document. */
export function styledDocument(): { window: Window; document: Document } {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
  const style = dom.window.document.createElement("style");
  style.textContent = stylesheet();
  dom.window.document.head.append(style);
  return {
    window: dom.window as unknown as Window,
    document: dom.window.document
  };
}

/** Reads a declared custom property off <html> for the given mode. */
export function tokenValue(
  win: Window,
  name: `--${string}`,
  mode?: "terracotta" | "chamber"
): string {
  const html = win.document.documentElement;
  if (mode === "chamber") html.dataset.mode = "chamber";
  else if (mode === "terracotta") html.dataset.mode = "terracotta";
  else html.removeAttribute("data-mode");
  return win.getComputedStyle(html).getPropertyValue(name).trim();
}

/** Every token name declared in the :root block, in source order. */
export function declaredTokenNames(): readonly string[] {
  return tokenNames(declarationBlock(":root"));
}

/** Token names declared in the html[data-mode="chamber"] block. */
export function chamberTokenNames(): readonly string[] {
  return tokenNames(declarationBlock('html[data-mode="chamber"]'));
}
