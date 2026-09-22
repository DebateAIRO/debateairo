// ARCH-S02-REWORK-R1 — ARCH-REV-S02 probe 2, RE-RUN AGAINST THE CORRECTED RULE (B1).
//
// This file is a byte-copy of .hermes/reports/consent-ui/probes/c7-mirror-desync-probe.mjs
// with ONLY the component changed, so the two can be diffed. The original stays untouched.
// The corrected rule, pinned in slices/S02/DECISIONS.md (2026-09-06, ARCH-S02-REWORK-R1):
//   member 1 — the privacy input's onChange mirrors the SETTLED checked value:
//              setP(e.currentTarget.checked && !e.nativeEvent.defaultPrevented)
//   member 2 — every dismissal route (x / Esc / backdrop) resyncs the mirror from the DOM.
// MEASURED ORDER that makes member 1 correct: React fires the ROW's onClick BEFORE the
// INPUT's onChange, so defaultPrevented is already true when the mirror is written.
//
// Original header, kept for the diff:
// PLAN.md (§Cluster S02-C7, and DECISIONS 2026-09-06 ARCH-S02 "The single click rule for the
// privacy row") pins: one onClick on the ROW; if the box is UNCHECKED -> event.preventDefault()
// unconditionally, then open the modal. R17's mirror is an onChange on the INPUT.
//
// Question the PLAN never asks: preventDefault reverts the DOM .checked, but does React's
// onChange still fire? If it does, the mirror says true while the DOM says false, and
// `Create account`'s disabled attribute (which R17 computes from the mirror ALONE) enables
// with the privacy box visibly empty and the policy never acknowledged.
import { JSDOM } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/node_modules/jsdom/lib/api.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const k of ["window", "document", "HTMLElement", "Event", "MouseEvent", "KeyboardEvent", "Node",
                 "MutationObserver", "requestAnimationFrame", "cancelAnimationFrame", "FormData",
                 "getComputedStyle"]) {
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const R = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/node_modules/";
const React = (await import(R + "react/index.js")).default;
const { createRoot } = await import(R + "react-dom/client.js");
const { act } = await import(R + "react/index.js");
const h = React.createElement;

let mirrorSpy = { a: null, p: null };
function makeApp() {
  const registerCalls = [];
  function App() {
    const [a, setA] = React.useState(false);
    const [p, setP] = React.useState(false);
    const [open, setOpen] = React.useState(false);
    const privacyRef = React.useRef(null);
    mirrorSpy = { a, p };
    function onSubmit(e) {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      if (fd.get("adult-affirmed") !== "on" || fd.get("privacy-accepted") !== "on") return; // R18
      registerCalls.push(["email", "pw", "rec", true]);
    }
    function rowClick(e) {
      if (p) { if (e.target !== privacyRef.current) privacyRef.current.click(); return; }
      e.preventDefault(); setOpen(true);
    }
    // CORRECTED, member 2: every dismissal route resyncs the mirror from the DOM.
    function close() {
      setP(privacyRef.current ? privacyRef.current.checked : false);
      setOpen(false);
    }
    return h(React.Fragment, null,
      h("form", { onSubmit },
        h("label", { className: "consentRow" },
          h("input", { name: "adult-affirmed", type: "checkbox", required: true,
                       onChange: (e) => setA(e.currentTarget.checked) }),
          h("span", null, "I am 18 or over.")),
        h("div", { className: "consentRow", onClick: rowClick },
          h("input", { ref: privacyRef, name: "privacy-accepted", type: "checkbox", required: true,
                       // CORRECTED, member 1: mirror the SETTLED checked value.
                       onChange: (e) => setP(e.currentTarget.checked && !e.nativeEvent.defaultPrevented) }),
          h("span", { id: "pt" }, "I agree to the "),
          h("button", { type: "button" }, "Privacy Policy")),
        h("button", { type: "submit", disabled: !(a && p) }, "Create account")),
      open ? h("div", { role: "dialog" },
               h("button", { className: "x", onClick: close }, "×")) : null);
  }
  return { App, registerCalls };
}
const f = (n) => document.querySelector(`input[name="${n}"]`);
const btn = () => document.querySelector('button[type="submit"]');
const dlg = () => document.querySelector('[role="dialog"]');
async function mount() {
  const { App, registerCalls } = makeApp();
  const c = document.createElement("div"); document.body.append(c);
  const root = createRoot(c);
  await act(async () => root.render(h(App)));
  return { registerCalls, teardown: async () => { await act(async () => root.unmount()); c.remove(); } };
}
const line = (label, v) => console.log("    " + String(label).padEnd(52) + JSON.stringify(v));

for (let run = 1; run <= 3; run++) {
  console.log(`\n=================== RUN ${run} of 3 ===================`);

  console.log("\n  SCENARIO 1 — click the UNCHECKED privacy box, then dismiss with the x button");
  {
    const { registerCalls, teardown } = await mount();
    await act(async () => { f("adult-affirmed").click(); });
    await act(async () => { f("privacy-accepted").click(); });
    line("dialog open (S02-S49 expects true)", !!dlg());
    line("DOM .checked (S02-S49 expects false)", f("privacy-accepted").checked);
    line("R17 mirror p  [PLAN asserts this NOWHERE]", mirrorSpy.p);
    await act(async () => { document.querySelector("button.x").click(); });   // S02-S54 route
    line("after x: dialog (S02-S54 expects null)", dlg());
    line("after x: DOM .checked (S02-S54: false)", f("privacy-accepted").checked);
    line("after x: Create account .disabled", btn().disabled);
    console.log("      ^^ SPEC V-step 7 requires 'Create account still disabled' here.");
    await act(async () => {
      document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    line("register() calls (R18 refusal holds?)", registerCalls.length);
    await teardown();
  }

  console.log("\n  SCENARIO 2 — click the UNCHECKED privacy box TWICE (no acknowledgement at all)");
  {
    const { registerCalls, teardown } = await mount();
    await act(async () => { f("adult-affirmed").click(); });
    await act(async () => { f("privacy-accepted").click(); });   // mirror -> true, DOM -> false
    await act(async () => { f("privacy-accepted").click(); });   // mirror says CHECKED -> no preventDefault
    line("DOM .checked after 2nd click", f("privacy-accepted").checked);
    line("R17 mirror p", mirrorSpy.p);
    line("Create account .disabled", btn().disabled);
    await act(async () => {
      document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    line("register() calls  [MUST be 0 per V's goal]", registerCalls.length);
    console.log("      ^^ SPEC invariant 1: 'the privacy box is ticked ONLY through the");
    console.log("         modal's acknowledgement'. No acknowledgement happened here.");
    await teardown();
  }
}
