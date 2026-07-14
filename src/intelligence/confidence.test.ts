import { describe, it, expect } from "bun:test";
import { computeConfidenceDelta, clampConfidence, sourceWeight, decayFactor } from "./confidence.ts";

describe("confidence scoring", () => {
  it("awards positive delta for applied + user_explicit", () => {
    const delta = computeConfidenceDelta("applied", "user_explicit", 0);
    expect(delta.delta).toBeGreaterThan(0);
    expect(delta.base).toBe(0.15);
    expect(delta.sourceWeight).toBe(1.0);
  });

  it("penalizes violated more than outdated", () => {
    const violated = computeConfidenceDelta("violated", "user_explicit", 0);
    const outdated = computeConfidenceDelta("outdated", "user_explicit", 0);
    expect(violated.delta).toBeLessThan(outdated.delta);
  });

  it("decays over time", () => {
    expect(decayFactor(0)).toBe(1);
    expect(decayFactor(14)).toBeCloseTo(0.5, 1);
  });

  it("clamps confidence to [0, 1]", () => {
    expect(clampConfidence(-0.5)).toBe(0);
    expect(clampConfidence(1.5)).toBe(1);
    expect(clampConfidence(0.5)).toBe(0.5);
  });

  it("assigns lower weight to implicit/derived sources", () => {
    expect(sourceWeight("user_explicit")).toBe(1.0);
    expect(sourceWeight("system_derived")).toBeLessThan(sourceWeight("user_implicit"));
  });
});
