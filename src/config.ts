import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { CapricornConfig } from "./types.ts";

const VAULT_DEFAULT = join(homedir(), "Documents", "second-brain-memory");
const DATA_DEFAULT = join(homedir(), ".capricorn");

export const DEFAULT_CONFIG: CapricornConfig = {
  vault: { path: VAULT_DEFAULT, auto_sync: true },
  storage: {
    db_path: join(DATA_DEFAULT, "capricorn.db"),
    vector_provider: "api",
    vector_model: "text-embedding-v3",
    vector_dimensions: 1024,
  },
  intelligence: {
    forge: {
      enabled: true,
      schedule: "0 */6 * * *",
      llm_provider: "omniroute",
      llm_model: "deepseek-v4-pro",
      embedding_provider: "openai",
      embedding_model: "text-embedding-v3",
      batch_size: 100,
    },
    dream: {
      enabled: true,
      schedule: "15 * * * *",
      confidence_threshold_confirm: 0.6,
      evidence_threshold_confirm: 3,
    },
  },
  mcp: { enabled: true, transport: "stdio" },
  http: { enabled: false, port: 7437, host: "127.0.0.1" },
  bridge: {
    osb_vault_path: join(homedir(), "Documents", "second-brain-memory"),
    osb_inbox_glob: "Brain/inbox/**/*.md",
    osb_persona_target: join(homedir(), "Documents", "second-brain-memory", "Brain", "personas", "persona-core.md"),
    osb_profile: "default",
  },
};

export function configPath(): string {
  return process.env.CAPRICORN_CONFIG ?? join(homedir(), ".capricorn", "capricorn.config.json");
}

export function loadConfig(): CapricornConfig {
  const path = configPath();
  let overrides: Partial<CapricornConfig> = {};
  try {
    const raw = readFileSync(path, "utf8");
    overrides = JSON.parse(raw);
  } catch (err) {
    console.error("capricorn: config load failed, using defaults:", String(err));
  }
  return mergeConfig(overrides);
}

export function mergeConfig(overrides: Partial<CapricornConfig>): CapricornConfig {
  return {
    vault: { ...DEFAULT_CONFIG.vault, ...overrides.vault },
    storage: { ...DEFAULT_CONFIG.storage, ...overrides.storage },
    intelligence: {
      forge: { ...DEFAULT_CONFIG.intelligence.forge, ...overrides.intelligence?.forge },
      dream: { ...DEFAULT_CONFIG.intelligence.dream, ...overrides.intelligence?.dream },
    },
    mcp: { ...DEFAULT_CONFIG.mcp, ...overrides.mcp },
    http: { ...DEFAULT_CONFIG.http, ...overrides.http },
    bridge: overrides.bridge ? { ...DEFAULT_CONFIG.bridge, ...overrides.bridge } : DEFAULT_CONFIG.bridge,
  };
}

export function saveConfig(config: CapricornConfig): void {
  const path = configPath();
  const dir = dirname(path);
  if (dir !== ".") mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2));
}

export function expandPath(input: string): string {
  if (input.startsWith("~/")) return join(homedir(), input.slice(2));
  return resolve(input);
}
