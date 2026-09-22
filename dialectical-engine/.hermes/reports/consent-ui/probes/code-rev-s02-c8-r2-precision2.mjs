import { readFileSync } from "node:fs";
const lane = process.argv[2];
const css = readFileSync(`${lane}/apps/ui/app/globals.css`, "utf8");
const tok = (s, n) => { const b = css.slice(css.indexOf(s + " {")); return b.slice(0, b.indexOf("}")).match(new RegExp(`${n}\\s*:\\s*([^;]+);`))[1].trim(); };
const chans = (h) => [1,3,5].map(o => parseInt(h.slice(o,o+2),16));
const comp = (fg,bg,a) => `#${chans(fg).map((v,i)=>Math.round(a*v+(1-a)*chans(bg)[i]).toString(16).padStart(2,"0")).join("")}`;
const lum = (h) => { const [r,g,b]=chans(h).map(v=>{const s=v/255;return s<=0.03928?s/12.92:((s+0.055)/1.055)**2.4;}); return .2126*r+.7152*g+.0722*b; };
const ratio=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
const G=tok('html[data-mode="chamber"]',"--shell"), F=tok('html[data-mode="chamber"]',"--ink"), L=tok('html[data-mode="chamber"]',"--bg");
const GT=tok(":root","--shell"), FT=tok(":root","--ink"), LT=tok(":root","--bg");
console.log("Chamber tokens --shell",G,"--ink",F,"--bg",L);
// the alpha interval whose Chamber ratio is the blind 4.498360
let lo=null,hi=null;
for(let i=1;i<=1000000;i++){const a=i/1000000;const r=ratio(comp(L,G,a),comp(F,G,a));
  if (Math.abs(r-4.498360)<5e-7){ if(lo===null)lo=a; hi=a; }}
console.log(`blind-window alpha interval: [${lo}, ${hi}]  width ${(hi-lo).toExponential(3)}`);
for (const a of [0.478, 0.4784, 0.47837, 0.4785]) {
  const rc=ratio(comp(L,G,a),comp(F,G,a)), rt=ratio(comp(LT,GT,a),comp(FT,GT,a));
  console.log(`alpha ${a}: Chamber true ${rc.toFixed(6)} -> "${rc.toFixed(2)}"  flaggedBEFORE=${rc<4.5}  flaggedAFTER=${parseFloat(rc.toFixed(2))<4.5} | Terracotta true ${rt.toFixed(6)} -> "${rt.toFixed(2)}" flaggedBEFORE=${rt<4.5} flaggedAFTER=${parseFloat(rt.toFixed(2))<4.5}`);
}
