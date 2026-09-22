// REQ-REV-01 probe: does the existing test idiom `field(name).checked = true`
// still drive registration once the checkbox is React-CONTROLLED, as
// slices/S02/SPEC.md S02-R17 requires ("the component holds both in React state
// rather than reading them only from FormData at submit time")?
//
// Models the three existing cases in tests/render/auth-flow-integration.test.tsx
// (:324 / :448 / :466) under both candidate implementations.
import { JSDOM } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/node_modules/jsdom/lib/api.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const k of ["window", "document", "HTMLElement", "Event", "Node", "MutationObserver", "requestAnimationFrame", "cancelAnimationFrame", "FormData", "getComputedStyle"]) {
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const R = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/node_modules/";
const React = (await import(R + "react/index.js")).default;
const { createRoot } = await import(R + "react-dom/client.js");
const { act } = await import(R + "react/index.js");

const h = React.createElement;

function makeApp({ controlled }) {
  const calls = [];
  function App() {
    const [adult, setAdult] = React.useState(false);
    const [privacy, setPrivacy] = React.useState(false);
    // S02-R18: the handler refuses when either is false.
    // Under a CONTROLLED implementation the handler's truth is React state.
    // Under an UNCONTROLLED+mirror implementation it is FormData.
    function onSubmit(e) {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const a = controlled ? adult : fd.get("adult-affirmed") === "on";
      const p = controlled ? privacy : fd.get("privacy-accepted") === "on";
      if (!a || !p) return;              // S02-R18 defence in depth
      calls.push([a, p]);                // stands in for client.register(...)
    }
    const box = (name, value, set) =>
      controlled
        ? h("input", { name, type: "checkbox", required: true, checked: value,
                       onChange: (e) => set(e.target.checked) })
        : h("input", { name, type: "checkbox", required: true,
                       onChange: (e) => set(e.target.checked) });
    return h("form", { onSubmit },
      box("adult-affirmed", adult, setAdult),
      box("privacy-accepted", privacy, setPrivacy),
      // S02-R17: disabled reflects both states live
      h("button", { type: "submit", disabled: !(adult && privacy) }, "Create account"));
  }
  return { App, calls };
}

async function run(controlled) {
  const { App, calls } = makeApp({ controlled });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(h(App)));

  // EXACTLY the idiom the SPEC prescribes for the three existing cases:
  //   field("adult-affirmed").checked = true;  field("privacy-accepted").checked = true;
  const f = (n) => document.querySelector(`input[name="${n}"]`);
  f("adult-affirmed").checked = true;
  f("privacy-accepted").checked = true;

  const btnBefore = document.querySelector("button").disabled;

  // EXACTLY the submit helper at tests/render/auth-flow-integration.test.tsx:41-48
  await act(async () => {
    document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  console.log(`  implementation = ${controlled ? "CONTROLLED (what S02-R17 prescribes)" : "UNCONTROLLED + onChange mirror"}`);
  console.log(`    submit button still disabled after .checked=true : ${btnBefore}`);
  console.log(`    DOM .checked after render                        : ${f("adult-affirmed").checked}/${f("privacy-accepted").checked}`);
  console.log(`    register() calls                                 : ${calls.length}  ${calls.length ? JSON.stringify(calls) : "<-- suite would be RED"}`);
  await act(async () => root.unmount());
  container.remove();
}

console.log("PROBE: does `field(x).checked = true` + bare submit still reach register()?");
console.log("(three runs each, to show it is deterministic)\n");
for (const controlled of [true, false]) {
  for (let i = 1; i <= 3; i++) {
    process.stdout.write(`run ${i}\n`);
    await run(controlled);
  }
  console.log("");
}
