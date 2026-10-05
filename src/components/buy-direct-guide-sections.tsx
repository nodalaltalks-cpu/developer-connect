import { BUY_DIRECT_STEPS, type FaqItem } from "@/lib/developer-connect/buy-direct-guides";

/** The shared five-step "how to buy directly from a developer" list. */
export function BuyDirectSteps() {
  return (
    <ol className="mt-4 space-y-4">
      {BUY_DIRECT_STEPS.map((step, index) => (
        <li key={step.title} className="flex gap-4">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-hover"
          >
            {index + 1}
          </span>
          <div>
            <h3 className="font-medium text-foreground">{step.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Visible FAQ list — the same items the page's FAQPage JSON-LD describes, so the markup always matches visible text. */
export function BuyDirectFaq({ items }: { items: FaqItem[] }) {
  return (
    <dl className="mt-4 divide-y divide-border rounded-lg border border-border">
      {items.map((item) => (
        <div key={item.question} className="p-5">
          <dt className="font-medium text-foreground">{item.question}</dt>
          <dd className="mt-2 text-sm text-muted-foreground">{item.answer}</dd>
        </div>
      ))}
    </dl>
  );
}

export function faqStructuredData(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function breadcrumbStructuredData(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `https://developerconnects.com${item.path}`,
    })),
  };
}
