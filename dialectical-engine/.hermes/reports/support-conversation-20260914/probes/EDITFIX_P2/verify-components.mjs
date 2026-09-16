import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { parseSupportRecoveryComponents } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/recovery.ts";

const lane = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const currentPath = `${lane}/packages/support-kb/recovery/components.json`;
const beforePath = "/tmp/EDITFIX_P2-components-before.json";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const beforeBytes = readFileSync(beforePath);
const currentBytes = readFileSync(currentPath);
const before = JSON.parse(beforeBytes.toString("utf8"));
const current = JSON.parse(currentBytes.toString("utf8"));
const parsed = parseSupportRecoveryComponents(currentBytes);
const mutable = new Set(["account-access.en","account-access.ro"]);
const prior = new Map(before.components.map((row) => [`${row.id}.${row.lang}`,row]));
const changed = [];
let retained = 0;
for (const row of current.components) {
  const key = `${row.id}.${row.lang}`;
  const old = prior.get(key);
  if (old === undefined) throw new Error(`MISSING_PRIOR:${key}`);
  if (!mutable.has(key)) {
    if (JSON.stringify(old) !== JSON.stringify(row)) throw new Error(`RETAINED_ROW_CHANGED:${key}`);
    retained += 1;
    continue;
  }
  if (old.id !== row.id || old.lang !== row.lang || old.articleSha256 !== row.articleSha256) {
    throw new Error(`MUTABLE_METADATA_CHANGED:${key}`);
  }
  for (const field of ["modelProjection","fallback"]) {
    if (old[field] === row[field]) throw new Error(`EXPECTED_STRING_UNCHANGED:${key}.${field}`);
    changed.push({
      logicalKey:key,field,
      oldSha256:sha256(old[field]),newSha256:sha256(row[field])
    });
  }
}
if (parsed.components.length !== 36 || retained !== 34 || changed.length !== 4) {
  throw new Error("EDITFIX_P2_SCOPE_INVALID");
}
console.log(JSON.stringify({
  status:"SEMANTIC_ADMISSION_PASS",componentCount:parsed.components.length,
  retainedRowCount:retained,changedStringCount:changed.length,
  oldComponentFileSha256:sha256(beforeBytes),newComponentFileSha256:parsed.fileSha256,
  first:`${parsed.components[0].id}.${parsed.components[0].lang}`,
  last:`${parsed.components.at(-1).id}.${parsed.components.at(-1).lang}`,
  changed
}));
