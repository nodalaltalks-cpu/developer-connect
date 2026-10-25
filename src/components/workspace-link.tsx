import Link from "next/link";
import { hasTeamWorkspace } from "@/lib/team/session";

/**
 * "My workspace": shown in the header ONLY to an active team member, as the way from the public site to their dial pad,
 * queue and follow-ups. Everyone else gets nothing at all. It lives in its own file so the public header itself stays
 * free of any reference to the team area. It grants nothing: /team still checks the member on the server.
 */
export async function WorkspaceLink({ userId }: { userId: string }) {
  if (!(await hasTeamWorkspace(userId).catch(() => false))) return null;
  return (
    <Link href="/team" className="inline-flex min-h-11 items-center text-sm font-medium text-foreground hover:text-accent-hover">
      My workspace
    </Link>
  );
}
