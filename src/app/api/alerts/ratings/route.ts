import { currentUser, isFounder } from "@/lib/auth";
import { createPostgresBuyerEnquiryRepository } from "@/lib/enquiries/db/postgres-repository";
import { raterLabel } from "@/lib/enquiries/service";

/**
 * The Founder's live rating alerts. The browser asks "anything rated since this moment?" and gets back the newest few ratings so a
 * pop-up can say who rated, how many stars and what they wrote. Founder only: anyone else gets 404 (the route does not admit that
 * it exists). It carries a first name, a title and a comment, never a phone number or an email.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const user = await currentUser();
  if (!user || !isFounder(user)) return new Response(null, { status: 404, headers: NO_STORE });

  const raw = new URL(request.url).searchParams.get("since");
  const parsed = raw ? new Date(raw) : null;
  const now = new Date();
  // A missing or invalid time means "from now": the first call only establishes a baseline and returns nothing.
  const since = parsed && !Number.isNaN(parsed.getTime()) && parsed.getTime() <= now.getTime() ? parsed : now;

  try {
    const rows = await createPostgresBuyerEnquiryRepository().listRated({ since, limit: 5 });
    const items = rows
      .reverse()
      .map((r) => ({
        id: `${r.id}:${r.ratedAt?.getTime() ?? 0}`,
        stars: r.rating as number,
        name: raterLabel(r.raterName),
        title: r.title,
        comment: r.comment ? (r.comment.length > 160 ? `${r.comment.slice(0, 157)}...` : r.comment) : null,
        ratedAt: (r.ratedAt as Date).toISOString(),
      }));
    return Response.json({ now: now.toISOString(), items }, { headers: NO_STORE });
  } catch {
    // Table not reachable: say nothing rather than fail the page.
    return Response.json({ now: now.toISOString(), items: [] }, { headers: NO_STORE });
  }
}
