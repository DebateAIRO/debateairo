// REQ-REV-01 ROUND 2 probe for B2.
// Question: does the implementation NEWLY PINNED by slices/S02/SPEC.md v2 R17
// (1. inputs stay uncontrolled  2. onChange mirrors .checked into React state used
//  ONLY for the button's disabled  3. FormData is the truth at submit, R18)
// actually satisfy every hook the SAME v2 SPEC now demands?
//
// Every case below is built from the v2 SPEC's own words, not from the author's tests.
import { JSDOM } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/node_modules/jsdom/lib/api.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const k of ["window", "document", "HTMLElement", "Event", "Node", "MutationObserver",
                 "requestAnimationFrame", "cancelAnimationFrame", "FormData", "getComputedStyle"]) {
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const R = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/node_modules/";
const React = (await import(R + "react/index.js")).default;
const { createRoot } = await import(R + "react-dom/client.js");
const { act } = await import(R + "react/index.js");
const h = React.createElement;

// truthSource: "formdata" = v2 R18 as pinned.  "mirror" = the shape v2 R18 forbids.
// controlled:  false = v2 R17 clause 1 as pinned.  true = v1's shape.
function makeApp({ controlled, truthSource }) {
  const calls = [];
  function App() {
    const [adult, setAdult] = React.useState(false);
    const [privacy, setPrivacy] = React.useState(false);
    function onSubmit(e) {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const a = truthSource === "mirror" ? adult : fd.get("adult-affirmed") === "on";
      const p = truthSource === "mirror" ? privacy : fd.get("privacy-accepted") === "on";
      if (!a || !p) return;              // S02-R18 defence in depth
      calls.push([a, p]);                // stands in for client.register(...)
    }
    const box = (name, value, set) =>
      controlled
        ? h("input", { name, type: "checkbox", required: true, checked: value,
                       onChange: (e) => set(e.currentTarget.checked) })
        : h("input", { name, type: "checkbox", required: true,
                       onChange: (e) => set(e.currentTarget.checked) });
    return h("form", { onSubmit },
      box("adult-affirmed", adult, setAdult),
      box("privacy-accepted", privacy, setPrivacy),
      h("button", { type: "submit", disabled: !(adult && privacy) }, "Create account"));
  }
  return { App, calls };
}

const f = (n) => document.querySelector(`input[name="${n}"]`);
const btn = () => document.querySelector("button");
const submit = async () => act(async () => {
  // EXACTLY tests/render/auth-flow-integration.test.tsx:41-48
  document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
});

async function mount(opts) {
  const { App, calls } = makeApp(opts);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(h(App)));
  return { calls, teardown: async () => { await act(async () => root.unmount()); container.remove(); } };
}

const results = [];
const rec = (id, desc, got, want) =>
  results.push({ id, desc, got: String(got), want: String(want), ok: String(got) === String(want) });

async function caseSet(label, opts) {
  console.log(`\n================ ${label} ================`);

  // --- R17 hook cases 1-4: every assertion about the BUTTON dispatches a real event ---
  {
    const { teardown } = await mount(opts);
    rec("R17-h1", "neither box -> button disabled", btn().disabled, true);
    await teardown();
  }
  {
    const { teardown } = await mount(opts);
    await act(async () => { f("adult-affirmed").click(); });
    rec("R17-h2", "only adult via .click() -> button disabled", btn().disabled, true);
    await teardown();
  }
  {
    const { teardown } = await mount(opts);
    await act(async () => { f("privacy-accepted").click(); });
    rec("R17-h3", "only privacy via .click() -> button disabled", btn().disabled, true);
    await teardown();
  }
  {
    const { teardown } = await mount(opts);
    await act(async () => { f("adult-affirmed").click(); f("privacy-accepted").click(); });
    rec("R17-h4", "both via .click() -> button ENABLED", btn().disabled, false);
    await teardown();
  }
  // --- R17 hook case 5, the mechanism pin, AND the SPEC's stated alternative idiom ---
  {
    const { teardown } = await mount(opts);
    f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
    rec("R17-h5a", "assign .checked, NO dispatch -> button still disabled", btn().disabled, true);
    await act(async () => {
      f("adult-affirmed").dispatchEvent(new Event("change", { bubbles: true }));
      f("privacy-accepted").dispatchEvent(new Event("change", { bubbles: true }));
    });
    rec("R17-h5b", "then dispatch new Event('change') -> button ENABLED  [SPEC's alternative idiom]",
        btn().disabled, false);
    await teardown();
  }
  // --- The three EXISTING auth-flow cases, with S02's one added line, house idiom ---
  {
    const { calls, teardown } = await mount(opts);
    f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
    const btnBefore = btn().disabled;
    await submit();
    rec("EXIST-3", "assign both + bare submit -> register called once", calls.length, 1);
    rec("STATE-ROW", "...and the button was still disabled at that moment", btnBefore, true);
    await teardown();
  }
  // --- R18 refusal pins, house idiom (SPEC says assignment is correct here) ---
  {
    const { calls, teardown } = await mount(opts);
    f("adult-affirmed").checked = true;
    await submit();
    rec("R18-p1", "assign adult only + submit -> register NOT called", calls.length, 0);
    await teardown();
  }
  {
    const { calls, teardown } = await mount(opts);
    f("privacy-accepted").checked = true;
    await submit();
    rec("R18-p2", "assign privacy only + submit -> register NOT called", calls.length, 0);
    await teardown();
  }

  const mine = results.splice(0);
  for (const r of mine) {
    console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.id.padEnd(10)} ${r.desc}`);
    if (!r.ok) console.log(`           got=${r.got}  want=${r.want}`);
  }
  const fails = mine.filter((r) => !r.ok).map((r) => r.id);
  console.log(`  ---> ${mine.length - fails.length}/${mine.length} hooks satisfied` +
              (fails.length ? `   FAILING: ${fails.join(", ")}` : ""));
  return fails;
}

for (let run = 1; run <= 3; run++) {
  console.log(`\n########################## RUN ${run} of 3 ##########################`);
  await caseSet("A: v2 AS PINNED  (uncontrolled + onChange mirror, FormData truth)",
                { controlled: false, truthSource: "formdata" });
  await caseSet("B: v1's shape    (CONTROLLED inputs, React-state truth)  [must still break]",
                { controlled: true, truthSource: "mirror" });
  await caseSet("C: the shape v2 R18 explicitly FORBIDS (uncontrolled, but handler reads the mirror)",
                { controlled: false, truthSource: "mirror" });
}
