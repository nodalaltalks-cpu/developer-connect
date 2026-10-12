import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../developer-connect/db/client.ts";
import { enquirySubmissions, leads, socialEvents, socialVideos } from "../../developer-connect/db/schema.ts";
import type { EnquiryStore } from "../enquiry-service.ts";
import type { SocialSummary, SocialVideo, SocialVideoInput, ValidSocialEvent } from "../types.ts";

/** The database side of the social features: the Founder's video list, the anonymous event log and the enquiry answers. */

const toVideo = (row: typeof socialVideos.$inferSelect): SocialVideo => ({
  id: row.id,
  title: row.title,
  platform: row.platform as SocialVideo["platform"],
  orientation: row.orientation as SocialVideo["orientation"],
  permalinkUrl: row.permalinkUrl,
  mediaUrl: row.mediaUrl,
  posterUrl: row.posterUrl,
  topic: row.topic,
  sortOrder: row.sortOrder,
  active: row.active,
});

export async function listActiveVideos(): Promise<SocialVideo[]> {
  const rows = await getDb().select().from(socialVideos).where(eq(socialVideos.active, true)).orderBy(socialVideos.sortOrder, desc(socialVideos.createdAt)).limit(40);
  return rows.map(toVideo);
}

export async function listAllVideos(): Promise<SocialVideo[]> {
  const rows = await getDb().select().from(socialVideos).orderBy(socialVideos.sortOrder, desc(socialVideos.createdAt)).limit(200);
  return rows.map(toVideo);
}

export async function videoExists(id: string): Promise<boolean> {
  const rows = await getDb().select({ id: socialVideos.id }).from(socialVideos).where(eq(socialVideos.id, id)).limit(1);
  return rows.length > 0;
}

export async function createVideo(input: SocialVideoInput, now: Date): Promise<SocialVideo> {
  const [row] = await getDb()
    .insert(socialVideos)
    .values({ id: randomUUID(), ...input, createdAt: now, updatedAt: now })
    .returning();
  return toVideo(row);
}

export async function updateVideo(id: string, patch: Partial<SocialVideoInput>, now: Date): Promise<void> {
  await getDb().update(socialVideos).set({ ...patch, updatedAt: now }).where(eq(socialVideos.id, id));
}

export async function deleteVideo(id: string): Promise<void> {
  await getDb().delete(socialVideos).where(eq(socialVideos.id, id));
}

export async function recordSocialEvent(event: ValidSocialEvent, ctx: { sessionId: string; deviceType: string; now: Date }): Promise<void> {
  await getDb()
    .insert(socialEvents)
    .values({
      id: randomUUID(),
      occurredAt: ctx.now,
      sessionId: ctx.sessionId,
      kind: event.kind,
      platform: event.platform ?? null,
      contentId: event.contentId ?? null,
      linkKey: event.linkKey ?? null,
      watchMs: event.watchMs ?? null,
      utmSource: event.utmSource ?? null,
      utmMedium: event.utmMedium ?? null,
      utmCampaign: event.utmCampaign ?? null,
      referrerHost: event.referrerHost ?? null,
      deviceType: ctx.deviceType,
    });
}

export const postgresEnquiryStore: EnquiryStore = {
  async insert(row) {
    await getDb()
      .insert(enquirySubmissions)
      .values({ id: randomUUID(), leadId: row.leadId, createdAt: row.createdAt, answers: row.answers, howFound: row.howFound, utmSource: row.utmSource, utmMedium: row.utmMedium, utmCampaign: row.utmCampaign, landingPath: row.landingPath });
  },
};

export interface EnquiryRow {
  id: string;
  leadId: string;
  createdAt: Date;
  answers: Record<string, unknown>;
  howFound: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  name: string | null;
  phoneE164: string | null;
  status: string;
}

/** The Founder's list of enquiry-form submissions, newest first, with the lead each created. */
export async function listEnquiries(limit = 100): Promise<EnquiryRow[]> {
  const rows = await getDb()
    .select({
      id: enquirySubmissions.id,
      leadId: enquirySubmissions.leadId,
      createdAt: enquirySubmissions.createdAt,
      answers: enquirySubmissions.answers,
      howFound: enquirySubmissions.howFound,
      utmSource: enquirySubmissions.utmSource,
      utmCampaign: enquirySubmissions.utmCampaign,
      name: leads.name,
      phoneE164: leads.phoneE164,
      status: leads.status,
    })
    .from(enquirySubmissions)
    .leftJoin(leads, eq(leads.id, enquirySubmissions.leadId))
    .orderBy(desc(enquirySubmissions.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, answers: (r.answers ?? {}) as Record<string, unknown>, status: r.status ?? "UNKNOWN" }));
}

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

