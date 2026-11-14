"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/*
 * Keyboard audit 2026-11-12: a retry that works swaps this note for the debate page, and Try again goes with it. Set by
 * the press, cleared when the retry ends with the note still here (it failed), and taken by the debate page it brought,
 * which puts focus on its question heading. It holds the address the retry was pressed on, so a page the person went
 * to meanwhile never takes it. The debate page mounts in the same commit that takes this note away; a moment after that
 * the note drops a flag nobody took (the retry brought something else), so no later page opens with focus moved.
 */
let retrying: string | null = null;

/** True once, for the debate page a successful Try again brought. */
export function takeRetried(): boolean {
  const was = retrying !== null && retrying === window.location.pathname;
  retrying = null;
  return was;
}

/** public-f7: a passing fault or the read limit is not "not found": the page asks the server again, in place. */
export function CouldNotLoadRetry({ catalog }: Readonly<{ catalog: MessageCatalog }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => { if (!pending) retrying = null; }, [pending]);
  useEffect(() => () => {
    setTimeout(() => { retrying = null; }, 0);
  }, []);
  return (
    // W2L-4 (the wave-2 checks, 4 Nov): it keeps its focus while the page asks again (never natively disabled), so focus
    // does not fall to the page; a press meanwhile does nothing.
    <button type="button" className="v4Btn v4PubRetry" aria-disabled={pending ? "true" : undefined} aria-busy={pending ? "true" : undefined}
      onClick={() => { if (!pending) { retrying = window.location.pathname; startTransition(() => router.refresh()); } }}>
      {t(catalog, "v4.common.retry")}
    </button>
  );
}
