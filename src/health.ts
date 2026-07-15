import { existsSync, accessSync, constants, statSync } from "node:fs";
import type { CapricornStorage } from "./storage/index.ts";
import type { CapricornConfig } from "./types.ts";
import { logger } from "./utils/logger.ts";

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  checks: Record<string, HealthCheck>;
  timestamp: string;
}

export interface HealthCheck {
  status: "ok" | "warn" | "fail";
  message: string;
  detail?: string;
}

export async function checkHealth(storage: CapricornStorage, config: CapricornConfig): Promise<HealthStatus> {
  const checks: Record<string, HealthCheck> = {};
  const start = Date.now();

  // DB check
  try {
    const stats = storage.memory.stats();
    checks.db = { status: "ok", message: `SQLite accessible (${stats.total_memories} memories)` };
  } catch (err) {
    checks.db = { status: "fail", message: "DB not accessible", detail: String(err) };
  }

  // Vault check
  try {
    const vaultPath = config.vault.path;
    if (existsSync(vaultPath)) {
      accessSync(vaultPath, constants.R_OK | constants.W_OK);
      checks.vault = { status: "ok", message: `Vault accessible at ${vaultPath}` };
    } else {
      checks.vault = { status: "warn", message: `Vault path does not exist: ${vaultPath}` };
    }
  } catch (err) {
    checks.vault = { status: "fail", message: "Vault not writable", detail: String(err) };
  }

  // LLM check
  if (config.intelligence.forge.llm_provider !== "none") {
    try {
      const baseUrl = process.env.CAPRICORN_LLM_BASE_URL ?? "http://localhost:20128/v1";
      const apiKey = process.env.CAPRICORN_LLM_API_KEY ?? "capricorn";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        checks.llm = { status: "ok", message: `LLM reachable: ${config.intelligence.forge.llm_model}` };
      } else {
        checks.llm = { status: "warn", message: `LLM returned ${res.status}`, detail: await res.text().catch(() => "") };
      }
    } catch (err) {
      checks.llm = { status: "fail", message: "LLM unreachable", detail: String(err) };
    }
  } else {
    checks.llm = { status: "warn", message: "LLM disabled (provider=none)" };
  }

  // Embedding check
  if (config.storage.vector_provider !== "none") {
    try {
      const baseUrl = process.env.CAPRICORN_EMBEDDING_BASE_URL ?? "http://localhost:20128/v1";
      const apiKey = process.env.CAPRICORN_EMBEDDING_API_KEY ?? "capricorn";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        checks.embedding = { status: "ok", message: `Embedding reachable: ${config.storage.vector_model}` };
      } else {
        checks.embedding = { status: "warn", message: `Embedding returned ${res.status}` };
      }
    } catch (err) {
      checks.embedding = { status: "fail", message: "Embedding unreachable", detail: String(err) };
    }
  } else {
    checks.embedding = { status: "warn", message: "Embedding disabled (provider=none)" };
  }

  // DB size check
  try {
    const dbSize = statSync(config.storage.db_path).size;
    const sizeMB = (dbSize / (1024 * 1024)).toFixed(1);
    if (dbSize > 500 * 1024 * 1024) {
      checks.db_size = { status: "warn", message: `DB file large: ${sizeMB}MB` };
    } else {
      checks.db_size = { status: "ok", message: `DB file: ${sizeMB}MB` };
    }
  } catch {
    checks.db_size = { status: "warn", message: "DB file not found" };
  }

  // Determine overall status
  const hasFail = Object.values(checks).some((c) => c.status === "fail");
  const hasWarn = Object.values(checks).some((c) => c.status === "warn");
  const status = hasFail ? "unhealthy" : hasWarn ? "degraded" : "healthy";

  const latency = Date.now() - start;
  logger.info("health", `check completed in ${latency}ms: ${status}`);

  return { status, checks, timestamp: new Date().toISOString() };
}