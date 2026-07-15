import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CapricornStorage } from "../storage/index.ts";
import { handleTool } from "../mcp/tools.ts";

describe("MCP round-trip", () => {
  let tempDir: string;
  let storage: CapricornStorage;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "capricorn-mcp-"));
    storage = new CapricornStorage(join(tempDir, "test.db"), join(tempDir, "vault"));
  });

  afterEach(() => {
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("remembers and recalls via MCP handler", async () => {
    const rememberRes = (await handleTool(
      { method: "capricorn.remember", params: { content: "MCP test memory", tags: ["test"] } },
      storage,
    )) as { id: string; status: string };
    expect(rememberRes.status).toBe("stored");

    const recallRes = (await handleTool(
      { method: "capricorn.recall", params: { query: "MCP" } },
      storage,
    )) as { results: Array<{ id: string; content: string }> };
    expect(recallRes.results.length).toBeGreaterThan(0);
    expect(recallRes.results[0].id).toBe(rememberRes.id);

    const statsRes = (await handleTool({ method: "capricorn.stats", params: {} }, storage)) as {
      total_memories: number;
    };
    expect(statsRes.total_memories).toBe(1);
  });
});
