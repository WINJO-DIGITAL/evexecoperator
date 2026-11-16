import crypto from "crypto";

// Verifies a Stripe webhook signature without pulling in the Stripe SDK.
//
// Stripe signs each webhook with `Stripe-Signature: t=<unix>,v1=<hex hmac>`,
// where the HMAC-SHA256 is taken over `${t}.${rawBody}` using the endpoint's
// signing secret (whsec_…). We recompute it and compare in constant time, and
// reject signatures whose timestamp is outside the tolerance window (replay
// protection). `nowSeconds` is injectable so the behaviour is testable.

export const DEFAULT_TOLERANCE_SECONDS = 300;

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | undefined,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!header || !secret) return false;

  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  ) as { t?: string; v1?: string };

  if (!parts.t || !parts.v1) return false;

  const age = nowSeconds - Number(parts.t);
  if (!Number.isFinite(age) || age > toleranceSeconds || age < -toleranceSeconds) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${parts.t}.${rawBody}`, "utf8")
    .digest("hex");

  return timingSafeEqual(expected, parts.v1);
}
