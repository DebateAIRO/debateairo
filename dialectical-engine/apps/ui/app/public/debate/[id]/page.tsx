import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createServerContractClient, readTrustedClientIp } from "@/lib/serverApi";
import { PublicDebatePageClient } from "./PublicDebatePageClient";

export const dynamic = "force-dynamic";

export default async function PublicDebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let debate;
  try {
    // DL3-F1: the public-read budget is per visitor; without the stamped address every
    // server-rendered read would count against one bucket shared by all visitors.
    debate = await createServerContractClient(fetch, undefined, undefined, readTrustedClientIp(await headers())).readPublicDebate(id);
  } catch {
    notFound();
  }
  return <PublicDebatePageClient debate={debate} />;
}
