// ARCH-REV-S02 probe — do PLAN.md S02-S25..S02-S30 (SPEC R17's six cases, cluster C4)
// still pass once cluster C7's "one click rule for the privacy row" lands in the SAME file?
//
// The mission's own oracle (.hermes/reports/consent-ui/probes/v3-r17-cases-probe.mjs) runs the
// six cases against a component with NO privacy-row click handler at all. C7 adds one, and
// PLAN.md S02-S49 pins that clicking the UNCHECKED privacy input must leave it unchecked.
// Variant E below is the component the PLAN describes AFTER C7. Cases are byte-copied from the
// mission oracle so the only thing that changes is the implementation under test.
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
console.log("react", (await import(R + "react/package.json", { with: { type: "json" } })).default.version,
  "· jsdom", (await import("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/node_modules/jsdom/package.json", { with: { type: "json" } })).default.version);

// ---------------------------------------------------------------------------
// Variant A — the mission oracle's PINNED shape: uncontrolled + mirror, FormData at submit,
//             NO privacy-row click rule (i.e. the component as it exists after C3+C4 only).
// Variant E — the same, PLUS cluster C7's one click rule, exactly as PLAN.md words it:
//   "one onClick on the row - if the box is CHECKED, do not preventDefault, and if the click
//    did not originate on the input call input.click() ...; if it is UNCHECKED,
//    event.preventDefault() unconditionally and open the modal with mode='consent'."
// ---------------------------------------------------------------------------
function makeApp({ c7 }) {
  const calls = [];
  function App() {
    const [a, setA] = React.useState(false);
    const [p, setP] = React.useState(false);
    const [open, setOpen] = React.useState(false);
    const privacyRef = React.useRef(null);

    function onSubmit(e) {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const av = fd.get("adult-affirmed") === "on";
      const pv = fd.get("privacy-accepted") === "on";
      if (!av || !pv) return;
      calls.push([av, pv]);
    }
    function rowClick(e) {
      if (p) {                                   // CHECKED -> untick through React's own path
        if (e.target !== privacyRef.current) privacyRef.current.click();
        return;
      }
      e.preventDefault();                        // UNCHECKED -> never tick; open the modal
      setOpen(true);
    }
    const adult = h("label", { className: "consentRow" },
      h("input", { name: "adult-affirmed", type: "checkbox", required: true,
                   onChange: (e) => setA(e.currentTarget.checked) }),
      h("span", null, "I am 18 or over."));
    const privacyInput = h("input", { ref: privacyRef, name: "privacy-accepted", type: "checkbox",
                                      required: true, onChange: (e) => setP(e.currentTarget.checked) });
    const privacy = c7
      ? h("div", { className: "consentRow", onClick: rowClick }, privacyInput,
          h("span", { id: "pt" }, "I agree to the "),
          h("button", { type: "button" }, "Privacy Policy"))
      : h("div", { className: "consentRow" }, privacyInput,
          h("span", { id: "pt" }, "I agree to the "),
          h("button", { type: "button" }, "Privacy Policy"));
    return h(React.Fragment, null,
      h("form", { onSubmit }, adult, privacy,
        h("button", { type: "submit", disabled: !(a && p) }, "Create account")),
      open ? h("div", { role: "dialog" }, "policy") : null);
  }
  return { App, calls };
}
const f = (n) => document.querySelector(`input[name="${n}"]`);
const btn = () => document.querySelector('button[type="submit"]');
async function mount(opts) {
  const { App, calls } = makeApp(opts);
  const c = document.createElement("div"); document.body.append(c);
  const root = createRoot(c);
  await act(async () => root.render(h(App)));
  return { calls, teardown: async () => { await act(async () => root.unmount()); c.remove(); } };
}

// --- the six cases, copied verbatim from probes/v3-r17-cases-probe.mjs ----------------------
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
  "case 5  assign both/no dispatch -> disabled; reset false; click both -> enables": async (o) => {
    const { teardown } = await mount(o);
    f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
    const half1 = btn().disabled === true;
    f("adult-affirmed").checked = false; f("privacy-accepted").checked = false;
    await act(async () => { f("adult-affirmed").click(); f("privacy-accepted").click(); });
    const half2 = btn().disabled === false;
    const r = half1 && half2; await teardown(); return r;
  },
  "case 6  assign adult only; click privacy; adult .checked STILL true + still disabled": async (o) => {
    const { teardown } = await mount(o);
    f("adult-affirmed").checked = true;
    await act(async () => { f("privacy-accepted").click(); });
    const r = f("adult-affirmed").checked === true && btn().disabled === true;
    await teardown(); return r;
  },
};

// --- PLAN.md S02-S49: the C7 pin the six cases have to coexist with -------------------------
const s49 = {
  "S02-S49 click UNCHECKED privacy input -> dialog present AND .checked === false": async (o) => {
    const { teardown } = await mount(o);
    await act(async () => { f("privacy-accepted").click(); });
    const r = !!document.querySelector('[role="dialog"]') && f("privacy-accepted").checked === false;
    await teardown(); return r;
  },
};

const variants = {
  "A after C3+C4 only (mission oracle's shape)": { c7: false },
  "E after C7      (the FINISHED component)   ": { c7: true },
};

for (let run = 1; run <= 3; run++) {
  console.log(`\n############### RUN ${run} of 3 ###############`);
  console.log("  " + "case".padEnd(74) + "A     E");
  for (const [name, fn] of Object.entries({ ...cases, ...s49 })) {
    const cells = [];
    for (const opts of Object.values(variants)) cells.push((await fn(opts)) ? "PASS" : "RED ");
    console.log("  " + name.padEnd(74) + cells.join("  "));
  }
}

// --- diagnostic: what actually happens to the DOM and the mirror on that one click ----------
console.log("\n--- diagnostic: one click on the UNCHECKED privacy input, variant E ---");
{
  const { teardown } = await mount({ c7: true });
  await act(async () => { f("privacy-accepted").click(); });
  console.log("  DOM .checked after the click      :", f("privacy-accepted").checked);
  console.log("  dialog present                    :", !!document.querySelector('[role="dialog"]'));
  console.log("  submit button disabled            :", btn().disabled);
  await act(async () => { f("adult-affirmed").click(); });
  console.log("  after ALSO clicking 18+, disabled :", btn().disabled, " <- case 4 needs false");
  await teardown();
}
