import { test } from "node:test";
import assert from "node:assert/strict";
import { ADVISOR_CONTACT, callHref, contextFromPath, mailtoHref, regionForMarket, whatsappHref, whatsappMessage } from "../advisor-contact.ts";

test("advisor contact: the approved numbers open the right WhatsApp chat and the right dialler", () => {
  assert.match(whatsappHref({ region: "india" }), /^https:\/\/wa\.me\/919833750932\?text=/);
  assert.match(whatsappHref({ region: "uae" }), /^https:\/\/wa\.me\/971508902817\?text=/);
  assert.equal(callHref("india"), "tel:+919833750932");
  assert.equal(callHref("uae"), "tel:+971508902817");
  for (const r of [ADVISOR_CONTACT.india, ADVISOR_CONTACT.uae]) {
    assert.equal(r.e164.replace("+", ""), r.whatsappDigits, "one number, written two ways, never two numbers");
    assert.ok(/^\d+$/.test(r.whatsappDigits), "wa.me wants digits only");
  }
});

test("advisor contact: the email goes to the integration address with the agreed subject", () => {
  const href = mailtoHref({ region: "india" });
  assert.ok(href.startsWith("mailto:nodalaltalks@gmail.com?subject="));
  assert.ok(href.includes(encodeURIComponent("Property Consultation — Developer Connects")));
  assert.ok(!href.includes("ambishsingh223"), "the founder's personal address is not used");
  assert.match(decodeURIComponent(href), /Budget: \nRequirement: /);
});

test("advisor contact: the pre-filled message uses only what the visitor can see, in the right voice", () => {
  assert.equal(whatsappMessage({ region: "india" }), "Hi Ambish, I was researching property on Developer Connects and would like some guidance on a property in Mumbai.");
  assert.equal(whatsappMessage({ region: "uae" }), "Hi Ambish, I was researching property on Developer Connects and would like some guidance on a property in Dubai.");
  assert.match(whatsappMessage({ region: "uae", developer: "Emaar Properties" }), /researching Emaar Properties on Developer Connects/);
  assert.match(whatsappMessage({ region: "india", project: "Lodha Park" }), /researching Lodha Park on Developer Connects and would like to understand whether it is suitable for me/);
  assert.match(whatsappMessage({ region: "india", article: "Five questions before you buy" }), /"Five questions before you buy"/);
});

test("advisor contact: visitor-visible text is sanitised and bounded, and no private identifier can enter a message", () => {
  const nasty = whatsappMessage({ region: "india", developer: "A\r\nB\tC " + "x".repeat(500) });
  assert.ok(!/[\r\n\t]/.test(nasty));
  assert.ok(nasty.length < 400);
  const everything = whatsappHref({ region: "uae", developer: "Emaar" }) + mailtoHref({ region: "uae", developer: "Emaar" });
  assert.ok(!/session|utm|gclid|fbclid|lead[_-]?id/i.test(everything));
});

test("advisor contact: the region follows the market, and the address can name it", () => {
  assert.equal(regionForMarket("mumbai"), "india");
  assert.equal(regionForMarket("dubai"), "uae");
  assert.equal(regionForMarket(null), "uae");
  assert.equal(contextFromPath("/buy-direct-from-developer/mumbai", "dubai").region, "india");
  assert.equal(contextFromPath("/developers", "mumbai").region, "india");
});
