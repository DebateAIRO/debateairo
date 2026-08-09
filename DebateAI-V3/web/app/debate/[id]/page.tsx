import { cookies } from "next/headers";
import DebatePageClient from "./DebatePageClient";
import { createServerContractClient, USER_TOKEN_COOKIE } from "@/lib/serverApi";
import type { Answer } from "@/lib/types";

export default async function DebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(USER_TOKEN_COOKIE)?.value ?? null;
  let initialAnswer: Answer | null = null;
  let initialError: string | null = null;
  if (token !== null) {
    const client = createServerContractClient();
    try { initialAnswer = await client.readAnswer(id, token); }
    catch {
      try { initialAnswer = await client.readRunAnswer(id, token); }
      catch (failure) { initialError = failure instanceof Error ? failure.name : "INVALID_RESPONSE"; }
    }
  }
  return <DebatePageClient id={id} initialAnswer={initialAnswer} initialError={initialError} />;
}
