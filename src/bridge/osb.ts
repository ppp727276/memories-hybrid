import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { glob } from "glob";
import YAML from "yaml";
import type { CapricornStorage } from "../storage/index.ts";
import { runSql, queryAll, queryGet } from "../utils/sqlite.ts";
import type { OsbSignal, OsbBridgeResult } from "./types.ts";

export interface OsbBridgeConfig {
  osb_vault_path: string;
  osb_inbox_glob: string;
  osb_persona_target: string;
  osb_profile: string;
}

export class OsbBridge {
  constructor(
    private storage: CapricornStorage,
    private config: OsbBridgeConfig,
    private runner?: () => Promise<void>,
  ) {}

  async run(dryRun = false): Promise<OsbBridgeResult> {
    const signals = this.loadSignals();
    const pending = await this.filterPending(signals);
    let processed = 0;
    const ids: string[] = [];

    for (const signal of pending) {
      if (dryRun) {
        processed++;
        continue;
      }

      const memory = await this.storage.remember({
        content: signal.content,
        source: signal.source,
        tags: signal.tags,
        metadata: {
          osb_id: signal.id,
          osb_title: signal.title,
          osb_timestamp: signal.timestamp,
        },
      });
      ids.push(memory.memory.id);

      try {
        this.saveCheckpoint(signal, "processed");
        processed++;
      } catch (err) {
        this.saveCheckpoint(signal, "failed");
        throw err;
      }
    }

    if (!dryRun && this.runner && ids.length > 0) {
      await this.runner();
    }

    const personaWritten = await this.mergePersona(dryRun);

    return {
      processed,
      skipped: signals.length - pending.length,
      newSignals: pending.length,
      personaWritten,
      personaTarget: this.config.osb_persona_target,
    };
  }

  private loadSignals(): OsbSignal[] {
    const pattern = this.config.osb_inbox_glob;
    const paths = glob.sync(pattern, { cwd: this.config.osb_vault_path }) as string[];
    const result: OsbSignal[] = [];

    for (const filePath of paths) {
      const absolute = resolve(this.config.osb_vault_path, filePath);
      const content = readFileSync(absolute, "utf-8");
      const parsed = this.parseSignalMarkdown(content, absolute);
      if (parsed) {
        result.push({ ...parsed, source: absolute });
      }
    }

    return result;
  }

  private parseSignalMarkdown(content: string, filePath: string): Omit<OsbSignal, "source"> | null {
    const lines = content.split("\n");
    const firstDelim = lines.findIndex((line) => line.trim() === "---");
    if (firstDelim < 0) return null;

    const frontmatterEnd = lines.findIndex((line, i) => i > firstDelim && line.trim() === "---");
    if (frontmatterEnd < 0) return null;

    const frontmatter = lines.slice(firstDelim + 1, frontmatterEnd).join("\n");
    const body = lines.slice(frontmatterEnd + 1).join("\n").trim();
    if (!body) return null;

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
          : filePath.replace(/\\/g, "/").split("/").pop()?.replace(/\.md$/, "") ?? "signal";

    const title = typeof meta.title === "string" ? meta.title : id;
    const timestamp = typeof meta.timestamp === "number" ? meta.timestamp : Date.now();
    const tags = Array.isArray(meta.tags)
      ? meta.tags.map((t) => String(t))
      : typeof meta.tags === "string"
        ? meta.tags.split(",").map((t) => t.trim())
        : [];

    return { id, title, content: body, timestamp, tags };
  }

  private async filterPending(signals: OsbSignal[]): Promise<OsbSignal[]> {
    const pending: OsbSignal[] = [];
    for (const signal of signals) {
      const hash = this.hash(signal.content);
      const row = queryGet<{ md5: string }>(
        this.storage.db,
        "SELECT md5 FROM osb_signal_checkpoints WHERE id = ?",
        [signal.id],
      );
      if (!row || row.md5 !== hash) {
        pending.push(signal);
      }
    }
    return pending;
  }

  private saveCheckpoint(signal: OsbSignal, status: "processed" | "failed"): void {
    const hash = this.hash(signal.content);
    runSql(
      this.storage.db,
      `INSERT INTO osb_signal_checkpoints (id, file_path, md5, status, processed_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         file_path = excluded.file_path,
         md5 = excluded.md5,
         status = excluded.status,
         processed_at = excluded.processed_at`,
      [signal.id, signal.source, hash, status, Date.now()],
    );
  }

  private async mergePersona(dryRun: boolean): Promise<boolean> {
    const latest = this.storage.memory.getLatestPersona(this.config.osb_profile);
    if (!latest) return false;

    const target = this.config.osb_persona_target;
    let frozenBlocks: string[] = [];
    if (existsSync(target)) {
      const existing = readFileSync(target, "utf-8");
      const frozenRegex = /<!--\s*status:\s*frozen\s*-->([\s\S]*?)<!--\s*status:\s*end\s*-->/g;
      let match: RegExpExecArray | null;
      while ((match = frozenRegex.exec(existing)) !== null) {
        frozenBlocks.push(match[0]);
      }
    }

    let newContent = `# Persona\n\n${latest.content.trim()}`;
    if (frozenBlocks.length > 0) {
      newContent += "\n\n## Preserved User Edits\n\n" + frozenBlocks.join("\n\n");
    }

    if (!dryRun) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, newContent, "utf-8");
    }

    return true;
  }

  private hash(content: string): string {
    return createHash("md5").update(content).digest("hex");
  }
}
