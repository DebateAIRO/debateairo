import { notFound } from "next/navigation";
import { createServerContractClient } from "@/lib/serverApi";
import { PublicDebatePageClient } from "./PublicDebatePageClient";

export const dynamic = "force-dynamic";

export default async function PublicDebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let debate;
  try {
    debate = await createServerContractClient().readPublicDebate(id);
  } catch {
    notFound();
  }
  return <PublicDebatePageClient debate={debate} />;
}
