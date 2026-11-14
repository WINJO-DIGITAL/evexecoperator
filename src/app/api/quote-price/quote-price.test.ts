import { describe, it, expect, vi, beforeEach } from "vitest";

const TENANT = "00000000-0000-0000-0000-000000000001";
const OTHER = "11111111-0000-4000-8000-000000000002";
const QUOTE = "22222222-0000-4000-8000-000000000003";

type Store = { quote: Record<string, unknown> | null; tasks: Record<string, unknown>[]; saved: Record<string, unknown> | null };
let store: Store;
let caller: { tenantId: string } | null;

vi.mock("@/lib/server/staff", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  return {
    json,
    adminClient: () => ({
      from(table: string) {
        const chain = {
          select: () => chain, eq: () => chain, maybeSingle: async () => {
            if (table === "quote_requests") return { data: store.quote };
            if (table === "tenants") return { data: { name: "EV Exec", brand: { site_url: "https://www.example.test" } } };
            if (table === "operator_sms_tasks") return { data: store.tasks[0] ?? null };
            return { data: null };
          },
          update: (data: Record<string, unknown>) => {
            if (table === "quote_requests") store.saved = data;
            if (table === "operator_sms_tasks") store.tasks = store.tasks.map((t) => ({ ...t, ...data }));
            return { eq: () => ({ eq: async () => ({ error: null }), ...({} as object) }) , then: undefined };
          },
          insert: async (row: Record<string, unknown>) => { store.tasks.push(row); return { error: null }; },
        };
        return chain;
      },
    }),
    getCaller: async () => caller,
  };
});

const { POST } = await import("./route");

const req = (body: unknown) => new Request("https://x.test/api/quote-price", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  caller = { tenantId: TENANT };
  store = {
    quote: {
      id: QUOTE, tenant_id: TENANT, status: "new", customer_name: "Sam Jones", phone: "07700 900123",
      airport: "Manchester Airport", destination: "Kirkham", pickup_date: "2026-12-08", pickup_time: "18:30:00",
      return_required: false, quote_token: "33333333-0000-4000-8000-000000000004",
    },
    tasks: [], saved: null,
  };
});

describe("POST /api/quote-price", () => {
  it("refuses anyone who is not staff", async () => {
    caller = null;
    const res = await POST(req({ quoteId: QUOTE, price: 170 }));
    expect(res.status).toBe(403);
    expect(store.saved).toBeNull();
  });

  it("refuses a quote that belongs to another business", async () => {
    store.quote = { ...store.quote, tenant_id: OTHER };
    const res = await POST(req({ quoteId: QUOTE, price: 170 }));
    expect(res.status).toBe(404);
    expect(store.saved).toBeNull();
  });

  it("refuses a price that is not a sensible amount", async () => {
    for (const price of ["", "abc", 0, 20000]) {
      const res = await POST(req({ quoteId: QUOTE, price }));
      expect(res.status).toBe(400);
    }
    expect(store.saved).toBeNull();
  });

  it("saves the price, queues the text with both reply links, and returns an sms link", async () => {
    const res = await POST(req({ quoteId: QUOTE, price: "170" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.price).toBe(170);
    expect(store.saved).toMatchObject({ quoted_price: 170 });
    expect(body.message).toContain("we can do it for £170.");
    expect(body.message).toContain("https://www.example.test/api/booking/quote-response?t=33333333-0000-4000-8000-000000000004&r=yes");
    expect(body.message).toContain("&r=no");
    expect(body.smsHref).toMatch(/^sms:07700900123\?&body=/);
    expect(store.tasks).toHaveLength(1);
    expect(store.tasks[0]).toMatchObject({ kind: "quote", quote_request_id: QUOTE, status: "pending", booking_id: null });
  });

  it("does not queue a text when there is no phone number, but still saves the price", async () => {
    store.quote = { ...store.quote, phone: "" };
    const body = await (await POST(req({ quoteId: QUOTE, price: 170 }))).json();
    expect(body.noPhone).toBe(true);
    expect(body.smsHref).toBeNull();
    expect(store.saved).toMatchObject({ quoted_price: 170 });
  });

  it("refuses a quote that is already converted or dismissed", async () => {
    store.quote = { ...store.quote, status: "converted" };
    const res = await POST(req({ quoteId: QUOTE, price: 170 }));
    expect(res.status).toBe(409);
  });
});
