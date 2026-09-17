// REV(S01) p2 product-truth — THE SEAM PROBE (package README §3 a/b/d).
// Paste into the devtools console of /new with Free chosen and the OPTIONS panel open.
// Answers: is each of the 14 "locked" controls still inert, and what paints the lock now?
// RED→GREEN→RED shape: measure as shipped, restore the pass-1 native `disabled` as a
// temporary in-DOM mutant, measure again, remove the mutant, reproduce.
// Nothing is written to disk; the mutant dies with the page.

const ids = [
  "riskTier-casual", "riskTier-standard", "riskTier-high-stakes",
  "budgetTier-low", "budgetTier-medium", "budgetTier-high",
  "treeDepth", "steeringPresets", "steeringAnnotations",
  "depthMode", "scrutinyDepth", "branchingWidth", "concurrency", "maxTokens"
];

function probe(label) {
  return ids.map((id) => {
    const el = document.getElementById(id);
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    // what the USER'S POINTER actually lands on — not the element we think is locked
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    document.activeElement.blur?.();
    el.focus();
    const focusAccepted = document.activeElement === el;
    const box = el.tagName === "SELECT" ? el.closest(".ndSelect") : el;
    const bcs = getComputedStyle(box);
    const out = {
      id, label,
      nativeDisabled: el.hasAttribute("disabled"),
      ariaDisabled: el.getAttribute("aria-disabled"),
      focusAccepted,                                     // pass-1 lock => false for all 14
      focusRing: `${bcs.outlineStyle} ${bcs.outlineWidth} ${bcs.outlineColor}`,
      opacity: getComputedStyle(el).opacity,
      cursorOnElement: getComputedStyle(el).cursor,
      cursorUnderPointer: hit ? getComputedStyle(hit).cursor : null,  // DONE.md M8 asks for not-allowed
      hitTop: hit ? hit.tagName + (hit.id ? "#" + hit.id : "") : null
    };
    el.blur();
    return out;
  });
}

const AS_SHIPPED = probe("53b903d2 (FIX head, as shipped)");
ids.forEach((id) => { document.getElementById(id).disabled = true; });   // mutant = f6c147cc behaviour
const MUTANT = probe("mutant: native disabled restored");
ids.forEach((id) => { document.getElementById(id).disabled = false; });  // revert
const REVERTED = probe("mutant removed (reproduce)");

console.log(JSON.stringify({ AS_SHIPPED, MUTANT, REVERTED }, null, 1));

// Measured at 53b903d2, Chrome, both modes (2026-09-10):
//   AS_SHIPPED  focusAccepted true  for all 14; .ndSelect ring "solid 2px rgb(193,95,60)" (T) /
//                                               "solid 2px rgb(200,131,79)" (C)
//   MUTANT      focusAccepted false for all 14; .ndSelect ring "none"
//   REVERTED    identical to AS_SHIPPED
//   cursorUnderPointer is "pointer" on depthMode/scrutinyDepth in ALL THREE variants
//     -> that divergence from M8 is PRE-EXISTING (`.ndSelect select { cursor: pointer }`,
//        globals.css:6160), not caused by the FIX.
