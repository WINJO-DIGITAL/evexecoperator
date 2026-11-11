import { describe, it, expect } from "vitest";
import { awaitingReply, needsDriver, unpaidCompleted, boardColumn } from "./bookingBuckets";

const b = (o) => ({ status: "Unassigned", source: "operator", operatorResponse: null, driverId: null, paymentStatus: "Unpaid", travelDate: "2026-10-14", ...o });

describe("booking buckets", () => {
  it("a new website request needs a reply, not a driver", () => {
    const x = b({ source: "website" });
    expect(awaitingReply(x)).toBe(true);
    expect(needsDriver(x)).toBe(false);
    expect(boardColumn(x, "2026-10-14")).toBe("reply");
  });
  it("an accepted request without a driver needs a driver", () => {
    const x = b({ source: "website", operatorResponse: "accepted" });
    expect(needsDriver(x)).toBe(true);
    expect(boardColumn(x, "2026-10-14")).toBe("driver");
  });
  it("assigned, on the road and done", () => {
    expect(boardColumn(b({ status: "Dispatched", driverId: "d1" }), "2026-10-14")).toBe("assigned");
    expect(boardColumn(b({ status: "En Route", driverId: "d1" }), "2026-10-14")).toBe("road");
    expect(boardColumn(b({ status: "Completed", driverId: "d1" }), "2026-10-14")).toBe("done");
    expect(boardColumn(b({ status: "Completed", driverId: "d1", travelDate: "2026-10-13" }), "2026-10-14")).toBeNull();
    expect(boardColumn(b({ status: "Cancelled" }), "2026-10-14")).toBeNull();
  });
  it("unpaid means completed, not paid, not cash", () => {
    expect(unpaidCompleted(b({ status: "Completed" }))).toBe(true);
    expect(unpaidCompleted(b({ status: "Completed", paymentStatus: "Paid" }))).toBe(false);
    expect(unpaidCompleted(b({ status: "Completed", paymentMethod: "Cash" }))).toBe(false);
    expect(unpaidCompleted(b({ status: "Dispatched" }))).toBe(false);
  });
  it("a return leg is paid with its outbound booking, so it is never chased as unpaid", () => {
    const leg = b({ status: "Completed", notes: "Return leg created automatically from return booking. Outbound ref: EVX-1" });
    expect(unpaidCompleted(leg)).toBe(false);
  });
  it("an operator-made booking never waits for a reply", () => {
    expect(awaitingReply(b({ source: "operator", operatorResponse: "accepted" }))).toBe(false);
    expect(awaitingReply(b({ source: "operator", operatorResponse: null }))).toBe(false);
  });
});

import { isPast, needsAction, LIST_VIEWS } from "./bookingBuckets";

describe("list views", () => {
  const today = "2026-10-14";
  it("upcoming = today onwards and not finished; past = done or earlier", () => {
    expect(LIST_VIEWS.upcoming(b({ travelDate: "2026-10-14", status: "Dispatched", driverId: "d" }), today)).toBe(true);
    expect(LIST_VIEWS.upcoming(b({ travelDate: "2026-10-14", status: "Completed" }), today)).toBe(false);
    expect(isPast(b({ travelDate: "2026-10-01", status: "Completed" }), today)).toBe(true);
    expect(isPast(b({ travelDate: "2026-10-13", status: "Dispatched" }), today)).toBe(true);
    // still on the road from yesterday's late job: not past
    expect(isPast(b({ travelDate: "2026-10-13", status: "En Route" }), today)).toBe(false);
  });
  it("needs action covers replies, missing drivers (not past) and unpaid completed jobs", () => {
    expect(needsAction(b({ source: "website" }), today)).toBe(true);
    expect(needsAction(b({ travelDate: "2026-10-15" }), today)).toBe(true);
    expect(needsAction(b({ travelDate: "2026-10-01" }), today)).toBe(false);
    expect(needsAction(b({ status: "Completed", travelDate: "2026-10-01" }), today)).toBe(true);
    expect(needsAction(b({ status: "Dispatched", driverId: "d", travelDate: "2026-10-15" }), today)).toBe(false);
  });
});
