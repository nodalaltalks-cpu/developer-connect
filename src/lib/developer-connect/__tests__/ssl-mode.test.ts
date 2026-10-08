import { test } from "node:test";
import assert from "node:assert/strict";
import { explicitSslMode } from "../db/ssl-mode.ts";

const base = "postgresql://user:pw@host.example.neon.tech/db";

test("ssl mode: the three ambiguous names become verify-full (what pg already does), nothing else changes", () => {
  for (const mode of ["prefer", "require", "verify-ca"]) assert.match(explicitSslMode(`${base}?sslmode=${mode}`), /sslmode=verify-full/);
  assert.equal(explicitSslMode(`${base}?sslmode=verify-full`), `${base}?sslmode=verify-full`);
  assert.equal(explicitSslMode(`${base}?sslmode=disable`), `${base}?sslmode=disable`);
  assert.equal(explicitSslMode(base), base, "no sslmode: untouched");
  const compat = `${base}?sslmode=require&uselibpqcompat=true`;
  assert.equal(explicitSslMode(compat), compat, "an explicit libpq-compat request is respected");
  assert.equal(explicitSslMode("not a url"), "not a url");
});

test("ssl mode: credentials and other parameters survive the rewrite", () => {
  const out = new URL(explicitSslMode(`${base}?sslmode=require&channel_binding=require`));
  assert.equal(out.username, "user");
  assert.equal(out.password, "pw");
  assert.equal(out.searchParams.get("channel_binding"), "require");
  assert.equal(out.searchParams.get("sslmode"), "verify-full");
});
