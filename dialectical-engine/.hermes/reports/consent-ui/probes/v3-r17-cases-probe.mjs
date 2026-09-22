// REQ-01 rework R2 — the SIX R17 hook cases EXACTLY as slices/S02/SPEC.md v3 words them,
// executed before the words are written. Four implementation variants x 3 runs.
// Under the PINNED variant A every case must pass; the case that carries the
// "a seat that switches to controlled inputs breaks this" guarantee must go RED under the
// controlled variants (B, D) and only there.
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

function makeApp({ controlled, truthSource }) {
  const calls = [];
  function App() {
    const [a, setA] = React.useState(false);
    const [p, setP] = React.useState(false);
    function onSubmit(e) {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const av = truthSource === "mirror" ? a : fd.get("adult-affirmed") === "on";
      const pv = truthSource === "mirror" ? p : fd.get("privacy-accepted") === "on";
      if (!av || !pv) return;
      calls.push([av, pv]);
    }
    const box = (name, v, set) =>
      controlled
        ? h("input", { name, type: "checkbox", required: true, checked: v,
                       onChange: (e) => set(e.currentTarget.checked) })
        : h("input", { name, type: "checkbox", required: true,
                       onChange: (e) => set(e.currentTarget.checked) });
    return h("form", { onSubmit }, box("adult-affirmed", a, setA), box("privacy-accepted", p, setP),
      h("button", { type: "submit", disabled: !(a && p) }, "Create account"));
  }
  return { App, calls };
}
const f = (n) => document.querySelector(`input[name="${n}"]`);
const btn = () => document.querySelector("button");
async function mount(opts) {
  const { App, calls } = makeApp(opts);
  const c = document.createElement("div"); document.body.append(c);
  const root = createRoot(c);
  await act(async () => root.render(h(App)));
  return { calls, teardown: async () => { await act(async () => root.unmount()); c.remove(); } };
}

const cases = {
  "case 1  neither box -> disabled": async (o) => {
    const { teardown } = await mount(o);
    const r = btn().disabled === true; await teardown(); return r;
  },
  "case 2  only adult-affirmed via click() -> disabled": async (o) => {
    const { teardown } = await mount(o);
    await act(async () => { f("adult-affirmed").click(); });
    const r = btn().disabled === true; await teardown(); return r;
  },
  "case 3  only privacy-accepted via click() -> disabled": async (o) => {
    const { teardown } = await mount(o);
    await act(async () => { f("privacy-accepted").click(); });
    const r = btn().disabled === true; await teardown(); return r;
  },
  "case 4  both via click() -> NOT disabled": async (o) => {
    const { teardown } = await mount(o);
    await act(async () => { f("adult-affirmed").click(); f("privacy-accepted").click(); });
    const r = btn().disabled === false; await teardown(); return r;
  },
  "case 5  assign true both/no dispatch -> disabled; reset false; click both -> enables": async (o) => {
    const { teardown } = await mount(o);
    f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
    const half1 = btn().disabled === true;
    f("adult-affirmed").checked = false; f("privacy-accepted").checked = false;
    await act(async () => { f("adult-affirmed").click(); f("privacy-accepted").click(); });
    const half2 = btn().disabled === false;
    const r = half1 && half2; await teardown(); return r;
  },
  "case 6  assign adult only/no dispatch; click privacy; adult .checked STILL true + still disabled": async (o) => {
    const { teardown } = await mount(o);
    f("adult-affirmed").checked = true;                        // assign, never dispatched
    await act(async () => { f("privacy-accepted").click(); }); // forces a React re-render
    const stillChecked = f("adult-affirmed").checked === true;
    const stillDisabled = btn().disabled === true;
    const r = stillChecked && stillDisabled; await teardown(); return r;
  },
};

const variants = {
  "A uncontrolled+FormData  (v3 PINNED)  ": { controlled: false, truthSource: "formdata" },
  "B controlled+mirror      (v1's shape) ": { controlled: true,  truthSource: "mirror" },
  "C uncontrolled+mirror    (R18 forbids)": { controlled: false, truthSource: "mirror" },
  "D controlled+FormData                 ": { controlled: true,  truthSource: "formdata" },
};

for (let run = 1; run <= 3; run++) {
  console.log(`\n########################## RUN ${run} of 3 ##########################`);
  console.log("  case".padEnd(76) + Object.keys(variants).map((v) => v.trim().slice(0, 1)).join("   "));
  for (const [name, fn] of Object.entries(cases)) {
    const cells = [];
    for (const opts of Object.values(variants)) cells.push((await fn(opts)) ? "PASS" : "RED ");
    console.log("  " + name.padEnd(74) + cells.join("  "));
  }
  console.log("  legend: A=uncontrolled+FormData (pinned)  B=controlled+mirror  C=uncontrolled+mirror  D=controlled+FormData");
}
