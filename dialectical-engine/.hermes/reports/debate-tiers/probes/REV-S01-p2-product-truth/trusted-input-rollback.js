// REV(S01) p2 product-truth — trusted-input probe for the Free lock.
// The seam question the DOM alone cannot answer: with native `disabled` gone, does a REAL
// keystroke reach a locked control, and what does the control hold while it does?
//
// Run in two halves: install the recorder from the console, then drive the key with the
// harness's `computer` tool (a devtools-typed key is NOT trusted and proves nothing).

// --- half 1: install the recorder -------------------------------------------------
window.__probe = [];
const rec = (e) => window.__probe.push({
  t: e.type,
  tgt: e.target.id || e.target.tagName,
  trusted: e.isTrusted,
  val: e.target.value !== undefined ? String(e.target.value) : null
});
for (const t of ["keydown", "input", "change", "click", "mousedown", "focus", "blur"]) {
  document.addEventListener(t, rec, true);
}

// --- half 2: focus the control, then send the key from OUTSIDE the page ------------
// const t = document.getElementById("treeDepth"); t.scrollIntoView({block:"center"}); t.focus();
//   -> mcp__Claude_Browser__computer { action:"key", text:"ArrowRight", repeat:3 }
// const p = document.getElementById("steeringPresets"); p.focus();
//   -> mcp__Claude_Browser__computer { action:"key", text:"p" }  (etc.)
// then read: window.__probe

// Measured at 53b903d2, Chrome, Free chosen (2026-09-10) — one ArrowRight on #treeDepth:
//   keydown  treeDepth  trusted:true  val:"2"
//   input    treeDepth  trusted:true  val:"3"   <-- the control MOVED
//   change   treeDepth  trusted:true  val:"2"   <-- React rolled it back
// three presses => three 2->3->2 round trips; the readout and --nd-pct never leave 2/25%.
//
// One "p" on #steeringPresets:
//   keydown  steeringPresets trusted:true val:""
//   input    steeringPresets trusted:true val:"p"  <-- the character landed
// three keystrokes => value "" throughout; nothing is typed on screen.
//
// Contrast under PREMIUM (same keys, same control): #treeDepth 2 -> 4, readout "4",
// --nd-pct 75% — the guard is the only thing holding the Free lock.
//
// Note on <select>: CDP key events do not drive the macOS native picker, so the picker's
// opening could not be observed here. What WAS observed is a real trusted
// mousedown -> focus -> click on #depthMode and the --focus ring it paints; see
// seam-lock-mutant.js.
