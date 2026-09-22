import { describe,expect,it,vi } from "vitest";
import {
  applyIncidentNotice,
  createSupportIncidentService,
  formatIncidentAnswer,
  type SupportIncidentRecord,
  type SupportIncidentRepositoryPort
} from "../../apps/api/src/support/incidents.js";
import { createSupportAnswerService } from "../../apps/api/src/support/answer.js";
import type { SupportModelPort } from "../../apps/api/src/support/model.js";
import {
  parseSupportIncidentArguments,runSupportIncidentCli
} from "../../apps/runner/src/support-incident-cli.js";

const ACTIVE: SupportIncidentRecord = Object.freeze({
  incidentId: "inc-test-1",
  startedAt: new Date("2026-09-07T08:30:00.000Z"),
  endedAt: null,
  severity: "major",
  affectedSurface: "debates",
  summaryEn: "Debates are slow to generate.",
  summaryRo: "Dezbaterile se generează lent.",
  publishedBy: "V",
  publishedAt: new Date("2026-09-07T08:35:00.000Z"),
  sourceRef: null
});

function repository(active: readonly SupportIncidentRecord[] = []) {
  const inserted: Parameters<SupportIncidentRepositoryPort["publish"]>[0][] = [];
  const resolved: Array<{ id: string;at: Date }> = [];
  const port: SupportIncidentRepositoryPort = {
    readActiveIncidents: vi.fn(async () => active),
    publish: vi.fn(async (input) => { inserted.push(input);return { ...input }; }),
    resolve: vi.fn(async (id,at) => {
      resolved.push({ id,at });
      return id === "missing" ? "NOT_FOUND" : id === "resolved" ? "ALREADY_RESOLVED" : "RESOLVED";
    })
  };
  return { port,inserted,resolved };
}

