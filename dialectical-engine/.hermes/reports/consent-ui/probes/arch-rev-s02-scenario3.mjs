// Browser-realistic path: the modal's scrim covers the row, so the user must dismiss FIRST.
// click unchecked box -> modal opens (box empty) -> press the x -> click the row TEXT.
import { JSDOM } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/node_modules/jsdom/lib/api.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const k of ["window","document","HTMLElement","Event","MouseEvent","Node","MutationObserver",
                 "requestAnimationFrame","cancelAnimationFrame","FormData","getComputedStyle"])
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const R = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/node_modules/";
const React = (await import(R+"react/index.js")).default;
const { createRoot } = await import(R+"react-dom/client.js");
const { act } = await import(R+"react/index.js");
const h = React.createElement;
function App({ sink }) {
  const [a,setA]=React.useState(false),[p,setP]=React.useState(false),[open,setOpen]=React.useState(false);
  const ref=React.useRef(null); sink.p=p;
  function onSubmit(e){e.preventDefault();const fd=new FormData(e.currentTarget);
    if(fd.get("adult-affirmed")!=="on"||fd.get("privacy-accepted")!=="on")return; sink.reg++;}
  function rowClick(e){ if(p){ if(e.target!==ref.current) ref.current.click(); return; }
    e.preventDefault(); setOpen(true); }
  return h(React.Fragment,null,
    h("form",{onSubmit},
      h("label",null,h("input",{name:"adult-affirmed",type:"checkbox",onChange:e=>setA(e.currentTarget.checked)})),
      h("div",{onClick:rowClick},
        h("input",{ref,name:"privacy-accepted",type:"checkbox",onChange:e=>setP(e.currentTarget.checked)}),
        h("span",{id:"pt"},"I agree to the "),
        h("button",{type:"button"},"Privacy Policy")),
      h("button",{type:"submit",disabled:!(a&&p)},"Create account")),
    open?h("div",{role:"dialog"},h("button",{className:"x",onClick:()=>setOpen(false)},"x")):null);
}
const f=n=>document.querySelector(`input[name="${n}"]`), btn=()=>document.querySelector('button[type="submit"]');
for (let run=1;run<=3;run++){
  const sink={p:false,reg:0};
  const c=document.createElement("div");document.body.append(c);const root=createRoot(c);
  await act(async()=>root.render(h(App,{sink})));
  await act(async()=>{f("adult-affirmed").click();});
  await act(async()=>{f("privacy-accepted").click();});          // modal opens, box stays empty
  await act(async()=>{document.querySelector("button.x").click();}); // dismiss WITHOUT acknowledging
  await act(async()=>{document.getElementById("pt").click();});   // click the row TEXT (S02-S50's target)
  await act(async()=>{document.querySelector("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
  console.log(`run ${run}: after [click box -> x -> click row text]  DOM .checked=${f("privacy-accepted").checked}`,
              `mirror=${sink.p} submitDisabled=${btn().disabled} register()calls=${sink.reg}`,
              `dialogReopened=${!!document.querySelector('[role="dialog"]')}`);
  await act(async()=>root.unmount()); c.remove();
}
