// ARCH-REV-S02 round 2 — INDEPENDENT probe. Built from the PLAN's PROSE, not from the
// author's probe: §Cluster S02-C7's click rule + mirror rule members 1 and 2, S02-S53's
// acknowledgement, S02-S52's untick, S02-S71's focus+activation route.
// It exceeds the author's parameters: 12 routes (their fixed probes cover 3).
// For every route it reports DOM .checked, the R17 mirror, the desync flag, the
// `Create account` disabled state with adult-affirmed ALREADY ticked, and register() calls.
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

// MODE = "pinned"  -> the rule the rework pinned (member 1 + member 2)
// MODE = "unfixed" -> round 0's rule (RED control)
// MODE = "m1only"  -> member 1 without member 2 (is member 2 really non-load-bearing?)
// MODE = "verdict" -> the round-1 verdict's literal wording, setPrivacyMirror(false) in the row
const MODE = process.argv[2] || "pinned";
let spy = { a: false, p: false, renders: 0, enabledFrames: 0 };

function makeApp() {
  const registerCalls = [];
  function App() {
    const [a, setA] = React.useState(false);
    const [p, setP] = React.useState(false);
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);
    spy.a = a; spy.p = p; spy.renders++;
    if (a && p && !(ref.current && ref.current.checked)) spy.enabledFrames++;
    function onSubmit(e) {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      if (fd.get("adult-affirmed") !== "on" || fd.get("privacy-accepted") !== "on") return; // R18
      registerCalls.push(["email", "pw", "rec", true]);
    }
    function rowClick(e) {                                    // C7's ONE click rule
      if (p) { if (e.target !== ref.current) ref.current.click(); return; }
      e.preventDefault();
      if (MODE === "verdict") setP(false);                    // the verdict's literal wording
      setOpen(true);
    }
    function onPrivacyChange(e) {                             // R17 mirror on the privacy input
      if (MODE === "unfixed" || MODE === "verdict") return setP(e.currentTarget.checked);
      return setP(e.currentTarget.checked && !e.nativeEvent.defaultPrevented); // member 1
    }
    function close() {                                        // x / Esc / backdrop
      if (MODE === "pinned") setP(ref.current ? ref.current.checked : false);  // member 2
      setOpen(false);
    }
    function acknowledge() {                                  // S02-S53
      if (ref.current) { ref.current.checked = true; ref.current.focus(); }
      setP(true); setOpen(false);
    }
    React.useEffect(() => {
      if (!open) return;
      const onKey = (ev) => { if (ev.key === "Escape") close(); };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    });
    return h(React.Fragment, null,
      h("form", { onSubmit },
        h("label", { className: "consentRow" },
          h("input", { name: "adult-affirmed", type: "checkbox", required: true,
                       onChange: (e) => setA(e.currentTarget.checked) }),
          h("span", null, "I am 18 or over.")),
        h("div", { className: "consentRow", onClick: rowClick },
          h("input", { ref, name: "privacy-accepted", type: "checkbox", required: true,
                       onChange: onPrivacyChange }),
          h("span", { id: "pt" }, "I agree to the "),
          h("button", { type: "button", id: "pp" }, "Privacy Policy")),
        h("button", { type: "submit", disabled: !(a && p) }, "Create account")),
      open ? h("div", { className: "policyScrim", onClick: (e) => { if (e.target === e.currentTarget) close(); } },
               h("div", { role: "dialog" },
                 h("button", { className: "x", onClick: close }, "x"),
                 h("button", { className: "ack", onClick: acknowledge }, "I have read it"))) : null);
  }
  return { App, registerCalls };
}
const f = (n) => document.querySelector(`input[name="${n}"]`);
const btn = () => document.querySelector('button[type="submit"]');
const dlg = () => document.querySelector('[role="dialog"]');
async function mount() {
  spy = { a: false, p: false, renders: 0, enabledFrames: 0 };
  const { App, registerCalls } = makeApp();
  const c = document.createElement("div"); document.body.append(c);
  const root = createRoot(c);
  await act(async () => root.render(h(App)));
  await act(async () => { f("adult-affirmed").click(); });   // adult ALWAYS ticked first, so the
  return { registerCalls, root, c };                          // privacy mirror is the only term
}
async function trySubmit() {
  await act(async () => {
    document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
const ROUTES = {
  "R01 click unchecked SQUARE (open)": async () => {
    await act(async () => { f("privacy-accepted").click(); }); },
  "R02 click row TEXT (open)": async () => {
    await act(async () => { document.querySelector("#pt").click(); }); },
  "R03 click 'Privacy Policy' control (open)": async () => {
    await act(async () => { document.querySelector("#pp").click(); }); },
  "R04 open then dismiss with x": async () => {
    await act(async () => { f("privacy-accepted").click(); });
    await act(async () => { document.querySelector("button.x").click(); }); },
  "R05 open then dismiss with Esc": async () => {
    await act(async () => { f("privacy-accepted").click(); });
    await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); },
  "R06 open then dismiss with BACKDROP": async () => {
    await act(async () => { f("privacy-accepted").click(); });
    await act(async () => { document.querySelector(".policyScrim").click(); }); },
  "R07 open then ACKNOWLEDGE": async () => {
    await act(async () => { f("privacy-accepted").click(); });
    await act(async () => { document.querySelector("button.ack").click(); }); },
  "R08 acknowledge then click row TEXT (untick)": async () => {
    await act(async () => { f("privacy-accepted").click(); });
    await act(async () => { document.querySelector("button.ack").click(); });
    await act(async () => { document.querySelector("#pt").click(); }); },
  "R09 acknowledge then click the INPUT (untick)": async () => {
    await act(async () => { f("privacy-accepted").click(); });
    await act(async () => { document.querySelector("button.ack").click(); });
    await act(async () => { f("privacy-accepted").click(); }); },
  "R10 focus + activation (S02-S71 keyboard route)": async () => {
    f("privacy-accepted").focus();
    await act(async () => { f("privacy-accepted").click(); }); },
  "R11 click unchecked box TWICE": async () => {
    await act(async () => { f("privacy-accepted").click(); });
    await act(async () => { f("privacy-accepted").click(); }); },
  "R12 box -> x -> row TEXT (browser-realistic)": async () => {
    await act(async () => { f("privacy-accepted").click(); });
    await act(async () => { document.querySelector("button.x").click(); });
    await act(async () => { document.querySelector("#pt").click(); }); },
};
// Routes where the box is LAWFULLY ticked (acknowledged) — mirror true / enabled is CORRECT.
const LAWFUL_CHECKED = new Set(["R07 open then ACKNOWLEDGE"]);

console.log(`\n############ MODE = ${MODE} ############`);
let desynced = 0, unlawfulReg = 0, unlawfulEnabled = 0, framesEnabled = 0;
for (const [name, run] of Object.entries(ROUTES)) {
  const { registerCalls, root, c } = await mount();
  await run();
  const domChecked = f("privacy-accepted").checked;
  const mirror = spy.p;
  const disabled = btn().disabled;
  await trySubmit();
  const regs = registerCalls.length;
  const desync = domChecked !== mirror;
  if (desync) desynced++;
  const lawful = LAWFUL_CHECKED.has(name);
  if (!lawful && regs > 0) unlawfulReg++;
  if (!lawful && disabled === false) unlawfulEnabled++;
  framesEnabled += spy.enabledFrames;
  console.log(
    `  ${name.padEnd(48)} DOM=${String(domChecked).padEnd(5)} mirror=${String(mirror).padEnd(5)} ` +
    `desync=${String(desync).padEnd(5)} btnDisabled=${String(disabled).padEnd(5)} register=${regs} ` +
    `dialog=${!!dlg()}${desync ? "   <<< DESYNC" : ""}${(!lawful && regs > 0) ? "   <<< UNLAWFUL REGISTER" : ""}` +
    `${(!lawful && disabled === false) ? "   <<< UNLAWFULLY ENABLED" : ""}`);
  await act(async () => root.unmount()); c.remove();
}
console.log(`  ---- MODE ${MODE}: desynced routes=${desynced}  unlawful register()=${unlawfulReg} ` +
            ` unlawfully-enabled routes=${unlawfulEnabled}  frames rendered enabled-with-empty-box=${framesEnabled}`);
