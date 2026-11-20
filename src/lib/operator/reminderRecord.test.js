import { describe, it, expect } from "vitest";
import { reminderKind } from "./reminderRecord";

describe("reminderKind", () => {
  it("matches the automatic reminder for the travel date", () => {
    expect(reminderKind("2026-11-27", "2026-11-20")).toBe("7day");
    expect(reminderKind("2026-11-25", "2026-11-20")).toBe("7day");
    expect(reminderKind("2026-11-21", "2026-11-20")).toBe("24hr");
    expect(reminderKind("2026-11-20", "2026-11-20")).toBe("24hr");
    expect(reminderKind("2026-11-22", "2026-11-20")).toBeNull();
    expect(reminderKind("2026-11-19", "2026-11-20")).toBeNull();
  });
});
