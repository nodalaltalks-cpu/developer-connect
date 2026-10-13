import { GUIDES, guidePath } from "./guides.ts";
import { CONSULTANT_PAGES, consultantPath } from "./consultant-pages.ts";
import type { Block, Guide } from "./types.ts";

const BASE_URL = "https://developerconnects.com";

/** Plain-Markdown rendering of the guides and city pages, for /llms.txt and /llms-full.txt (built from the same data as the pages). */

function blockToMarkdown(block: Block): string {
  switch (block.t) {
    case "h2":
      return `\n## ${block.text}\n`;
    case "h3":
      return `\n### ${block.text}\n`;
    case "p":
      return `${block.text}\n`;
    case "ul":
      return block.items.map((i) => `- ${i}`).join("\n") + "\n";
    case "ol":
      return block.items.map((i, n) => `${n + 1}. ${i}`).join("\n") + "\n";
    case "note":
      return `> **${block.title}:** ${block.text}\n`;
  }
}

export function guideToMarkdown(guide: Guide): string {
  const faq = guide.faq.map((f) => `**${f.question}**\n${f.answer}\n`).join("\n");
  return `# ${guide.title}\n\nSource: ${BASE_URL}${guidePath(guide)} (facts checked ${guide.updated})\n\n${guide.summary}\n${guide.blocks.map(blockToMarkdown).join("\n")}\n## Frequently asked questions\n\n${faq}`;
}

export function guideIndexMarkdown(): string {
  return GUIDES.map((g) => `- [${g.title}](${BASE_URL}${guidePath(g)}): ${g.description}`).join("\n");
}

export function consultantIndexMarkdown(): string {
  return CONSULTANT_PAGES.map((p) => `- [${p.title}](${BASE_URL}${consultantPath(p)}): ${p.description}`).join("\n");
}

export function consultantToMarkdown(page: (typeof CONSULTANT_PAGES)[number]): string {
  const areas = page.areaGroups.map((g) => `- ${g.heading}: ${g.areas.join(", ")}`).join("\n");
  const faq = page.faq.map((f) => `**${f.question}**\n${f.answer}\n`).join("\n");
  return `# ${page.title}\n\nSource: ${BASE_URL}${consultantPath(page)}\n\n${page.intro}\n\n## How we help\n${page.helpWith.map((h) => `- ${h}`).join("\n")}\n\n## Areas covered\n${areas}\n\n## Regulator\n${page.regulator.name}: ${page.regulator.check}\n\n## Questions\n\n${faq}`;
}
