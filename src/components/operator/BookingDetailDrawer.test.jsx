// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import BookingDetailDrawer from "./BookingDetailDrawer";

afterEach(cleanup);

const booking = {
  id: "EVX-DEL1", customer: "Test Customer", phone: "", email: "", route: "Blackpool → Manchester Airport",
  pickup: "Blackpool", dropoff: "Manchester Airport", date: "2026-10-20", time: "10:00",
  status: "Unassigned", paymentStatus: "Unpaid", price: 90, notes: "",
};

function open(props = {}) {
  const onClose = vi.fn();
  const onDelete = vi.fn(async () => {});
  render(<BookingDetailDrawer booking={booking} drivers={[]} onClose={onClose} onDelete={onDelete} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /Delete Job/ }));
  return { onClose, onDelete, password: screen.getByPlaceholderText("Enter password") };
}

describe("BookingDetailDrawer — delete dialog", () => {
  it("tapping inside the delete dialog does not close the drawer", () => {
    const { onClose, password } = open();
    fireEvent.pointerDown(password);
    fireEvent.change(password, { target: { value: "secret" } });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Enter password").value).toBe("secret");
  });

  it("deletes with the typed password", () => {
    const { onDelete, password } = open();
    fireEvent.change(password, { target: { value: "secret" } });
    const buttons = screen.getAllByRole("button", { name: "Delete Job" });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onDelete).toHaveBeenCalledWith("EVX-DEL1", "secret");
  });

  it("Escape closes only the dialog", () => {
    const { onClose } = open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("Enter password")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a tap outside still closes the drawer when no dialog is open", () => {
    const onClose = vi.fn();
    render(<BookingDetailDrawer booking={booking} drivers={[]} onClose={onClose} />);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
