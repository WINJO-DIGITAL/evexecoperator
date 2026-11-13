import { describe, it, expect } from "vitest";
import { queueCustomerText, wantsCustomerText } from "./smsTask";

// A tiny fake of the table: select().eq().eq().maybeSingle(), update().eq(), insert().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake / Supabase query builder; typed loosely on purpose
function fakeAdmin(rows: any[]) {
  const log: string[] = [];
  const admin = {
    from() {
      return {
        select() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake / Supabase query builder; typed loosely on purpose
          const q: any = { _f: {} as Record<string, unknown> };
          q.eq = (k: string, v: unknown) => { q._f[k] = v; return q; };
          q.maybeSingle = async () => ({ data: rows.find((r) => Object.entries(q._f).every(([k, v]) => r[k] === v)) ?? null });
          return q;
        },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake / Supabase query builder; typed loosely on purpose
        update(patch: any) {
          return { eq: async (_k: string, id: string) => { log.push("update"); Object.assign(rows.find((r) => r.id === id), patch); return { error: null }; } };
        },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake / Supabase query builder; typed loosely on purpose
        insert: async (row: any) => { log.push("insert"); rows.push({ id: `t${rows.length + 1}`, ...row }); return { error: null }; },
      };
    },
  };
  return { admin, log };
}
const t = (message: string) => ({ tenantId: "ten", bookingId: "b1", kind: "confirmation", name: "Sam", phone: "07123456789", message });

describe("queueCustomerText", () => {
  it("creates a text when none exists", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake / Supabase query builder; typed loosely on purpose
    const rows: any[] = []; const { admin, log } = fakeAdmin(rows);
    expect(await queueCustomerText(admin, t("Confirmed"))).toBe(true);
    expect(log).toEqual(["insert"]);
    expect(rows[0].status).toBe("pending");
  });
  it("replaces an earlier 'received' text with the confirmed text and makes it unsent again", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake / Supabase query builder; typed loosely on purpose
    const rows: any[] = [{ id: "t1", booking_id: "b1", kind: "confirmation", message: "Received", status: "sent", sent_at: "x" }];
    const { admin, log } = fakeAdmin(rows);
    expect(await queueCustomerText(admin, t("Confirmed"))).toBe(true);
    expect(log).toEqual(["update"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ message: "Confirmed", status: "pending", sent_at: null });
  });
  it("leaves an identical text alone (a retry)", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake / Supabase query builder; typed loosely on purpose
    const rows: any[] = [{ id: "t1", booking_id: "b1", kind: "confirmation", message: "Confirmed", status: "pending" }];
    const { admin, log } = fakeAdmin(rows);
    expect(await queueCustomerText(admin, t("Confirmed"))).toBe(true);
    expect(log).toEqual([]);
  });
});

describe("wantsCustomerText", () => {
  it("a confirmed booking gets a text whenever there is a phone, even if the email went", () => {
    expect(wantsCustomerText({ accepted: true, emailed: true, phone: "07123456789" })).toBe(true);
    expect(wantsCustomerText({ accepted: true, emailed: false, phone: "07123456789" })).toBe(true);
  });
  it("no phone, no text", () => {
    expect(wantsCustomerText({ accepted: true, emailed: false, phone: "" })).toBe(false);
  });
  it("a 'journey unavailable' text is only for when the email could not be sent", () => {
    expect(wantsCustomerText({ accepted: false, emailed: true, phone: "07123456789" })).toBe(false);
    expect(wantsCustomerText({ accepted: false, emailed: false, phone: "07123456789" })).toBe(true);
  });
});
