// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// A fake Supabase client: getUser always succeeds (a signed-in account);
// tenant_users returns whatever the test sets; bookings returns one booking.
const state: { roles: Array<{ tenant_id: string | null; role: string }>; booking: Record<string, unknown> } = { roles: [], booking: {} };

function chain(table: string) {
  const q: Record<string, unknown> = {};
  const self = () => q;
  for (const m of ["select", "eq", "in", "limit", "order", "update", "insert"]) q[m] = vi.fn(self);
  q.single = vi.fn(async () => ({ data: table === "bookings" ? state.booking : null, error: null }));
  q.then = (res: (v: unknown) => unknown) => res({ data: table === "tenant_users" ? state.roles : [], error: null });
  return q;
}
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: (t: string) => chain(t),
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
process.env.STRIPE_SECRET_KEY = "sk_test_x";
process.env.RESEND_API_KEY = "re_x";

const req = (body: unknown) => new Request("http://localhost/api", {
  method: "POST", headers: { authorization: "Bearer tok", "content-type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => {
  state.roles = [];
  state.booking = { ref: "EVX-1", tenant_id: "t1", customer_email: "c@example.com", quoted_price: 90 };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "cs_1", url: "https://stripe.test" }), { status: 200 })));
});

describe("staff-only API routes", () => {
  it("send-invoice refuses a signed-in account that isn't staff", async () => {
    const { POST } = await import("./send-invoice/route");
    const res = await POST(req({ to: "x@example.com", pdfBase64: "AAA", number: "INV-1" }));
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("payment-link refuses a signed-in account that isn't staff", async () => {
    const { POST } = await import("./payment-link/route");
    const res = await POST(req({ ref: "EVX-1" }));
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("payment-link hides another business's booking from staff", async () => {
    state.roles = [{ tenant_id: "t2", role: "dispatcher" }];
    const { POST } = await import("./payment-link/route");
    const res = await POST(req({ ref: "EVX-1" }));
    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("payment-link lets staff of the booking's business through to Stripe", async () => {
    state.roles = [{ tenant_id: "t1", role: "operator_admin" }];
    const { POST } = await import("./payment-link/route");
    await POST(req({ ref: "EVX-1" }));
    expect(fetch).toHaveBeenCalledWith("https://api.stripe.com/v1/checkout/sessions", expect.anything());
  });
});

// Payment links: one payable checkout per booking, never a second payment.
describe("payment-link: no duplicate or split payments", () => {
  const stripeCalls = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    .filter(([u]) => String(u).startsWith("https://api.stripe.com"))
    .map(([u, o]) => `${(o as RequestInit)?.method ?? "GET"} ${String(u).replace("https://api.stripe.com/v1/checkout/sessions", "")}`);
  const stripeWith = (prev: Record<string, unknown> | null) =>
    vi.stubGlobal("fetch", vi.fn(async (url: string, opts?: RequestInit) => {
      const u = String(url);
      if (u.includes("/checkout/sessions/") && !u.endsWith("/expire") && (opts?.method ?? "GET") === "GET") {
        return new Response(JSON.stringify(prev ?? {}), { status: prev ? 200 : 404 });
      }
      if (u.endsWith("/expire")) return new Response(JSON.stringify({ ...prev, status: "expired" }), { status: 200 });
      if (u === "https://api.stripe.com/v1/checkout/sessions") return new Response(JSON.stringify({ id: "cs_new", url: "https://stripe.test/new" }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));

  beforeEach(() => {
    state.roles = [{ tenant_id: "t1", role: "operator_admin" }];
    state.booking = { id: "b1", ref: "EVX-1", tenant_id: "t1", customer_email: "c@example.com", quoted_price: 160, payment_status: "Unpaid" };
  });

  it("charges the booking's whole price in one checkout (£160, not £80)", async () => {
    stripeWith(null);
    const { POST } = await import("./payment-link/route");
    const res = await POST(req({ ref: "EVX-1" }));
    expect(res.status).toBe(200);
    const create = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([u]) => u === "https://api.stripe.com/v1/checkout/sessions");
    expect(String((create![1] as RequestInit).body)).toContain("unit_amount%5D=16000");
  });

  it("refuses a booking that is already paid", async () => {
    state.booking.payment_status = "Paid";
    stripeWith(null);
    const { POST } = await import("./payment-link/route");
    const res = await POST(req({ ref: "EVX-1" }));
    expect(res.status).toBe(409);
    expect(stripeCalls()).toEqual([]);
  });

  it("refuses the return leg of a return booking (paid with the outbound)", async () => {
    state.booking = { ...state.booking, quoted_price: 0, notes: "Return leg created automatically from return booking. Outbound ref: EVX-0" };
    stripeWith(null);
    const { POST } = await import("./payment-link/route");
    const res = await POST(req({ ref: "EVX-1" }));
    expect(res.status).toBe(422);
    expect(stripeCalls()).toEqual([]);
  });

  it("re-sending reuses the open checkout instead of making a second one", async () => {
    state.booking.stripe_session_id = "cs_old";
    stripeWith({ id: "cs_old", url: "https://stripe.test/old", status: "open", payment_status: "unpaid", amount_total: 16000, metadata: { booking_ref: "EVX-1" } });
    const { POST } = await import("./payment-link/route");
    const res = await POST(req({ ref: "EVX-1" }));
    expect((await res.json()).url).toBe("https://stripe.test/old");
    expect(stripeCalls()).toEqual(["GET /cs_old"]);
  });

  it("closes the customer's own open booking-page checkout before making the link", async () => {
    state.booking.stripe_session_id = "cs_site";
    stripeWith({ id: "cs_site", url: "https://stripe.test/site", status: "open", payment_status: "unpaid", amount_total: 8000, metadata: { bookingId: "b1" } });
    const { POST } = await import("./payment-link/route");
    const res = await POST(req({ ref: "EVX-1" }));
    expect((await res.json()).url).toBe("https://stripe.test/new");
    expect(stripeCalls()).toEqual(["GET /cs_site", "POST /cs_site/expire", "POST "]);
  });

  it("does not take a second payment when the earlier checkout was already paid", async () => {
    state.booking.stripe_session_id = "cs_paid";
    stripeWith({ id: "cs_paid", status: "complete", payment_status: "paid", amount_total: 16000, metadata: { booking_ref: "EVX-1" } });
    const { POST } = await import("./payment-link/route");
    const res = await POST(req({ ref: "EVX-1" }));
    expect(res.status).toBe(409);
    expect(stripeCalls()).toEqual(["GET /cs_paid"]);
  });
});
