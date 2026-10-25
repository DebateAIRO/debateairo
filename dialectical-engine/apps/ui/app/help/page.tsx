import { headers } from "next/headers";
import { Assistant } from "@/components/support/Assistant";
import { HelpSupport } from "@/components/support/HelpSupport";
import { readCrisisCountryHint } from "@/lib/crisisLines";

export default async function HelpPage() {
  return (
    <div className="supportPage" data-help-page>
      <HelpSupport chat={<Assistant fullPage crisisCountryHint={readCrisisCountryHint(await headers())} />} />
    </div>
  );
}
