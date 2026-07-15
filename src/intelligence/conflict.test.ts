import { describe, it, expect } from "bun:test";
import { detectConflicts } from "./conflict.ts";

describe("detectConflicts", () => {
  it("finds antonym pair conflicts among confirmed preferences", () => {
    const prefs = [
      { id: "p1", body: "User prefers dark mode.", tier: "confirmed" },
      { id: "p2", body: "User prefers light mode.", tier: "confirmed" },
    ];
    const conflicts = detectConflicts(prefs);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0].reason).toContain("dark/light");
  });

  it("ignores non-confirmed preferences", () => {
    const prefs = [
      { id: "p1", body: "User prefers dark mode.", tier: "confirmed" },
      { id: "p2", body: "User prefers light mode.", tier: "trial" },
    ];
    const conflicts = detectConflicts(prefs);
    expect(conflicts.length).toBe(0);
  });

  it("returns empty when no antonym pairs exist", () => {
    const prefs = [
      { id: "p1", body: "User prefers dark mode.", tier: "confirmed" },
      { id: "p2", body: "User likes coffee.", tier: "confirmed" },
    ];
    const conflicts = detectConflicts(prefs);
    expect(conflicts.length).toBe(0);
  });
});
