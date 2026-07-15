import { CapricornStorage } from "./storage/index.ts";
import type { CapricornConfig } from "./types.ts";
import { createLLMRunner } from "./intelligence/llm.ts";
import { ForgePipeline } from "./intelligence/forge.ts";
import { DreamPipeline } from "./intelligence/dream.ts";
import { VaultSync } from "./storage/sync.ts";

export function matchesCronPart(value: number, part: string, max: number): boolean {
  if (part === "*") {
    if (value < 0 || value > max) return false;
    return true;
  }
  if (part.includes("/")) {
    const [range, step] = part.split("/");
    const start = range === "*" ? 0 : parseInt(range, 10);
    return (value - start) % parseInt(step, 10) === 0 && value >= start;
  }
  if (part.includes(",")) {
    return part.split(",").some((p) => parseInt(p, 10) === value);
  }
  const parsed = parseInt(part, 10);
  if (parsed < 0 || parsed > max) return false;
  return parsed === value;
}

function cronMatch(date: Date, pattern: string): boolean {
  const parts = pattern.split(/\s+/);
  if (parts.length < 5) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
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
  job?: () => Promise<void> | void;
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

  addJob(name: string, pattern: string, job: () => Promise<void> | void) {
    this.schedules.push({ name, pattern, lastRun: "", job });
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

  tick(date = new Date()) {
    for (const schedule of this.schedules) {
      if (cronMatch(date, schedule.pattern)) {
        const key = `${schedule.pattern}_${date.getFullYear()}-${date.getMonth()}-${date.getDate()}_${date.getHours()}-${date.getMinutes()}`;
        if (schedule.lastRun === key) continue;
        schedule.lastRun = key;
        this.runJob(schedule);
      }
    }
  }

  private runJob(schedule: Schedule) {
    if (schedule.job) {
      return schedule.job();
    }
    return this.runBuiltIn(schedule.name);
  }

  private async runBuiltIn(name: string) {
    let lastStatus = "ok";
    let lastError: string | undefined;
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
    } catch (err) {
      lastStatus = "failed";
      lastError = String(err);
      console.error("capricorn: cron job failed:", String(err));
    }
    this.storage.memory.saveJobState(name, new Date().toISOString(), lastStatus, lastError);
  }
}
