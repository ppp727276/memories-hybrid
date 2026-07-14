import { CapricornStorage } from "./storage/index.ts";
import type { CapricornConfig } from "./types.ts";
import { createLLMRunner } from "./intelligence/llm.ts";
import { ForgePipeline } from "./intelligence/forge.ts";
import { DreamPipeline } from "./intelligence/dream.ts";
import { VaultSync } from "./intelligence/sync.ts";

function matchesCronPart(value: number, part: string, max: number): boolean {
  if (part === "*") return true;
  if (part.includes("/")) {
    const [range, step] = part.split("/");
    const start = range === "*" ? 0 : parseInt(range, 10);
    return (value - start) % parseInt(step, 10) === 0 && value >= start;
  }
  if (part.includes(",")) {
    return part.split(",").some((p) => parseInt(p, 10) === value);
  }
  const parsed = parseInt(part, 10);
  return parsed === value;
}

function cronMatch(date: Date, pattern: string): boolean {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = pattern.split(/\s+/);
  return (
    matchesCronPart(date.getMinutes(), minute, 59) &&
    matchesCronPart(date.getHours(), hour, 23) &&
    matchesCronPart(date.getDate(), dayOfMonth, 31) &&
    matchesCronPart(date.getMonth() + 1, month, 12) &&
    matchesCronPart(date.getDay(), dayOfWeek, 6)
  );
}

interface Schedule {
  name: string;
  pattern: string;
  lastRun: string;
}

export class CapricornScheduler {
  private storage: CapricornStorage;
  private schedules: Schedule[] = [];
  private interval: Timer | null = null;

  constructor(private config: CapricornConfig) {
    this.storage = new CapricornStorage(config.storage.db_path, config.vault.path, config);
    if (config.intelligence.forge.enabled) {
      this.schedules.push({ name: "bridge", pattern: config.intelligence.forge.schedule, lastRun: "" });
    }
    if (config.intelligence.dream.enabled) {
      this.schedules.push({ name: "dream", pattern: config.intelligence.dream.schedule, lastRun: "" });
    }
    if (config.vault.auto_sync) {
      this.schedules.push({ name: "sync", pattern: "*/5 * * * *", lastRun: "" });
    }
  }

  start() {
    if (this.interval) return;
    this.tick();
    this.interval = setInterval(() => this.tick(), 60_000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.storage.close();
  }

  private async tick() {
    const now = new Date();
    for (const schedule of this.schedules) {
      if (cronMatch(now, schedule.pattern)) {
        const key = `${schedule.pattern}_${now.getFullYear()}-${now.getMonth()}-${now.getDate()}_${now.getHours()}-${now.getMinutes()}`;
        if (schedule.lastRun === key) continue;
        schedule.lastRun = key;
        await this.runJob(schedule.name);
      }
    }
  }

  private async runJob(name: string) {
    try {
      switch (name) {
        case "bridge": {
          const llm = createLLMRunner(this.config);
          const forge = new ForgePipeline(this.storage, llm);
          await forge.run();
          break;
        }
        case "dream": {
          const dream = new DreamPipeline(this.storage);
          await dream.run();
          break;
        }
        case "sync": {
          const sync = new VaultSync(this.storage);
          sync.sync();
          break;
        }
      }
    } catch {
      // ignore
    }
  }
}
