// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockChain, mockSupabase } = vi.hoisted(() => {
  const chain = { insert: vi.fn() };
  const client = {
    from: vi.fn(() => chain),
    auth: { getSession: vi.fn() },
  };
  return { mockChain: chain, mockSupabase: client };
});

vi.mock("./supabase", () => ({
  supabase: mockSupabase,
  isConfigured: true,
}));

import { logError } from "./errorLog";

beforeEach(() => {
  vi.clearAllMocks();
  mockChain.insert.mockResolvedValue({ error: null });
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: "user-1", email: "ops@evexec.co.uk" } } },
  });
});

describe("logError", () => {
  it("inserts an error_log row with the error details and current operator's identity", async () => {
    await logError({
      message: "Cannot read properties of undefined",
      stack: "TypeError: Cannot read properties of undefined\n    at Foo",
      componentStack: "in Foo\n    in App",
      context: { page: "dispatch" },
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("error_log");
    expect(mockChain.insert).toHaveBeenCalledWith({
      message: "Cannot read properties of undefined",
      stack: "TypeError: Cannot read properties of undefined\n    at Foo",
      component_stack: "in Foo\n    in App",
      url: expect.any(String),
      user_email: "ops@evexec.co.uk",
      context: { page: "dispatch" },
    });
  });

  it("defaults optional fields to null", async () => {
    await logError({ message: "Boom" });

    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Boom",
        stack: null,
        component_stack: null,
        context: null,
      })
    );
  });

  it("records a null user_email when there is no session", async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });

    await logError({ message: "Boom" });

    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_email: null })
    );
  });

  it("does not throw when the insert fails", async () => {
    mockChain.insert.mockResolvedValue({ error: { message: "DB write error" } });

    await expect(logError({ message: "Boom" })).resolves.toBeUndefined();
  });

  it("does not throw when Supabase auth is unavailable", async () => {
    mockSupabase.auth.getSession.mockRejectedValue(new Error("network error"));

    await expect(logError({ message: "Boom" })).resolves.toBeUndefined();
  });
});

describe("logError — not configured", () => {
  it("is a no-op when Supabase is not configured", async () => {
    vi.resetModules();
    vi.doMock("./supabase", () => ({ supabase: mockSupabase, isConfigured: false }));

    const { logError: logErrorDemo } = await import("./errorLog");
    await logErrorDemo({ message: "Boom" });

    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});
