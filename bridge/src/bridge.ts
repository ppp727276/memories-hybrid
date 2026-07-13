/**
 * Hybrid Memory Bridge v3
 *
 * Orchestrates the enrichment pipeline:
 *   OSB signals → TencentDB seed → persona.md → OSB Brain/personas/
 *
 * Usage:
 *   npx tsx src/bridge.ts --config bridge-config.json
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import YAML from "yaml";
import type { BridgeConfig, Signal } from "./types.js";
import { signalsToSeedInput } from "./signal-converter.js";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..", "..");

const TAG = "[hybrid-bridge]";

interface RunOptions {
  config: string;
  dryRun?: boolean;
}

interface Checkpoint {
  processed: Record<string, string>;
}

function parseCliArgs(): RunOptions {
  const { values } = parseArgs({
    options: {
      config: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  if (!values.config || typeof values.config !== "string") {
    throw new Error("--config is required");
  }

  return {
    config: values.config,
    dryRun: values["dry-run"] === true,
  };
}

function loadConfig(configPath: string): BridgeConfig {
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<BridgeConfig>;

  const home = process.env.HOME || process.env.USERPROFILE || ".";
  const vaultPath = parsed.vaultPath || path.join(home, "Documents", "second-brain-memory");
  const profile = parsed.profile;
  const profileSlug = profile || "default";

  return {
    vaultPath,
    profile,
    tencentdbPath: parsed.tencentdbPath || path.join(PROJECT_ROOT, "forge"),
    outputDir: parsed.outputDir || path.join(vaultPath, "..", "tdai-seed-output", profileSlug),
    personaTargetPath:
      parsed.personaTargetPath || path.join(vaultPath, "Brain", "personas", `persona-${profileSlug}.md`),
    sessionKey: parsed.sessionKey || `hybrid-bridge-${profileSlug}`,
    pluginConfig: parsed.pluginConfig || {},
  };
}

function getCheckpointPath(config: BridgeConfig): string {
  const profileSlug = config.profile || "default";
  return path.join(config.vaultPath, `.hybrid-bridge-checkpoint-${profileSlug}.json`);
}

function loadCheckpoint(config: BridgeConfig): Checkpoint {
  const checkpointPath = getCheckpointPath(config);
  if (!fs.existsSync(checkpointPath)) {
    return { processed: {} };
  }
  try {
    const raw = fs.readFileSync(checkpointPath, "utf-8");
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return { processed: {} };
  }
}

function saveCheckpoint(config: BridgeConfig, checkpoint: Checkpoint): void {
  const checkpointPath = getCheckpointPath(config);
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2), "utf-8");
}

function hashContent(content: string): string {
  return createHash("md5").update(content).digest("hex");
}

function loadSignals(config: BridgeConfig, checkpoint: Checkpoint): { signals: Signal[]; pending: string[] } {
  const profileSlug = config.profile || "default";
  const inboxDir = path.join(config.vaultPath, "Brain", "inbox", profileSlug === "default" ? "" : profileSlug);
  if (!fs.existsSync(inboxDir)) {
    return { signals: [], pending: [] };
  }

  const files = fs.readdirSync(inboxDir).filter((f) => f.endsWith(".md"));
  const signals: Signal[] = [];
  const pending: string[] = [];

  for (const file of files) {
    const filePath = path.join(inboxDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const contentHash = hashContent(content);

    const previousHash = checkpoint.processed[filePath];
    if (previousHash === contentHash) {
      continue;
    }

    const parsed = parseSignalMarkdown(content, filePath);
    if (parsed) {
      signals.push({ ...parsed, source: filePath });
      pending.push(filePath);
    }
  }

  return { signals, pending };
}

function parseSignalMarkdown(content: string, filePath: string): Omit<Signal, "source"> | null {
  const lines = content.split("\n");

  const firstDelim = lines.findIndex((line) => line.trim() === "---");
  if (firstDelim < 0) {
    return null;
  }

  const frontmatterEnd = lines.findIndex((line, i) => i > firstDelim && line.trim() === "---");
  if (frontmatterEnd < 0) {
    return null;
  }

  const frontmatter = lines.slice(firstDelim + 1, frontmatterEnd).join("\n");
  const body = lines.slice(frontmatterEnd + 1).join("\n").trim();

  if (!body) {
    return null;
  }

  let meta: Record<string, unknown> = {};
  try {
    meta = YAML.parse(frontmatter) || {};
  } catch {
    return null;
  }

  const id =
    typeof meta.id === "string"
      ? meta.id
      : typeof meta.title === "string"
        ? meta.title
        : path.basename(filePath, ".md");

  const title = typeof meta.title === "string" ? meta.title : id;
  const timestamp =
    typeof meta.timestamp === "number" ? meta.timestamp : Date.now();
  const tags = Array.isArray(meta.tags)
    ? meta.tags.map((t) => String(t))
    : typeof meta.tags === "string"
      ? meta.tags.split(",").map((t) => t.trim())
      : [];

  return {
    id,
    title,
    content: body,
    timestamp,
    tags,
  };
}

// ============================
// Host memory write loader
// ============================

interface HostMemoryWriteRecord {
  ts: string;
  kind: "host_memory_write";
  payload: {
    action: string;
    target: string;
    content: string;
    id?: string;
  };
}

function readdirRecursive(dir: string, ext: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...readdirRecursive(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

function loadHostMemoryWrites(
  config: BridgeConfig,
  checkpoint: Checkpoint,
): { signals: Signal[]; pending: string[] } {
  const logDir = path.join(config.vaultPath, "Brain", "log");
  if (!fs.existsSync(logDir)) {
    return { signals: [], pending: [] };
  }

  const signals: Signal[] = [];
  const pending: string[] = [];

  const files = readdirRecursive(logDir, ".jsonl");
  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      let record: HostMemoryWriteRecord;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }

      if (record.kind !== "host_memory_write") continue;

      const key = `${filePath}::${record.payload.id || record.ts}`;
      const contentHash = hashContent(record.payload.content || line);

      if (checkpoint.processed[key] === contentHash) continue;

      signals.push({
        id: `host-write-${record.payload.id || record.ts}`,
        title: `Auto-save ${record.payload.action} to ${record.payload.target}`,
        content: record.payload.content,
        timestamp: Date.parse(record.ts) || Date.now(),
        tags: ["auto-save", "host-memory-write", record.payload.target],
        source: key,
      });
      pending.push(key);
    }
  }

  return { signals, pending };
}

function runSeedRunner(
  _tencentdbPath: string,
  inputPath: string,
  outputDir: string,
  sessionKey: string,
  pluginConfig: Record<string, unknown>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const pluginConfigPath = path.join(outputDir, "plugin-config.json");
    fs.writeFileSync(pluginConfigPath, JSON.stringify(pluginConfig, null, 2), "utf-8");

    const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const args = [
      "tsx", "bridge/src/seed-runner.ts",
      "--input", inputPath,
      "--output-dir", outputDir,
      "--session-key", sessionKey,
      "--plugin-config", pluginConfigPath,
    ];

    console.log(`${TAG} Running seed pipeline...`);
    const proc = spawn(cmd, args, { cwd: PROJECT_ROOT, shell: true, stdio: "inherit" });

    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Seed runner exited with code ${code}`));
      }
    });
  });
}

function findPersonaMd(outputDir: string): string | null {
  const candidate = path.join(outputDir, "persona.md");
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  return null;
}

function mergePersona(targetPath: string, generatedPersona: string): void {
  const header = "# Persona\n\n";
  const frozenRegex = /<!--\s*status:\s*frozen\s*-->([\s\S]*?)<!--\s*status:\s*end\s*-->/g;

  let frozenBlocks: string[] = [];
  if (fs.existsSync(targetPath)) {
    const existing = fs.readFileSync(targetPath, "utf-8");
    let match: RegExpExecArray | null;
    while ((match = frozenRegex.exec(existing)) !== null) {
      frozenBlocks.push(match[0]);
    }
  }

  let newContent = header + generatedPersona.trim();
  if (frozenBlocks.length > 0) {
    newContent += "\n\n## Preserved User Edits\n\n" + frozenBlocks.join("\n\n");
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, newContent, "utf-8");
}

async function main(): Promise<void> {
  const opts = parseCliArgs();
  const config = loadConfig(opts.config);

  console.log(`${TAG} Vault: ${config.vaultPath}`);
  console.log(`${TAG} Persona target: ${config.personaTargetPath}`);

  const checkpoint = loadCheckpoint(config);
  const inboxResult = loadSignals(config, checkpoint);
  const logResult = loadHostMemoryWrites(config, checkpoint);
  const signals = [...inboxResult.signals, ...logResult.signals];
  const pending = [...inboxResult.pending, ...logResult.pending];
  console.log(`${TAG} Loaded ${signals.length} new/updated signals (${inboxResult.signals.length} inbox, ${logResult.signals.length} host-memory-writes)`);

  if (signals.length === 0) {
    console.log(`${TAG} No signals to process. Exiting.`);
    return;
  }

  const seedInput = signalsToSeedInput(signals, { sessionKey: config.sessionKey });

  const inputPath = path.join(config.outputDir, "seed-input.json");
  fs.mkdirSync(config.outputDir, { recursive: true });
  fs.writeFileSync(inputPath, JSON.stringify(seedInput, null, 2), "utf-8");

  if (opts.dryRun) {
    console.log(`${TAG} Dry run. Input written to: ${inputPath}`);
    return;
  }

  await runSeedRunner(config.tencentdbPath, inputPath, config.outputDir, config.sessionKey, config.pluginConfig);

  const personaPath = findPersonaMd(config.outputDir);
  if (!personaPath) {
    throw new Error(`persona.md not found in ${config.outputDir}`);
  }

  const personaContent = fs.readFileSync(personaPath, "utf-8");
  mergePersona(config.personaTargetPath, personaContent);

  for (const filePath of inboxResult.pending) {
    const content = fs.readFileSync(filePath, "utf-8");
    checkpoint.processed[filePath] = hashContent(content);
  }
  for (const key of logResult.pending) {
    // Host memory write keys are composite: filePath::recordId
    // Content hash was already computed during loadHostMemoryWrites
    // We need to re-derive it from the signal content
    const signal = logResult.signals.find((s) => s.source === key);
    if (signal) {
      checkpoint.processed[key] = hashContent(signal.content);
    }
  }
  saveCheckpoint(config, checkpoint);

  console.log(`${TAG} Persona merged to: ${config.personaTargetPath}`);
}

main().catch((err) => {
  console.error(`${TAG} Failed:`, err instanceof Error ? err.message : String(err));
  process.exit(1);
});