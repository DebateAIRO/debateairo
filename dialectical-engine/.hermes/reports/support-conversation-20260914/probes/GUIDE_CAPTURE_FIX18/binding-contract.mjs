import { resolve } from "node:path";

const SHA256=/^[a-f0-9]{64}$/u;
const COMMIT=/^[a-f0-9]{40}$/u;
const BASE_REVISION="152eed4da1cd3e66b74d8301159ba76427552409";
const exactKeys=(value,keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const absolute=value => typeof value === "string" && value.startsWith("/") && resolve(value) === value;

export const GUIDE_CAPTURE_FIX18_BINDING_KEYS=Object.freeze([
  "schemaVersion","baseRevision","finalRevision","expectedKbVersion","actualNamespace",
  "profileRoot","receiptPath","screenshotPrefix","retentionPath","retentionSha256",
  "retainedSequences","freshSequences","freshSessionGroups"
]);

export function validateGuideCaptureFix18Binding(value) {
  if (!exactKeys(value,GUIDE_CAPTURE_FIX18_BINDING_KEYS) || value.schemaVersion !== 1
    || value.baseRevision !== BASE_REVISION || !COMMIT.test(value.finalRevision)
    || !SHA256.test(value.expectedKbVersion) || !/^[A-Z0-9_]+$/u.test(value.actualNamespace)
    || ![value.profileRoot,value.receiptPath,value.screenshotPrefix,value.retentionPath].every(absolute)
    || !SHA256.test(value.retentionSha256)
    || !Array.isArray(value.retainedSequences) || !Array.isArray(value.freshSequences)
    || !Array.isArray(value.freshSessionGroups)
    || ![...value.retainedSequences,...value.freshSequences].every(Number.isSafeInteger)
    || value.freshSessionGroups.some(group => !exactKeys(group,["id","mode","language","sequences"])
      || typeof group.id !== "string" || !["full","compact"].includes(group.mode)
      || !["en","ro"].includes(group.language) || !Array.isArray(group.sequences)
      || !group.sequences.every(Number.isSafeInteger))) {
    throw new Error("GUIDE_CAPTURE_FIX18_BINDING_INVALID");
  }
  const combined=[...value.retainedSequences,...value.freshSequences];
  const outputPaths=[value.profileRoot,value.receiptPath,value.screenshotPrefix];
  if (combined.length !== new Set(combined).size
    || outputPaths.some(path => path.includes("GUIDE_LIVE_GUIDE17"))
    || new Set(outputPaths).size !== outputPaths.length) {
    throw new Error("GUIDE_CAPTURE_FIX18_BINDING_PLAN_INVALID");
  }
  return Object.freeze(structuredClone(value));
}
