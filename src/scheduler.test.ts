import { describe, it, expect } from "bun:test";
import { CapricornScheduler } from "./scheduler.ts";
import { DEFAULT_CONFIG } from "./config.ts";

describe("CapricornScheduler", () => {
  it("runs a cron job only when minute pattern matches", () => {
    const config = { ...DEFAULT_CONFIG, intelligence: { ...DEFAULT_CONFIG.intelligence, forge: { ...DEFAULT_CONFIG.intelligence.forge, enabled: false }, dream: { ...DEFAULT_CONFIG.intelligence.dream, enabled: false } } };
    const scheduler = new CapricornScheduler(config);
    let runs = 0;
    scheduler.addJob("test", "* * * * *", () => { runs++; });
    const date = new Date("2026-07-14T12:00:00Z");
    scheduler.tick(date);
    scheduler.tick(date);
    expect(runs).toBe(1);
  });

  it("does not run job on non-matching minute", () => {
    const config = { ...DEFAULT_CONFIG, intelligence: { ...DEFAULT_CONFIG.intelligence, forge: { ...DEFAULT_CONFIG.intelligence.forge, enabled: false }, dream: { ...DEFAULT_CONFIG.intelligence.dream, enabled: false } } };
    const scheduler = new CapricornScheduler(config);
    let runs = 0;
    scheduler.addJob("test", "5 * * * *", () => { runs++; });
    const date = new Date("2026-07-14T12:00:00Z");
    scheduler.tick(date);
    expect(runs).toBe(0);
  });
});
