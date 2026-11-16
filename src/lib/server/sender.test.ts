import { describe, it, expect, beforeAll } from "vitest";
import { mergeBrands } from "@/lib/email/brand.js";
import { senderFor } from "./sender";

const EV = "00000000-0000-0000-0000-000000000001";
const OTHER = "dddddddd-0000-4000-8000-000000000002";
const BARE = "eeeeeeee-0000-4000-8000-000000000003";

beforeAll(() => {
  mergeBrands([
    { id: EV, name: "EV Exec", contact_email: "book@evexec.co.uk", brand: {} },
    { id: OTHER, name: "Coastal Cars", contact_email: "hello@coastal.test", brand: {} },
    { id: BARE, name: "Bare Business", contact_email: null, brand: {} },
  ]);
});

describe("senderFor", () => {
  it("another business: its name as sender (platform address), replies to its own email", () => {
    expect(senderFor(OTHER)).toEqual({ from: "Coastal Cars <book@evexec.co.uk>", reply_to: "hello@coastal.test" });
  });
  it("a business with no contact email gets no reply-to, never EV Exec's", () => {
    const s = senderFor(BARE);
    expect(s.reply_to).toBeUndefined();
    expect(s.from).toBe("Bare Business <book@evexec.co.uk>");
  });
  it("EV Exec (and no tenant) keep the configured reply-to", () => {
    expect(senderFor(EV)).toEqual({ from: "EV Exec <book@evexec.co.uk>", reply_to: "book@evexec.co.uk" });
    expect(senderFor(undefined).reply_to).toBe("book@evexec.co.uk");
  });
});
