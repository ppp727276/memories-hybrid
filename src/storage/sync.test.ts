import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CapricornStorage } from "../storage/index.ts";
import { VaultSync } from "../storage/sync.ts";

describe("VaultSync", () => {
  let tmp: string;
  let storage: CapricornStorage;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "capricorn-sync-"));
    storage = new CapricornStorage(join(tmp, "capricorn.db"), tmp, {
      vault: { path: tmp, auto_sync: true },
      storage: { db_path: join(tmp, "capricorn.db"), vector_provider: "none", vector_model: "text-embedding-v3", vector_dimensions: 1024 },
      intelligence: {
        forge: { enabled: false, schedule: "0 */6 * * *", llm_provider: "none", llm_model: "", embedding_provider: "", embedding_model: "", batch_size: 100 },
        dream: { enabled: false, schedule: "15 * * * *", confidence_threshold_confirm: 0.6, evidence_threshold_confirm: 3 },
      },
      mcp: { enabled: true, transport: "stdio" },
      http: { enabled: false, port: 7437, host: "127.0.0.1" },
    });
  });

  afterEach(() => {
    storage.close();
    rmSync(tmp, { recursive: true });
  });

  it("imports a vault signal into sqlite preserving id", async () => {
    const id = "mem_test_sync_123";
    const inbox = join(tmp, "Brain", "inbox");
    mkdirSync(inbox, { recursive: true });
    writeFileSync(
      join(inbox, "sig-test.md"),
      `---\nid: ${id}\nsource: user\ncreated_at: ${new Date().toISOString()}\n---\nTest sync signal`,
    );
    const sync = new VaultSync(storage);
    const result = sync.sync();
    expect(result.imported).toBe(1);
    const stored = storage.memory.getById(id);
    expect(stored).not.toBeNull();
    expect(stored?.id).toBe(id);
    expect(stored?.content).toBe("Test sync signal");
  });

  it("round-trips a DB memory to vault", async () => {
    const { memory } = await storage.remember({ content: "Round trip memory" });
    const sync = new VaultSync(storage);
    const result = sync.sync();
    expect(result.exported).toBe(0);
    const inbox = join(tmp, "Brain", "inbox");
    let found = false;
    for (const entry of require("node:fs").readdirSync(inbox, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const raw = readFileSync(join(inbox, entry.name), "utf8");
      if (raw.includes(memory.id) && raw.includes("Round trip memory")) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("detects conflicts and preserves DB by default", async () => {
    const id = "mem_conflict_1";
    await storage.remember({ content: "DB version", source: "user" });
    // Overwrite the just-written vault file with different content
    const inbox = join(tmp, "Brain", "inbox");
    const entries = require("node:fs").readdirSync(inbox, { withFileTypes: true });
    const sigFile = entries.find((e: any) => e.isFile() && e.name.endsWith(".md"));
    if (sigFile) {
      const dbMem = await storage.remember({ content: "DB version", source: "user" });
      writeFileSync(join(inbox, sigFile.name), `---\nid: ${dbMem.memory.id}\nsource: user\ncreated_at: ${new Date().toISOString()}\n---\nVault edited version`);
      const sync = new VaultSync(storage);
      const result = sync.sync();
      expect(result.conflicts).toBeGreaterThanOrEqual(1);
      expect(result.resolved).toBe(0);
      const stored = storage.memory.getById(dbMem.memory.id);
      expect(stored?.content).toBe("DB version");
    }
  });

  it("resolves conflicts with --prefer-vault", async () => {
    const { memory } = await storage.remember({ content: "DB original" });
    const inbox = join(tmp, "Brain", "inbox");
    const entries = require("node:fs").readdirSync(inbox, { withFileTypes: true });
    const sigFile = entries.find((e: any) => e.isFile() && e.name.endsWith(".md"));
    if (sigFile) {
      writeFileSync(join(inbox, sigFile.name), `---\nid: ${memory.id}\nsource: user\ncreated_at: ${new Date().toISOString()}\n---\nVault wins`);
      const sync = new VaultSync(storage);
      const result = sync.sync(true);
      expect(result.conflicts).toBeGreaterThanOrEqual(1);
      expect(result.resolved).toBeGreaterThanOrEqual(1);
      const stored = storage.memory.getById(memory.id);
      expect(stored?.content).toBe("Vault wins");
    }
  });
});
