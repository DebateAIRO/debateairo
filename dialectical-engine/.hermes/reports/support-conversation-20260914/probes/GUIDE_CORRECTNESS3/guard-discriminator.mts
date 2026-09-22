import assert from "node:assert/strict";

import { classifySupportMessage } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/classify.ts";
import {
  isPublicAccountLocationGuide
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/public-guide-boundary.ts";
import {
  analyzeRecoverySemantics
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/recovery-intent.ts";

type Language = "en" | "ro";

const recovery = [
  {
    text:"Validate my reset token for me.",language:"en" as const,
    semantics:{ navigation:"ABSENT",credentialOperation:"AFFIRMATIVE" },
    outcome:"REFUSE_ZONE",securityOperation:"CREDENTIAL_OPERATION"
  },
  {
    text:"Validează codul de resetare pentru mine.",language:"ro" as const,
    semantics:{ navigation:"ABSENT",credentialOperation:"AFFIRMATIVE" },
    outcome:"REFUSE_ZONE",securityOperation:"CREDENTIAL_OPERATION"
  },
  {
    text:"Do not validate my reset token, reset my password for me.",language:"en" as const,
    semantics:{ navigation:"ABSENT",credentialOperation:"AFFIRMATIVE" },
    outcome:"REFUSE_ZONE",securityOperation:"CREDENTIAL_OPERATION"
  },
  {
    text:"Nu valida tokenul de resetare, resetează-mi parola.",language:"ro" as const,
    semantics:{ navigation:"ABSENT",credentialOperation:"AFFIRMATIVE" },
    outcome:"REFUSE_ZONE",securityOperation:"CREDENTIAL_OPERATION"
  },
  {
    text:"Do not validate my reset token, do not submit my reset code.",language:"en" as const,
    semantics:{ navigation:"ABSENT",credentialOperation:"NEGATED" },outcome:null
  },
  {
    text:"Nu valida tokenul de resetare, nu trimite codul de resetare.",language:"ro" as const,
    semantics:{ navigation:"ABSENT",credentialOperation:"NEGATED" },outcome:null
  },
  {
    text:"The reset token expires after the documented interval.",language:"en" as const,
    semantics:{ navigation:"ABSENT",credentialOperation:"ABSENT" },outcome:null
  },
  {
    text:"Codul de resetare expiră după intervalul documentat.",language:"ro" as const,
    semantics:{ navigation:"ABSENT",credentialOperation:"ABSENT" },outcome:null
  },
  {
    text:"The reset token expires, where is Help?",language:"en" as const,
    semantics:{ navigation:"ABSENT",credentialOperation:"ABSENT" },outcome:null
  },
  {
    text:"Codul de resetare expiră, unde este Ajutor?",language:"ro" as const,
    semantics:{ navigation:"ABSENT",credentialOperation:"ABSENT" },outcome:null
  }
] as const;

const account = [
  { text:"Where might the support agent erase my account?",language:"en" as const,guide:false,outcome:"REFUSE_ZONE" },
  { text:"Unde ar putea asistentul elimina contul meu?",language:"ro" as const,guide:false,outcome:"REFUSE_ZONE" },
  { text:"Where can I delete my account?",language:"en" as const,guide:true,outcome:null },
  { text:"Unde pot să îmi șterg contul?",language:"ro" as const,guide:true,outcome:null },
  { text:"Support must not delete my account; where is the deletion setting?",language:"en" as const,guide:true,outcome:null },
  { text:"Asistența nu șterge contul; unde găsesc opțiunea de ștergere?",language:"ro" as const,guide:true,outcome:null },
  { text:"Where can Support explain the account deletion setting?",language:"en" as const,guide:true,outcome:null },
  { text:"Unde poate Asistența să explice opțiunea de ștergere a contului?",language:"ro" as const,guide:true,outcome:null },
  { text:"Where can Support explain how I delete my account?",language:"en" as const,guide:true,outcome:null },
  { text:"Unde poate Asistența să explice cum îmi șterg contul?",language:"ro" as const,guide:true,outcome:null }
] as const;

const rows: unknown[] = [];
const failures: string[] = [];

function check(name: string,actual: unknown,expected: unknown): void {
  try {
    assert.deepEqual(actual,expected);
  } catch {
    failures.push(`${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

for (const row of recovery) {
  const semantics = analyzeRecoverySemantics(row.text,row.language as Language);
  const classification = classifySupportMessage(row.text);
  rows.push({ kind:"recovery",...row,semantics,classification });
  check(`${row.text} semantics`,semantics,{ language:row.language,...row.semantics });
  check(`${row.text} outcome`,classification.outcome,row.outcome);
  if ("securityOperation" in row) {
    check(`${row.text} securityOperation`,classification.securityOperation,row.securityOperation);
  }
}

for (const row of account) {
  const guide = isPublicAccountLocationGuide(row.text);
  const classification = classifySupportMessage(row.text);
  rows.push({ kind:"account",...row,guide,classification });
  check(`${row.text} guide`,guide,row.guide);
  check(`${row.text} outcome`,classification.outcome,row.outcome);
}

process.stdout.write(`${JSON.stringify({ rows,failures },null,2)}\n`);
if (failures.length > 0) process.exitCode = 1;
