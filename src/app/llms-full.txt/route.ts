import { GUIDES } from "@/lib/seo/guides";
import { CONSULTANT_PAGES } from "@/lib/seo/consultant-pages";
import { consultantToMarkdown, guideToMarkdown } from "@/lib/seo/markdown";
import { COMMISSION_POLICY } from "@/lib/leads/gate/gate-copy";
import { EMI_TOOL_FAQ, EMI_TOOL_PATH, GLOSSARY, GLOSSARY_PATH } from "@/lib/seo/tools";

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

---

# Property glossary for Mumbai and Dubai

Source: https://developerconnects.com${GLOSSARY_PATH}

${GLOSSARY.map((t) => `- **${t.term}** (${t.market}): ${t.definition}`).join("\n")}

---

# Home loan EMI calculator

Source: https://developerconnects.com${EMI_TOOL_PATH}

EMI = P × r × (1 + r)^n ÷ ((1 + r)^n − 1), where P is the loan amount, r the monthly rate (yearly rate ÷ 12 ÷ 100) and n the number of monthly instalments.

${EMI_TOOL_FAQ.map((f) => `### ${f.question}\n\n${f.answer}`).join("\n\n")}
`;
  return new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
