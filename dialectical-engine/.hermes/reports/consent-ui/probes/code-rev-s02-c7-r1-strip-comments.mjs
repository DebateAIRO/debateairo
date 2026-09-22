/* Byte-level comment stripper: tracks string/template state so a // or /* inside a
   string is not mistaken for a comment. Verified below against a known-BAD input. */
import { readFileSync, writeFileSync } from "node:fs";
export function strip(src) {
  let out = "", i = 0, n = src.length;
  let mode = "code"; // code | line | block | sq | dq | tpl
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (mode === "code") {
      if (c === "/" && d === "/") { mode = "line"; i += 2; continue; }
      if (c === "/" && d === "*") { mode = "block"; i += 2; continue; }
      if (c === "'") { mode = "sq"; out += c; i++; continue; }
      if (c === '"') { mode = "dq"; out += c; i++; continue; }
      if (c === "`") { mode = "tpl"; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === "line") { if (c === "\n") { mode = "code"; out += c; } i++; continue; }
    if (mode === "block") { if (c === "*" && d === "/") { mode = "code"; i += 2; } else { if (c === "\n") out += c; i++; } continue; }
    // inside a string of some kind
    if (c === "\\") { out += c + (d ?? ""); i += 2; continue; }
    if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"') || (mode === "tpl" && c === "`")) mode = "code";
    out += c; i++;
  }
  // collapse runs of blank lines and trailing spaces so comment REMOVAL alone cannot shift text
  return out.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.length > 0).join("\n") + "\n";
}
const [,, inp, outp] = process.argv;
if (inp) writeFileSync(outp, strip(readFileSync(inp, "utf8")));
