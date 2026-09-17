import { describe,expect,it } from "vitest";
import {
  classifyPublicGuideBoundary,isPublicAccountLocationGuide
} from "../../apps/api/src/support/public-guide-boundary.js";

describe("Support public-guide boundary", () => {
  it.each([
    ["Where is Your debates?","en"],
    ["How do I use the debate workspace?","en"],
    ["Unde găsesc Dezbaterile tale?","ro"],
    ["Cum folosesc meniul dezbaterii?","ro"]
  ] as const)("keeps public product guidance public: %s", (text,language) => {
    expect(classifyPublicGuideBoundary(text,language)).toEqual({ kind: "PUBLIC_GUIDE" });
  });

  it.each([
    ["Where can I manage active sessions?","en"],
    ["Where are the account deletion options?","en"],
    ["Unde pot gestiona sesiunile active?","ro"],
    ["Unde găsesc opțiunile de ștergere a contului?","ro"]
  ] as const)("keeps account-menu locations public: %s", (text,language) => {
    expect(classifyPublicGuideBoundary(text,language)).toEqual({ kind: "PUBLIC_GUIDE" });
    expect(isPublicAccountLocationGuide(text)).toBe(true);
  });

  it.each([
    ["Where can Support delete my account now?","en"],
    ["Where could the assistant remove my account?","en"],
    ["Unde poate Asistența șterge contul meu?","ro"],
    ["Unde poate agentul de suport să elimine contul meu?","ro"]
  ] as const)("does not treat an explicit %s Support account operation as navigation: %s",(
    text,_language
  ) => {
    expect(isPublicAccountLocationGuide(text)).toBe(false);
  });

  it.each([
    "Where can I delete my account?",
    "Where can I find the account deletion setting?",
    "Do not delete my account; where can I find the account deletion setting?",
    "Where can Support explain the account deletion setting?",
    "Unde pot să îmi șterg contul?",
    "Unde găsesc opțiunea de ștergere a contului?",
    "Nu îmi șterge contul; unde găsesc opțiunea de ștergere?",
    "Unde poate Asistența să explice opțiunea de ștergere a contului?"
  ])("retains user navigation and non-operational Support guidance: %s",(text) => {
    expect(isPublicAccountLocationGuide(text)).toBe(true);
  });

  it("distinguishes Support actors from user navigation across bounded operation forms", () => {
    const controls = [
      {
        prefix:"Where can",actors:["Support","the assistant"],
        operations:["delete","remove"],object:"my account"
      },
      {
        prefix:"Unde poate",actors:["Asistența","agentul de suport"],
        operations:["șterge","elimine"],object:"contul meu"
      }
    ] as const;
    for (const control of controls) {
      for (const actor of control.actors) {
        for (const operation of control.operations) {
          expect(
            isPublicAccountLocationGuide(
              `${control.prefix} ${actor} ${operation} ${control.object}?`
            )
          ).toBe(false);
        }
      }
    }
    expect(isPublicAccountLocationGuide(
      "Support must not delete my account; where is the deletion setting?"
    )).toBe(true);
    expect(isPublicAccountLocationGuide(
      "Asistența nu șterge contul; unde găsesc opțiunea de ștergere?"
    )).toBe(true);
  });

  it.each([
    ["List my debates","en"],
    ["Show the current state of my account","en"],
    ["Summarize my latest debate","en"],
    ["Inspect my account records","en"],
    ["Show my active sessions","en"],
    ["List the active devices on my account","en"],
    ["Listează dezbaterile mele","ro"],
    ["Arată starea curentă a contului meu","ro"],
    ["Rezumați ultima mea dezbatere","ro"],
    ["Verifică înregistrările contului meu","ro"],
    ["Arată sesiunile active ale contului meu","ro"],
    ["Listează dispozitivele active ale contului meu","ro"]
  ] as const)("refuses actual private-record access: %s", (text,language) => {
    expect(classifyPublicGuideBoundary(text,language)).toEqual({
      kind: "PRIVATE_RECORD_REQUEST",language
    });
  });
});
