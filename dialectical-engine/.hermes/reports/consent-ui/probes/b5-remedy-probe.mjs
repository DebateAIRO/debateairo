// REQ-01 rework R2 — DOES MY B5 REMEDY ACTUALLY PASS?
// B4/B5 exist because round 1 prescribed an idiom it never executed (COMMON §10.10).
// So: before one word of the remedy reaches slices/S02/SPEC.md, run every candidate
// against the SAME v2-pinned implementation the reviewer's b2-idiom-matrix.mjs uses.
// The App below is byte-for-byte the reviewer's probe App (uncontrolled + onChange mirror).
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

function App() {                              // v2/v3 R17 AS PINNED: uncontrolled + onChange mirror
  const [a, setA] = React.useState(false);
  const [p, setP] = React.useState(false);
  const box = (name, set) => h("input", { name, type: "checkbox", required: true,
                                          onChange: (e) => set(e.currentTarget.checked) });
  return h("form", {}, box("adult-affirmed", setA), box("privacy-accepted", setP),
    h("button", { type: "submit", disabled: !(a && p) }, "Create account"));
}
const f = (n) => document.querySelector(`input[name="${n}"]`);
const btn = () => document.querySelector("button");

async function mount() {
  const c = document.createElement("div"); document.body.append(c);
  const root = createRoot(c);
  await act(async () => root.render(h(App)));
  return async () => { await act(async () => root.unmount()); c.remove(); };
}

const rows = [];
const rec = (id, desc, got, want) =>
  rows.push({ id, desc, got: String(got), want: String(want), ok: String(got) === String(want) });

async function runAll() {
  rows.length = 0;

  // ---- CANDIDATE 1 — the reviewer's suggested in-place rewrite, reset OUTSIDE act ----
  {
    const teardown = await mount();
    f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
    rec("C1-half1", "assign true on both, NO dispatch -> button still disabled", btn().disabled, true);
    f("adult-affirmed").checked = false; f("privacy-accepted").checked = false;   // reset, no dispatch
    await act(async () => { f("adult-affirmed").click(); f("privacy-accepted").click(); });
    rec("C1-half2", "set .checked=false on both, then click() both -> button ENABLED", btn().disabled, false);
    rec("C1-dom",   "...and the DOM boxes are both checked at that moment",
        `${f("adult-affirmed").checked}/${f("privacy-accepted").checked}`, "true/true");
    await teardown();
  }

  // ---- CANDIDATE 1b — same, but the reset placed INSIDE act (does placement matter?) ----
  {
    const teardown = await mount();
    f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
    rec("C1b-half1", "assign true on both, NO dispatch -> button still disabled", btn().disabled, true);
    await act(async () => {
      f("adult-affirmed").checked = false; f("privacy-accepted").checked = false;
      f("adult-affirmed").click(); f("privacy-accepted").click();
    });
    rec("C1b-half2", "reset+click() both INSIDE one act -> button ENABLED", btn().disabled, false);
    await teardown();
  }

  // ---- CANDIDATE 2 — split into two cases from FRESH mounts ----
  {
    const teardown = await mount();
    f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
    rec("C2-a", "[fresh mount] assign true on both, NO dispatch -> button still disabled", btn().disabled, true);
    await teardown();
  }
  {
    const teardown = await mount();
    await act(async () => { f("adult-affirmed").click(); f("privacy-accepted").click(); });
    rec("C2-b", "[fresh mount] click() both -> button ENABLED  (NOTE: identical to R17 case 4)", btn().disabled, false);
    await teardown();
  }

  // ---- CANDIDATE 3 — reset then the MouseEvent alternative instead of .click() ----
  {
    const teardown = await mount();
    f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
    rec("C3-half1", "assign true on both, NO dispatch -> button still disabled", btn().disabled, true);
    f("adult-affirmed").checked = false; f("privacy-accepted").checked = false;
    await act(async () => {
      f("adult-affirmed").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      f("privacy-accepted").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    rec("C3-half2", "reset, then MouseEvent('click') both -> button ENABLED", btn().disabled, false);
    await teardown();
  }

  // ---- CONTROL — the v2 sentence exactly as written (must still FAIL; this is B5) ----
  {
    const teardown = await mount();
    f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
    rec("B5-control-a", "[v2 AS WRITTEN] assign true, no dispatch -> still disabled", btn().disabled, true);
    await act(async () => { f("adult-affirmed").click(); f("privacy-accepted").click(); });
    rec("B5-control-b", "[v2 AS WRITTEN] then .click() both -> button ENABLED  << MUST FAIL", btn().disabled, false);
    await teardown();
  }

  // ---- CONTROL — is the reset alone (no click) enough? (it must NOT be) ----
  {
    const teardown = await mount();
    f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
    f("adult-affirmed").checked = false; f("privacy-accepted").checked = false;
    rec("RESET-only", "assign true then false, never click -> button still disabled", btn().disabled, true);
    await teardown();
  }

  // ---- MUTATION CHECK — does C1 fail if the inputs are made CONTROLLED (the regression it exists to catch)? ----
  {
    function Controlled() {
      const [a, setA] = React.useState(false);
      const [p, setP] = React.useState(false);
      const box = (name, v, set) => h("input", { name, type: "checkbox", required: true, checked: v,
                                                 onChange: (e) => set(e.currentTarget.checked) });
      return h("form", {}, box("adult-affirmed", a, setA), box("privacy-accepted", p, setP),
        h("button", { type: "submit", disabled: !(a && p) }, "Create account"));
    }
    const c = document.createElement("div"); document.body.append(c);
    const root = createRoot(c);
    await act(async () => root.render(h(Controlled)));
    f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
    const half1 = btn().disabled;
    f("adult-affirmed").checked = false; f("privacy-accepted").checked = false;
    await act(async () => { f("adult-affirmed").click(); f("privacy-accepted").click(); });
    rec("MUT-controlled-half1", "[CONTROLLED impl] assign true, no dispatch -> still disabled", half1, true);
    rec("MUT-controlled-half2", "[CONTROLLED impl] reset + click() -> button ENABLED (does C1 still pass?)",
        btn().disabled, false);
    await act(async () => root.unmount()); c.remove();
  }

  const mine = rows.splice(0);
  for (const r of mine) {
    console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.id.padEnd(20)} ${r.desc}`);
    if (!r.ok) console.log(`${" ".repeat(30)}got=${r.got}  want=${r.want}`);
  }
  const fails = mine.filter((r) => !r.ok).map((r) => r.id);
  console.log(`  ---> ${mine.length - fails.length}/${mine.length} satisfied` +
              (fails.length ? `   FAILING: ${fails.join(", ")}` : ""));
}

for (let run = 1; run <= 3; run++) {
  console.log(`\n########################## RUN ${run} of 3 ##########################`);
  await runAll();
}
