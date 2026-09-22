// Which rounding/compositing variant yields Terracotta 5.61 at alpha .70?
const T = { ink: [41,38,31], bg: [249,246,241], shell: [239,233,224], core:[253,251,246] };
const lin = c => { const s=c/255; return s<=0.03928 ? s/12.92 : ((s+0.055)/1.055)**2.4; };
const lum = r => 0.2126*lin(r[0])+0.7152*lin(r[1])+0.0722*lin(r[2]);
const cr = (a,b)=>{const la=lum(a),lb=lum(b);const[h,l]=la>lb?[la,lb]:[lb,la];return (h+0.05)/(l+0.05);};
const mk = (f)=> (fg,bg,a)=> fg.map((v,i)=> f(a*v+(1-a)*bg[i]));
const variants = {
  round: mk(Math.round), floor: mk(Math.floor), ceil: mk(Math.ceil), trunc: mk(Math.trunc), raw: mk(x=>x)
};
for (const a of [0.65, 0.70]) {
  for (const [name, mix] of Object.entries(variants)) {
    const r = cr(mix(T.bg,T.shell,a), mix(T.ink,T.shell,a));
    console.log(`alpha=${a.toFixed(2)} ${name.padEnd(6)} -> ${r.toFixed(4)}  label=${mix(T.bg,T.shell,a).map(x=>Math.round(x))} face=${mix(T.ink,T.shell,a).map(x=>Math.round(x))}`);
  }
}
// what face/label pair would give 5.61? try face green channel 96 instead of 97 (round-half-down)
const label=[246,242,236];
for (const g of [95,96,97,98]) console.log(`face green=${g} -> ${cr(label,[100,g,89]).toFixed(4)}`);
for (const rch of [99,100,101]) console.log(`face red=${rch} -> ${cr(label,[rch,97,89]).toFixed(4)}`);
