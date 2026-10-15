import { INDIA_GUIDES } from "./guides-india.ts";
import { DUBAI_AND_ADVISOR_GUIDES } from "./guides-dubai-advisor.ts";
import { AREA_GUIDES } from "./guides-areas.ts";
import { MORE_AREA_GUIDES } from "./guides-areas-more.ts";
import { DUBAI_MICRO_GUIDES } from "./guides-areas-dubai.ts";
import type { Guide, GuideTopic } from "./types.ts";

/** Every published guide. One list feeds the hub page, the article pages, the sitemap, llms.txt and the structured data. */
export const GUIDES: readonly Guide[] = [...INDIA_GUIDES, ...DUBAI_AND_ADVISOR_GUIDES, ...AREA_GUIDES, ...MORE_AREA_GUIDES, ...DUBAI_MICRO_GUIDES];

export const GUIDES_PATH = "/guides";
export const guidePath = (guide: Pick<Guide, "slug">): string => `${GUIDES_PATH}/${guide.slug}`;

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

const TOPIC_ORDER: readonly GuideTopic[] = ["Buying process", "Costs and money", "Mumbai", "Mumbai neighbourhoods", "Dubai", "Dubai communities", "NRI and overseas", "Choosing an advisor"];

export function guidesByTopic(): Array<{ topic: GuideTopic; guides: Guide[] }> {
  return TOPIC_ORDER.map((topic) => ({ topic, guides: GUIDES.filter((g) => g.topic === topic) })).filter((g) => g.guides.length > 0);
}

/** Related guides that exist, in the order given. */
export function relatedGuides(guide: Guide): Guide[] {
  return guide.related.map((slug) => getGuide(slug)).filter((g): g is Guide => g !== undefined);
}

/** The neighbourhood guide for an area named in a city page's "Areas we cover" list, if one has been written. */
export function guideForArea(area: string): Guide | undefined {
  return GUIDES.find((g) => g.area === area);
}
