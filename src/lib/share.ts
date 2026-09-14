/**
 * Pure text-building for developer sharing (Parts 28-32) — kept separate
 * from share-developer.tsx (a client component) purely so it's testable
 * without a browser/DOM. No marketing language, no phone-number capture.
 */
export function buildShareMessage(developerName: string, url: string): string {
  return `I found the official website for ${developerName} on Developer Connects:\n${url}`;
}

export function buildWhatsAppShareUrl(developerName: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(buildShareMessage(developerName, url))}`;
}

export function buildMailtoShareUrl(developerName: string, url: string): string {
  const subject = encodeURIComponent(`Official website for ${developerName}`);
  const body = encodeURIComponent(buildShareMessage(developerName, url));
  return `mailto:?subject=${subject}&body=${body}`;
}
