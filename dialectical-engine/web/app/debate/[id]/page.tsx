import { cookies, headers } from "next/headers";
import DebatePageClient from "./DebatePageClient";
import { createServerContractClient, USER_TOKEN_COOKIE } from "@/lib/serverApi";
import type { Answer } from "@/lib/types";

export default async function DebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(USER_TOKEN_COOKIE)?.value ?? null;
  const userAgent = (await headers()).get("user-agent") ?? undefined;
  let initialAnswer: Answer | null = null;
  let initialError: string | null = null;
  if (token !== null) {
    const client = createServerContractClient(fetch, token, userAgent);
    try { initialAnswer = await client.readAnswer(id, "cookie-session"); }
    catch {
      try { initialAnswer = await client.readRunAnswer(id, "cookie-session"); }
      catch (failure) { initialError = failure instanceof Error ? failure.name : "INVALID_RESPONSE"; }
    }
  }
  return <DebatePageClient id={id} initialAnswer={initialAnswer} initialError={initialError} />;
}
