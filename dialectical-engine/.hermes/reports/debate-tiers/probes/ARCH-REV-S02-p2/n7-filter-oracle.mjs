// ARCH-REV-S02-p2 · executable oracle for PLAN.md S02-C2-S3 (finding N7's fix) and its case 9.
// I run BOTH shapes against panels the plan's own cases describe, plus two the plan does NOT
// describe, and check them against frozen SPEC R4: panelSize === roster.length.

const ROSTERS = {
  free: ["gpt-5.6-luna", "claude-sonnet-5"],
  premium: ["gpt-5.6-sol", "claude-opus-5", "grok-4.6"]
};
const m = (id, p) => ({ model_id: id, provider: p });

const pass1 = (roster, panel) => roster.flatMap((id) => panel.filter((x) => x.model_id === id));
const rev2  = (roster, panel) => roster.map((id) => panel.find((x) => x.model_id === id)).filter((x) => x !== undefined);

const cases = [
  ["case 1 · free filter (panel = 2 free ids + sol)", "free",
   [m("gpt-5.6-luna","a"), m("claude-sonnet-5","b"), m("gpt-5.6-sol","c")]],
  ["case 2 · premium filter (panel = all five)", "premium",
   [m("gpt-5.6-luna","a"), m("claude-sonnet-5","b"), m("gpt-5.6-sol","c"), m("claude-opus-5","d"), m("grok-4.6","e")]],
  ["case 2b · PROBE-ORDER: panel arrives in reverse roster order", "premium",
   [m("grok-4.6","e"), m("claude-opus-5","d"), m("gpt-5.6-sol","c")]],
  ["case 3 · all members missing (free)", "free",
   [m("gpt-5.6-sol","c"), m("claude-opus-5","d")]],
  ["case 4 · one member missing (premium)", "premium",
   [m("gpt-5.6-sol","c"), m("claude-opus-5","d")]],
  ["case 5 · several members missing (premium)", "premium", [m("gpt-5.6-sol","c")]],
  ["case 6 · empty panel", "free", []],
  ["case 9 · two providers serve grok-4.6 (the N7 case)", "premium",
   [m("gpt-5.6-sol","a"), m("claude-opus-5","b"), m("grok-4.6","c"), m("grok-4.6","d")]],
  ["EXTRA · THREE providers serve one id, and a second id doubled too", "premium",
   [m("gpt-5.6-sol","a"), m("gpt-5.6-sol","a2"), m("claude-opus-5","b"), m("grok-4.6","c"), m("grok-4.6","d"), m("grok-4.6","e")]],
  ["EXTRA · duplicate on a MISSING id (dup of a non-roster model)", "free",
   [m("gpt-5.6-sol","a"), m("gpt-5.6-sol","a2")]]
];

const show = (r) => "[" + r.map((x) => `${x.model_id}@${x.provider}`).join(", ") + "]";
let violations1 = 0, violations2 = 0;

for (const [label, tier, panel] of cases) {
  const roster = ROSTERS[tier];
  const p1 = pass1(roster, panel), p2 = rev2(roster, panel);
  // frozen R4's equality applies only when the roster is COMPLETE (otherwise R6 refuses first).
  const complete = roster.every((id) => panel.some((x) => x.model_id === id));
  const bad1 = complete && p1.length !== roster.length;
  const bad2 = complete && p2.length !== roster.length;
  if (bad1) violations1++;
  if (bad2) violations2++;
  console.log(`\n${label}  (tier=${tier}, roster=${roster.length}, panel=${panel.length}, complete=${complete})`);
  console.log(`  pass-1 flatMap : n=${p1.length} panelSize=${p1.length} ${show(p1)}${bad1 ? "   <== VIOLATES R4" : ""}`);
  console.log(`  Rev-2  map/find: n=${p2.length} panelSize=${p2.length} ${show(p2)}${bad2 ? "   <== VIOLATES R4" : ""}`);
  const ordered = p2.map((x) => x.model_id);
  const expectOrder = roster.filter((id) => panel.some((x) => x.model_id === id));
  console.log(`  Rev-2 roster order held: ${JSON.stringify(ordered) === JSON.stringify(expectOrder)}`);
  // R6's `missing` computed against the FILTERED panel, as S02-C2-S4 writes it
  const missing = roster.filter((id) => !p2.some((x) => x.model_id === id));
  console.log(`  R6 missing (from filteredPanel) = ${JSON.stringify(missing)}  refuses=${missing.length > 0}`);
}
console.log(`\nR4 violations — pass-1 shape: ${violations1} · Revision-2 shape: ${violations2}`);
