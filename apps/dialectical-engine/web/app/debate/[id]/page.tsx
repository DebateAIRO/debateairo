import DebatePageClient from "./DebatePageClient";
import { getDebateServer } from "@/lib/serverApi";
import type { DebateDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // SSR fetches the coordinator directly. A request timeout or an unreachable/
  // slow coordinator is TRANSIENT (pending): render a loading state and let the
  // client polling/stream retry populate the debate -- never a fatal dead-end.
  // Only a definitive outcome (e.g. 404 not found) seeds a terminal error.
  const result = await getDebateServer(id);

  let initialDebate: DebateDetail | null = null;
  let initialError: string | null = null;
  let initialPending = false;

  if (result.ok) {
    initialDebate = result.debate;
  } else if (result.kind === "pending") {
    initialPending = true;
  } else {
    initialError = result.message;
  }

  return (
    <DebatePageClient
      id={id}
      initialDebate={initialDebate}
      initialError={initialError}
      initialPending={initialPending}
    />
  );
}
