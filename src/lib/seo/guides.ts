import { INDIA_GUIDES } from "./guides-india.ts";
import { DUBAI_AND_ADVISOR_GUIDES } from "./guides-dubai-advisor.ts";
import type { Guide, GuideTopic } from "./types.ts";

/** Every published guide. One list feeds the hub page, the article pages, the sitemap, llms.txt and the structured data. */
export const GUIDES: readonly Guide[] = [...INDIA_GUIDES, ...DUBAI_AND_ADVISOR_GUIDES];

export const GUIDES_PATH = "/guides";
export const guidePath = (guide: Pick<Guide, "slug">): string => `${GUIDES_PATH}/${guide.slug}`;

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

const TOPIC_ORDER: readonly GuideTopic[] = ["Buying process", "Costs and money", "Mumbai", "Dubai", "NRI and overseas", "Choosing an advisor"];

export function guidesByTopic(): Array<{ topic: GuideTopic; guides: Guide[] }> {
  return TOPIC_ORDER.map((topic) => ({ topic, guides: GUIDES.filter((g) => g.topic === topic) })).filter((g) => g.guides.length > 0);
}

/** Related guides that exist, in the order given. */
export function relatedGuides(guide: Guide): Guide[] {
  return guide.related.map((slug) => getGuide(slug)).filter((g): g is Guide => g !== undefined);
}