describe("SUP-05 incident publication", () => {
  it("parses only the closed terminal command shape", () => {
    expect(parseSupportIncidentArguments([
      "publish","--id","inc","--severity","major","--surface","debates",
      "--en","English","--ro","Română"
    ])).toEqual({
      command: "publish",incidentId: "inc",severity: "major",affectedSurface: "debates",
      summaryEn: "English",summaryRo: "Română"
    });
    expect(parseSupportIncidentArguments(["resolve","--id","inc"]))
      .toEqual({ command: "resolve",incidentId: "inc" });
    expect(() => parseSupportIncidentArguments(["publish","--id","inc"]))
      .toThrowError("SUPPORT_INCIDENT_USAGE");
  });

  it("runs the V-only publication command through the support data credential", async () => {
    const rows = repository();
    const end = vi.fn(async () => undefined);
    const output = await runSupportIncidentCli([
      "publish","--id","inc-test-1","--severity","major","--surface","debates",
      "--en",ACTIVE.summaryEn,"--ro",ACTIVE.summaryRo
    ],{
      loadCredentials: vi.fn(async () => ({ supportDatabaseUrl: "postgresql://closed" })),
      openPool: vi.fn(() => ({ end } as never)),createRepository: () => rows.port,
      clock: () => new Date("2026-09-07T08:35:00.000Z")
    });
    expect(output).toContain("published_by: V\n");
    expect(rows.inserted).toEqual([{ ...ACTIVE,startedAt: ACTIVE.publishedAt }]);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it.each(["line one\nline two","line one\rline two"])(
    "rejects CR/LF incident text before CLI credentials or publication: %j",async (summary) => {
      const loadCredentials = vi.fn();
      await expect(runSupportIncidentCli([
        "publish","--id","inc-test","--severity","major","--surface","debates",
        "--en",summary,"--ro","Rezumat"
      ],{
        loadCredentials,openPool: vi.fn() as never,createRepository: vi.fn() as never,
        clock: () => new Date("2026-09-07T08:35:00.000Z")
      })).rejects.toMatchObject({ code: "SUPPORT_INCIDENT_SUMMARY_INVALID" });
      expect(loadCredentials).not.toHaveBeenCalled();
    }
  );

  it("publishes only closed enum values and stamps V", async () => {
    const rows = repository();
    const service = createSupportIncidentService(rows.port,() => new Date("2026-09-07T08:35:00.000Z"));
    await expect(service.publish({
      incidentId: "inc-test-1",severity: "major",affectedSurface: "debates",
      summaryEn: ACTIVE.summaryEn,summaryRo: ACTIVE.summaryRo,
      startedAt: ACTIVE.startedAt,sourceRef: null
    })).resolves.toMatchObject({ publishedBy: "V" });
    expect(rows.inserted).toEqual([{ ...ACTIVE }]);
  });

  it.each([
    [{ severity: "critical",affectedSurface: "debates" },"SUPPORT_INCIDENT_SEVERITY_INVALID"],
    [{ severity: "major",affectedSurface: "payments" },"SUPPORT_INCIDENT_SURFACE_INVALID"]
  ])("rejects invalid publication enum input with a typed code", async (patch,code) => {
    const rows = repository();
    const service = createSupportIncidentService(rows.port);
    await expect(service.publish({
      incidentId: "inc",severity: patch.severity as never,
      affectedSurface: patch.affectedSurface as never,summaryEn: "English",summaryRo: "Română",
      startedAt: new Date("2026-09-07T08:30:00.000Z"),sourceRef: null
    })).rejects.toMatchObject({ code });
    expect(rows.inserted).toEqual([]);
  });

  it("resolves without deletion, rejects unknown ids, and reports an idempotent no-op", async () => {
    const rows = repository();
    const service = createSupportIncidentService(rows.port,() => new Date("2026-09-07T09:00:00.000Z"));
    await expect(service.resolve("inc-test-1")).resolves.toBe("resolved\n");
    await expect(service.resolve("resolved")).resolves.toBe("already resolved\n");
    await expect(service.resolve("missing")).rejects.toMatchObject({ code: "SUPPORT_INCIDENT_NOT_FOUND" });
    expect(rows.resolved).toHaveLength(3);
  });
});

describe("SUP-05 deterministic incident answers", () => {
  it("renders the active row's selected summary byte-for-byte without a model", () => {
    const model = vi.fn();
    expect(formatIncidentAnswer([ACTIVE],"en",model)).toEqual({
      outcome: "ANSWER_INCIDENT",
      text: "Known incident since 2026-09-07T08:30:00.000Z: Debates are slow to generate. (published by the team). If your problem matches, no need to report it; otherwise choose 'Talk to a human'."
    });
    expect(formatIncidentAnswer([ACTIVE],"ro",model)).toEqual({
      outcome: "ANSWER_INCIDENT",
      text: "Incident cunoscut din 2026-09-07T08:30:00.000Z: Dezbaterile se generează lent. (publicat de echipă). Dacă problema ta se potrivește, nu e nevoie să o raportezi; altfel alege „Vorbește cu o persoană”."
    });
    expect(model).not.toHaveBeenCalled();
  });

  it("uses the fixed non-assertive response for none or resolved", () => {
    expect(formatIncidentAnswer([],"en").outcome).toBe("NO_INCIDENT");
    expect(formatIncidentAnswer([{ ...ACTIVE,endedAt: new Date() }],"ro")).toEqual({
      outcome: "NO_INCIDENT",
      text: "Nu am nicio înregistrare a unui incident cunoscut în acest moment. Asta nu exclude unul — dacă ceva pare stricat, alege „Vorbește cu o persoană” și descrie problema."
    });
  });

  it("prepends the deterministic notice only after a related answer exists", () => {
    const reply = "Model reply.\nSource: Publish a debate (publish-a-debate)";
    expect(applyIncidentNotice(reply,"publishing",[ACTIVE],"en")).toBe(
      "Note: there is a known incident affecting debates since 2026-09-07T08:30:00.000Z.\n\n" + reply
    );
    expect(applyIncidentNotice(reply,"sign-in",[ACTIVE],"en")).toBe(reply);
    expect(applyIncidentNotice(reply,"publishing",[],"en")).toBe(reply);
  });

  it("adds the notice after relay completion without putting it in the model prompt", async () => {
    const complete = vi.fn(async (_input: Parameters<SupportModelPort["complete"]>[0]) => ({
      text: "Model reply."
    }));
    const messages = {
      write: vi.fn(async (input) => ({ ...input,redacted: false })),
      writeAndTransit: vi.fn(async (input,transit) => {
        await transit(input.text);
        return { ...input,redacted: false };
      }),
      read: vi.fn(async () => null),
      listSession: vi.fn(async () => [])
    } as never;
    const instants = [
      new Date("2026-09-07T09:00:00.001Z"),new Date("2026-09-07T09:00:00.002Z")
    ];
    const answer = createSupportAnswerService({
      entries: [{
        id: "publish-a-debate",lang: "en",title: "Publish a debate",status: "shipped",
        sources: ["test"],verifiedAgainst: "test",ratifiedBy: "V",ratifiedOn: "2026-09-01",
        body: "Owners can publish a debate from its page."
      }],messages,modelFor: () => ({ complete }),
      incidents: { readActiveIncidents: async () => [ACTIVE] },
      clock: () => instants.shift() ?? new Date("2026-09-07T09:00:00.003Z")
    });
    const result = await answer.respond({
      sessionId: "session",text: "How do I publish a debate?",language: "en",
      detectedLanguage: "en",overrideLanguage: null,modelRef: "relay",
      receivedAt: new Date("2026-09-07T09:00:00.000Z")
    });
    expect(result.text).toMatch(/^Note: there is a known incident affecting debates/u);
    expect(result.text).toContain("\n\nModel reply.\nSource: Publish a debate (publish-a-debate)");
    expect(complete).toHaveBeenCalledTimes(1);
    // FW-B / B-I1: the prompt is ONE framed packet now, so the property this
    // row measures — the incident notice is added after the model answered and
    // never reaches the prompt — is read off the whole packet, instruction
    // compartment and fenced material alike.
    const posted = complete.mock.calls[0]![0].packet;
    expect(posted.messages.map((message) => message.content).join("\n"))
      .not.toContain("known incident");
  });
});
