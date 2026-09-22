// ARCH-REV-S02 r2 — I run my OWN proposed remedy through the probe before proposing it
// (the author's P8 finding against the reviewer contract, which I accept and adopt).
// Candidate: at C7, R17 cases 4 and 5 reach the "both checked" state through the modal's
// acknowledgement instead of through a bare privacy .click().
import { JSDOM } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/node_modules/jsdom/lib/api.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const k of ["window","document","HTMLElement","Event","MouseEvent","KeyboardEvent","Node",
                 "MutationObserver","requestAnimationFrame","cancelAnimationFrame","FormData","getComputedStyle"])
  Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const R="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/node_modules/";
const React=(await import(R+"react/index.js")).default;
const {createRoot}=await import(R+"react-dom/client.js");
const {act}=await import(R+"react/index.js");
const h=React.createElement;
function App(){
  const [a,setA]=React.useState(false),[p,setP]=React.useState(false),[open,setOpen]=React.useState(false);
  const ref=React.useRef(null);
  function rowClick(e){ if(p){ if(e.target!==ref.current) ref.current.click(); return;} e.preventDefault(); setOpen(true); }
  function ack(){ if(ref.current) ref.current.checked=true; setP(true); setOpen(false); }
  return h(React.Fragment,null,
    h("form",null,
      h("label",null,h("input",{name:"adult-affirmed",type:"checkbox",onChange:e=>setA(e.currentTarget.checked)})),
      h("div",{onClick:rowClick},h("input",{ref,name:"privacy-accepted",type:"checkbox",
        onChange:e=>setP(e.currentTarget.checked && !e.nativeEvent.defaultPrevented)})),
      h("button",{type:"submit",disabled:!(a&&p)},"Create account")),
    open?h("div",{role:"dialog"},h("button",{className:"ack",onClick:ack},"I have read it")):null);
}
const f=n=>document.querySelector(`input[name="${n}"]`), btn=()=>document.querySelector('button[type="submit"]');
for(let run=1;run<=3;run++){
  const c=document.createElement("div"); document.body.append(c); const root=createRoot(c);
  await act(async()=>root.render(h(App)));
  await act(async()=>{ f("adult-affirmed").click(); });
  await act(async()=>{ f("privacy-accepted").click(); });          // opens the modal
  await act(async()=>{ document.querySelector("button.ack").click(); });   // acknowledgement
  console.log(`run ${run}: REMEDY case4-via-modal -> DOM=${f("privacy-accepted").checked} btnDisabled=${btn().disabled} (case 4 wants disabled=false)`);
  await act(async()=>root.unmount()); c.remove();
}
