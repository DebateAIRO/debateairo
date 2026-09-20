import { describe,expect,it } from "vitest";
import {
  classifyPublicGuideBoundary,isPublicAccountLocationGuide
} from "../../apps/api/src/support/public-guide-boundary.js";

describe("Support public-guide boundary", () => {
  it.each([
    ["Where is Your debates?","en"],
    ["How do I use the debate workspace?","en"],
    ["Unde găsesc Dezbaterile tale?","ro"],
    ["Cum folosesc meniul dezbaterii?","ro"],
    ["Open Your debates and Browse public debates.","en"],
    ["Deschide Dezbaterile mele și Biblioteca de dezbateri publice.","ro"]
  ] as const)("keeps public product guidance public: %s", (text,language) => {
    expect(classifyPublicGuideBoundary(text,language)).toEqual({ kind: "PUBLIC_GUIDE" });
  });

  it.each([
    ["Where can I browse public debates? Do not open my debates.","en"],
    ["Unde găsesc dezbaterile publice? Nu deschide dezbaterile mele.","ro"]
  ] as const)("keeps a negated private-list half as public navigation: %s",(text,language) => {
    expect(classifyPublicGuideBoundary(text,language)).toEqual({ kind:"PUBLIC_GUIDE" });
  });

  it.each([
    ["Where can I manage active sessions?","en"],
    ["Where are the account deletion options?","en"],
    ["Where can I sign in?","en"],
    ["Where is the login page?","en"],
    ["Unde pot gestiona sesiunile active?","ro"],
    ["Unde găsesc opțiunile de ștergere a contului?","ro"],
    ["Unde mă pot autentifica?","ro"],
    ["Unde găsesc pagina de autentificare?","ro"]
  ] as const)("keeps account-menu locations public: %s", (text,language) => {
    expect(classifyPublicGuideBoundary(text,language)).toEqual({ kind: "PUBLIC_GUIDE" });
    expect(isPublicAccountLocationGuide(text)).toBe(true);
  });

  it.each([
    ["Where can Support delete my account now?","en"],
    ["Where could the assistant remove my account?","en"],
    ["Where can you delete my account for me?","en"],
    ["Where can you remove my account, Support?","en"],
    ["Unde poate Asistența șterge contul meu?","ro"],
    ["Unde poate agentul de suport să elimine contul meu?","ro"],
    ["Unde poate Asistența să îmi șteargă contul acum?","ro"]
  ] as const)("does not treat an explicit %s Support account operation as navigation: %s",(
    text,_language
  ) => {
    expect(isPublicAccountLocationGuide(text)).toBe(false);
  });

  it.each([
    "Where can Support sign in to my account?",
    "Where can you log in to my account for me?",
    "Unde poate Asistența să se autentifice în contul meu?",
    "Unde te poți autentifica în contul meu în locul meu?"
  ])("does not treat a Support sign-in operation as public navigation: %s",(text) => {
    expect(isPublicAccountLocationGuide(text)).toBe(false);
  });

  it.each([
    "Where can I delete my account?",
    "Where can I find the account deletion setting?",
    "Do not delete my account; where can I find the account deletion setting?",
    "Where can Support explain the account deletion setting?",
    "Where can Support explain how I delete my account?",
    "Where can you show me the account deletion setting?",
    "Unde pot să îmi șterg contul?",
    "Unde găsesc opțiunea de ștergere a contului?",
    "Nu îmi șterge contul; unde găsesc opțiunea de ștergere?",
    "Unde poate Asistența să explice opțiunea de ștergere a contului?",
    "Unde poate Asistența să explice cum îmi șterg contul?"
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
    "Where could the assistant erase my account?",
    "Where would Support remove my account for me?",
    "Where can you erase my account for me?",
    "Where can you delete my account, Support?",
    "Unde ar putea agentul de suport elimina contul meu?",
    "Unde poate Asistența să îmi șteargă contul?",
    "Unde poți să îmi ștergi contul?"
  ])("keeps actor, modality, position, and morphology transforms operational: %s",(text) => {
    expect(isPublicAccountLocationGuide(text)).toBe(false);
  });

  it.each([
    "Support cannot erase my account; where is the account deletion setting?",
    "Where can Support explain how I remove my account?",
    "Where can Support describe the account deletion setting?",
    "Asistența nu îmi poate elimina contul; unde găsesc setarea?",
    "Unde poate Asistența să explice cum îmi elimin contul?",
    "Unde poate Asistența descrie opțiunea de ștergere a contului?"
  ])("retains negated and explanatory actor predicates as public guidance: %s",(text) => {
    expect(isPublicAccountLocationGuide(text)).toBe(true);
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
