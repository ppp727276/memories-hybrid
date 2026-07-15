import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  component: string;
  message: string;
  error?: string;
}

const LOG_DIR = join(homedir(), ".capricorn", "logs");
const LOG_FILE = join(LOG_DIR, "capricorn.log");

let initialized = false;

function ensureDir() {
  if (!initialized) {
    mkdirSync(LOG_DIR, { recursive: true });
    initialized = true;
  }
}

function write(entry: LogEntry) {
  ensureDir();
  try {
    appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  } catch {
    // can't log — fall back to stderr
    process.stderr.write(JSON.stringify(entry) + "\n");
  }
}

export const logger = {
  debug(component: string, message: string, error?: Error) {
    write({ ts: new Date().toISOString(), level: "debug", component, message, error: error?.message });
  },
  info(component: string, message: string) {
    write({ ts: new Date().toISOString(), level: "info", component, message });
  },
  warn(component: string, message: string, error?: Error) {
    write({ ts: new Date().toISOString(), level: "warn", component, message, error: error?.message });
    console.error(`capricorn:${component} [warn] ${message}${error ? ": " + error.message : ""}`);
  },
  error(component: string, message: string, error?: Error) {
    write({ ts: new Date().toISOString(), level: "error", component, message, error: error?.message });
    console.error(`capricorn:${component} [error] ${message}${error ? ": " + error.message : ""}`);
  },
};