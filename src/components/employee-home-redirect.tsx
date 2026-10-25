import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { currentUser, isFounder } from "@/lib/auth";
import { getEmployee } from "@/lib/team/session";

/**
 * A signed-in team member who opens the landing page goes straight to their workspace instead of the public site.
 * The Founder and everyone else are left alone. Doing the check here also links an approved person's very first
 * sign-in (the same step /post-sign-in takes), so it works however they reached the site. It grants nothing: /team still
 * checks the member on the server. Lives outside the marketing folder so the public pages themselves never mention the team.
 */
export async function EmployeeHomeRedirect() {
  const { userId } = await auth();
  if (!userId) return null;
  if (isFounder(await currentUser())) return null;
  const employee = await getEmployee().catch(() => null);
  if (employee) redirect("/team");
  return null;
}
