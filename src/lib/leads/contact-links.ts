/**
 * Links that open the phone dialer or WhatsApp on the founder's device.
 * Built only from a stored E.164 number; anything else yields null so a bad
 * value can never become a link. No custom dialer: the device does the call.
 */
const E164 = /^\+[1-9]\d{7,14}$/;

export function telHref(phoneE164: string | null): string | null {
  return phoneE164 !== null && E164.test(phoneE164) ? `tel:${phoneE164}` : null;
}

/** WhatsApp's click-to-chat link wants digits only, no plus sign. */
export function whatsappHref(phoneE164: string | null): string | null {
  return phoneE164 !== null && E164.test(phoneE164) ? `https://wa.me/${phoneE164.slice(1)}` : null;
}
