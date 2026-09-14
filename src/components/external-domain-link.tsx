/**
 * A developer's official website, shown as a short clickable domain
 * instead of the full raw URL — used on the Founder verification screen
 * and on public developer surfaces alike, so "click once, see the real
 * site" behaves identically everywhere. Always opens in a new tab with
 * `rel="noopener noreferrer"` (the new tab gets no access back to this
 * page, and no referrer leaks to the destination site).
 */
export function ExternalDomainLink({
  url,
  domain,
  className = "",
}: {
  url: string;
  /** Short host to display, e.g. "example.com" — pass canonicalDomain, not the full URL. */
  domain: string;
  className?: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex max-w-full items-center gap-1 truncate text-accent-hover hover:underline ${className}`}
    >
      <span className="truncate">{domain}</span>
      <span aria-hidden="true">↗</span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
