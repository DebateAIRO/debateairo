import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginFlow } from "@/components/LoginFlow";
import { createServerContractClient, USER_TOKEN_COOKIE } from "@/lib/serverApi";

export default async function LoginPage() {
  const token = (await cookies()).get(USER_TOKEN_COOKIE)?.value;
  let sessionConfirmed = false;
  if (token !== undefined) {
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
