import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl } from "../url.ts";
import { InvalidUrlError } from "../errors.ts";

test("URL normalization: equivalent URLs resolve to the same canonical domain", () => {
  const a = normalizeUrl("https://example.com");
  const b = normalizeUrl("https://www.example.com/");
  const c = normalizeUrl("http://EXAMPLE.com:80");

  assert.equal(a.canonicalDomain, "example.com");
  assert.equal(b.canonicalDomain, "example.com");
  assert.equal(c.canonicalDomain, "example.com");
});

test("URL normalization: default ports are stripped but non-default ports are preserved", () => {
  const https = normalizeUrl("https://example.com:443/path");
  const custom = normalizeUrl("https://example.com:8443/path");

  assert.equal(https.url, "https://example.com/path");
  assert.ok(custom.url.includes(":8443"));
});

test("URL normalization: meaningful paths are preserved, not destroyed", () => {
  const result = normalizeUrl("https://example.com/projects/andheri-tower?utm=1");
  assert.equal(result.url, "https://example.com/projects/andheri-tower?utm=1");
});

test("URL normalization: trailing slash does not change the normalized path for de-duplication, root stays '/'", () => {
  const withSlash = normalizeUrl("https://example.com/projects/");
  const withoutSlash = normalizeUrl("https://example.com/projects");
  const root = normalizeUrl("https://example.com/");

  assert.equal(withSlash.normalizedPath, withoutSlash.normalizedPath);
  assert.equal(root.normalizedPath, "/");
});

test("URL normalization: rejects non-URL input", () => {
  assert.throws(() => normalizeUrl("not a url"), InvalidUrlError);
});

test("URL normalization: rejects unsupported protocols", () => {
  assert.throws(() => normalizeUrl("ftp://example.com"), InvalidUrlError);
});
