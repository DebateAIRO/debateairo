// REQ-REV-01 ROUND 2 — which "dispatch a real event" idioms actually flip R17's mirror?
// v2 slices/S02/SPEC.md R17 hook + the new §Tests row offer TWO idioms as equivalent:
//   (a) field(name).click()
//   (b) field(name).dispatchEvent(new Event("change", { bubbles: true }))
// and R17's FIFTH hook case says: assign .checked=true on both WITHOUT dispatching,
// assert still disabled, "then dispatch and assert it enables".
// This matrix runs every combination against the v2-PINNED implementation.
import { JSDOM } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/node_modules/jsdom/lib/api.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const k of ["window", "document", "HTMLElement", "Event", "MouseEvent", "Node", "MutationObserver",
                 "requestAnimationFrame", "cancelAnimationFrame", "FormData", "getComputedStyle"]) {
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const R = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/node_modules/";
const React = (await import(R + "react/index.js")).default;
const { createRoot } = await import(R + "react-dom/client.js");
const { act } = await import(R + "react/index.js");
const h = React.createElement;
console.log("react", (await import(R + "react/package.json", { with: { type: "json" } })).default.version,
            "· jsdom", (await import("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/node_modules/jsdom/package.json", { with: { type: "json" } })).default.version);

function App() {                              // v2 R17 AS PINNED: uncontrolled + onChange mirror
  const [a, setA] = React.useState(false);
  const [p, setP] = React.useState(false);
  const box = (name, set) => h("input", { name, type: "checkbox", required: true,
                                          onChange: (e) => set(e.currentTarget.checked) });
  return h("form", {}, box("adult-affirmed", setA), box("privacy-accepted", setP),
    h("button", { type: "submit", disabled: !(a && p) }, "Create account"));
}
const f = (n) => document.querySelector(`input[name="${n}"]`);
const btn = () => document.querySelector("button");

async function trial(label, preAssign, dispatchFn) {
  const c = document.createElement("div"); document.body.append(c);
  const root = createRoot(c);
  await act(async () => root.render(h(App)));
  if (preAssign) { f("adult-affirmed").checked = true; f("privacy-accepted").checked = true; }
  const midDisabled = btn().disabled;
  await act(async () => { dispatchFn(f("adult-affirmed")); dispatchFn(f("privacy-accepted")); });
  const out = { label, preAssign, midDisabled,
                domChecked: `${f("adult-affirmed").checked}/${f("privacy-accepted").checked}`,
                buttonEnabled: !btn().disabled };
  await act(async () => root.unmount()); c.remove();
  return out;
}

const idioms = {
  ".click()":                                  (el) => el.click(),
  "dispatchEvent(new Event('change',{bubbles}))": (el) => el.dispatchEvent(new Event("change", { bubbles: true })),
  "dispatchEvent(new Event('click',{bubbles}))":  (el) => el.dispatchEvent(new Event("click", { bubbles: true })),
  "dispatchEvent(new MouseEvent('click',{bubbles}))": (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true })),
};

for (const pre of [false, true]) {
  console.log(`\n### preAssign .checked=true first ? ${pre}   ${pre ? "(this is R17's FIFTH hook case)" : "(this is R17 hook cases 1-4)"}`);
  console.log("  idiom".padEnd(52) + "DOM checked   button ENABLED?   verdict");
  for (const [name, fn] of Object.entries(idioms)) {
    const r = await trial(name, pre, fn);
    const want = true; // every one of these is offered as a way to make the button enable
    console.log(`  ${name.padEnd(50)} ${r.domChecked.padEnd(13)} ${String(r.buttonEnabled).padEnd(17)} ${r.buttonEnabled === want ? "OK" : "*** DOES NOT ENABLE THE BUTTON ***"}`);
  }
}
