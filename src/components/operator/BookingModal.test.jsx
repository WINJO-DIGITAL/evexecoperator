// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/hooks/operator/useDrivers", () => ({ useDrivers: () => ({ drivers: [] }) }));
// One stable object, as the real provider gives: a new object on every render
// would re-run the price effect forever.
const { profile } = vi.hoisted(() => ({
  profile: {
    pricing: {
      airports: [
        { name: "Manchester Airport", code: "MAN", oneWay: 90, ret: 160 },
        { name: "Liverpool Airport", code: "LPL", oneWay: 95, ret: 170 },
      ],
      extraStop: 5,
    },
  },
}));
vi.mock("./OperatorContext", () => ({ useOperator: () => ({ profile }) }));

import BookingModal from "./BookingModal";

afterEach(cleanup);

const PICKUP = "Manchester Airport (MAN), or a full address";
const DROPOFF = "18 Lowther Rd, Fleetwood — or an airport";

function setup(props = {}) {
  const view = render(<BookingModal open onClose={() => {}} onSubmit={async () => {}} {...props} />);
  return {
    view,
    pickup: () => screen.getByPlaceholderText(PICKUP),
    dropoff: () => screen.getByPlaceholderText(DROPOFF),
    price: () => screen.getByPlaceholderText("0"),
  };
}

// The fixed price follows the route until the operator types a price of their own.
describe("BookingModal — suggested price", () => {
  it("suggests the one-way price when a listed place is typed", () => {
    const m = setup();
    fireEvent.change(m.pickup(), { target: { value: "Manchester Airport" } });
    expect(m.price().value).toBe("90");
  });

  it("uses the drop-off when only that end is a listed place", () => {
    const m = setup();
    fireEvent.change(m.dropoff(), { target: { value: "Liverpool Airport" } });
    expect(m.price().value).toBe("95");
  });

  it("follows the route when it changes", () => {
    const m = setup();
    fireEvent.change(m.pickup(), { target: { value: "Manchester Airport" } });
    fireEvent.change(m.pickup(), { target: { value: "Liverpool Airport" } });
    expect(m.price().value).toBe("95");
  });

  it("drops the suggestion when the route no longer names a listed place", () => {
    const m = setup();
    fireEvent.change(m.pickup(), { target: { value: "Manchester Airport" } });
    fireEvent.change(m.pickup(), { target: { value: "Blackpool" } });
    expect(m.price().value).toBe("");
  });

  it("switches to the whole return fare when the return journey is ticked", () => {
    const m = setup();
    fireEvent.change(m.pickup(), { target: { value: "Manchester Airport" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(m.price().value).toBe("160");
  });

  it("never overrides a price the operator typed", () => {
    const m = setup();
    fireEvent.change(m.pickup(), { target: { value: "Manchester Airport" } });
    fireEvent.change(m.price(), { target: { value: "75" } });
    fireEvent.change(m.pickup(), { target: { value: "Liverpool Airport" } });
    expect(m.price().value).toBe("75");
  });

  it("keeps a typed price when the route is cleared", () => {
    const m = setup();
    fireEvent.change(m.price(), { target: { value: "120" } });
    fireEvent.change(m.pickup(), { target: { value: "Blackpool" } });
    expect(m.price().value).toBe("120");
  });

  it("keeps a price that arrives pre-filled", () => {
    const m = setup({ initialValues: { pickup: "Manchester Airport", price: "55" } });
    expect(m.pickup().value).toBe("Manchester Airport");
    expect(m.price().value).toBe("55");
  });

  it("pre-fills from initial values and suggests a price when none is given", () => {
    const m = setup({ initialValues: { pickup: "Manchester Airport", customer: "Ann" } });
    expect(m.pickup().value).toBe("Manchester Airport");
    expect(m.price().value).toBe("90");
  });
});

describe("BookingModal — opening and closing", () => {
  it("starts empty again after being closed and reopened", () => {
    const m = setup();
    fireEvent.change(m.pickup(), { target: { value: "Manchester Airport" } });
    m.view.rerender(<BookingModal open={false} onClose={() => {}} onSubmit={async () => {}} />);
    m.view.rerender(<BookingModal open onClose={() => {}} onSubmit={async () => {}} />);
    expect(m.pickup().value).toBe("");
    expect(m.price().value).toBe("");
  });

  it("a reopened form suggests prices again", () => {
    const m = setup();
    fireEvent.change(m.pickup(), { target: { value: "Manchester Airport" } });
    m.view.rerender(<BookingModal open={false} onClose={() => {}} onSubmit={async () => {}} />);
    m.view.rerender(<BookingModal open onClose={() => {}} onSubmit={async () => {}} />);
    fireEvent.change(m.dropoff(), { target: { value: "Liverpool Airport" } });
    expect(m.price().value).toBe("95");
  });
});
