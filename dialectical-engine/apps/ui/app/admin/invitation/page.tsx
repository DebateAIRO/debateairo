import { cookies } from "next/headers";
import { StaffInvitationPanel } from "../../../components/StaffInvitationPanel";
import { LOCALE_COOKIE } from "../../../lib/i18n/locales";
import staffEnglish from "../../../messages/en/staff.json";
import staffRomanian from "../../../messages/ro/staff.json";
export default async function InvitationPage() {
    const locale = (await cookies()).get(LOCALE_COOKIE)?.value;
    return <main className="screen scroll setScreen"><div className="setBody"><div className="setInner"><StaffInvitationPanel catalog={locale === "ro" ? staffRomanian : staffEnglish}/></div></div></main>;
}
