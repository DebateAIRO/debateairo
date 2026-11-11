"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/** public-f7: a passing fault or the read limit is not "not found": the page asks the server again, in place. */
export function CouldNotLoadRetry({ catalog }: Readonly<{ catalog: MessageCatalog }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    // W2L-4 (the wave-2 checks, 4 Nov): it keeps its focus while the page asks again (never natively disabled), so focus
    // does not fall to the page; a press meanwhile does nothing.
    <button type="button" className="v4Btn v4PubRetry" aria-disabled={pending ? "true" : undefined} aria-busy={pending ? "true" : undefined}
      onClick={() => { if (!pending) startTransition(() => router.refresh()); }}>
      {t(catalog, "v4.common.retry")}
    </button>
  );
}
