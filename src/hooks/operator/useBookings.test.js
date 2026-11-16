// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ValidationError } from "@/lib/operator/validation";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockChain, mockSupabase } = vi.hoisted(() => {
  const chain = {
    select: vi.fn(),
    order:  vi.fn(),
    range:  vi.fn(),
    or:     vi.fn(),
    lt:     vi.fn(),
    eq:     vi.fn(),
    single: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    like:   vi.fn(),
    is:     vi.fn(),
    not:    vi.fn(),
    delete: vi.fn(),
  };
  Object.values(chain).forEach((fn) => fn.mockReturnValue(chain));

  const client = {
    from:          vi.fn(() => chain),
    channel:       vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
    auth:          {
      getSession:         vi.fn(async () => ({ data: { session: { access_token: "t" } } })),
      getUser:            vi.fn(async () => ({ data: { user: { email: "office@example.com" } }, error: null })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
    },
  };

  return { mockChain: chain, mockSupabase: client };
});

vi.mock("@/lib/supabase", () => ({
  supabase:     mockSupabase,
  isConfigured: true,
}));

vi.mock("./useRealtimeBookings", () => ({
  useRealtimeBookings: vi.fn(),
  useRealtimeDrivers:  vi.fn(),
}));

import { useBookings, shapedBooking, ukDateDaysAgo, OPERATIONAL_DAYS_BACK, isReturnLegOf, keepReturnLegMarker } from "./useBookings";

// ─── Shared setup ─────────────────────────────────────────────────────────────

// Safe defaults: every terminal chain method resolves to a no-error empty response.
// Individual tests override with mockResolvedValueOnce where specific data is needed.
beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mockChain).forEach((fn) => fn.mockReturnValue(mockChain));
  mockChain.range.mockResolvedValue({ data: [], error: null });
  mockChain.single.mockResolvedValue({ data: null, error: null });
  mockChain.eq.mockResolvedValue({ data: [], error: null });
  mockChain.insert.mockResolvedValue({ error: null });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tomorrow() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function validForm(overrides = {}) {
  return {
    customer: "Test Customer", phone: "+44 7700 900000", email: "",
    pickup: "Manchester Airport (MAN)", dropoff: "Blackpool",
    date: tomorrow(), time: "10:00",
    flight: "EK017", notes: "", price: 160, driver: "",
    ...overrides,
  };
}

// Prime the range mock (the terminal call in the select chain) to return
// `rows` for the next N calls.
// Pass N=2 to survive React 18 strict-mode double-invoke of effects.
function primeRows(rows, times = 2) {
  for (let i = 0; i < times; i++) {
    mockChain.range.mockResolvedValueOnce({ data: rows, error: null });
  }
}

// ─── shapedBooking — pure function ───────────────────────────────────────────

describe("shapedBooking", () => {
  it("builds the pickup moment from the UK date and time when none is stored", () => {
    const s = shapedBooking({ id: 1, ref: "EVX-1", travel_date: "2026-10-15", travel_time: "09:00:00", pickup_time: null, status: "Unassigned" });
    expect(s.pickupTime).toBe("2026-10-15T08:00:00.000Z"); // 09:00 BST
  });
  it("maps a full DB row to the display shape", () => {
    const row = {
      ref: "EVX-1234", customer_name: "James Whitmore", flight_number: "EK017",
      airport: "Manchester Airport", dropoff_address: "Blackpool",
      travel_time: "10:45:00", drivers: { name: "Nitisat Siri" },
      quoted_price: 160, status: "Dispatched", priority: false,
      updated_at: "2025-07-01T10:00:00Z",
    };
    const s = shapedBooking(row);

    expect(s.id).toBe("EVX-1234");
    expect(s.customer).toBe("James Whitmore");
    expect(s.flight).toBe("EK017");
    expect(s.route).toBe("Manchester Airport → Blackpool");
    expect(s.driver).toBe("Nitisat Siri");
    expect(s.price).toBe("£160");
    expect(s.status).toBe("Dispatched");
    expect(s.priority).toBe(false);
    expect(s.updatedAt).toBe("2025-07-01T10:00:00Z");
  });

  it("uses fallback values for null optional fields", () => {
    const row = {
      ref: "EVX-0", customer_name: "X", flight_number: null, airport: null,
      dropoff_address: "Somewhere", travel_time: null, drivers: null,
      quoted_price: null, status: "Unassigned", priority: null, updated_at: null,
    };
    const s = shapedBooking(row);
    expect(s.flight).toBe("—");
    expect(s.time).toBe("—");
    expect(s.driver).toBe("Unassigned");
    expect(s.price).toBe("TBC");
    expect(s.priority).toBe(false);
    expect(s.updatedAt).toBeNull();
  });

  it("formats route as airport → destination", () => {
    const row = {
      ref: "X", customer_name: "A", airport: "LPL", dropoff_address: "Lytham",
      flight_number: null, travel_time: null, drivers: null, quoted_price: null,
      status: "Dispatched", priority: false, updated_at: null,
    };
    expect(shapedBooking(row).route).toBe("LPL → Lytham");
  });
});

