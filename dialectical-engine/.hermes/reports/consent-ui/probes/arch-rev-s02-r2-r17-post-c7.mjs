// ARCH-REV-S02 r2 — does R17's six-case gate suite (S02-S25..S02-S30, cluster C4) still pass
// once C7's click rule + the B1 mirror fix land in the SAME component?
// C7's command now RUNS tests/render/consent-signup-gate.test.tsx (the N7 chain rule added
// THIS round), so this is C7's own acceptance, not a distant integration concern.
// Cases are transcribed from SPEC.md:370-385 and PLAN.md S02-S25..S02-S30, verbatim in behaviour.
import { JSDOM } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/node_modules/jsdom/lib/api.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const k of ["window","document","HTMLElement","Event","MouseEvent","KeyboardEvent","Node",
                 "MutationObserver","requestAnimationFrame","cancelAnimationFrame","FormData","getComputedStyle"]) {
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const R = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/node_modules/";
const React = (await import(R + "react/index.js")).default;
const { createRoot } = await import(R + "react-dom/client.js");
const { act } = await import(R + "react/index.js");
const h = React.createElement;

// STAGE = "c4"  -> the component as C4 leaves it: R17 mirror only, NO row click rule (no modal).
// STAGE = "c7"  -> the component as C7 leaves it: + the one click rule + the B1 mirror fix.
// STAGE = "c7-unfixed" -> C7's click rule with ROUND 0's mirror (the B1 defect), for contrast.
function makeApp(stage) {
  function App() {
    const [a,setA]=React.useState(false), [p,setP]=React.useState(false), [open,setOpen]=React.useState(false);
    const ref=React.useRef(null);
    function rowClick(e){
      if (stage === "c4") return;                       // C4: no row handler yet
      if (p) { if (e.target !== ref.current) ref.current.click(); return; }
      e.preventDefault(); setOpen(true);
    }
    function onPrivacyChange(e){
      if (stage === "c7") return setP(e.currentTarget.checked && !e.nativeEvent.defaultPrevented); // B1 fix
      return setP(e.currentTarget.checked);                                                        // round 0
    }
    return h(React.Fragment,null,
      h("form",null,
        h("label",null,h("input",{name:"adult-affirmed",type:"checkbox",onChange:e=>setA(e.currentTarget.checked)})),
        h("div",{onClick:rowClick},
          h("input",{ref,name:"privacy-accepted",type:"checkbox",onChange:onPrivacyChange})),
        h("button",{type:"submit",disabled:!(a&&p)},"Create account")),
      open?h("div",{role:"dialog"}):null);
  }
  return App;
}
const f=n=>document.querySelector(`input[name="${n}"]`);
const btn=()=>document.querySelector('button[type="submit"]');
async function mount(stage){
  const c=document.createElement("div"); document.body.append(c);
  const root=createRoot(c); await act(async()=>root.render(h(makeApp(stage))));
  return { teardown: async()=>{ await act(async()=>root.unmount()); c.remove(); } };
}
const CASES = {
  "S02-S25 case1 neither          -> expect disabled=true ": async () => btn().disabled === true,
  "S02-S26 case2 only adult       -> expect disabled=true ": async () => {
    await act(async()=>{ f("adult-affirmed").click(); }); return btn().disabled === true; },
  "S02-S27 case3 only privacy     -> expect disabled=true ": async () => {
    await act(async()=>{ f("privacy-accepted").click(); }); return btn().disabled === true; },
  "S02-S28 case4 BOTH             -> expect disabled=FALSE": async () => {
    await act(async()=>{ f("adult-affirmed").click(); f("privacy-accepted").click(); });
    return btn().disabled === false; },
  "S02-S29 case5 assign,reset,click-> expect disabled=FALSE": async () => {
    f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
    await act(async()=>{});
    if (btn().disabled !== true) return false;                   // first half
    f("adult-affirmed").checked = false; f("privacy-accepted").checked = false;
    await act(async()=>{ f("adult-affirmed").click(); f("privacy-accepted").click(); });
    return btn().disabled === false; },
  "S02-S30 case6 assign adult,click privacy -> disabled=true+adult stays true": async () => {
    f("adult-affirmed").checked = true;
    await act(async()=>{ f("privacy-accepted").click(); });
    return btn().disabled === true && f("adult-affirmed").checked === true; },
};
for (const stage of ["c4","c7","c7-unfixed"]) {
  console.log(`\n===== STAGE ${stage} =====`);
  let fails=0;
  for (const [name, run] of Object.entries(CASES)) {
    const { teardown } = await mount(stage);
    let ok=false, err=null;
    try { ok = await run(); } catch (e) { err = e.message; }
    if (!ok) fails++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${err ? "  ERROR:"+err : ""}`);
    await teardown();
  }
  console.log(`  ---- STAGE ${stage}: ${6-fails}/6 pass, ${fails} FAIL`);
}
