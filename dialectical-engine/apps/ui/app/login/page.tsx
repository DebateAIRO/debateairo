import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginFlow } from "@/components/LoginFlow";
import { createServerContractClient, readSessionCookie } from "@/lib/serverApi";

export default async function LoginPage() {
  const token = readSessionCookie(await cookies());
  let sessionConfirmed = false;
  if (token !== null) {
    const userAgent = (await headers()).get("user-agent") ?? undefined;
    try {
      await createServerContractClient(fetch, token, userAgent).readSession();
      sessionConfirmed = true;
    } catch {
      // A stale or invalid cookie must not prevent a fresh login attempt.
    }
  }
  if (sessionConfirmed) redirect("/#start-a-debate");
  return <LoginFlow />;
}
