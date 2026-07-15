import { describe, it, expect } from "bun:test";
import { validate } from "./validate.ts";

describe("validation layer", () => {
  it("returns high score for coherent relevant output", async () => {
    const result = await validate({
      source: "User prefers dark mode for all interfaces.",
      output: "User prefers dark mode for all interfaces.",
      existingPreferences: [],
    });
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.flags).not.toContain("g3_contradiction_detected");
  });

  it("flags degenerate output", async () => {
    const result = await validate({
      source: "test",
      output: "I don't know",
      existingPreferences: [],
    });
    expect(result.hyper_tune.quality).toBe(0.1);
    expect(result.score).toBeLessThan(0.5);
  });

  it("detects contradiction with existing preferences", async () => {
    const embed = async (text: string) => {
      if (text.includes("light mode")) return [1, 0, 0, 0];
      return [0, 1, 0, 0];
    };
    const result = await validate({
      source: "User prefers light mode.",
      output: "User prefers light mode.",
      existingPreferences: ["User prefers light mode in all apps."],
    }, embed);
    expect(result.flags).toContain("g3_contradiction_detected");
  });

  it("uses embed function when provided", async () => {
    const embed = async (text: string) =>
      text.includes("dark") ? [1, 0, 0, 0] : [0, 1, 0, 0];
    const result = await validate({
      source: "User prefers dark mode.",
      output: "User prefers dark mode.",
      existingPreferences: ["User prefers light mode."],
    }, embed);
    expect(result.hyper_tune.coherence).toBeDefined();
    expect(result.hyper_tune.relevance).toBeDefined();
  });
});
