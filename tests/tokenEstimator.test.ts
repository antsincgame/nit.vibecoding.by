import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  estimateMessagesTokens,
  computeTokenBudget,
} from "~/lib/utils/tokenEstimator";

describe("tokenEstimator", () => {
  describe("estimateTokens", () => {
    it("should estimate tokens from text length", () => {
      const text = "hello"; // 5 chars
      expect(estimateTokens(text)).toBeGreaterThanOrEqual(1);
    });

    it("should return 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });

    it("should ceil the result", () => {
      const text = "a".repeat(4); // 4 chars, 4/3.5 ~ 1.14
      expect(estimateTokens(text)).toBe(2);
    });
  });

  describe("estimateMessagesTokens", () => {
    it("should include system prompt", () => {
      const messages: Array<{ role: string; content: string }> = [];
      const system = "You are helpful.";
      const total = estimateMessagesTokens(messages, system);
      expect(total).toBeGreaterThanOrEqual(estimateTokens(system));
    });

    it("should add overhead per message", () => {
      const messages = [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ];
      const total = estimateMessagesTokens(messages, "");
      const baseTokens = estimateTokens("Hi") + estimateTokens("Hello");
      expect(total).toBeGreaterThan(baseTokens);
    });

    it("should handle empty messages", () => {
      const total = estimateMessagesTokens([], "System");
      expect(total).toBe(estimateTokens("System"));
    });
  });

  describe("computeTokenBudget", () => {
    it("should compute available output", () => {
      const budget = computeTokenBudget(1000, 8000, 4000);
      expect(budget.inputEstimate).toBe(1000);
      expect(budget.contextWindow).toBe(8000);
      expect(budget.availableOutput).toBeGreaterThan(0);
      expect(budget.effectiveMaxTokens).toBeLessThanOrEqual(4000);
    });

    it("should set overflow when input too large", () => {
      const budget = computeTokenBudget(7000, 8000, 4000);
      expect(budget.overflow).toBe(true);
    });

    it("should cap effectiveMaxTokens by requested", () => {
      const budget = computeTokenBudget(100, 8000, 500);
      expect(budget.effectiveMaxTokens).toBeLessThanOrEqual(500);
    });

    it("should return non-negative availableOutput", () => {
      const budget = computeTokenBudget(9000, 8000, 1000);
      expect(budget.availableOutput).toBeGreaterThanOrEqual(0);
    });
  });
});