// ─── createBooking ────────────────────────────────────────────────────────────

describe("useBookings — createBooking", () => {
  it("calls supabase.insert with correct shape for a valid form", async () => {
    const { result } = renderHook(() => useBookings());

    await act(async () => {
      await result.current.createBooking(validForm());
    });

    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_name: "Test Customer",
        pickup_location: "Manchester Airport (MAN)",
        dropoff_address: "Blackpool",
        airport: "Manchester Airport (MAN)",
        status: "Unassigned",
      })
    );
  });

  it("returns a ref matching EVX- format", async () => {
    const { result } = renderHook(() => useBookings());

    let ref;
    await act(async () => {
      ({ ref } = await result.current.createBooking(validForm()));
    });

    expect(ref).toMatch(/^EVX-[A-Z0-9]+$/);
  });

  it("does not create a return leg when returnJourney is off", async () => {
    const { result } = renderHook(() => useBookings());
    let out;
    await act(async () => {
      out = await result.current.createBooking(validForm());
    });
    expect(mockChain.insert).toHaveBeenCalledTimes(1);
    expect(out.returnRef).toBeNull();
  });

  it("creates a second flipped return leg when returnJourney is on", async () => {
    const { result } = renderHook(() => useBookings());
    let out;
    await act(async () => {
      out = await result.current.createBooking(
        validForm({ returnJourney: true, returnDate: tomorrow(), returnTime: "18:30", returnFlight: "EK018" })
      );
    });

    expect(mockChain.insert).toHaveBeenCalledTimes(2);
    // Outbound keeps its direction; the return flips it and is left unassigned.
    expect(mockChain.insert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      direction: "Airport → Destination", travel_time: "10:00", status: "Unassigned",
    }));
    expect(mockChain.insert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      direction: "Destination → Airport", travel_date: expect.any(String), travel_time: "18:30",
      flight_number: "EK018", status: "Unassigned",
    }));
    expect(out.ref).toMatch(/^EVX-/);
    expect(out.returnRef).toMatch(/^EVX-/);
    expect(out.returnRef).not.toBe(out.ref);
  });

  it("marks an operator-made booking as accepted, so it never waits for approval", async () => {
    const { result } = renderHook(() => useBookings());
    await act(async () => {
      await result.current.createBooking(validForm({ returnJourney: true, returnDate: tomorrow(), returnTime: "18:30" }));
    });
    for (const [row] of mockChain.insert.mock.calls) {
      expect(row).toMatchObject({ source: "operator", operator_response: "accepted" });
      expect(row.operator_responded_at).toEqual(expect.any(String));
    }
  });

  it("charges a return once: the whole fare on the outbound, £0 on the return leg", async () => {
    const { result } = renderHook(() => useBookings());
    let out;
    await act(async () => {
      out = await result.current.createBooking(
        validForm({ price: 160, returnJourney: true, returnDate: tomorrow(), returnTime: "18:30", returnFlight: "EK018" })
      );
    });
    const [[outbound], [returnLeg]] = mockChain.insert.mock.calls;
    // Outbound: £160 and the return details, as the website stores a return.
    expect(outbound).toMatchObject({
      quoted_price: 160, return_journey: true,
      return_pickup: "Blackpool", return_destination: "Manchester Airport (MAN)",
      return_airport: "Manchester Airport (MAN)", return_time: "18:30", return_flight: "EK018",
    });
    // Return leg: no price of its own, flagged with the website's return-leg note.
    expect(returnLeg).toMatchObject({ quoted_price: 0, return_journey: false });
    expect(returnLeg.notes).toMatch(/^Return leg created automatically/);
    expect(returnLeg.notes).toContain(`Outbound ref: ${out.ref}`);
    expect(returnLeg.notes).toContain("£160");
    // Never two £80 bookings.
    const total = mockChain.insert.mock.calls.reduce((sum, [row]) => sum + Number(row.quoted_price || 0), 0);
    expect(total).toBe(160);
  });

  it("a single journey has no return details", async () => {
    const { result } = renderHook(() => useBookings());
    await act(async () => {
      await result.current.createBooking(validForm({ price: 90 }));
    });
    expect(mockChain.insert).toHaveBeenCalledWith(expect.objectContaining({ quoted_price: 90, return_journey: false }));
    expect(mockChain.insert.mock.calls[0][0]).not.toHaveProperty("return_date");
  });

  it("throws ValidationError for missing customer name", async () => {
    const { result } = renderHook(() => useBookings());

    await expect(
      act(() => result.current.createBooking(validForm({ customer: "" })))
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for negative price", async () => {
    const { result } = renderHook(() => useBookings());

    await expect(
      act(() => result.current.createBooking(validForm({ price: -1 })))
    ).rejects.toThrow(ValidationError);
  });

  it("retries on unique-key collision and succeeds on second attempt", async () => {
    const collision = { code: "23505", message: "duplicate key value" };
    // Override: first call fails (collision), second succeeds
    mockChain.insert
      .mockResolvedValueOnce({ error: collision })
      .mockResolvedValueOnce({ error: null });

    const { result } = renderHook(() => useBookings());

    await act(async () => {
      await result.current.createBooking(validForm());
    });

    expect(mockChain.insert).toHaveBeenCalledTimes(2);
  });

  it("throws after 3 consecutive collision failures", async () => {
    const collision = { code: "23505", message: "duplicate key value" };
    mockChain.insert.mockResolvedValue({ error: collision }); // fail every call

    const { result } = renderHook(() => useBookings());

    // Catch inside act so act waits for the full async loop before settling.
    let thrownErr;
    await act(async () => {
      try { await result.current.createBooking(validForm()); }
      catch (e) { thrownErr = e; }
    });

    expect(thrownErr).toBeDefined();
    expect(thrownErr.message).toMatch(/unique booking reference/i);
    expect(mockChain.insert).toHaveBeenCalledTimes(3);
  });

  it("propagates non-collision errors immediately without retry", async () => {
    const permErr = { code: "42501", message: "permission denied" };
    mockChain.insert.mockResolvedValueOnce({ error: permErr });

    const { result } = renderHook(() => useBookings());

    await expect(
      act(() => result.current.createBooking(validForm()))
    ).rejects.toThrow(/permission denied/);

    expect(mockChain.insert).toHaveBeenCalledTimes(1);
  });
});

