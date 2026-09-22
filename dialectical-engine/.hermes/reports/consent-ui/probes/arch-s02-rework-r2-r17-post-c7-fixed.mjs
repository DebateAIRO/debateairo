// ARCH-S02-REWORK-R2 — B3's discharge probe. A copy of the reviewer's
// arch-rev-s02-r2-r17-post-c7.mjs (byte-identical except for the two changes declared below),
// re-run against the CORRECTED case-4/case-5 text.
//
// The reviewer's original showed: STAGE c4 6/6, STAGE c7 4/6 (cases 4 and 5 FAIL), and
// STAGE c7-unfixed 6/6 — i.e. the B1 defect was propping cases 4 and 5 up.
//
// EXACTLY TWO THINGS CHANGED FROM THE ORIGINAL, both declared:
//   (1) THE CASE-4/CASE-5 ROUTE. Both now reach the "both boxes checked" state through the
//       modal's acknowledgement — open the policy from the unchecked privacy row, satisfy the
//       scroll gate, activate `I have read it`, then click `adult-affirmed` — instead of
//       through a bare privacy .click(). This is V-DECISIONS row V-18 default (a). The
//       PROPERTY each case asserts is unchanged: both ticked -> NOT disabled. Case 5 keeps
//       its assignment-announces-nothing first half AND its reset, unchanged.
//   (2) THE HARNESS COMPONENT GAINS THE ACKNOWLEDGEMENT AFFORDANCE the route needs and the
//       original had no reason to model: the dialog now renders a scroll region
//       (`.policyScroll`) and a `button.ack` ("I have read it") that is DISABLED until the
//       R15 gate latches (`scrollTop + clientHeight >= scrollHeight - 8`), plus the C7
//       acknowledgement handler pinned by S02-S53 (set the DOM .checked AND the R17 mirror,
//       then close). Modelled only at the stages that have a modal at all — at STAGE c4 the
//       row handler does not exist, so nothing opens and the route throws, which is the
//       measurement that says cases 4 and 5 cannot live in cluster C4.
// Nothing else is touched: cases 1, 2, 3 and 6 are byte-identical to the reviewer's, and the
// three stages, the mirror rule and the click rule are the reviewer's own.
//
// Cases are transcribed from SPEC.md:370-385 and PLAN.md S02-S25..S02-S30.
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
    const [gate,setGate]=React.useState(false);         // change (2): R15's latching scroll gate
    const ref=React.useRef(null);
    function rowClick(e){
      if (stage === "c4") return;                       // C4: no row handler yet
      if (p) { if (e.target !== ref.current) ref.current.click(); return; }
      e.preventDefault(); setGate(false); setOpen(true);
    }
    function onPrivacyChange(e){
      if (stage === "c7") return setP(e.currentTarget.checked && !e.nativeEvent.defaultPrevented); // B1 fix
      return setP(e.currentTarget.checked);                                                        // round 0
    }
    function onScroll(e){                               // change (2): S02-S40's gate, latching
      const r=e.currentTarget;
      if (r.scrollTop + r.clientHeight >= r.scrollHeight - 8) setGate(true);
    }
    function ack(){                                     // change (2): S02-S53's pinned handler
      if (ref.current) ref.current.checked = true;      // the DOM half
      setP(true);                                       // the R17 mirror half
      setOpen(false);
    }
    return h(React.Fragment,null,
      h("form",null,
        h("label",null,h("input",{name:"adult-affirmed",type:"checkbox",onChange:e=>setA(e.currentTarget.checked)})),
        h("div",{onClick:rowClick},
          h("input",{ref,name:"privacy-accepted",type:"checkbox",onChange:onPrivacyChange})),
        h("button",{type:"submit",disabled:!(a&&p)},"Create account")),
      open?h("div",{role:"dialog"},
        h("div",{className:"policyScroll",onScroll}),
        h("button",{className:"ack",type:"button",disabled:!gate,onClick:ack},"I have read it")):null);
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
// change (1): THE LAWFUL ROUTE to a ticked privacy box — V-18 (a). Used by cases 4 and 5 only.
// Throws, rather than returning false, so the STAGE that cannot run it says WHY in its output.
async function ackRoute(){
  await act(async()=>{ f("privacy-accepted").click(); });            // opens the policy
  const region = document.querySelector(".policyScroll");
  if (!region) throw new Error("NO MODAL AT THIS STAGE — the acknowledgement route does not exist until C7 wires the modal into SignUpFlow; this case cannot live in cluster C4");
  Object.defineProperty(region,"scrollHeight",{value:600,configurable:true});
  Object.defineProperty(region,"clientHeight",{value:300,configurable:true});
  Object.defineProperty(region,"scrollTop",  {value:300,configurable:true});   // 300+300 >= 600-8
  await act(async()=>{ region.dispatchEvent(new Event("scroll",{bubbles:true})); });
  const ackBtn = document.querySelector("button.ack");
  if (!ackBtn) throw new Error("no 'I have read it' control");
  if (ackBtn.disabled) throw new Error("'I have read it' still disabled — the R15 scroll gate did not latch");
  await act(async()=>{ ackBtn.click(); });
  if (document.querySelector('[role="dialog"]')) throw new Error("the acknowledgement did not close the modal");
  return true;
}
const CASES = {
  "S02-S25 case1 neither          -> expect disabled=true ": async () => btn().disabled === true,
  "S02-S26 case2 only adult       -> expect disabled=true ": async () => {
    await act(async()=>{ f("adult-affirmed").click(); }); return btn().disabled === true; },
  "S02-S27 case3 only privacy     -> expect disabled=true ": async () => {
    await act(async()=>{ f("privacy-accepted").click(); }); return btn().disabled === true; },
  "S02-S28 case4 BOTH via the modal ack -> expect disabled=FALSE": async () => {
    await ackRoute();                                            // privacy ticks lawfully
    await act(async()=>{ f("adult-affirmed").click(); });
    return btn().disabled === false && f("privacy-accepted").checked === true; },
  "S02-S29 case5 assign,reset,modal ack -> expect disabled=FALSE": async () => {
    f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
    await act(async()=>{});
    if (btn().disabled !== true) return false;                   // first half — UNCHANGED
    f("adult-affirmed").checked = false; f("privacy-accepted").checked = false;  // the reset — UNCHANGED
    await act(async()=>{ f("adult-affirmed").click(); });
    await ackRoute();                                            // privacy ticks lawfully
    return btn().disabled === false && f("privacy-accepted").checked === true; },
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
