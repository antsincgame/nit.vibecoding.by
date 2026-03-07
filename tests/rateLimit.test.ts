import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit } from "~/lib/utils/rateLimit";

function createRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://example.com", {
    headers: new Headers(headers),
  });
}

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("should allow first request", () => {
    const req = createRequest();
    const result = checkRateLimit(req, { maxRequests: 2, windowMs: 60_000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("should allow requests within limit", () => {
    const req = createRequest({ "x-forwarded-for": "1.2.3.4" });
    const opts = { maxRequests: 3, windowMs: 60_000 };

    expect(checkRateLimit(req, opts).allowed).toBe(true);
    vi.advanceTimersByTime(100);
    expect(checkRateLimit(req, opts).allowed).toBe(true);
    vi.advanceTimersByTime(100);
    expect(checkRateLimit(req, opts).allowed).toBe(true);
  });

  it("should deny when limit exceeded", () => {
    const req = createRequest({ "x-real-ip": "10.0.0.1" });
    const opts = { maxRequests: 2, windowMs: 60_000 };

    checkRateLimit(req, opts);
    checkRateLimit(req, opts);
    const result = checkRateLimit(req, opts);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeDefined();
  });

  it("should use x-forwarded-for when present", () => {
    const req1 = createRequest({ "x-forwarded-for": "1.2.3.4" });
    const req2 = createRequest({ "x-forwarded-for": "5.6.7.8" });
    const opts = { maxRequests: 1, windowMs: 60_000 };

    checkRateLimit(req1, opts);
    const result = checkRateLimit(req2, opts);

    expect(result.allowed).toBe(true);
  });

  it("should return retryAfterMs when denied", () => {
    const req = createRequest({ "cf-connecting-ip": "9.9.9.9" });
    const opts = { maxRequests: 1, windowMs: 5000 };

    checkRateLimit(req, opts);
    const result = checkRateLimit(req, opts);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThanOrEqual(0);
  });
});
