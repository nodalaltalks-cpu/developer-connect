/**
 * The arithmetic of one page view's engagement, with no DOM in it so it can be unit-tested.
 *
 * "Engaged" time is not time-on-page. A second only counts when the page is VISIBLE and the visitor did something
 * (scrolled, tapped, typed, moved) within the last IDLE_SECONDS - a forgotten background tab earns nothing.
 */

export const IDLE_SECONDS = 30;

export interface EngagementSummary {
  engagedSeconds: number;
  maxScrollPercent: number;
  clicks: number;
}

export class PageEngagement {
  private engaged = 0;
  private maxScroll = 0;
  private clicks = 0;
  private lastActivityAt: number;

  constructor(startedAtMs: number) {
    // Opening a page counts as the first activity.
    this.lastActivityAt = startedAtMs;
  }

  /** Any sign the visitor is there: scroll, tap, key, pointer move. */
  activity(nowMs: number): void {
    this.lastActivityAt = nowMs;
  }

  /** Called about once a second. Counts that second only when visible and recently active. */
  tick(nowMs: number, visible: boolean): void {
    if (!visible) return;
    if ((nowMs - this.lastActivityAt) / 1000 > IDLE_SECONDS) return;
    this.engaged += 1;
  }

  scroll(scrollTop: number, viewportHeight: number, documentHeight: number, nowMs: number): void {
    this.activity(nowMs);
    if (!(documentHeight > 0) || !(viewportHeight > 0)) return;
    // A page that fits in one screen has been fully seen.
    const percent = documentHeight <= viewportHeight ? 100 : ((scrollTop + viewportHeight) / documentHeight) * 100;
    this.maxScroll = Math.max(this.maxScroll, Math.min(100, Math.round(percent)));
  }

  click(nowMs: number): void {
    this.activity(nowMs);
    this.clicks += 1;
  }

  summary(): EngagementSummary {
    return { engagedSeconds: this.engaged, maxScrollPercent: this.maxScroll, clicks: this.clicks };
  }
}
