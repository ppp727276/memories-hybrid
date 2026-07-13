/**
 * Standalone seed runner for the hybrid memory bridge.
 *
 * Runs the TencentDB seed pipeline directly without OpenClaw.
 * Requires the patched seed-runtime.ts (apply patches/seed-runtime.patch first).
 *
 * Usage:
 *   npx tsx src/seed-runner.ts --input seed-input.json --output-dir ./seed-out --plugin-config plugin-config.json
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadAndValidateInput } from "../../forge/core/seed/input.js";
import { executeSeed } from "../../forge/core/seed/seed-runtime.js";
import type { PipelineLogger } from "../../forge/utils/pipeline-factory.js";

const TAG = "[tdai-seed]";

interface RunSeedOptions {
  input: string;
  outputDir: string;
  sessionKey?: string;
  strictRoundRole: boolean;
  pluginConfig?: Record<string, unknown>;
}

function createLogger(): PipelineLogger {
  return {
    debug: (msg: string) => console.debug(`${TAG} ${msg}`),
    info: (msg: string) => console.info(`${TAG} ${msg}`),
    warn: (msg: string) => console.warn(`${TAG} ${msg}`),
    error: (msg: string) => console.error(`${TAG} ${msg}`),
  };
}

function parseCliArgs(): RunSeedOptions {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      "output-dir": { type: "string" },
      "session-key": { type: "string" },
      "strict-round-role": { type: "boolean", default: false },
      "plugin-config": { type: "string" },
    },
    allowPositionals: false,
  });

  if (!values.input || typeof values.input !== "string") {
    throw new Error("--input is required");
  }

  const outputDir = values["output-dir"] ?? `./seed-out-${Date.now()}`;
  if (typeof outputDir !== "string") {
    throw new Error("--output-dir must be a string");
  }

  let pluginConfig: Record<string, unknown> | undefined;
  const configFile = values["plugin-config"];
  if (typeof configFile === "string" && fs.existsSync(configFile)) {
    pluginConfig = JSON.parse(fs.readFileSync(configFile, "utf-8")) as Record<string, unknown>;
  }

  return {
    input: values.input,
    outputDir,
    sessionKey: typeof values["session-key"] === "string" ? values["session-key"] : "hybrid-bridge",
    strictRoundRole: values["strict-round-role"] === true,
    pluginConfig,
  };
}

async function main(): Promise<void> {
  const opts = parseCliArgs();
  const logger = createLogger();

  logger.info(`Starting seed run`);
  logger.info(`  input:      ${opts.input}`);
  logger.info(`  outputDir:  ${opts.outputDir}`);
  logger.info(`  sessionKey: ${opts.sessionKey}`);

  const { input, needsTimestampConfirmation } = loadAndValidateInput({
    input: opts.input,
    sessionKey: opts.sessionKey,
    strictRoundRole: opts.strictRoundRole,
  });

  if (needsTimestampConfirmation) {
    logger.info("Timestamps missing — auto-filling");
    const { fillTimestamps } = await import("../../forge/core/seed/input.js");
    fillTimestamps(input);
  }

  fs.mkdirSync(opts.outputDir, { recursive: true });

  const summary = await executeSeed(input, {
    outputDir: opts.outputDir,
    openclawConfig: {},
    pluginConfig: opts.pluginConfig,
    inputFile: opts.input,
    logger,
    onProgress: (progress) => {
      const pct = ((progress.currentRound / progress.totalRounds) * 100).toFixed(0);
      process.stdout.write(
        `\r  [${progress.currentRound}/${progress.totalRounds}] ${pct}% ` +
        `session=${progress.sessionKey} stage=${progress.stage}    `,
      );
    },
  });

  console.log("\n");
  console.log("╔══════════════════════════════════════════╗");
  console.log("║               Seed Summary               ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Sessions:    ${String(summary.sessionsProcessed).padStart(11)}               ║`);
  console.log(`║  Rounds:      ${String(summary.roundsProcessed).padStart(11)}               ║`);
  console.log(`║  Messages:    ${String(summary.messagesProcessed).padStart(11)}               ║`);
  console.log(`║  L0 recorded: ${String(summary.l0RecordedCount).padStart(11)}               ║`);
  console.log(`║  Duration:    ${(summary.durationMs / 1000).toFixed(1).padStart(10)}s               ║`);
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\n📁 Output: ${summary.outputDir}\n`);

  // Write a marker file for the bridge to easily locate persona.md
  const markerPath = path.join(summary.outputDir, ".seed-complete");
  fs.writeFileSync(markerPath, new Date().toISOString());
}

main().catch((err) => {
  console.error("Seed runner failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
