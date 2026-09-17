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
import { subscribeToPreferenceRequests } from "../../apps/ui/lib/consent.js";

const SESSION = Object.freeze({ sessionId: "session-1",token: "token-1",identityBound: false });
let root: Root | null = null;

type ClientReply = Awaited<ReturnType<SupportAssistantClient["sendMessage"]>>;

function client(
  reply: ClientReply,
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
      .toContain("Cookie preferences");
    expect(parsed.body.textContent).toContain("New conversation");
    expect(parsed.body.textContent).not.toContain("Attach a debate");
    expect(parsed.body.textContent).toContain("Escalate to a human");
  });

  it("offers only verified full-page shortcuts and uses the existing cookie opener", async () => {
    const signedOut = new DOMParser().parseFromString(renderToStaticMarkup(
      <Assistant fullPage signedIn={false} client={client({
        messageId: "signed-out-shortcuts",outcome: "NO_SOURCE",text: "No source."
      })} />
    ),"text/html");
    const signedOutShortcuts = signedOut.querySelector('[aria-label="Support shortcuts"]')!;
    expect([...signedOutShortcuts.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href")))
      .not.toContain("/settings#privacy");
    expect(signedOutShortcuts.querySelector('a[href="/settings#consent-privacy-heading"]'))
      .toBeNull();
    expect([...signedOutShortcuts.querySelectorAll("button")].map((button) => button.textContent?.trim()))
      .toContain("Cookie preferences ↗");

    await render(<Assistant fullPage signedIn client={client({
      messageId: "signed-in-shortcuts",outcome: "NO_SOURCE",text: "No source."
    })} />);
    const shortcuts = document.querySelector('[aria-label="Support shortcuts"]')!;
    const privacy = shortcuts.querySelector<HTMLAnchorElement>(
      'a[href="/settings#consent-privacy-heading"]'
    );
    expect(privacy?.textContent?.trim()).toBe("Privacy preferences ↗");
    expect([...shortcuts.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href")))
      .not.toContain("/settings#cookies");

    const cookie = [...shortcuts.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Cookie preferences"))!;
    const requests: Array<HTMLElement | null> = [];
    const unsubscribe = subscribeToPreferenceRequests((opener) => requests.push(opener));
    try {
      await act(async () => cookie.click());
      expect(requests).toEqual([cookie]);
    } finally {
      unsubscribe();
    }

    await act(async () => ([...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "RO")!).click());
    expect(privacy?.textContent?.trim()).toBe("Preferințe de confidențialitate ↗");
    expect(cookie.textContent?.trim()).toBe("Cookie preferences ↗");
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
      SESSION,"What does a condition mark mean?"
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
      SESSION,"Cum funcționează dezbaterile?"
    );
  });

  it("invalidates the active session when language changes and sends text only", async () => {
    const enSession = Object.freeze({ sessionId: "session-en",token: "token-en",identityBound: false });
    const roSession = Object.freeze({ sessionId: "session-ro",token: "token-ro",identityBound: false });
    const transport: SupportAssistantClient = Object.freeze({
      createSession: vi.fn()
        .mockResolvedValueOnce(enSession)
        .mockResolvedValueOnce(roSession),
      sendMessage: vi.fn().mockResolvedValue({
        messageId: "answer",outcome: "NO_SOURCE",text: "answer"
      }),
      rate: vi.fn(),escalate: vi.fn()
    });
    await render(<Assistant client={transport} />);
    await submit("Pricing");
    await act(async () => ([...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "RO")!).click());
    await submit("Account");

    expect(transport.createSession).toHaveBeenNthCalledWith(1,"en");
    expect(transport.createSession).toHaveBeenNthCalledWith(2,"ro");
    expect(transport.sendMessage).toHaveBeenNthCalledWith(1,enSession,"Pricing");
    expect(transport.sendMessage).toHaveBeenNthCalledWith(2,roSession,"Account");
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
    expect(document.querySelector<HTMLAnchorElement>(`a[href="${link}"]`)).not.toBeNull();
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
      SESSION,"ordinary safety request"
    )).resolves.toMatchObject({
      caseAcknowledgement: { text: acknowledgement,token,slaHours: 48,link }
    });
  });

  it("returns a structured RATE_LIMITED outcome from a real 429 response", async () => {
    const text = "You've sent a lot of messages in a short time. Please wait a few minutes.";
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({
      outcome: "RATE_LIMITED",text
    }),{ status: 429,headers: { "content-type": "application/json" } })));

    await expect(supportAssistantClient.sendMessage(
      SESSION,"one request too many"
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
      messages: [{ id: "disclosure",role: "assistant",text: "Prior disclosure." }]
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
    expect(document.querySelector<HTMLAnchorElement>(`a[href="${link}"]`)).not.toBeNull();
  });

  it("renders SHREDDED returned by rating and escalation mutations", async () => {
    const text = "This conversation was erased at the owner's request.";
    const terminal = Object.freeze({ messageId: "",outcome: "SHREDDED" as const,text });
    const transport: SupportAssistantClient = Object.freeze({
      createSession: vi.fn().mockResolvedValue({ ...SESSION,identityBound: true }),
      sendMessage: vi.fn().mockResolvedValue({
        messageId: "rateable",outcome: "NO_SOURCE",text: "No source."
      }),
      rate: vi.fn().mockResolvedValue(terminal),
      escalate: vi.fn().mockResolvedValue(terminal)
    });
    await render(<Assistant client={transport} signedIn />);

    await submit("unknown detail");
    await act(async () => ([...document.querySelectorAll("button")]
      .find((button) => button.textContent === "No") as HTMLButtonElement).click());
    await settle();
    await act(async () => ([...document.querySelectorAll("button")]
      .find((button) => button.textContent === "Talk to a human") as HTMLButtonElement).click());
    await settle();

    expect(document.body.textContent?.split(text)).toHaveLength(3);
  });

  it("preserves the structured SHREDDED envelope on rating and escalation clients", async () => {
    const text = "This conversation was erased at the owner's request.";
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      kind: "SHREDDED",outcome: "SHREDDED",text
    }),{ status: 200,headers: { "content-type": "application/json" } })));

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
      if (url.endsWith("/rating")) return new Response("{}",{ status: 200 });
      if (url.endsWith("/escalate")) return new Response(JSON.stringify({
        case_token: "A".repeat(43),text: "Case opened."
      }),{ status: 200,headers: { "content-type": "application/json" } });
      throw new Error(`UNEXPECTED_FETCH:${url}`);
    }));

    const session = await supportAssistantClient.createSession("en");
    if (!("sessionId" in session)) throw new Error("EXPECTED_SUPPORT_SESSION");
    await supportAssistantClient.sendMessage(session,"hello");
    await supportAssistantClient.rate(session,"message-csrf","yes");
    await supportAssistantClient.escalate(session,"en");

    expect(calls).toHaveLength(4);
    expect(calls.map(({ url }) => url)).toEqual([
      "/api/v1/support/sessions",
      `/api/v1/support/sessions/${SESSION.sessionId}/messages`,
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

  it.each([
    [false,"en","Sources","Actions","Start a debate","/login?next=%2Fnew"],
    [true,"en","Sources","Actions","Start a debate","/login?next=%2Fnew"],
    [false,"ro","Surse","Acțiuni","Pornește o dezbatere","/login?next=%2Fnew"],
    [true,"ro","Surse","Acțiuni","Pornește o dezbatere","/login?next=%2Fnew"]
  ] as const)(
    "renders reviewed sources and canonical actions in fullPage=%s language=%s",
    async (fullPage,language,sourcesName,actionsName,actionLabel,href) => {
      const transport = client({
        messageId: `grounded-${language}-${String(fullPage)}`,
        outcome: "ANSWER_GROUNDED",
        text: language === "en" ? "Current product guidance." : "Îndrumare actuală despre produs.",
        sources: [
          { id: "getting-started-debate",label: language === "en" ? "Create a debate" : "Creează o dezbatere" },
          { id: "budget-tier-choice",label: language === "en" ? "Choose a plan" : "Alege un plan" }
        ],
        actions: [{ id: "start-debate",label: actionLabel,href }]
      });
      await render(<Assistant fullPage={fullPage} client={transport} />);
      if (language === "ro") {
        await act(async () => ([...document.querySelectorAll("button")]
          .find((button) => button.textContent === "RO") as HTMLButtonElement).click());
      }
      await submit(language === "en" ? "How do I create a debate?" : "Cum creez o dezbatere?");

      const sources = document.querySelector(`[aria-label="${sourcesName}"]`)!;
      expect([...sources.querySelectorAll('[role="listitem"]')].map((item) => item.textContent))
        .toEqual(language === "en"
          ? ["Create a debate","Choose a plan"]
          : ["Creează o dezbatere","Alege un plan"]);
      const action = document.querySelector<HTMLAnchorElement>(`[aria-label="${actionsName}"] a`)!;
      expect(action.textContent).toBe(actionLabel);
      expect(action.getAttribute("href")).toBe(href);
      expect(action.target).toBe("");
    }
  );

  it("renders response text and source labels as literal text", async () => {
    await render(<Assistant client={client({
      messageId: "escaped-grounded",outcome: "ANSWER_GROUNDED",
      text: "**bold** <img src=x onerror=alert(1)>",
      sources: [{ id: "getting-started-debate",label: "<script>alert(1)</script>" }],
      actions: [{ id: "home",label: "Home",href: "/" }]
    })} />);
    await submit("question");

    expect(document.body.textContent).toContain("**bold** <img src=x onerror=alert(1)>");
    expect(document.body.textContent).toContain("<script>alert(1)</script>");
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });

  it("accepts complete source/action arrays at the browser response boundary", async () => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message_id: "valid-decorations",outcome: "ANSWER_GROUNDED",text: "Current guidance.",
      sources: [{ id: "getting-started-debate",label: "Create a debate" }],
      actions: [{ id: "start-debate",label: "Start a debate",href: "/login?next=%2Fnew" }]
    }),{ status: 200,headers: { "content-type": "application/json" } })));

    await expect(supportAssistantClient.sendMessage(SESSION,"question")).resolves.toMatchObject({
      sources: [{ id: "getting-started-debate",label: "Create a debate" }],
      actions: [{ id: "start-debate",label: "Start a debate",href: "/login?next=%2Fnew" }]
    });
  });

  it.each([
    ["non-array sources",{ sources: "getting-started-debate",actions: [] }],
    ["source with an extra key",{ sources: [{ id: "getting-started-debate",label: "Create",path: "/internal" }],actions: [] }],
    ["unknown source",{ sources: [{ id: "unknown",label: "Unknown" }],actions: [] }],
    ["duplicate source",{ sources: [
      { id: "getting-started-debate",label: "Create" },{ id: "getting-started-debate",label: "Again" }
    ],actions: [] }],
    ["more than three sources",{ sources: [
      { id: "getting-started-debate",label: "One" },{ id: "budget-tier-choice",label: "Two" },
      { id: "account-access",label: "Three" },{ id: "export-json",label: "Four" }
    ],actions: [] }],
    ["non-array actions",{ sources: [],actions: "home" }],
    ["action with an extra key",{ sources: [],actions: [{ id: "home",label: "Home",href: "/",target: "_blank" }] }],
    ["unknown action",{ sources: [],actions: [{ id: "unknown",label: "Unknown",href: "/" }] }],
    ["duplicate action",{ sources: [],actions: [
      { id: "home",label: "Home",href: "/" },{ id: "home",label: "Home",href: "/" }
    ] }],
    ["mismatched action label",{ sources: [],actions: [{ id: "home",label: "Go elsewhere",href: "/" }] }],
    ["mismatched action href",{ sources: [],actions: [{ id: "home",label: "Home",href: "/settings" }] }],
    ["more than three actions",{ sources: [],actions: [
      { id: "home",label: "Home",href: "/" },
      { id: "start-debate",label: "Start a debate",href: "/login?next=%2Fnew" },
      { id: "sign-in",label: "Sign in",href: "/login" },
      { id: "sign-up",label: "Create account",href: "/sign-up" }
    ] }]
  ] as const)("rejects %s without accepting partial response decorations", async (_name,decorations) => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message_id: "malformed-decorations",outcome: "ANSWER_GROUNDED",text: "Must not render.",
      ...decorations
    }),{ status: 200,headers: { "content-type": "application/json" } })));

    await expect(supportAssistantClient.sendMessage(SESSION,"question"))
      .rejects.toThrow("SUPPORT_RESPONSE_INVALID");
  });

  it("rejects forged decorations restored from session storage", async () => {
    sessionStorage.setItem(SUPPORT_CONVERSATION_STORAGE_KEY,JSON.stringify({
      language: "en",session: SESSION,
      messages: [
        { id: "disclosure",role: "assistant",text: "Prior disclosure." },
        { id: "forged",role: "assistant",text: "Stored forged message",outcome: "ANSWER_GROUNDED",
          sources: [],actions: [{ id: "home",label: "Reset account",href: "/settings" }] }
      ]
    }));
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("{}",{ status: 401 })));

    await render(<Assistant client={supportAssistantClient} signedIn={false} />);

    expect(document.body.textContent).not.toContain("Stored forged message");
    expect(document.body.textContent).toContain("I'm the Dialectical Engine support assistant, an AI");
  });

  it("clears stale A and retries the same redacted turn once through fresh B", async () => {
    sessionStorage.setItem(SUPPORT_CONVERSATION_STORAGE_KEY,JSON.stringify({
      language: "en",
      session: { sessionId: "session-a",token: "token-a",identityBound: false },
      messages: [{ id: "disclosure",role: "assistant",text: "Prior disclosure." }]
    }));
    const calls: Array<Readonly<{ url: string;body: unknown;token: string | null }>> = [];
    vi.stubGlobal("fetch",vi.fn(async (url: string,init: RequestInit = {}) => {
      calls.push({
        url,body: typeof init.body === "string" ? JSON.parse(init.body) : null,
        token: new Headers(init.headers).get("x-support-session-token")
      });
      if (url === "/api/v1/support/sessions/session-a/messages") {
        return new Response(JSON.stringify({
          error: "SUPPORT_KB_SNAPSHOT_UNAVAILABLE",restart_session: true
        }),{ status: 409,headers: { "content-type": "application/json" } });
      }
      if (url === "/api/v1/support/sessions") return new Response(JSON.stringify({
        session: { session_id: "session-b",identity_bound: false },session_token: "token-b"
      }),{ status: 201,headers: { "content-type": "application/json" } });
      if (url === "/api/v1/support/sessions/session-b/messages") return new Response(JSON.stringify({
        message_id: "fresh-answer",outcome: "NO_SOURCE",text: "Fresh answer.",sources: [],actions: []
      }),{ status: 200,headers: { "content-type": "application/json" } });
      throw new Error(`UNEXPECTED_FETCH:${url}`);
    }));
    await render(<Assistant client={supportAssistantClient} signedIn={false} />);
    await submit("My code 123456 failed");

    expect(calls.map(({ url }) => url)).toEqual([
      "/api/v1/support/sessions/session-a/messages",
      "/api/v1/support/sessions",
      "/api/v1/support/sessions/session-b/messages"
    ]);
    expect(calls.filter(({ url }) => url.endsWith("/messages")).map(({ body }) => body)).toEqual([
      { text: "My [REDACTED_SECRET_LIKE] failed" },
      { text: "My [REDACTED_SECRET_LIKE] failed" }
    ]);
    expect(calls.map(({ token }) => token)).toEqual(["token-a",null,"token-b"]);
    expect(document.querySelectorAll('[data-role="user"]')).toHaveLength(1);
    expect(document.body.textContent).toContain("Fresh answer.");
    const stored = sessionStorage.getItem(SUPPORT_CONVERSATION_STORAGE_KEY)!;
    expect(stored).not.toContain("session-a");
    expect(stored).not.toContain("token-a");
    expect(stored).toContain("session-b");
  });

  it("stops after a second exact snapshot mismatch", async () => {
    sessionStorage.setItem(SUPPORT_CONVERSATION_STORAGE_KEY,JSON.stringify({
      language: "en",
      session: { sessionId: "session-a",token: "token-a",identityBound: false },
      messages: [{ id: "disclosure",role: "assistant",text: "Prior disclosure." }]
    }));
    const urls: string[] = [];
    vi.stubGlobal("fetch",vi.fn(async (url: string) => {
      urls.push(url);
      if (url === "/api/v1/support/sessions") return new Response(JSON.stringify({
        session: { session_id: "session-b",identity_bound: false },session_token: "token-b"
      }),{ status: 201,headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({
        error: "SUPPORT_KB_SNAPSHOT_UNAVAILABLE",restart_session: true
      }),{ status: 409,headers: { "content-type": "application/json" } });
    }));
    await render(<Assistant client={supportAssistantClient} signedIn={false} />);
    await submit("question");

    expect(urls).toEqual([
      "/api/v1/support/sessions/session-a/messages",
      "/api/v1/support/sessions",
      "/api/v1/support/sessions/session-b/messages"
    ]);
    const unavailable = "Support is unavailable right now. Please try again or choose 'Talk to a human'.";
    expect(document.body.textContent?.split(unavailable)).toHaveLength(2);
    const stored = sessionStorage.getItem(SUPPORT_CONVERSATION_STORAGE_KEY) ?? "";
    expect(stored).not.toContain("session-b");
    expect(stored).not.toContain("token-b");
  });

  it.each([
    ["a different conflict",{ error: "SUPPORT_CONFLICT",restart_session: true }],
    ["an extended snapshot envelope",{
      error: "SUPPORT_KB_SNAPSHOT_UNAVAILABLE",restart_session: true,detail: "extra"
    }]
  ])("does not restart for %s", async (_name,body) => {
    sessionStorage.setItem(SUPPORT_CONVERSATION_STORAGE_KEY,JSON.stringify({
      language: "en",
      session: { sessionId: "session-a",token: "token-a",identityBound: false },
      messages: [{ id: "disclosure",role: "assistant",text: "Prior disclosure." }]
    }));
    const urls: string[] = [];
    vi.stubGlobal("fetch",vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(body),{
        status: 409,headers: { "content-type": "application/json" }
      });
    }));
    await render(<Assistant client={supportAssistantClient} signedIn={false} />);
    await submit("question");

    expect(urls).toEqual(["/api/v1/support/sessions/session-a/messages"]);
    expect(document.body.textContent).toContain(
      "Support is unavailable right now. Please try again or choose 'Talk to a human'."
    );
  });

  it.each([
    ["en","Forgot password"],
    ["ro","Am uitat parola"]
  ] as const)("keeps unresolved %s password recovery inside Support with no action", async (language,request) => {
    const urls: string[] = [];
    vi.stubGlobal("fetch",vi.fn(async (url: string) => {
      urls.push(url);
      if (url === "/api/v1/support/sessions") return new Response(JSON.stringify({
        session: { session_id: "recovery-session",identity_bound: false },session_token: "recovery-token"
      }),{ status: 201,headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({
        message_id: `recovery-${language}`,outcome: "REFUSE_ZONE",
        text: "Use the product's verified password-recovery flow. Support cannot reset credentials.",
        sources: [],actions: []
      }),{ status: 200,headers: { "content-type": "application/json" } });
    }));
    await render(<Assistant client={supportAssistantClient} signedIn={false} />);
    if (language === "ro") {
      await act(async () => ([...document.querySelectorAll("button")]
        .find((button) => button.textContent === "RO") as HTMLButtonElement).click());
    }
    await submit(request);

    expect(urls).toEqual([
      "/api/v1/support/sessions",
      "/api/v1/support/sessions/recovery-session/messages"
    ]);
    expect(document.querySelector('[aria-label="Actions"]')).toBeNull();
    expect(document.querySelector('[aria-label="Acțiuni"]')).toBeNull();
  });

  it.todo("opens the verified first-party Forgot password flow after V-1 supplies its exact destination");
});
