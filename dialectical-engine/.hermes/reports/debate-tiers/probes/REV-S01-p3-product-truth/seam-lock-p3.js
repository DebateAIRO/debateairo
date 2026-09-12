// REV(S01) p3 product-truth — THE SEAM PROBE, INVERTED for the pass-3 head.
// Descendant of REV-S01-p2-product-truth/seam-lock-mutant.js. At 53b903d2 the page shipped
// aria-disabled, so that probe's mutant SET disabled=true and its "revert" SET disabled=false.
// At 9ddbb1ef the page ships native `disabled`, so running the p2 probe verbatim would leave
// all 14 controls ENABLED — the "revert" is the defect. Here the mutant REMOVES `disabled`
// (= the p2 behaviour) and the restore puts it back; the third block reproduces as-shipped.
// Paste into the console of /new, Free chosen, OPTIONS panel open. Nothing touches disk.

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
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    document.activeElement.blur?.();
    const before = document.activeElement;
    el.focus();
    const focusAccepted = document.activeElement === el;
    const activeUnchanged = document.activeElement === before;
    const box = el.tagName === "SELECT" ? el.closest(".ndSelect") : el;
    const bcs = getComputedStyle(box);
    const ecs = getComputedStyle(el);
    const out = {
      id, label,
      nativeDisabled: el.hasAttribute("disabled"),
      ariaDisabled: el.getAttribute("aria-disabled"),
      inlineStyle: el.getAttribute("style"),
      focusAccepted, activeUnchanged,
      focusRing: `${bcs.outlineStyle} ${bcs.outlineWidth} ${bcs.outlineColor}`,
      boxOpacity: bcs.opacity,
      elOpacity: ecs.opacity,
      cursorOnElement: ecs.cursor,
      cursorUnderPointer: hit ? getComputedStyle(hit).cursor : null,
      hitTop: hit ? hit.tagName + (hit.id ? "#" + hit.id : "") : null
    };
    el.blur();
    return out;
  });
}

const AS_SHIPPED = probe("9ddbb1ef (FIX p2 head, as shipped)");
ids.forEach((id) => { document.getElementById(id).disabled = false; });   // mutant = 53b903d2 behaviour
const MUTANT = probe("mutant: native disabled REMOVED");
ids.forEach((id) => { document.getElementById(id).disabled = true; });    // restore
const RESTORED = probe("restored (reproduce as-shipped)");

JSON.stringify({ AS_SHIPPED, MUTANT, RESTORED });
