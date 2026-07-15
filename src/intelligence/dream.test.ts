import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CapricornStorage } from "../storage/index.ts";
import { DreamPipeline } from "./dream.ts";

describe("DreamPipeline", () => {
  let tmp: string;
  let storage: CapricornStorage;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "capricorn-dream-"));
    storage = new CapricornStorage(join(tmp, "capricorn.db"), tmp, {
      vault: { path: tmp, auto_sync: false },
      storage: { db_path: join(tmp, "capricorn.db"), vector_provider: "none", vector_model: "text-embedding-v3", vector_dimensions: 1024 },
      intelligence: {
        forge: { enabled: false, schedule: "0 */6 * * *", llm_provider: "none", llm_model: "", embedding_provider: "", embedding_model: "", batch_size: 100 },
        dream: { enabled: false, schedule: "15 * * * *", confidence_threshold_confirm: 0.4, evidence_threshold_confirm: 1 },
      },
      mcp: { enabled: true, transport: "stdio" },
      http: { enabled: false, port: 7437, host: "127.0.0.1" },
    });
  });

  afterEach(() => {
    storage.close();
    rmSync(tmp, { recursive: true });
  });

  function writeSignal(id: string, content: string) {
    const inbox = join(tmp, "Brain", "inbox");
    mkdirSync(inbox, { recursive: true });
    writeFileSync(
      join(inbox, `sig-${id}.md`),
      `---\nid: ${id}\nsource: user\ncreated_at: ${new Date().toISOString()}\n---\n${content}`,
    );
  }

  it("creates a trial preference from a new signal", async () => {
    writeSignal("sig-1", "User prefers dark mode.");
    const dream = new DreamPipeline(storage);
    const result = await dream.run();
    expect(result.created).toBe(1);
    const prefs = storage.memory.getAllPreferences();
    expect(prefs.length).toBe(1);
    expect(prefs[0].tier).toBe("trial");
  });

  it("promotes a preference after multiple applied evidence", async () => {
    writeSignal("sig-1", "User prefers dark mode.");
    writeSignal("sig-2", "User prefers dark mode.");
    writeSignal("sig-3", "User prefers dark mode.");
    const dream = new DreamPipeline(storage);
    await dream.run("default", 0.4, 3);
    const prefs = storage.memory.getAllPreferences();
    expect(prefs[0].tier).toBe("confirmed");
  });

  it("writes active.md with confirmed preferences", async () => {
    writeSignal("sig-1", "User prefers dark mode.");
    const dream = new DreamPipeline(storage);
    await dream.run();
    expect(existsSync(join(tmp, "Brain", "active.md"))).toBe(true);
  });
});
