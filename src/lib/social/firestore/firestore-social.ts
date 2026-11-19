import { randomUUID } from "node:crypto";
import { getFirestoreDb } from "../../firestore/client.ts";
import { reqDate, toTs } from "../../firestore/convert.ts";
import type { EnquiryStore } from "../enquiry-service.ts";
import type { SocialSummary, SocialVideo, SocialVideoInput, ValidSocialEvent } from "../types.ts";

/**
 * Firestore side of the social features: the Founder's video list, the anonymous event log and the enquiry answers.
 * Collections: socialVideos, socialEvents, enquirySubmissions.
 *
 * The dashboard summary used to be eight GROUP BY queries. Firestore has none, so `socialSummary` reads the events of
 * the requested range once (only the fields it needs) and groups them here. It is an admin-only page opened a few times
 * a day, so one bounded read of the range is the cheapest correct way to keep "distinct visitors" exact.
 */

const VIDEOS = "socialVideos";
const EVENTS = "socialEvents";
const ENQUIRIES = "enquirySubmissions";

type Data = FirebaseFirestore.DocumentData;

const toVideo = (id: string, d: Data): SocialVideo => ({
  id,
  title: d.title,
  platform: d.platform as SocialVideo["platform"],
  orientation: d.orientation as SocialVideo["orientation"],
  permalinkUrl: d.permalinkUrl,
  mediaUrl: d.mediaUrl ?? null,
  posterUrl: d.posterUrl ?? null,
  topic: d.topic ?? null,
  sortOrder: d.sortOrder ?? 0,
  active: d.active !== false,
});

export async function listActiveVideos(): Promise<SocialVideo[]> {
  const snap = await getFirestoreDb().collection(VIDEOS).where("active", "==", true).orderBy("sortOrder", "asc").orderBy("createdAt", "desc").limit(40).get();
  return snap.docs.map((d) => toVideo(d.id, d.data()));
}

export async function listAllVideos(): Promise<SocialVideo[]> {
  const snap = await getFirestoreDb().collection(VIDEOS).orderBy("sortOrder", "asc").orderBy("createdAt", "desc").limit(200).get();
  return snap.docs.map((d) => toVideo(d.id, d.data()));
}

export async function videoExists(id: string): Promise<boolean> {
  return (await getFirestoreDb().collection(VIDEOS).doc(id).get()).exists;
}

export async function createVideo(input: SocialVideoInput, now: Date): Promise<SocialVideo> {
  const id = randomUUID();
  await getFirestoreDb()
    .collection(VIDEOS)
    .doc(id)
    .create({ ...input, mediaUrl: input.mediaUrl ?? null, posterUrl: input.posterUrl ?? null, topic: input.topic ?? null, createdAt: toTs(now), updatedAt: toTs(now) });
  const snap = await getFirestoreDb().collection(VIDEOS).doc(id).get();
  return toVideo(id, snap.data()!);
}

export async function updateVideo(id: string, patch: Partial<SocialVideoInput>, now: Date): Promise<void> {
  const ref = getFirestoreDb().collection(VIDEOS).doc(id);
  // The SQL UPDATE of a missing row was a no-op; keep that.
  if (!(await ref.get()).exists) return;
  await ref.update({ ...patch, updatedAt: toTs(now) });
}

export async function deleteVideo(id: string): Promise<void> {
  await getFirestoreDb().collection(VIDEOS).doc(id).delete();
}

