// REQ-01 rework R2 — B5, second question.
// S02/SPEC.md v2 :355-358 says R17's FIFTH hook case exists "so a future seat that switches to
// controlled inputs breaks a test that names the reason". b5-remedy-probe.mjs measured that the
// reviewer's suggested rewrite (reset .checked=false, then click()) PASSES under the controlled
// implementation too — i.e. it fixes the unsatisfiability but does not serve the stated purpose.
// So: WHICH pin actually goes red when the inputs become controlled? Four implementation
// variants x four candidate pins, three runs.
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
const submit = async () => act(async () => {
  document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
});
async function mount(opts) {
  const { App, calls } = makeApp(opts);
  const c = document.createElement("div"); document.body.append(c);
  const root = createRoot(c);
  await act(async () => root.render(h(App)));
  return { calls, teardown: async () => { await act(async () => root.unmount()); c.remove(); } };
}

// ---- candidate pins. Each returns the OBSERVED value; `want` is what the v3-pinned impl gives.
const pins = {
  // P1: the fifth case as the reviewer proposes rewriting it (reset, then click)
  "P1 reset-then-click enables the button": {
    want: "disabled=true then enabled=true",
    async run(opts) {
      const { teardown } = await mount(opts);
      f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
      const half1 = btn().disabled;
      f("adult-affirmed").checked = false; f("privacy-accepted").checked = false;
      await act(async () => { f("adult-affirmed").click(); f("privacy-accepted").click(); });
      const out = `disabled=${half1} then enabled=${!btn().disabled}`;
      await teardown(); return out;
    },
  },
  // P2: the EXISTING suite's case — assign both, bare programmatic submit
  "P2 assign both + bare submit -> register calls": {
    want: "1",
    async run(opts) {
      const { calls, teardown } = await mount(opts);
      f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
      await submit();
      const out = String(calls.length);
      await teardown(); return out;
    },
  },
  // P3: assignment survives an unrelated React re-render (controlled inputs get RESET by React)
  "P3 assigned .checked survives a re-render": {
    want: "true",
    async run(opts) {
      const { teardown } = await mount(opts);
      f("adult-affirmed").checked = true;                       // assign, no dispatch
      await act(async () => { f("privacy-accepted").click(); });// force a React render
      const out = String(f("adult-affirmed").checked);
      await teardown(); return out;
    },
  },
  // P4: the two halves of the fifth case, with NO reset (v2 as written) - the B5 control
  "P4 v2-as-written: assign true then click()": {
    want: "disabled=true then enabled=true",
    async run(opts) {
      const { teardown } = await mount(opts);
      f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
      const half1 = btn().disabled;
      await act(async () => { f("adult-affirmed").click(); f("privacy-accepted").click(); });
      const out = `disabled=${half1} then enabled=${!btn().disabled}`;
      await teardown(); return out;
    },
  },
};

const variants = {
  "A uncontrolled+FormData  (v3 PINNED)": { controlled: false, truthSource: "formdata" },
  "B controlled+mirror      (v1 shape)  ": { controlled: true,  truthSource: "mirror" },
  "C uncontrolled+mirror    (R18 forbids)": { controlled: false, truthSource: "mirror" },
  "D controlled+FormData    (untested until now)": { controlled: true, truthSource: "formdata" },
};

for (let run = 1; run <= 3; run++) {
  console.log(`\n########################## RUN ${run} of 3 ##########################`);
  for (const [pinName, pin] of Object.entries(pins)) {
    console.log(`\n### ${pinName}   [want, under the v3-pinned impl: ${pin.want}]`);
    for (const [vName, opts] of Object.entries(variants)) {
      const got = await pin.run(opts);
      const red = got !== pin.want;
      console.log(`   ${vName.padEnd(46)} got=${got.padEnd(34)} ${red ? "<<< RED (pin discriminates)" : "green"}`);
    }
  }
}