/** Everything the social dashboard shows for a date range, computed in the database in a few bounded queries. */
export async function socialSummary(from: Date, to: Date): Promise<SocialSummary> {
  const db = getDb();
  const range = sql`occurred_at >= ${from.toISOString()}::timestamptz and occurred_at < ${to.toISOString()}::timestamptz`;

  const [perVideo, perLink, perSource, perHour, perDevice, funnel, answersBySource, topicRows] = await Promise.all([
    db.execute(sql`
      select v.id, v.title, v.platform, v.orientation, v.topic,
        count(distinct e.session_id) filter (where e.kind = 'video_impression')::int as viewers,
        count(*) filter (where e.kind = 'video_play')::int as plays,
        count(*) filter (where e.kind = 'video_click')::int as clicks,
        coalesce(round(avg(e.watch_ms) filter (where e.kind = 'video_play' and e.watch_ms > 0)), 0)::int as avg_watch_ms
      from social_videos v
      left join social_events e on e.content_id = v.id and e.${range}
      group by v.id order by clicks desc, plays desc limit 100`),
    db.execute(sql`select link_key as key, count(*)::int as clicks from social_events where kind = 'link_click' and ${range} group by link_key order by clicks desc`),
    db.execute(sql`
      select coalesce(utm_source, referrer_host, 'direct') as source, count(distinct session_id)::int as visitors,
        count(*) filter (where kind in ('video_click', 'link_click'))::int as clicks,
        count(*) filter (where kind = 'form_submitted')::int as enquiries
      from social_events where ${range} group by 1 order by visitors desc limit 20`),
    db.execute(sql`
      select extract(hour from occurred_at at time zone 'Asia/Kolkata')::int as hour,
        count(*) filter (where kind in ('video_click', 'link_click'))::int as clicks,
        count(*) filter (where kind = 'video_play')::int as plays
      from social_events where ${range} group by 1 order by 1`),
    db.execute(sql`select coalesce(device_type, 'unknown') as device, count(distinct session_id)::int as visitors from social_events where ${range} group by 1`),
    db.execute(sql`
      select count(distinct session_id) filter (where kind = 'video_impression')::int as saw_video,
        count(distinct session_id) filter (where kind in ('video_click', 'link_click'))::int as clicked,
        count(distinct session_id) filter (where kind = 'form_started')::int as started_form,
        count(distinct session_id) filter (where kind = 'form_submitted')::int as submitted_form
      from social_events where ${range}`),
    db.execute(sql`
      select coalesce(how_found, 'UNKNOWN') as how_found, count(*)::int as enquiries
      from enquiry_submissions where created_at >= ${from.toISOString()}::timestamptz and created_at < ${to.toISOString()}::timestamptz group by 1 order by enquiries desc`),
    db.execute(sql`
      select coalesce(v.topic, 'Untagged') as topic, count(*) filter (where e.kind = 'video_play')::int as plays, count(*) filter (where e.kind = 'video_click')::int as clicks
      from social_videos v left join social_events e on e.content_id = v.id and e.${range} group by 1 order by clicks desc, plays desc`),
  ]);

  const f = (funnel.rows[0] ?? {}) as Row;
  return {
    videos: (perVideo.rows as Row[]).map((r) => ({ id: String(r.id), title: String(r.title), platform: String(r.platform), orientation: String(r.orientation), topic: (r.topic as string | null) ?? null, viewers: n(r.viewers), plays: n(r.plays), clicks: n(r.clicks), avgWatchMs: n(r.avg_watch_ms) })),
    links: (perLink.rows as Row[]).map((r) => ({ key: String(r.key), clicks: n(r.clicks) })),
    sources: (perSource.rows as Row[]).map((r) => ({ source: String(r.source), visitors: n(r.visitors), clicks: n(r.clicks), enquiries: n(r.enquiries) })),
    hours: (perHour.rows as Row[]).map((r) => ({ hour: n(r.hour), clicks: n(r.clicks), plays: n(r.plays) })),
    devices: (perDevice.rows as Row[]).map((r) => ({ device: String(r.device), visitors: n(r.visitors) })),
    funnel: { sawVideo: n(f.saw_video), clicked: n(f.clicked), startedForm: n(f.started_form), submittedForm: n(f.submitted_form) },
    enquiriesByFoundVia: (answersBySource.rows as Row[]).map((r) => ({ howFound: String(r.how_found), enquiries: n(r.enquiries) })),
    topics: (topicRows.rows as Row[]).map((r) => ({ topic: String(r.topic), plays: n(r.plays), clicks: n(r.clicks) })),
  };
}