export async function recordSocialEvent(event: ValidSocialEvent, ctx: { sessionId: string; deviceType: string; now: Date }): Promise<void> {
  await getFirestoreDb()
    .collection(EVENTS)
    .doc(randomUUID())
    .create({
      occurredAt: toTs(ctx.now),
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

export const firestoreEnquiryStore: EnquiryStore = {
  async insert(row) {
    await getFirestoreDb()
      .collection(ENQUIRIES)
      .doc(randomUUID())
      .create({
        leadId: row.leadId,
        createdAt: toTs(row.createdAt),
        answers: row.answers,
        howFound: row.howFound ?? null,
        utmSource: row.utmSource ?? null,
        utmMedium: row.utmMedium ?? null,
        utmCampaign: row.utmCampaign ?? null,
        landingPath: row.landingPath ?? null,
      });
  },
};

export interface EnquiryRowShape {
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
export async function listEnquiries(limit = 100): Promise<EnquiryRowShape[]> {
  const db = getFirestoreDb();
  const snap = await db.collection(ENQUIRIES).orderBy("createdAt", "desc").limit(limit).get();
  const leadIds = [...new Set(snap.docs.map((d) => d.data().leadId as string))];
  const leadDocs = leadIds.length ? await db.getAll(...leadIds.map((id) => db.collection("leads").doc(id))) : [];
  const leads = new Map(leadDocs.filter((l) => l.exists).map((l) => [l.id, l.data()!]));
  return snap.docs.map((d) => {
    const x = d.data();
    const lead = leads.get(x.leadId);
    return {
      id: d.id,
      leadId: x.leadId,
      createdAt: reqDate(x.createdAt),
      answers: (x.answers ?? {}) as Record<string, unknown>,
      howFound: x.howFound ?? null,
      utmSource: x.utmSource ?? null,
      utmCampaign: x.utmCampaign ?? null,
      name: lead?.name ?? null,
      phoneE164: lead?.phoneE164 ?? null,
      status: lead?.status ?? "UNKNOWN",
    };
  });
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const CLICK_KINDS = new Set(["video_click", "link_click"]);

function countBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/** Everything the social dashboard shows for a date range. */
export async function socialSummary(from: Date, to: Date): Promise<SocialSummary> {
  const db = getFirestoreDb();
  const [eventSnap, videoSnap, enquirySnap] = await Promise.all([
    db
      .collection(EVENTS)
      .where("occurredAt", ">=", toTs(from))
      .where("occurredAt", "<", toTs(to))
      .select("occurredAt", "sessionId", "kind", "contentId", "linkKey", "watchMs", "utmSource", "referrerHost", "deviceType")
      .get(),
    db.collection(VIDEOS).get(),
    db.collection(ENQUIRIES).where("createdAt", ">=", toTs(from)).where("createdAt", "<", toTs(to)).select("howFound").get(),
  ]);

  const events = eventSnap.docs.map((d) => {
    const x = d.data();
    return {
      at: reqDate(x.occurredAt),
      session: x.sessionId as string,
      kind: x.kind as string,
      contentId: (x.contentId ?? null) as string | null,
      linkKey: (x.linkKey ?? null) as string | null,
      watchMs: (x.watchMs ?? null) as number | null,
      source: ((x.utmSource ?? x.referrerHost ?? "direct") as string) || "direct",
      device: ((x.deviceType ?? "unknown") as string) || "unknown",
    };
  });
  const distinct = (rows: typeof events) => new Set(rows.map((e) => e.session)).size;
  const count = (rows: typeof events, kind: string) => rows.filter((e) => e.kind === kind).length;

  const byContent = countBy(events.filter((e) => e.contentId), (e) => e.contentId!);
  const videos = videoSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as { id: string } & Data);

  const videoRows = videos
    .map((v) => {
      const own = byContent.get(v.id) ?? [];
      const watches = own.filter((e) => e.kind === "video_play" && (e.watchMs ?? 0) > 0).map((e) => e.watchMs as number);
      return {
        id: v.id,
        title: String(v.title),
        platform: String(v.platform),
        orientation: String(v.orientation),
        topic: (v.topic as string | null) ?? null,
        viewers: distinct(own.filter((e) => e.kind === "video_impression")),
        plays: count(own, "video_play"),
        clicks: count(own, "video_click"),
        avgWatchMs: watches.length ? Math.round(watches.reduce((a, b) => a + b, 0) / watches.length) : 0,
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.plays - a.plays)
    .slice(0, 100);

  const links = [...countBy(events.filter((e) => e.kind === "link_click" && e.linkKey), (e) => e.linkKey!)]
    .map(([key, rows]) => ({ key, clicks: rows.length }))
    .sort((a, b) => b.clicks - a.clicks);

  const sources = [...countBy(events, (e) => e.source)]
    .map(([source, rows]) => ({
      source,
      visitors: distinct(rows),
      clicks: rows.filter((e) => CLICK_KINDS.has(e.kind)).length,
      enquiries: count(rows, "form_submitted"),
    }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 20);

  const hours = [...countBy(events, (e) => String(new Date(e.at.getTime() + IST_OFFSET_MS).getUTCHours()))]
    .map(([hour, rows]) => ({ hour: Number(hour), clicks: rows.filter((e) => CLICK_KINDS.has(e.kind)).length, plays: count(rows, "video_play") }))
    .sort((a, b) => a.hour - b.hour);

  const devices = [...countBy(events, (e) => e.device)].map(([device, rows]) => ({ device, visitors: distinct(rows) }));

  const funnel = {
    sawVideo: distinct(events.filter((e) => e.kind === "video_impression")),
    clicked: distinct(events.filter((e) => CLICK_KINDS.has(e.kind))),
    startedForm: distinct(events.filter((e) => e.kind === "form_started")),
    submittedForm: distinct(events.filter((e) => e.kind === "form_submitted")),
  };

  const enquiriesByFoundVia = [...countBy(enquirySnap.docs, (d) => (d.data().howFound as string | null) || "UNKNOWN")]
    .map(([howFound, rows]) => ({ howFound, enquiries: rows.length }))
    .sort((a, b) => b.enquiries - a.enquiries);

  const topics = [...countBy(videoRows, (v) => v.topic ?? "Untagged")]
    .map(([topic, rows]) => ({ topic, plays: rows.reduce((s, v) => s + v.plays, 0), clicks: rows.reduce((s, v) => s + v.clicks, 0) }))
    .sort((a, b) => b.clicks - a.clicks || b.plays - a.plays);

  return { videos: videoRows, links, sources, hours, devices, funnel, enquiriesByFoundVia, topics };
}
