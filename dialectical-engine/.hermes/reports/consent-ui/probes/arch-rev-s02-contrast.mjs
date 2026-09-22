// independent re-derivation of S02-S64's opacity pin, WCAG 2.x relative luminance
const L = (h)=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255)
  .map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};
const CR=(a,b)=>{const [x,y]=[L(a),L(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
const hx=n=>Math.round(n).toString(16).padStart(2,"0");
const mix=(fg,bg,a)=>"#"+[1,3,5].map(i=>hx(a*parseInt(fg.slice(i,i+2),16)+(1-a)*parseInt(bg.slice(i,i+2),16))).join("");
// COMMON.md §7 token values
const M={Terracotta:{ink:"#29261F",bg:"#F9F6F1",shell:"#EFE9E0"},
         Chamber:   {ink:"#F2EAD9",bg:"#14110E",shell:"#221D17"}};
for(const a of [0.45,0.50,0.55,0.60,0.65,0.70]){
  const out=[];
  for(const [m,t] of Object.entries(M)){
    const face=mix(t.ink,t.shell,a), label=mix(t.bg,t.shell,a);
    out.push(`${m} ${face}/${label} ${CR(face,label).toFixed(2)}`);
  }
  console.log(`opacity ${a.toFixed(2)} : ${out.join("   |   ")}`);
}
console.log("enabled (no opacity):",
  `Terracotta ${CR(M.Terracotta.ink,M.Terracotta.bg).toFixed(2)}`,
  `| Chamber ${CR(M.Chamber.ink,M.Chamber.bg).toFixed(2)}`);
