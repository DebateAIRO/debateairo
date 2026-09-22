// ARCH-REV-S02 round 3 — INDEPENDENT check of B3's remedy.
// The component here is written from PLAN.md's PROSE (the C7 click rule at :934-938, the B1
// mirror rule at :940-964, S02-S53's acknowledgement handler at :1030-1034, S02-S40's gate at
// :829-830), NOT copied from the author's probe. The six R17 cases are transcribed from the
// PLAN as it now words them: 1,2,3,6 unchanged in C4 form; 4 and 5 through the acknowledgement
// route block at PLAN:1124-1132.
//
// Four modes, so the question is not only "does it pass" but "does it DISCRIMINATE":
//   pinned            — the plan as written
//   mut_disabled_true — `disabled` hard-coded true (the mutant C4 says it LOST and C7 says it GAINED)
//   mut_ack_dom_only  — the acknowledgement sets the DOM but not the R17 mirror
//   mut_ack_mirror_only — the acknowledgement sets the mirror but not the DOM
// Reported per mode: the six cases, the C4 SUBSET verdict (1,2,3,6 — the cluster's own command)
// and the C7 verdict (all six, since 4 and 5 now live there).
import { JSDOM } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/node_modules/jsdom/lib/api.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const k of ["window","document","HTMLElement","Event","MouseEvent","KeyboardEvent","Node",
                 "MutationObserver","requestAnimationFrame","cancelAnimationFrame","FormData","getComputedStyle"]) {
  // Node 22.23.1 makes globalThis.navigator getter-only; plain assignment throws.
  Object.defineProperty(globalThis, k, {
    value: k === "window" ? dom.window : dom.window[k], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const R = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/node_modules/";
const React = (await import(R + "react/index.js")).default;
const { createRoot } = await import(R + "react-dom/client.js");
const { act } = await import(R + "react/index.js");
const h = React.createElement;

const f = (n) => document.querySelector(`input[name="${n}"]`);
const btn = () => document.querySelector('button[type="submit"]');
const dialog = () => document.querySelector('[role="dialog"]');

let trace = false;
function makeApp(mode) {
  return function App() {
    const [adultMirror, setAdult] = React.useState(false);
    const [privacyMirror, setPrivacy] = React.useState(false);
    const [open, setOpen] = React.useState(false);
    const [gateLatched, setGate] = React.useState(false);
    const privacyRef = React.useRef(null);

    // PLAN:934-938 — the ONE click rule for the privacy row. "if the box is CHECKED" is read
    // two ways: the React mirror (settled) or the DOM property (in-flight). MODE picks.
    function rowClick(e) {
      const isChecked = mode === "mut_predicate_dom" ? privacyRef.current.checked : privacyMirror;
      if (trace) console.log(`      TRACE rowClick: domChecked=${privacyRef.current.checked} mirror=${privacyMirror} -> isChecked=${isChecked}`);
      if (isChecked) {
        if (e.target !== privacyRef.current) privacyRef.current.click();
        return;
      }
      e.preventDefault();
      setGate(false);
      setOpen(true);
    }
    // PLAN:945-947 — member 1 of the mirror rule: the SETTLED value.
    function onPrivacyChange(e) {
      setPrivacy(e.currentTarget.checked && !e.nativeEvent.defaultPrevented);
    }
    // PLAN:829-830 — R15's latching gate, evaluated on scroll.
    function onScroll(e) {
      const r = e.currentTarget;
      if (r.scrollTop + r.clientHeight >= r.scrollHeight - 8) setGate(true);
    }
    // PLAN:1030-1034 — S02-S53's acknowledgement handler: BOTH halves.
    function acknowledge() {
      if (mode !== "mut_ack_mirror_only") privacyRef.current.checked = true;
      if (mode !== "mut_ack_dom_only") setPrivacy(true);
      setOpen(false);
    }
    // PLAN:958-964 — member 2: dismissal resyncs the mirror from the DOM.
    function dismiss() {
      setPrivacy(privacyRef.current?.checked ?? false);
      setOpen(false);
    }
    const disabled = mode === "mut_disabled_true" ? true : !(adultMirror && privacyMirror);
    return h(React.Fragment, null,
      h("form", null,
        h("label", null, h("input", { name: "adult-affirmed", type: "checkbox",
          onChange: (e) => setAdult(e.currentTarget.checked) })),
        h("div", { className: "consentRow", onClick: rowClick },
          h("input", { ref: privacyRef, name: "privacy-accepted", type: "checkbox",
            onChange: onPrivacyChange }),
          h("span", { className: "rowText" }, "I have read the Privacy Policy")),
        h("button", { type: "submit", disabled }, "Create account")),
      open ? h("div", { role: "dialog", "aria-modal": "true" },
        h("div", { className: "policyScroll", onScroll }),
        h("button", { className: "ack", type: "button", disabled: !gateLatched,
          onClick: acknowledge }, "I have read it"),
        h("button", { className: "x", type: "button", onClick: dismiss }, "×")) : null);
  };
}

async function mount(mode) {
  const c = document.createElement("div"); document.body.appendChild(c);
  const root = createRoot(c);
  await act(async () => root.render(h(makeApp(mode))));
  return { teardown: async () => { await act(async () => root.unmount()); c.remove(); } };
}

// PLAN:1124-1132 — the acknowledgement route, written out once, transcribed here.
async function ackRoute() {
  await act(async () => { f("privacy-accepted").click(); });
  const region = document.querySelector(".policyScroll");
  if (!region) throw new Error("no scroll region — modal never opened");
  Object.defineProperty(region, "scrollHeight", { value: 500, configurable: true });
  Object.defineProperty(region, "clientHeight", { value: 200, configurable: true });
  Object.defineProperty(region, "scrollTop",    { value: 292, configurable: true }); // S02-S40's own 292
  await act(async () => { region.dispatchEvent(new Event("scroll", { bubbles: true })); });
  const ackBtn = document.querySelector("button.ack");
  if (ackBtn.disabled) throw new Error("'I have read it' still disabled — gate did not latch");
  await act(async () => { ackBtn.click(); });
  if (dialog()) throw new Error("acknowledgement did not close the modal");
}

const CASES = {
  "case1 S02-S25 neither box                 -> disabled=true ": async () => btn().disabled === true,
  "case2 S02-S26 only adult via click()      -> disabled=true ": async () => {
    await act(async () => { f("adult-affirmed").click(); }); return btn().disabled === true; },
  "case3 S02-S27 only privacy via click()    -> disabled=true ": async () => {
    await act(async () => { f("privacy-accepted").click(); }); return btn().disabled === true; },
  "case4 S02-S28 BOTH via the ack route      -> disabled=FALSE": async () => {
    await ackRoute();
    await act(async () => { f("adult-affirmed").click(); });
    return btn().disabled === false && f("privacy-accepted").checked === true; },
  "case5 S02-S29 assign,reset,ack route      -> disabled=FALSE": async () => {
    f("adult-affirmed").checked = true; f("privacy-accepted").checked = true;
    await act(async () => {});
    if (btn().disabled !== true) return false;
    f("adult-affirmed").checked = false; f("privacy-accepted").checked = false;
    await act(async () => { f("adult-affirmed").click(); });
    await ackRoute();
    return btn().disabled === false && f("privacy-accepted").checked === true; },
  "case6 S02-S30 assign adult, click privacy -> disabled=true ": async () => {
    f("adult-affirmed").checked = true;
    await act(async () => { f("privacy-accepted").click(); });
    return btn().disabled === true && f("adult-affirmed").checked === true; },
};

// V's goal, checked independently of R17: can any bare-click route reach ENABLED with an
// empty privacy box?
async function safetyRoutes(mode) {
  const out = [];
  for (const [name, run] of Object.entries({
    "bare privacy click x2, then adult": async () => {
      await act(async () => { f("privacy-accepted").click(); });
      await act(async () => { f("privacy-accepted").click(); });
      await act(async () => { f("adult-affirmed").click(); }); },
    "click row TEXT, then adult": async () => {
      await act(async () => { document.querySelector(".rowText").click(); });
      await act(async () => { f("adult-affirmed").click(); }); },
    "open then dismiss with x, then adult": async () => {
      await act(async () => { f("privacy-accepted").click(); });
      await act(async () => { document.querySelector("button.x")?.click(); });
      await act(async () => { f("adult-affirmed").click(); }); },
  })) {
    const { teardown } = await mount(mode);
    await run();
    out.push(`    ${name.padEnd(38)} box=${f("privacy-accepted").checked} btnDisabled=${btn().disabled} dialogEverOpened=${!!document.querySelector('[role="dialog"]')}`);
    await teardown();
  }
  return out;
}

const C4_SUBSET = ["case1", "case2", "case3", "case6"];
for (const mode of ["pinned", "mut_predicate_dom", "mut_disabled_true", "mut_ack_dom_only", "mut_ack_mirror_only"]) {
  console.log(`\n===== MODE ${mode} =====`);
  let c4fail = 0, allfail = 0;
  for (const [name, run] of Object.entries(CASES)) {
    const { teardown } = await mount(mode);
    let ok = false, err = null;
    try { ok = await run(); } catch (e) { err = e.message; }
    if (!ok) { allfail++; if (C4_SUBSET.some((k) => name.startsWith(k))) c4fail++; }
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${err ? "  ERROR:" + err : ""}`);
    await teardown();
  }
  console.log(`  ---- C4 SUBSET (cases 1,2,3,6): ${4 - c4fail}/4 pass   |   C7 (all six): ${6 - allfail}/6 pass`);
}
for (const m of ["pinned", "mut_predicate_dom"]) {
  console.log(`\n===== V's goal: is ENABLED-with-empty-box reachable? MODE ${m} =====`);
  for (const line of await safetyRoutes(m)) console.log(line);
}
console.log("\n===== the row handler's view at click time, ONE bare click on the unchecked box =====");
for (const m of ["pinned", "mut_predicate_dom"]) {
  trace = true;
  console.log(`  MODE ${m}`);
  const { teardown } = await mount(m);
  await act(async () => { f("privacy-accepted").click(); });
  console.log(`      after: box=${f("privacy-accepted").checked} dialog=${!!dialog()}`);
  await teardown();
  trace = false;
}
