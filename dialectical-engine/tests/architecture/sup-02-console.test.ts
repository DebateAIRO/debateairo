import { readdir,readFile } from "node:fs/promises";
import { describe,expect,it } from "vitest";
import {
  renderInert,renderTranscript,runSupportInboxCommand,UNTRUSTED_SUPPORT_TEXT
} from "../../apps/runner/src/support-inbox-cli.js";

describe("SUP-02 terminal inbox boundary", () => {
  it("has no model/provider dependency and no support tool file", async () => {
    const source = await readFile("apps/runner/src/support-inbox-cli.ts","utf8");
    expect(source).not.toMatch(/support\/model|packages\/providers|@debateai\/providers/iu);
    const tools = await readdir("tools",{ recursive: true });
    expect(tools.filter((path) => /support/iu.test(path))).toEqual([]);
  });

  it("replaces ANSI and every control byte before output", () => {
    expect(renderInert("\u001b[31mred\u0007")).toBe("?[31mred?");
  });

  it("wraps the full prefixed transcript in untrusted banners", () => {
    const rendered = renderTranscript([
      { role: "user",text: "https://example.test/\u0007" },
      { role: "assistant",text: "fixed answer" },
      { role: "V",text: "person reply" }
    ]);
    const lines = rendered.split("\n");
    expect(lines[0]).toBe(UNTRUSTED_SUPPORT_TEXT);
    expect(lines.at(-1)).toBe(UNTRUSTED_SUPPORT_TEXT);
    expect(lines.slice(1,-1)).toEqual([
      "USER> https://example.test/?","ASSISTANT> fixed answer","V> person reply"
    ]);
  });

  it("keeps an advisory summary inside the same untrusted banner boundary", () => {
    const rendered = renderTranscript(
      [{ role: "user",text: "problem" }],
      "summary with \u001b[31m control"
    );
    const lines = rendered.split("\n");
    expect(lines[0]).toBe(UNTRUSTED_SUPPORT_TEXT);
    expect(lines.at(-1)).toBe(UNTRUSTED_SUPPORT_TEXT);
    expect(lines.slice(1,-1)).toEqual([
      "USER> problem","Model-written summary — advisory","summary with ?[31m control"
    ]);
  });

  it("prints one terminal shredded marker per retained message without invoking crypto", async () => {
    let cryptoCalls = 0;
    const output = await runSupportInboxCommand(["case","00000000-0000-4000-8000-000000000001"],{
      repository: {
        listInboxEncrypted: async () => [],
        readCaseEncrypted: async () => ({
          case_id: "00000000-0000-4000-8000-000000000001",
          shredded_at: new Date("2026-09-08T00:00:00.000Z"),destroyed_at: new Date(),
          session_message_count: "2",case_message_count: "1"
        }),
        appendCaseMessage: async () => null,
        closeCase: async () => false
      },
      keys: {
        unwrapDataKey: async () => { cryptoCalls += 1;throw new Error("must not unwrap"); },
        openContent: () => { cryptoCalls += 1;throw new Error("must not open"); }
      } as never,
      limits: { messageByteLimit: 4_000,caseMessageLimit: 100 }
    });

    expect(output.match(/\[SHREDDED\]/gu)).toHaveLength(3);
    expect(cryptoCalls).toBe(0);
  });

  it("prints only the shredded discriminator when a reply loses the shred race", async () => {
    const output = await runSupportInboxCommand([
      "reply","00000000-0000-4000-8000-000000000001","hello"
    ],{
      repository: {
        listInboxEncrypted: async () => [],
        readCaseEncrypted: async () => ({
          case_id: "00000000-0000-4000-8000-000000000001",
          wrapped_key: Buffer.alloc(48,1)
        }),
        appendCaseMessage: async () => "SHREDDED" as const,
        closeCase: async () => false
      },
      keys: {
        unwrapDataKey: async () => Buffer.alloc(32,2),
        sealContent: () => Buffer.alloc(32,3)
      } as never,
      limits: { messageByteLimit: 4_000,caseMessageLimit: 100 }
    });

    expect(output).toBe("[SHREDDED]\n");
  });
});