// ─── updateStatus ─────────────────────────────────────────────────────────────

describe("useBookings — updateStatus", () => {
  it("throws ValidationError for an unknown status value", async () => {
    const { result } = renderHook(() => useBookings());

    await expect(
      act(() => result.current.updateStatus("EVX-1234", "TakeOff"))
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for a forbidden state-machine transition (Completed → Dispatched)", async () => {
    const completedRow = {
      ref: "EVX-DONE", customer_name: "X", flight: null,
      airport: "A", destination: "B", pickup_time: null,
      drivers: null, price: null, status: "Completed",
      priority: false, updated_at: null,
    };
    // Prime twice to survive React 18 strict-mode double-invoke of effects
    primeRows([completedRow], 2);

    const { result } = renderHook(() => useBookings());

    // Wait for effect + bookingsRef update to settle
    await act(async () => {});

    await expect(
      act(() => result.current.updateStatus("EVX-DONE", "Dispatched"))
    ).rejects.toThrow(ValidationError);
  });

  it("calls supabase.update on a valid transition", async () => {
    const dispatchedRow = {
      ref: "EVX-LIVE", customer_name: "X", flight: null,
      airport: "A", destination: "B", pickup_time: null,
      drivers: null, price: null, status: "Dispatched",
      priority: false, updated_at: null,
    };
    primeRows([dispatchedRow], 2);

    const { result } = renderHook(() => useBookings());
    await act(async () => {});
    mockChain.eq.mockReturnValueOnce(mockChain);
    mockChain.select.mockResolvedValueOnce({ data: [{ ref: "EVX-LIVE" }], error: null });

    await act(async () => {
      await result.current.updateStatus("EVX-LIVE", "En Route");
    });

    expect(mockChain.update).toHaveBeenCalledWith({ status: "En Route" });
  });

  it("throws when Supabase returns an error during update", async () => {
    const dispatchedRow = {
      ref: "EVX-ERR", customer_name: "X", flight: null,
      airport: "A", destination: "B", pickup_time: null,
      drivers: null, price: null, status: "Dispatched",
      priority: false, updated_at: null,
    };
    primeRows([dispatchedRow], 2);

    const { result } = renderHook(() => useBookings());
    await act(async () => {});
    mockChain.eq.mockReturnValueOnce(mockChain);
    mockChain.select.mockResolvedValueOnce({ data: [], error: { message: "DB write error" } });

    await expect(
      act(() => result.current.updateStatus("EVX-ERR", "En Route"))
    ).rejects.toThrow(/DB write error/);
  });
});

describe("useBookings — loading window", () => {
  it("ukDateDaysAgo counts back in UK calendar days", () => {
    // 00:30 UK on 01/11/2026 (GMT) is still 31/10 in UTC terms one hour earlier.
    expect(ukDateDaysAgo(0, new Date("2026-11-01T00:30:00Z"))).toBe("2026-11-01");
    expect(ukDateDaysAgo(14, new Date("2026-11-01T00:30:00Z"))).toBe("2026-10-18");
    // 23:30 UTC on 14/10 (BST) is already 15/10 in the UK.
    expect(ukDateDaysAgo(0, new Date("2026-10-14T23:30:00Z"))).toBe("2026-10-15");
  });

  it("operational screens load from the window start (plus undated), not the oldest bookings", async () => {
    renderHook(() => useBookings());
    await act(async () => {});
    expect(mockChain.or).toHaveBeenCalledWith(
      `travel_date.gte.${ukDateDaysAgo(OPERATIONAL_DAYS_BACK)},travel_date.is.null`,
    );
  });

  it("scope 'all' loads every booking", async () => {
    renderHook(() => useBookings({ scope: "all" }));
    await act(async () => {});
    expect(mockChain.or).not.toHaveBeenCalled();
  });
});

describe("useBookings — loading the list", () => {
  // Earlier tests leave queued one-off responses behind; start clean.
  beforeEach(() => {
    mockChain.range.mockReset();
    mockChain.range.mockResolvedValue({ data: [], error: null });
  });

  const rowOf = (ref) => ({ id: ref, ref, customer_name: "C " + ref, travel_date: "2099-01-01", travel_time: "10:00:00", status: "Unassigned", drivers: null });

  it("shows the bookings and finishes loading", async () => {
    primeRows([rowOf("EVX-A"), rowOf("EVX-B")], 1);
    const { result } = renderHook(() => useBookings());
    await act(async () => {});
    expect(result.current.bookings.map((b) => b.id)).toEqual(["EVX-A", "EVX-B"]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("reports the database error and finishes loading", async () => {
    mockChain.range.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useBookings());
    await act(async () => {});
    expect(result.current.error).toBe("boom");
    expect(result.current.loading).toBe(false);
    expect(result.current.bookings).toEqual([]);
  });

  it("starts in the loading state before the first response arrives", () => {
    mockChain.range.mockReturnValue(new Promise(() => {})); // never answers
    const { result } = renderHook(() => useBookings());
    expect(result.current.loading).toBe(true);
  });

  it("refetch replaces the list", async () => {
    primeRows([rowOf("EVX-A")], 1);
    const { result } = renderHook(() => useBookings());
    await act(async () => {});
    primeRows([rowOf("EVX-C")], 1);
    await act(async () => { await result.current.refetch(); });
    expect(result.current.bookings.map((b) => b.id)).toEqual(["EVX-C"]);
  });

  it("ignores a slow, older response that arrives after a newer one", async () => {
    let releaseSlow;
    const slow = new Promise((resolve) => { releaseSlow = resolve; });
    mockChain.range.mockReset();
    mockChain.range.mockReturnValueOnce(slow);                                   // first load: slow
    mockChain.range.mockResolvedValue({ data: [rowOf("EVX-NEW")], error: null }); // everything after: fast
    const { result } = renderHook(() => useBookings());
    await act(async () => { await result.current.refetch(); });                  // newer fetch finishes first
    expect(result.current.bookings.map((b) => b.id)).toEqual(["EVX-NEW"]);
    await act(async () => { releaseSlow({ data: [rowOf("EVX-OLD")], error: null }); await slow; });
    expect(result.current.bookings.map((b) => b.id)).toEqual(["EVX-NEW"]);
    expect(result.current.loading).toBe(false);
  });
});

// ─── respondToBooking (website requests) ─────────────────────────────────────

describe("useBookings — respondToBooking", () => {
  const row = (o) => ({ id: o.ref + "-id", ref: o.ref, status: "Unassigned", source: "website", operator_response: null, customer_name: "Web Customer", customer_email: "", customer_phone: "", travel_date: tomorrow(), travel_time: "09:00", quoted_price: 160, ...o });
  const outbound = row({ ref: "EVX-OUT1", return_journey: true });
  const leg = row({ ref: "EVX-RET1", quoted_price: 0, notes: "Return leg created automatically from return booking. Original return fare: £160. Outbound ref: EVX-OUT1" });
  const other = row({ ref: "EVX-OTHER", notes: "Return leg created automatically from return booking. Outbound ref: EVX-ELSE" });

  async function loaded() {
    // Earlier tests can leave queued one-off responses behind; start clean.
    mockChain.range.mockReset();
    mockChain.range.mockResolvedValue({ data: [], error: null });
    primeRows([outbound, leg, other]);
    const hook = renderHook(() => useBookings());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, channel: "email" }))));
    return hook;
  }

  it("matches only the outbound's own return leg", () => {
    expect(isReturnLegOf(shapedBooking(leg), "EVX-OUT1")).toBe(true);
    expect(isReturnLegOf(shapedBooking(other), "EVX-OUT1")).toBe(false);
    expect(isReturnLegOf(shapedBooking(outbound), "EVX-OUT1")).toBe(false);
  });

  it("accepting a return booking accepts its return leg too, with one customer notice", async () => {
    const { result } = await loaded();
    mockChain.eq.mockReturnValueOnce(mockChain);
    mockChain.select.mockResolvedValueOnce({ data: [{ ref: "EVX-OUT1" }], error: null });
    await act(async () => { await result.current.respondToBooking("EVX-OUT1", "accepted"); });
    expect(mockChain.update).toHaveBeenCalledTimes(2);
    expect(mockChain.update).toHaveBeenNthCalledWith(2, expect.objectContaining({ operator_response: "accepted" }));
    expect(mockChain.update.mock.calls[1][0]).not.toHaveProperty("status");
    expect(mockChain.like).toHaveBeenCalledWith("notes", "Return leg created automatically%Outbound ref: EVX-OUT1%");
    expect(mockChain.is).toHaveBeenCalledWith("operator_response", null);
    const byRef = Object.fromEntries(result.current.bookings.map((b) => [b.id, b]));
    expect(byRef["EVX-RET1"].operatorResponse).toBe("accepted");
    expect(byRef["EVX-OTHER"].operatorResponse).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1); // one confirmation, for the outbound only
  });

  it("declining a return booking cancels its return leg too", async () => {
    const { result } = await loaded();
    mockChain.eq.mockReturnValueOnce(mockChain);
    mockChain.select.mockResolvedValueOnce({ data: [{ ref: "EVX-OUT1" }], error: null });
    await act(async () => { await result.current.respondToBooking("EVX-OUT1", "rejected"); });
    expect(mockChain.update).toHaveBeenNthCalledWith(2, expect.objectContaining({ operator_response: "rejected", status: "Cancelled" }));
    expect(mockChain.not).toHaveBeenCalledWith("status", "in", "(Cancelled,Completed)");
    const byRef = Object.fromEntries(result.current.bookings.map((b) => [b.id, b]));
    expect(byRef["EVX-RET1"]).toMatchObject({ operatorResponse: "rejected", status: "Cancelled" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("useBookings — deleteBooking", () => {
  const row = { id: 1, ref: "EVX-DEL1", customer_name: "A", travel_date: tomorrow(), travel_time: "10:00", status: "Unassigned" };

  async function loaded() {
    mockChain.range.mockReset();
    mockChain.range.mockResolvedValue({ data: [], error: null });
    primeRows([row]);
    const hook = renderHook(() => useBookings());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return hook;
  }

  it("re-checks the password, deletes the row and drops it from the list", async () => {
    const { result } = await loaded();
    mockChain.eq.mockReturnValueOnce(mockChain);
    mockChain.select.mockResolvedValueOnce({ data: [{ ref: "EVX-DEL1" }], error: null });
    await act(async () => { await result.current.deleteBooking("EVX-DEL1", "secret"); });
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: "office@example.com", password: "secret" });
    expect(mockChain.delete).toHaveBeenCalled();
    expect(result.current.bookings.find((b) => b.id === "EVX-DEL1")).toBeUndefined();
  });

  it("puts the job back and reports it when the database removed nothing", async () => {
    const { result } = await loaded();
    mockChain.eq.mockReturnValueOnce(mockChain);
    mockChain.select.mockResolvedValueOnce({ data: [], error: null });
    let caught;
    await act(async () => { await result.current.deleteBooking("EVX-DEL1", "secret").catch((e) => { caught = e; }); });
    expect(caught?.message).toMatch(/could not be deleted/);
    expect(result.current.bookings.find((b) => b.id === "EVX-DEL1")).toBeDefined();
  });

  it("refuses a wrong password without touching the booking", async () => {
    const { result } = await loaded();
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });
    let caught;
    await act(async () => { await result.current.deleteBooking("EVX-DEL1", "wrong").catch((e) => { caught = e; }); });
    expect(caught?.message).toBe("Password verification failed.");
    expect(mockChain.delete).not.toHaveBeenCalled();
    expect(result.current.bookings.find((b) => b.id === "EVX-DEL1")).toBeDefined();
  });
});

describe("keepReturnLegMarker", () => {
  const marker = "Return leg created automatically from return booking. Original return fare: £160. Outbound ref: EVX-OUT1";

  it("keeps a return leg's marker when the operator replaces the notes", () => {
    expect(keepReturnLegMarker(marker, "Meet at arrivals, 3 bags")).toBe(`${marker}\nMeet at arrivals, 3 bags`);
  });
  it("keeps the marker when the notes are cleared", () => {
    expect(keepReturnLegMarker(marker, "")).toBe(marker);
  });
  it("leaves notes that already start with the marker alone", () => {
    expect(keepReturnLegMarker(marker, `${marker}\nGate 4`)).toBe(`${marker}\nGate 4`);
  });
  it("doesn't touch ordinary bookings", () => {
    expect(keepReturnLegMarker("Child seat", "  No child seat  ")).toBe("No child seat");
  });
});

describe("shapedBooking — price", () => {
  it("keeps pence so edits and invoices don't round the fare", () => {
    expect(shapedBooking({ id: 1, ref: "A", quoted_price: 87.5 }).price).toBe("£87.50");
    expect(shapedBooking({ id: 2, ref: "B", quoted_price: 90 }).price).toBe("£90");
  });
});
