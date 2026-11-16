import { describe, it, expect } from "vitest";
import { computeTotals, shapedInvoice } from "@/hooks/operator/useInvoices";

describe("computeTotals", () => {
  it("sums quantity × unit_price across line items", () => {
    const items = [
      { description: "Transfer", quantity: 2, unit_price: 50 },
      { description: "Waiting", quantity: 1, unit_price: 25.5 },
    ];
    const { subtotal, vatAmount, total } = computeTotals(items, 0);
    expect(subtotal).toBe(125.5);
    expect(vatAmount).toBe(0);
    expect(total).toBe(125.5);
  });

  it("applies a 20% VAT rate and rounds to 2dp", () => {
    const items = [{ description: "Transfer", quantity: 1, unit_price: 100 }];
    const { subtotal, vatAmount, total } = computeTotals(items, 0.2);
    expect(subtotal).toBe(100);
    expect(vatAmount).toBe(20);
    expect(total).toBe(120);
  });

  it("rounds VAT on awkward amounts", () => {
    const items = [{ description: "Fare", quantity: 1, unit_price: 33.33 }];
    const { vatAmount, total } = computeTotals(items, 0.2);
    expect(vatAmount).toBe(6.67); // 6.666 → 6.67
    expect(total).toBe(40);
  });

  it("treats missing/blank fields as zero", () => {
    const { subtotal, total } = computeTotals(
      [{ description: "x", quantity: "", unit_price: "" }],
      0
    );
    expect(subtotal).toBe(0);
    expect(total).toBe(0);
  });

  it("handles an empty or nullish item list", () => {
    expect(computeTotals([], 0.2)).toEqual({ subtotal: 0, vatAmount: 0, total: 0 });
    expect(computeTotals(null, 0)).toEqual({ subtotal: 0, vatAmount: 0, total: 0 });
  });
});

describe("shapedInvoice", () => {
  it("maps DB columns to the client shape with safe defaults", () => {
    const inv = shapedInvoice({
      id: "abc",
      invoice_number: "INV-0007",
      booking_ref: "EVX123",
      customer_name: "Jane",
      customer_email: null,
      line_items: [{ description: "Transfer", quantity: 1, unit_price: 80 }],
      subtotal: 80,
      vat_rate: 0.2,
      vat_amount: 16,
      total: 96,
      status: "Sent",
    });
    expect(inv.number).toBe("INV-0007");
    expect(inv.bookingRef).toBe("EVX123");
    expect(inv.customer).toBe("Jane");
    expect(inv.email).toBeNull();
    expect(inv.lineItems).toHaveLength(1);
    expect(inv.total).toBe(96);
    expect(inv.status).toBe("Sent");
  });

  it("defaults line_items to an array and status to Draft", () => {
    const inv = shapedInvoice({ id: "x", invoice_number: "INV-0001", customer_name: "A" });
    expect(inv.lineItems).toEqual([]);
    expect(inv.status).toBe("Draft");
    expect(inv.total).toBe(0);
  });
});
