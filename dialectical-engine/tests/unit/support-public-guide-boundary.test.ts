import { describe,expect,it } from "vitest";
import { classifyPublicGuideBoundary } from "../../apps/api/src/support/public-guide-boundary.js";

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
    ["List my debates","en"],
    ["Show the current state of my account","en"],
    ["Summarize my latest debate","en"],
    ["Inspect my account records","en"],
    ["Listează dezbaterile mele","ro"],
    ["Arată starea curentă a contului meu","ro"],
    ["Rezumați ultima mea dezbatere","ro"],
    ["Verifică înregistrările contului meu","ro"]
  ] as const)("refuses actual private-record access: %s", (text,language) => {
    expect(classifyPublicGuideBoundary(text,language)).toEqual({
      kind: "PRIVATE_RECORD_REQUEST",language
    });
  });
});
