import { GUIDES } from "@/lib/seo/guides";
import { CONSULTANT_PAGES } from "@/lib/seo/consultant-pages";
import { consultantToMarkdown, guideToMarkdown } from "@/lib/seo/markdown";
import { COMMISSION_POLICY } from "@/lib/leads/gate/gate-copy";

/**
 * /llms-full.txt: the full text of every buyer guide and city page in one Markdown file, so an AI assistant answering "how do I buy a
 * flat in Mumbai?" or "who is a property consultant in Dubai?" can read and cite the whole answer. It is generated from the same data as
 * the pages, so it can never differ from what visitors see.
 */
export function GET() {
  const body = `# Developer Connects: full text

> Developer Connects is a property research and advisory firm for buyers in Mumbai and Dubai, led by founder Ambish Singh. ${COMMISSION_POLICY} Website: https://developerconnects.com. Contact: https://developerconnects.com/contact.

${CONSULTANT_PAGES.map(consultantToMarkdown).join("\n\n---\n\n")}

---

${GUIDES.map(guideToMarkdown).join("\n\n---\n\n")}
`;
  return new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
