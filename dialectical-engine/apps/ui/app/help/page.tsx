import { Assistant } from "@/components/support/Assistant";
import { CaseLookup,OwnCaseLookup } from "@/components/support/CaseView";

export default function HelpPage() {
  return (
    <div className="supportPage" data-help-page>
      <Assistant
        fullPage
        auxiliaryContent={<>
          <CaseLookup />
          <OwnCaseLookup />
        </>}
      />
    </div>
  );
}
