// ARCH-S02-REWORK-R2 — the alternatives I rejected for B3, each with the measurement that
// rejected it (COMMON §10.1's substitute for brainstorming's human gate; heartbeat-architecture
// "every choice, appended same day"). Same harness shape as the reviewer's r2 probes.
//
//   ALT-2  "R17 case 4 keeps its bare .click() and C7 is EXEMPTED from running the gate file."
//          The only implementation that can satisfy the literal case is one where a bare click
//          on the EMPTY privacy box ticks it. Measured below: that implementation lets
//          client.register() fire with the policy never opened and never acknowledged.
//   ALT-3  "Keep cases 4/5 in C4 and reach both-checked by ASSIGNMENT (no modal needed)."
//          Measured below: an assignment never reaches React, so the button stays disabled and
//          the case is unsatisfiable at every stage.
//   RESET  Is case 5's reset still load-bearing once the privacy half goes through the modal?
//          Measured below, per input.
import { JSDOM } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/node_modules/jsdom/lib/api.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const k of ["window","document","HTMLElement","Event","MouseEvent","KeyboardEvent","Node",
                 "MutationObserver","requestAnimationFrame","cancelAnimationFrame","FormData","getComputedStyle"])
  Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const R = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/node_modules/";
const React = (await import(R + "react/index.js")).default;
const { createRoot } = await import(R + "react-dom/client.js");
const { act } = await import(R + "react/index.js");
const h = React.createElement;

let registerCalls = 0;
// RULE "pinned"      — C7's click rule + the B1 mirror fix (what this PLAN pins).
// RULE "case4literal" — the ONLY rule under which R17 case 4's literal text can pass: a bare
//                       click on the empty privacy box ticks it (no preventDefault).
function makeApp(rule) {
  return function App(){
    const [a,setA]=React.useState(false),[p,setP]=React.useState(false),[open,setOpen]=React.useState(false);
    const [gate,setGate]=React.useState(false);
    const ref=React.useRef(null);
    function rowClick(e){
      if (p) { if (e.target !== ref.current) ref.current.click(); return; }
      if (rule === "case4literal") { setOpen(true); return; }   // opens AND lets the tick happen
      e.preventDefault(); setGate(false); setOpen(true);
    }
    function onScroll(e){ const r=e.currentTarget;
      if (r.scrollTop + r.clientHeight >= r.scrollHeight - 8) setGate(true); }
    function ack(){ if(ref.current) ref.current.checked=true; setP(true); setOpen(false); }
    function onSubmit(e){
      e.preventDefault();
      const d = new FormData(e.currentTarget);
      if (d.get("adult-affirmed") !== "on" || d.get("privacy-accepted") !== "on") return;
      registerCalls++;
    }
    return h(React.Fragment,null,
      h("form",{onSubmit},
        h("label",null,h("input",{name:"adult-affirmed",type:"checkbox",onChange:e=>setA(e.currentTarget.checked)})),
        h("div",{onClick:rowClick},
          h("input",{ref,name:"privacy-accepted",type:"checkbox",
            onChange:e=>setP(e.currentTarget.checked && !e.nativeEvent.defaultPrevented)})),
        h("button",{type:"submit",disabled:!(a&&p)},"Create account")),
      open?h("div",{role:"dialog"},
        h("div",{className:"policyScroll",onScroll}),
        h("button",{className:"ack",type:"button",disabled:!gate,onClick:ack},"I have read it")):null);
  };
}
const f=n=>document.querySelector(`input[name="${n}"]`);
const btn=()=>document.querySelector('button[type="submit"]');
const dialog=()=>document.querySelector('[role="dialog"]');
async function mount(rule){
  const c=document.createElement("div"); document.body.append(c);
  const root=createRoot(c); await act(async()=>root.render(h(makeApp(rule))));
  return { teardown: async()=>{ await act(async()=>root.unmount()); c.remove(); } };
}
async function ackRoute(){
  await act(async()=>{ f("privacy-accepted").click(); });
  const region=document.querySelector(".policyScroll"); if(!region) return "NO MODAL";
  Object.defineProperty(region,"scrollHeight",{value:600,configurable:true});
  Object.defineProperty(region,"clientHeight",{value:300,configurable:true});
  Object.defineProperty(region,"scrollTop",  {value:300,configurable:true});
  await act(async()=>{ region.dispatchEvent(new Event("scroll",{bubbles:true})); });
  const b=document.querySelector("button.ack"); if(!b||b.disabled) return "GATE NOT LATCHED";
  await act(async()=>{ b.click(); }); return "ACKNOWLEDGED";
}
async function submitNow(){
  await act(async()=>{ document.querySelector("form").dispatchEvent(
    new dom.window.Event("submit",{bubbles:true,cancelable:true})); });
}

for (let run=1; run<=3; run++){
  console.log(`\n########## RUN ${run} ##########`);

  // ---- ALT-2 -------------------------------------------------------------------------------
  registerCalls = 0;
  let t = await mount("case4literal");
  await act(async()=>{ f("adult-affirmed").click(); });
  await act(async()=>{ f("privacy-accepted").click(); });      // ONE bare click on the empty box
  const litTicked = f("privacy-accepted").checked, litDisabled = btn().disabled;
  await submitNow();
  console.log(`ALT-2 literal-case-4 rule : bare click ticked box=${litTicked} btnDisabled=${litDisabled} ` +
              `acknowledgements=0 register()=${registerCalls}  <- V's goal forbids exactly this`);
  await t.teardown();

  // control: the pinned rule, same keystrokes
  registerCalls = 0;
  t = await mount("pinned");
  await act(async()=>{ f("adult-affirmed").click(); });
  await act(async()=>{ f("privacy-accepted").click(); });
  const pinTicked = f("privacy-accepted").checked, pinDisabled = btn().disabled;
  await submitNow();
  console.log(`      pinned rule CONTROL : bare click ticked box=${pinTicked} btnDisabled=${pinDisabled} ` +
              `acknowledgements=0 register()=${registerCalls} dialogOpen=${!!dialog()}`);
  await t.teardown();

  // ---- ALT-3 -------------------------------------------------------------------------------
  t = await mount("pinned");
  f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
  await act(async()=>{});
  console.log(`ALT-3 assignment-only route: btnDisabled=${btn().disabled} (case 4 needs false) ` +
              `-> unsatisfiable in C4 and in C7 alike`);
  await t.teardown();

  // ---- RESET -------------------------------------------------------------------------------
  t = await mount("pinned");
  f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
  await act(async()=>{});
  const half1 = btn().disabled;
  f("adult-affirmed").checked = false; f("privacy-accepted").checked = false;   // WITH the reset
  await act(async()=>{ f("adult-affirmed").click(); });
  const rWith = await ackRoute();
  console.log(`RESET with reset          : firstHalfDisabled=${half1} route=${rWith} ` +
              `btnDisabled=${btn().disabled} (case 5 needs false)`);
  await t.teardown();

  t = await mount("pinned");
  f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
  await act(async()=>{});
  // NO reset: click adult-affirmed while it is already assigned true
  await act(async()=>{ f("adult-affirmed").click(); });
  const adultAfter = f("adult-affirmed").checked;
  const rNo = await ackRoute();
  console.log(`RESET without reset       : adultCheckedAfterClick=${adultAfter} route=${rNo} ` +
              `btnDisabled=${btn().disabled} <- reset is STILL load-bearing, on adult-affirmed`);
  await t.teardown();
}
