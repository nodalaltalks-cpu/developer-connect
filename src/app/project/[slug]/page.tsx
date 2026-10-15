import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdvisorPageContext } from "@/components/advisor/advisor";
import { ADVISOR_CONTACT } from "@/lib/advisor-contact";
import { CAMPAIGN_PROJECTS, getCampaignProject } from "@/lib/campaign/projects";
import { ProjectQuickForm } from "@/components/campaign/project-quick-form";
import { StickyEnquireBar } from "@/components/campaign/sticky-enquire-bar";

/**
 * The page paid ads land on: one project, one decision, one next step. Deliberately NOT indexed and NOT in the sitemap, so it
 * never competes with the guides and the ad traffic stays measurable. The two-field form on it and the full enquiry form it links
 * to both keep the campaign tags and click ids from this visit (they are remembered in the browser when the page loads).
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return CAMPAIGN_PROJECTS.filter((p) => getCampaignProject(p.slug)).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/project/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const project = getCampaignProject(slug);
  if (!project) return { title: "Project not found | Developer Connects", robots: { index: false, follow: false } };
  return {
    title: `${project.name}, ${project.locality} | Developer Connects`,
    description: `${project.name} by ${project.developer} in ${project.locality}, Mumbai: homes, possession and MahaRERA number, with a short form to speak to an advisor.`,
    alternates: { canonical: `/project/${project.slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function ProjectLandingPage({ params }: PageProps<"/project/[slug]">) {
  const { slug } = await params;
  const project = getCampaignProject(slug);
  if (!project) notFound();

  const whatsappText = `Hi, I'd like details of ${project.name}, ${project.locality}.`;
  const whatsappHref = `https://wa.me/${ADVISOR_CONTACT.india.whatsappDigits}?text=${encodeURIComponent(whatsappText)}`;
  const checked = new Date(`${project.factsCheckedOn}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const facts: Array<[string, string]> = [
    ["Homes", project.configurations],
    ...(project.priceNote ? ([["Price", project.priceNote]] as Array<[string, string]>) : []),
    ["Possession", project.possession],
    ["MahaRERA no.", project.reraNumber],
  ];

  return (
    <div className="flex flex-1 flex-col">
      <AdvisorPageContext project={project.name} location={`${project.locality}, Mumbai`} />
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-10 pb-28 sm:py-14 sm:pb-14">
          <article className="mx-auto max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass-700">{project.locality}, Mumbai</p>
            <h1 className="mt-2 text-balance font-serif text-4xl font-medium leading-[1.1] tracking-tight text-foreground sm:text-5xl">{project.name}</h1>
            <p className="mt-3 text-lg text-muted-foreground">By {project.developer}</p>

            <dl className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label} className="bg-white p-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-base font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>

            <ul className="mt-8 list-disc space-y-2 pl-5 text-base leading-7 text-foreground/85 marker:text-brass-700">
              {project.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>

            <section aria-label="Speak to an advisor" className="mt-10 rounded-xl bg-ink p-6 text-pearl sm:p-8">
              <h2 className="font-serif text-2xl font-medium text-white">Get the price sheet and arrange a site visit</h2>
              <p className="mt-2 text-sm leading-6 text-pearl">Leave your name and number. An advisor calls or WhatsApps you, usually within minutes between 9 am and 9 pm.</p>
              <div className="mt-5">
                <ProjectQuickForm projectName={project.name} whatsappHref={whatsappHref} />
              </div>
              <div className="mt-5 flex flex-col gap-3 border-t border-white/20 pt-5 sm:flex-row">
                <a
                  href={`tel:${ADVISOR_CONTACT.india.e164}`}
                  data-cta="advisor_call"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-sm border border-white/60 px-5 text-sm font-semibold text-white hover:bg-white/10 sm:w-auto"
                >
                  Call {ADVISOR_CONTACT.india.display}
                </a>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cta="advisor_whatsapp"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-sm border border-white/60 px-5 text-sm font-semibold text-white hover:bg-white/10 sm:w-auto"
                >
                  Message on WhatsApp
                </a>
                <Link href="/enquire" data-cta="advisor_open" className="inline-flex min-h-12 w-full items-center justify-center px-2 text-sm font-medium text-pearl underline underline-offset-4 sm:w-auto">
                  Tell us your budget and area
                </Link>
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-semibold text-foreground">Check it yourself</h2>
              <p className="mt-2 text-sm leading-6 text-foreground/80">
                This project is registered with MahaRERA under {project.reraNumber}. You can look up the registration, the approved plans and the
                possession date on the{" "}
                <a href="https://maharera.maharashtra.gov.in" target="_blank" rel="noopener noreferrer" className="text-accent-hover underline underline-offset-4">
                  MahaRERA website
                </a>{" "}
                before you decide.
              </p>
            </section>

            <p className="mt-10 text-xs leading-5 text-muted-foreground">
              Developer Connects is a property advisory platform and is not the developer. Details are taken from the developer&apos;s published
              material and were last checked on {checked}; please confirm them with the developer and MahaRERA. See our{" "}
              <Link href="/disclaimer" className="underline underline-offset-4">
                disclaimer
              </Link>
              .
            </p>
          </article>
        </Container>
      </main>
      <StickyEnquireBar label="Get the price sheet" />
      <SiteFooter />
    </div>
  );
}
