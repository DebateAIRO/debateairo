"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/** public-f7: a passing fault or the read limit is not "not found": the page asks the server again, in place. */
export function CouldNotLoadRetry({ catalog }: Readonly<{ catalog: MessageCatalog }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" className="v4Btn" disabled={pending} aria-busy={pending} onClick={() => startTransition(() => router.refresh())}>
      {t(catalog, "v4.common.retry")}
    </button>
  );
}
