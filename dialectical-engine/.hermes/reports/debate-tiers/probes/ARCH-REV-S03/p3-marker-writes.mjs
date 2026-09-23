// ARCH-REV-S03 p3 — the check the completeness assertion does NOT make:
// every path-shaped token that appears ON a "Files —" MARKER LINE (i.e. after Create:/Modify: on the
// first physical line(s) of the Files declaration, before the prose) must be CAPTURED.
// A classification table keyed only on (step, path) cannot make this distinction.
import { readFileSync } from "node:fs";
const plan = process.argv[2];
const src = readFileSync(plan, "utf8");
const lines = src.split("\n");
const steps = []; let cur = null;
for (const line of lines) {
  const m = /^\*\*S(\d+)\. /.exec(line);
  if (m) { cur = { n: +m[1], body: [] }; steps.push(cur); continue; }
  if (/^## /.test(line) && cur) cur = null;
  if (cur) cur.body.push(line);
}
const CLUSTER_OF = (n) => (n>=1&&n<=13)?"C1":(n===14||n===16||n===17)?"C2":(n===24||n===35||n===36)?"C4":(n===15||(n>=18&&n<=23)||(n>=25&&n<=34))?"C3":null;
// captured, exactly as surfaces.mjs does
function captured(text){
  const got=new Set(); const markerRe=/(?:Create|Modify):/g; let mk;
  while((mk=markerRe.exec(text))!==null){
    let i=mk.index+mk[0].length;
    for(;;){ const tok=/^[\s,;]*`([^`]+)`/.exec(text.slice(i)); if(!tok) break;
      let raw=tok[1].trim(); if(raw==="none modified by this step") break;
      raw=raw.replace(/(?::[\d\s,-]+)+$/u,"").replace(/[,;\s]+$/u,"");
      if(/[\/.]/.test(raw)) got.add(raw);
      i+=tok[0].length;
      const cont=/^[\s,;]*(?:and|plus)?[\s,;]*(?=`)/.exec(text.slice(i)); if(cont) i+=cont[0].length; else break; }
  }
  return got;
}
let bad=0, checked=0;
for (const step of steps){
  const c=CLUSTER_OF(step.n); if(!c) continue;
  const start=step.body.findIndex(l=>/^(Files — |Files—|Files -)/.test(l));
  if(start===-1) continue;
  // the MARKER LINES: from "Files —" until the first line that does not continue the declaration
  // (a line ending in "." that is followed by a line not starting with a backtick/marker ends it).
  const para=[]; for(let i=start;i<step.body.length&&step.body[i].trim()!=="";i+=1) para.push(step.body[i]);
  const text=para.join(" ");
  const got=captured(text);
  // tokens that sit between a marker and the end of that marker's declaration, found greedily:
  // every backticked path token that appears BEFORE the first sentence-ending that is followed by prose.
  // Approximation that is strictly safe: tokens on the physical lines of the Files declaration.
  let declLines=[]; 
  for(let i=0;i<para.length;i+=1){
    declLines.push(para[i]);
    if(/\.\s*$/.test(para[i]) && !/(Create|Modify):\s*$/.test(para[i])) break;
  }
  const declText=declLines.join(" ");
  for(const m of declText.matchAll(/`([^`]+)`/g)){
    let raw=m[1].trim().replace(/(?::[\d\s,-]+)+$/u,"").replace(/[,;\s]+$/u,"");
    if(!/^[A-Za-z0-9_@./*{}-]+\/[A-Za-z0-9_@./*{},-]+/.test(raw)) continue;
    checked+=1;
    if(!got.has(raw)){ console.log(`!! S${step.n} (${c}) DECLARATION-LINE path NOT captured: ${raw}`); console.log(`      ${declText.replace(/\s+/g," ").slice(0,200)}`); bad+=1; }
  }
}
console.log(`\ndeclaration-line path tokens checked: ${checked}`);
console.log(bad===0 ? "OK — every path on a Files declaration line is captured" : `FAIL — ${bad} declared write(s) dropped`);
