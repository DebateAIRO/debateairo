// @vitest-environment jsdom

import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import {
  Assistant,
  SUPPORT_CONVERSATION_STORAGE_KEY,
  supportAssistantClient,
  type SupportAssistantClient
} from "../../apps/ui/components/support/Assistant.js";

const SESSION = Object.freeze({ sessionId: "session-1",token: "token-1",identityBound: false });
let root: Root | null = null;

function client(
  reply: Readonly<{
    messageId: string;
    outcome: "ANSWER_GROUNDED" | "NO_SOURCE" | "REFUSE_ZONE" | "REFUSE_INJECTION" | "REFUSE_SAFETY" | "DEGRADED" | "DISABLED";
    text: string;
    link?: string;
    caseAcknowledgement?: Readonly<{ text: string;token: string;slaHours: number;link: string }>;
  }>,
  ratingAcknowledgement: Readonly<{
    text: string;token: string;slaHours: number;link: string;
  }> | null = null
): SupportAssistantClient {
  return Object.freeze({
    createSession: vi.fn().mockResolvedValue(SESSION),
    sendMessage: vi.fn().mockResolvedValue(reply),
    rate: vi.fn().mockResolvedValue(ratingAcknowledgement),
    escalate: vi.fn().mockResolvedValue({ token: "case-token",text: "Case opened." })
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function render(component: React.ReactNode): Promise<void> {
  await act(async () => root!.render(component));
  await settle();
}

async function submit(text: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[name="support-message"]')!;
  await act(async () => {
    input.value = text;
    input.dispatchEvent(new Event("input",{ bubbles: true }));
  });
  await act(async () => {
    document.querySelector<HTMLFormElement>("form")!
      .dispatchEvent(new Event("submit",{ bubbles: true,cancelable: true }));
  });
  await settle();
}

describe("SUP-01 /help assistant", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders the complete Turn 11 help desk information architecture", () => {
    const html = renderToStaticMarkup(<Assistant fullPage client={client({
      messageId: "turn-11",outcome: "NO_SOURCE",text: "No source."
    })} />);
    const parsed = new DOMParser().parseFromString(html,"text/html");

    expect(parsed.querySelector("[data-support-desk]")).not.toBeNull();
    expect(parsed.querySelector("[data-support-header]")?.textContent).toContain("Dialectical Engine");
    expect(parsed.querySelector("[data-support-header]")?.textContent).toContain("Help");
    expect(parsed.querySelector('[aria-label="Browse by topic"]')?.querySelectorAll("button"))
      .toHaveLength(6);
    expect(parsed.querySelector('[aria-label="Service status"]')?.textContent)
      .toContain("Debate engine");
    expect(parsed.querySelector('[aria-label="Support agent conversation"]')?.textContent)
      .toContain("Support agent");
    expect(parsed.querySelector('[aria-label="Conversation details"]')?.textContent)
      .toContain("This conversation");
    expect(parsed.querySelector('[aria-label="Support shortcuts"]')?.textContent)
      .toContain("Privacy policy");
    expect(parsed.body.textContent).toContain("New conversation");
    expect(parsed.body.textContent).toContain("Attach a debate");
    expect(parsed.body.textContent).toContain("Escalate to a human");
  });

  it("submits a Turn 11 suggestion immediately without priming the composer", async () => {
    const transport = client({
      messageId: "turn-11-answer",outcome: "NO_SOURCE",text: "No source."
    });
    await render(<Assistant fullPage client={transport} />);
    const suggestion = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "What does a condition mark mean?")!;
    await act(async () => {
      suggestion.click();
      await Promise.resolve();
    });
    await settle();

    expect(transport.createSession).toHaveBeenCalledWith("en");
    expect(transport.sendMessage).toHaveBeenCalledWith(
      SESSION,"What does a condition mark mean?","en"
    );
    expect(document.querySelector<HTMLInputElement>('#support-message')?.value)
      .toBe("");
    expect(document.querySelectorAll('[aria-label="Support conversation"] article')).toHaveLength(3);
  });

  it("starts a clean conversation", async () => {
    await render(<Assistant fullPage client={client({
      messageId: "turn-11-answer",outcome: "NO_SOURCE",text: "No source."
    })} />);
    await submit("What does a condition mark mean?");
    expect(document.querySelectorAll('[aria-label="Support conversation"] article')).toHaveLength(3);
    const reset = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "New conversation")!;
    await act(async () => reset.click());
    expect(document.querySelectorAll('[aria-label="Support conversation"] article')).toHaveLength(1);
  });

  it("reports the public Support configuration as unavailable even when the relay is healthy", async () => {
    vi.stubGlobal("fetch",vi.fn(async (url: string) => {
      if (url === "/api/v1/session") return new Response("{}",{ status: 401 });
      if (url === "/api/v1/support/status") return new Response(JSON.stringify({
        configuration: { kind: "DISABLED",code: "SUPPORT_CONFIG_SNAPSHOT_INVALID" },
        relay_state: "AVAILABLE",kb_loaded: { shipped: 12,ignored: 0 }
      }),{ status: 200,headers: { "content-type": "application/json" } });
      throw new Error(`UNEXPECTED_FETCH:${url}`);
    }));

    await render(<Assistant fullPage />);

    expect(document.querySelector(".supportOnline")?.textContent).toBe("UNAVAILABLE");
  });

  it("renders disclosure first and exposes native keyboard/form semantics", () => {
    const html = renderToStaticMarkup(<Assistant client={client({
      messageId: "m1",outcome: "NO_SOURCE",text: "No source."
    })} />);
    const parsed = new DOMParser().parseFromString(html,"text/html");
    const conversation = parsed.querySelector('[aria-label="Support conversation"]')!;
    expect(conversation.firstElementChild?.textContent).toContain(
      "I'm the Dialectical Engine support assistant, an AI"
    );
    const form = parsed.querySelector("form")!;
    const label = form.querySelector('label[for="support-message"]');
    const input = form.querySelector<HTMLInputElement>('#support-message');
    expect(label).not.toBeNull();
    expect(input?.name).toBe("support-message");
    expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });

  it("applies the Romanian override to disclosure and every typed request", async () => {
    const transport = client({ messageId: "m2",outcome: "NO_SOURCE",text: "Nu am o sursă." });
    await render(<Assistant client={transport} />);
    const ro = [...document.querySelectorAll("button")]
      .find((button) => button.textContent === "RO")! as HTMLButtonElement;
    await act(async () => ro.click());
    expect(document.querySelector('[aria-label="Support conversation"]')?.firstElementChild?.textContent)
      .toContain("sunt asistentul de suport Dialectical Engine");
    await submit("Cum funcționează dezbaterile?");
    expect(transport.createSession).toHaveBeenCalledWith("ro");
    expect(transport.sendMessage).toHaveBeenCalledWith(
      SESSION,"Cum funcționează dezbaterile?","ro"
    );
  });

  it("renders conversation content as text and never links external response URLs", async () => {
    await render(<Assistant client={client({
      messageId: "m3",
      outcome: "ANSWER_GROUNDED",
      text: "<b>unsafe</b> https://evil.example",
      link: "https://evil.example"
    })} />);
    await submit("question");
    expect(document.body.textContent).toContain("<b>unsafe</b> https://evil.example");
    expect(document.querySelector("b")).toBeNull();
    expect(document.querySelector('a[href="https://evil.example"]')).toBeNull();
  });

  it.each([
    ["en","The support assistant is switched off at the moment."],
    ["ro","Asistentul de suport este oprit momentan."]
  ] as const)("renders the exact deterministic %s DISABLED notice", async (language,text) => {
    await render(<Assistant client={client({
      messageId: `disabled-${language}`,outcome: "DISABLED",text
    })} />);
    if (language === "ro") {
      await act(async () => ([...document.querySelectorAll("button")]
        .find((button) => button.textContent === "RO") as HTMLButtonElement).click());
    }
    await submit("How do I start my first debate?");
    expect(document.body.textContent).toContain(text);
    expect(document.querySelector('[aria-label="Answer rating"]')).toBeNull();
  });

  it("admits only frozen same-origin response links as anchors", async () => {
    await render(<Assistant client={client({
      messageId: "m4",outcome: "REFUSE_ZONE",text: "Use settings.",link: "/settings"
    })} />);
    await submit("question");
    const anchor = document.querySelector<HTMLAnchorElement>('a[href="/settings"]');
    expect(anchor).not.toBeNull();
    expect(anchor?.target).toBe("");
  });

  it.each([
    ["en", "I've opened case {token} for a person. Expected reply: within 48 hours. Check replies at {link}. I can't promise an outcome."],
    ["ro", "Am deschis cazul {token} pentru o persoană. Răspuns estimat: în 48 ore. Vezi răspunsurile la {link}. Nu pot promite un rezultat."]
  ] as const)("renders the exact %s automated case acknowledgement with its case link", async (
    language,template
  ) => {
    const token = "A".repeat(43);
    const link = `/help?case=${token}`;
    const acknowledgement = template.replace("{token}",token).replace("{link}",link);
    const transport = client({
      messageId: "m-auto",outcome: "REFUSE_SAFETY",text: "Fixed refusal.",
      caseAcknowledgement: { text: acknowledgement,token,slaHours: 48,link }
    });
    await render(<Assistant client={transport} />);
    if (language === "ro") {
      await act(async () => ([...document.querySelectorAll("button")]
        .find((button) => button.textContent === "RO") as HTMLButtonElement).click());
    }
    await submit("ordinary safety request");
    expect(document.body.textContent).toContain(acknowledgement);
    // DL3-F4: the API still writes the retired ?case= form into its sentence;
    // what the browser can navigate to is the fragment form, which never
    // reaches a server, a proxy log or the address bar as a query.
    expect(document.querySelector<HTMLAnchorElement>(`a[href="/help#case=${token}"]`)).not.toBeNull();
    expect(document.querySelector(`a[href="${link}"]`)).toBeNull();
  });

  it("retains automated token/SLA/link fields from the browser client contract", async () => {
    const token = "B".repeat(43);
    const link = `/help?case=${token}`;
    const acknowledgement = `I've opened case ${token} for a person. Expected reply: within 48 hours. Check replies at ${link}. I can't promise an outcome.`;
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message_id: "m-client",outcome: "REFUSE_SAFETY",text: "Fixed refusal.",
      case_token: token,sla_hours: 48,link,case_acknowledgement: acknowledgement
    }),{ status: 200,headers: { "content-type": "application/json" } })));
    await expect(supportAssistantClient.sendMessage(
      SESSION,"ordinary safety request","en"
    )).resolves.toMatchObject({
      // DL3-F4: the API's ?case= link is accepted and carried as #case=.
      caseAcknowledgement: { text: acknowledgement,token,slaHours: 48,link: `/help#case=${token}` }
    });
  });

  it("returns a structured RATE_LIMITED outcome from a real 429 response", async () => {
    const text = "You've sent a lot of messages in a short time. Please wait a few minutes.";
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({
      outcome: "RATE_LIMITED",text
    }),{ status: 429,headers: { "content-type": "application/json" } })));

    await expect(supportAssistantClient.sendMessage(
      SESSION,"one request too many","en"
    )).resolves.toMatchObject({ outcome: "RATE_LIMITED",text });
  });

  it("returns the fresh-session DISABLED terminal reply instead of reading a missing session", async () => {
    const text = "The support assistant is switched off at the moment.";
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({
      outcome: "DISABLED",code: "SUPPORT_DISABLED",text
    }),{ status: 200,headers: { "content-type": "application/json" } })));

    await expect(supportAssistantClient.createSession("en"))
      .resolves.toMatchObject({ outcome: "DISABLED",text });
  });

  it("renders the frozen degraded notice for an unstructured non-2xx response", async () => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "SUPPORT_CONFIG_REFRESH_DEADLINE"
    }),{ status: 503,headers: { "content-type": "application/json" } })));

    await render(<Assistant client={supportAssistantClient} signedIn />);
    await submit("How does publishing work?");

    expect(document.body.textContent).toContain(
      "Support is unavailable right now. Please try again or choose 'Talk to a human'."
    );
  });

  it("replaces a persisted anonymous capability before a signed-in request", async () => {
    sessionStorage.setItem(SUPPORT_CONVERSATION_STORAGE_KEY,JSON.stringify({
      language: "en",
      session: { sessionId: "anonymous-session",token: "anonymous-token",identityBound: false },
      messages: [{ id: "disclosure",role: "assistant",text: "Prior disclosure." }],
      ownContext: { latest: true }
    }));
    const calls: Array<Readonly<{ url: string;headers: Headers }>> = [];
    vi.stubGlobal("fetch",vi.fn(async (url: string,init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      calls.push({ url,headers });
      if (url === "/api/v1/support/sessions") return new Response(JSON.stringify({
        session: { session_id: "owned-session",identity_bound: true },
        session_token: "owned-token"
      }),{ status: 201,headers: { "content-type": "application/json" } });
      if (url === "/api/v1/support/sessions/owned-session/messages") {
        return new Response(JSON.stringify({
          message_id: "owned-answer",outcome: "NO_SOURCE",text: "No source."
        }),{ status: 200,headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }),{
        status: 404,headers: { "content-type": "application/json" }
      });
    }));

    await render(<Assistant client={supportAssistantClient} signedIn />);
    await submit("How does publishing work?");

    const supportCalls = calls.filter(({ url }) => url.startsWith("/api/v1/support/"));
    expect(supportCalls.map(({ url }) => url)).toEqual([
      "/api/v1/support/sessions",
      "/api/v1/support/sessions/owned-session/messages"
    ]);
    expect(supportCalls[0]!.headers.get("x-support-session-token")).toBeNull();
    expect(supportCalls[1]!.headers.get("x-support-session-token")).toBe("owned-token");
    expect(document.body.textContent).toContain("No source.");
  });

  it("renders an E5 acknowledgement returned by the rating request", async () => {
    const token = "C".repeat(43);
    const link = `/help?case=${token}`;
    const text = `I've opened case ${token} for a person. Expected reply: within 48 hours. Check replies at ${link}. I can't promise an outcome.`;
    await render(<Assistant client={client(
      { messageId: "m-rate",outcome: "NO_SOURCE",text: "No source." },
      { text,token,slaHours: 48,link }
    )} />);
    await submit("unknown detail");
    await act(async () => ([...document.querySelectorAll("button")]
      .find((button) => button.textContent === "No") as HTMLButtonElement).click());
    await settle();
    expect(document.body.textContent).toContain(text);
    // DL3-F4: rendered as the fragment form, never as a query bearer.
    expect(document.querySelector<HTMLAnchorElement>(`a[href="/help#case=${token}"]`)).not.toBeNull();
    expect(document.querySelector(`a[href="${link}"]`)).toBeNull();
  });

  it("renders SHREDDED returned by consent, rating, and escalation mutations", async () => {
    const text = "This conversation was erased at the owner's request.";
    const terminal = Object.freeze({ messageId: "",outcome: "SHREDDED" as const,text });
    const transport: SupportAssistantClient = Object.freeze({
      createSession: vi.fn().mockResolvedValue({ ...SESSION,identityBound: true }),
      sendMessage: vi.fn().mockResolvedValue({
        messageId: "rateable",outcome: "NO_SOURCE",text: "No source."
      }),
      setConsent: vi.fn().mockResolvedValue(terminal),
      rate: vi.fn().mockResolvedValue(terminal),
      escalate: vi.fn().mockResolvedValue(terminal)
    });
    await render(<Assistant client={transport} signedIn />);

    await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await settle();
    await submit("unknown detail");
    await act(async () => ([...document.querySelectorAll("button")]
      .find((button) => button.textContent === "No") as HTMLButtonElement).click());
    await settle();
    await act(async () => ([...document.querySelectorAll("button")]
      .find((button) => button.textContent === "Talk to a human") as HTMLButtonElement).click());
    await settle();

    expect(document.body.textContent?.split(text)).toHaveLength(4);
  });

  it("preserves the structured SHREDDED envelope on every browser mutation client", async () => {
    const text = "This conversation was erased at the owner's request.";
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      kind: "SHREDDED",outcome: "SHREDDED",text
    }),{ status: 200,headers: { "content-type": "application/json" } })));

    await expect(supportAssistantClient.setConsent!(SESSION,true))
      .resolves.toMatchObject({ outcome: "SHREDDED",text });
    await expect(supportAssistantClient.rate(SESSION,"message-id","no"))
      .resolves.toMatchObject({ outcome: "SHREDDED",text });
    await expect(supportAssistantClient.escalate(SESSION,"en"))
      .resolves.toMatchObject({ outcome: "SHREDDED",text });
  });

  it("uses the same-origin CSRF boundary for every browser support mutation", async () => {
    const csrf = "c".repeat(43);
    Object.defineProperty(document,"cookie",{
      configurable: true,value: `__Host-debateai-csrf=${csrf}`
    });
    const calls: Array<Readonly<{ url: string;init: RequestInit }>> = [];
    vi.stubGlobal("fetch",vi.fn(async (url: string,init: RequestInit = {}) => {
      calls.push({ url,init });
      if (url === "/api/v1/support/sessions") {
        return new Response(JSON.stringify({
          session: { session_id: SESSION.sessionId },session_token: SESSION.token
        }),{ status: 200,headers: { "content-type": "application/json" } });
      }
      if (url.endsWith("/messages")) return new Response(JSON.stringify({
        message_id: "message-csrf",outcome: "NO_SOURCE",text: "No source."
      }),{ status: 200,headers: { "content-type": "application/json" } });
      if (url.endsWith("/consent")) return new Response("{}",{ status: 200 });
      if (url.endsWith("/rating")) return new Response("{}",{ status: 200 });
      if (url.endsWith("/escalate")) return new Response(JSON.stringify({
        case_token: "A".repeat(43),text: "Case opened."
      }),{ status: 200,headers: { "content-type": "application/json" } });
      throw new Error(`UNEXPECTED_FETCH:${url}`);
    }));

    const session = await supportAssistantClient.createSession("en");
    if (!("sessionId" in session)) throw new Error("EXPECTED_SUPPORT_SESSION");
    await supportAssistantClient.sendMessage(session,"hello","en");
    await supportAssistantClient.setConsent!(session,true);
    await supportAssistantClient.rate(session,"message-csrf","yes");
    await supportAssistantClient.escalate(session,"en");

    expect(calls).toHaveLength(5);
    expect(calls.map(({ url }) => url)).toEqual([
      "/api/v1/support/sessions",
      `/api/v1/support/sessions/${SESSION.sessionId}/messages`,
      `/api/v1/support/sessions/${SESSION.sessionId}/consent`,
      "/api/v1/support/messages/message-csrf/rating",
      `/api/v1/support/sessions/${SESSION.sessionId}/escalate`
    ]);
    for (const { url,init } of calls) {
      expect(url.startsWith("/api/v1/support/")).toBe(true);
      expect(init.method).toBe("POST");
      expect(init.credentials).toBe("same-origin");
      expect(new Headers(init.headers).get("x-csrf-token")).toBe(csrf);
    }
    expect(new Headers(calls[0]!.init.headers).get("x-support-session-token")).toBeNull();
    for (const { init } of calls.slice(1)) {
      expect(new Headers(init.headers).get("x-support-session-token")).toBe(SESSION.token);
    }
  });

  it.each(["ANSWER_GROUNDED","NO_SOURCE"] as const)(
    "shows rating controls only after %s",
    async (outcome) => {
      await render(<Assistant client={client({ messageId: "m5",outcome,text: "answer" })} />);
      await submit("question");
      expect(document.querySelector('[aria-label="Answer rating"]')).not.toBeNull();
      expect(document.body.textContent).toContain("Talk to a human");
    }
  );

  it.each(["REFUSE_ZONE","REFUSE_INJECTION","REFUSE_SAFETY","DEGRADED"] as const)(
    "does not show rating controls after %s",
    async (outcome) => {
      await render(<Assistant client={client({ messageId: "m6",outcome,text: "fixed" })} />);
      await submit("question");
      expect(document.querySelector('[aria-label="Answer rating"]')).toBeNull();
    }
  );
});
