// PROBE S(extract) — pull every visible string of artboards 10a and 10b out of
// the design files MECHANICALLY. Nothing here is retyped by the reviewer.
import { readFileSync, writeFileSync } from "node:fs";
const D = process.argv[2], OUT = process.argv[3];
const html = readFileSync(`${D}/turn-10-cookie-consent.html`, "utf8");
const js = readFileSync(`${D}/design-data.js`, "utf8");

const slice = (from, to) => {
  const a = html.indexOf(from);
  const b = to ? html.indexOf(to) : html.length;
  return html.slice(a, b === -1 ? html.length : b);
};
/** Visible text nodes, in DOM order, with tags and {{token}} refs removed. */
function textNodes(fragment) {
  return fragment
    .replace(/<[^>]*>/g, "")
    .split("")
    .map((s) => s.replace(/\{\{[^}]*\}\}/g, "").trim())
    .filter((s) => s.length > 0);
}
// 10a: only the bar itself — from the fixed bezel div to the end of the artboard.
const a10 = slice('style="position:absolute; left:22px; right:22px; bottom:22px;', '<div id="10c"');
// 10b: the whole artboard body after its caption row.
const b10 = slice('<div data-screen-label="10b Cookie preferences"');

const bar = textNodes(a10);
const card = textNodes(b10);

// cookieCats: the quoted string arguments of each mkCat( ... ) call.
const catsBlock = js.slice(js.indexOf("const cookieCats"));
const cats = [];
for (const m of catsBlock.matchAll(/mkCat\(([^)]*)\)/g)) {
  const args = [];
  const re = /'((?:[^'\\]|\\.)*)'/g;
  let x;
  while ((x = re.exec(m[1])) !== null) args.push(JSON.parse(`"${x[1].replace(/"/g, '\\"')}"`));
  if (args.length >= 4) cats.push({ name: args[0], tag: args[1], desc: args[2], detail: args[3] });
}
const out = { bar, card, cats };
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log("--- 10a bar, design strings in DOM order ---");
bar.forEach((s, i) => console.log(`${i}: ${JSON.stringify(s)}`));
console.log("--- 10b card, design strings in DOM order ---");
card.forEach((s, i) => console.log(`${i}: ${JSON.stringify(s)}`));
console.log("--- cookieCats ---");
console.log(JSON.stringify(cats, null, 2));
