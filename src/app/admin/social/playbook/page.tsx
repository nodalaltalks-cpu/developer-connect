import Link from "next/link";
import { SectionHeading } from "@/components/admin/empty-state";
import { BUSINESS_EMAIL } from "@/lib/social/links";

export const metadata = { title: "Growth playbook | Developer Connects", robots: { index: false, follow: false } };

const PILLARS = [
  { name: "Market reality", body: "Plain-spoken Mumbai and Dubai price and demand updates. No hype: what is moving, what is not, and why. Builds the trust that makes people call." },
  { name: "Project walkthrough", body: "Real walk-throughs with the price, the carpet area and the RERA number on screen. People save and share these, which is how reach grows." },
  { name: "Buyer mistakes and red flags", body: "What buyers get wrong (hidden charges, possession delays, wrong configuration). Highest-saving format in Indian real estate, and it shows expertise." },
  { name: "Investor maths", body: "Yield, appreciation, Dubai against Mumbai, first-time-buyer numbers. Your MBA in Strategy and the deals you have run are the credibility here." },
  { name: "Client stories", body: "Only with the client&apos;s permission and in their words. One real story outperforms ten promotional posts." },
];

const AUTOMATION = [
  { tool: "Meta Business Suite (free)", use: "Schedule Instagram and Facebook posts and Reels in advance from one place, and read the platforms' own insights. Plan a week of posts in one sitting." },
  { tool: "Comment-to-DM tool such as ManyChat (free tier; check current limits)", use: 'A viewer comments a keyword ("FORM") under a Reel and automatically receives a DM with developerconnects.com/enquire. This is how you turn views into enquiries without answering each message by hand.' },
  { tool: "WhatsApp Business app (free)", use: "Greeting message, away message, quick replies for the five questions you hear most, and labels (New, Site visit, Booked). Your +91 98337 50932 link already opens a chat." },
  { tool: "CapCut and Canva (free)", use: "Cut and caption Reels (captions matter: most people watch muted) and make thumbnails and carousels from a saved template so each one takes minutes." },
  { tool: "One long video, five Reels", use: "Record one 10 to 15 minute explainer a month for YouTube, then cut five 30-second Reels from it. One recording session feeds a month of posting." },
];

const WEEK = [
  ["Mon", "Market reality Reel"],
  ["Tue", "Project walkthrough Reel + Stories (poll: which area next?)"],
  ["Wed", "Buyer-mistake Reel"],
  ["Thu", "Investor-maths carousel or Reel"],
  ["Fri", "Client story or Q&A Reel"],
  ["Sat", "Stories only: behind the scenes, a site visit, a question box"],
  ["Sun", "Review /admin/social, pick next week's three best topics"],
];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-border p-4">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-6 text-foreground/85">{children}</div>
    </section>
  );
}

export default function PlaybookPage() {
  return (
    <div>
      <SectionHeading title="Social growth playbook" description="How to grow Instagram, Facebook, LinkedIn and YouTube from zero for Mumbai and Dubai property, using only free tools, and how to let the analytics steer what you make." />
      <Link href="/admin/social" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover hover:underline">← Social analytics</Link>

      <Card title="1. The positioning">
        <p>
          You are a first-generation real estate entrepreneur with 6+ years of hands-on strategy and investment experience, ₹300 Cr+ of transactions executed (and still counting), and an MBA in Strategy from Symbiosis International University, Dubai. Every profile says the same in the first line, because credibility is the whole game in property.
        </p>
        <p>Suggested bio: <span className="font-medium text-foreground">Property advisor · Mumbai + Dubai · ₹300 Cr+ deals · MBA Strategy · 0% commission on new launches</span>, then the link <span className="font-mono">developerconnects.com/links</span>.</p>
      </Card>

      <Card title="2. Set up once">
        <ul className="list-disc space-y-1 pl-5">
          <li>Company accounts (Instagram and the Facebook Page) are opened with <span className="font-medium text-foreground">{BUSINESS_EMAIL}</span>; your personal profiles use ambishsingh223@gmail.com. Keep them separate, turn on two-step verification on every one, and manage the Page and Instagram together in one Meta Business account.</li>
          <li>Same name, same logo, same link on every platform. Switch Instagram to a Professional account so insights are available.</li>
          <li>Highlights: Start here, Mumbai, Dubai, How it works, Client stories.</li>
          <li>Tag every link with where it sits, so the analytics can tell the platforms apart: <span className="font-mono">?utm_source=instagram&amp;utm_medium=bio</span>, and <span className="font-mono">facebook</span>, <span className="font-mono">linkedin</span>, <span className="font-mono">youtube</span> for the others. For a single Reel use <span className="font-mono">&amp;utm_campaign=reel-name</span>.</li>
        </ul>
      </Card>

      <Card title="3. Five content types (tag each video with one)">
        <ul className="space-y-2">
          {PILLARS.map((p) => (
            <li key={p.name}>
              <span className="font-semibold text-foreground">{p.name}.</span> {p.body}
            </li>
          ))}
        </ul>
        <p>Tag every video with its type when you add it under Landing-page videos. That tag is what lets the dashboard say which type of content turns plays into clicks and enquiries.</p>
      </Card>

      <Card title="4. A week that works (4 to 5 Reels, daily Stories)">
        <ul className="grid gap-1 sm:grid-cols-2">
          {WEEK.map(([day, what]) => (
            <li key={day}>
              <span className="font-semibold text-foreground">{day}:</span> {what}
            </li>
          ))}
        </ul>
        <p>Every Reel: a face and a one-line promise in the first two seconds, captions burned in, 20 to 40 seconds, one idea, and one call to action (comment the keyword, or tap the link in bio). End on a question to invite comments.</p>
      </Card>

      <Card title="5. Free automation (start here, add paid tools only when these are saturated)">
        <ul className="space-y-2">
          {AUTOMATION.map((a) => (
            <li key={a.tool}>
              <span className="font-semibold text-foreground">{a.tool}.</span> {a.use}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="6. The funnel, and how it is measured here">
        <p>Reel or post → link in bio (/links) → tap-to-select form (/enquire) → a lead for your team → a call. Every step is counted on this site: videos seen, played and clicked, links tapped, forms started and sent, and which platform each came from. Open Social analytics weekly.</p>
      </Card>

      <Card title="7. The Sunday review (10 minutes)">
        <ul className="list-disc space-y-1 pl-5">
          <li>Read the recommendations at the top of Social analytics. They are computed from your numbers; do the first two.</li>
          <li>Keep the two best videos at the front of the landing-page strip (Position 0 and 1). Hide any that are played but never clicked.</li>
          <li>Make next week&apos;s content from the content type with the best click rate, in the shape (vertical or horizontal) that holds attention longer.</li>
          <li>Post just before your busiest hour (shown on the dashboard).</li>
        </ul>
      </Card>

      <Card title="8. Rules that protect the brand">
        <ul className="list-disc space-y-1 pl-5">
          <li>Show the RERA registration number whenever you present a specific project, and never promise returns or say anything is guaranteed.</li>
          <li>Use real prices and real photos. Get written permission before showing a client or their words.</li>
          <li>Only state credentials you can prove if asked (registration number, degree, deal figures).</li>
        </ul>
      </Card>

      <Card title="Not automatic yet">
        <p>Instagram, Facebook and YouTube do not hand their own reach and watch-time numbers to a website unless a developer app is approved with each platform. For now this dashboard counts everything that happens on developerconnects.com (the part that leads to enquiries), and you read each platform&apos;s own insights next to it. Connecting those feeds automatically is the next step once the company accounts exist.</p>
      </Card>
    </div>
  );
}
