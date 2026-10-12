import type { SocialSummary } from "./types.ts";

/**
 * Turns the social numbers into plain advice about WHAT TO MAKE NEXT. Pure and deterministic: every sentence below is computed from
 * the figures passed in, with a minimum amount of data before a claim is made (a pattern from five plays is noise, so it is not
 * reported as one). Nothing is invented and nothing is a score: each recommendation names the numbers it rests on.
 */

export interface Recommendation {
  kind: "double_down" | "fix" | "timing" | "format" | "funnel" | "data";
  title: string;
  detail: string;
}

const MIN_PLAYS_FOR_PATTERN = 20;
const MIN_PLAYS_FOR_VIDEO_VERDICT = 15;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`;

export function recommend(s: SocialSummary): Recommendation[] {
  const out: Recommendation[] = [];
  const totalPlays = s.videos.reduce((n, v) => n + v.plays, 0);
  const totalClicks = s.videos.reduce((n, v) => n + v.clicks, 0);

  if (totalPlays < MIN_PLAYS_FOR_PATTERN) {
    out.push({
      kind: "data",
      title: "Not enough viewing data yet",
      detail: `Only ${totalPlays} video plays in this period. Keep 5 to 7 videos on the landing page, post 4 to 5 times a week, and add the links-page address to every bio and caption. Patterns show up after about ${MIN_PLAYS_FOR_PATTERN} plays; until then no content conclusions are drawn.`,
    });
  }

  // Which TYPE of content turns a play into a click.
  const topics = s.topics.filter((t) => t.plays >= 10 && t.topic !== "Untagged").map((t) => ({ ...t, rate: t.clicks / t.plays }));
  if (topics.length >= 2) {
    const best = [...topics].sort((a, b) => b.rate - a.rate)[0];
    const worst = [...topics].sort((a, b) => a.rate - b.rate)[0];
    if (best.topic !== worst.topic && best.rate > worst.rate) {
      out.push({ kind: "double_down", title: `Make more "${best.topic}" content`, detail: `${pct(best.clicks, best.plays)}% of plays on "${best.topic}" videos click through to the network, against ${pct(worst.clicks, worst.plays)}% for "${worst.topic}". Shift the next batch toward the first.` });
    }
  } else if (s.topics.some((t) => t.topic === "Untagged" && t.plays > 0)) {
    out.push({ kind: "data", title: "Tag each video with its content type", detail: "Videos without a topic cannot be compared. Give every video a topic (market update, project walkthrough, investor tip, buyer mistake...) so the dashboard can tell you which type works." });
  }

  // Format: vertical vs horizontal, by how long people watch.
  const vertical = s.videos.filter((v) => v.orientation === "VERTICAL" && v.plays >= MIN_PLAYS_FOR_VIDEO_VERDICT);
  const horizontal = s.videos.filter((v) => v.orientation === "HORIZONTAL" && v.plays >= MIN_PLAYS_FOR_VIDEO_VERDICT);
  if (vertical.length > 0 && horizontal.length > 0) {
    const avg = (list: typeof vertical) => list.reduce((n, v) => n + v.avgWatchMs, 0) / list.length;
    const v = avg(vertical);
    const h = avg(horizontal);
    if (Math.abs(v - h) > 1500) {
      const better = v > h ? "vertical (Reels)" : "horizontal (long-form)";
      out.push({ kind: "format", title: `${better[0].toUpperCase()}${better.slice(1)} holds attention longer`, detail: `Average watch time is ${(v / 1000).toFixed(1)}s for vertical and ${(h / 1000).toFixed(1)}s for horizontal. Lead the landing strip with ${better}.` });
    }
  }

  // Videos that are watched but never clicked.
  const watchedNotClicked = s.videos.filter((v) => v.plays >= MIN_PLAYS_FOR_VIDEO_VERDICT && v.clicks === 0);
  if (watchedNotClicked.length > 0) {
    out.push({ kind: "fix", title: `${watchedNotClicked.length} video${watchedNotClicked.length === 1 ? " is" : "s are"} played but never clicked`, detail: `${watchedNotClicked.slice(0, 3).map((v) => `"${v.title}"`).join(", ")}: people watch them but do not go to the post. Add a spoken or on-screen call to action ("full video on Instagram") in the last 3 seconds, or replace them.` });
  }
  const weakHook = s.videos.filter((v) => v.viewers >= MIN_PLAYS_FOR_VIDEO_VERDICT && v.plays / v.viewers < 0.2);
  if (weakHook.length > 0) {
    out.push({ kind: "fix", title: "Some videos are seen but rarely played", detail: `${weakHook.slice(0, 3).map((v) => `"${v.title}"`).join(", ")}: fewer than 1 in 5 viewers lets them play. The preview clip or the first frame is not stopping the scroll; use a face and a one-line promise in the first 2 seconds.` });
  }

  // When people click.
  const hours = [...s.hours].filter((h) => h.clicks > 0).sort((a, b) => b.clicks - a.clicks);
  if (hours.length > 0 && totalClicks >= 10) {
    out.push({ kind: "timing", title: `Post just before ${hourLabel(hours[0].hour)} IST`, detail: `${hours[0].clicks} of ${totalClicks} click-throughs happen in that hour, the busiest of the day. Schedule posts to go live shortly before it.` });
  }

  // The path from watching to enquiring.
  const f = s.funnel;
  if (f.sawVideo >= 20 && f.clicked / f.sawVideo < 0.05) {
    out.push({ kind: "funnel", title: "Few viewers click through", detail: `${f.clicked} of ${f.sawVideo} people who saw a video clicked to the network (${pct(f.clicked, f.sawVideo)}%). Make the call to action clearer and put the links-page address in every caption.` });
  }
  if (f.startedForm >= 10 && f.submittedForm / f.startedForm < 0.4) {
    out.push({ kind: "funnel", title: "People start the enquiry form but do not finish", detail: `${f.submittedForm} of ${f.startedForm} who started it submitted (${pct(f.submittedForm, f.startedForm)}%). Shorten it: keep only the questions the sales call truly needs.` });
  }

  // Which door brings real enquiries.
  const bySource = [...s.sources].filter((x) => x.enquiries > 0).sort((a, b) => b.enquiries - a.enquiries);
  if (bySource.length > 0) {
    out.push({ kind: "double_down", title: `${bySource[0].source} is bringing the most enquiries`, detail: `${bySource[0].enquiries} enquiry${bySource[0].enquiries === 1 ? "" : "ies"} from ${bySource[0].visitors} visitor${bySource[0].visitors === 1 ? "" : "s"}. Put the next hour of effort there.` });
  }
  const trafficNoAction = s.sources.filter((x) => x.visitors >= 20 && x.clicks === 0 && x.enquiries === 0);
  if (trafficNoAction.length > 0) {
    out.push({ kind: "fix", title: `${trafficNoAction[0].source} sends visitors who do nothing`, detail: `${trafficNoAction[0].visitors} visitors, no click and no enquiry. The audience or the promise does not match what the site offers; change the caption or the link they land on.` });
  }

  return out;
}
