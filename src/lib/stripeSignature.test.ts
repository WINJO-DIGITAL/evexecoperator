import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyStripeSignature } from "./stripeSignature";

const SECRET = "whsec_test_secret_123";

// Builds a header exactly the way Stripe does: t=<unix>,v1=<hmac of `${t}.${body}`>.
function sign(rawBody: string, secret: string, t: number): string {
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

describe("verifyStripeSignature", () => {
  const body = JSON.stringify({
    type: "checkout.session.completed",
    data: { object: { payment_status: "paid", client_reference_id: "REF123" } },
  });
  const now = 1_700_000_000;

  it("accepts a correctly signed, fresh payload", () => {
    const header = sign(body, SECRET, now);
    expect(verifyStripeSignature(body, header, SECRET, 300, now)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const header = sign(body, SECRET, now);
    const tampered = body.replace("REF123", "REF999");
    expect(verifyStripeSignature(tampered, header, SECRET, 300, now)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const header = sign(body, "whsec_attacker", now);
    expect(verifyStripeSignature(body, header, SECRET, 300, now)).toBe(false);
  });

  it("rejects an expired timestamp (replay protection)", () => {
    const header = sign(body, SECRET, now - 301);
    expect(verifyStripeSignature(body, header, SECRET, 300, now)).toBe(false);
  });

  it("accepts a timestamp within tolerance", () => {
    const header = sign(body, SECRET, now - 120);
    expect(verifyStripeSignature(body, header, SECRET, 300, now)).toBe(true);
  });

  it("rejects a missing header or secret", () => {
    const header = sign(body, SECRET, now);
    expect(verifyStripeSignature(body, null, SECRET, 300, now)).toBe(false);
    expect(verifyStripeSignature(body, header, undefined, 300, now)).toBe(false);
  });

  it("rejects a malformed header", () => {
    expect(verifyStripeSignature(body, "garbage", SECRET, 300, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now}`, SECRET, 300, now)).toBe(false);
  });
});
