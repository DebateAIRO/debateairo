"use client";

import Link from "next/link";
import type { AnswerContribution } from "@debateai/contract";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/*
 * Decision 13: a dig made on a public debate says what became of it, to the digger only (the API serves `contribution` to no one else). No reason is shown.
 */
export function V4ContributionNote({ contribution, catalog }: Readonly<{ contribution: AnswerContribution | undefined; catalog: MessageCatalog }>) {
  if (contribution === undefined) return null;
  return (
    <p className="v4ContributionNote" role="status" data-state={contribution.state}>
      {t(catalog, `v4.contribution.${contribution.state}`)}
      {contribution.state === "ON_THE_PAGE" ? (
        <>
          {" "}
          <Link className="v4Link" href={`/public/debate/${encodeURIComponent(contribution.public_ref)}`}>{t(catalog, "v4.contribution.seePage")}</Link>
        </>
      ) : null}
    </p>
  );
}
