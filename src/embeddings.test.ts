import { describe, it, expect } from "bun:test";
import { createEmbedder } from "./embeddings.ts";
import type { CapricornConfig } from "./types.ts";
import { DEFAULT_CONFIG } from "./config.ts";

function localConfig(dims: number): CapricornConfig {
  return { ...DEFAULT_CONFIG, storage: { ...DEFAULT_CONFIG.storage, vector_provider: "local", vector_dimensions: dims } } as CapricornConfig;
}

describe("LocalEmbedder", () => {
  it("returns deterministic embeddings for identical text", async () => {
    const embedder = createEmbedder(localConfig(128));
    const a = await embedder.embed("hello world");
    const b = await embedder.embed("hello world");
    expect(a).toEqual(b);
  });

  it("returns normalized vectors", async () => {
    const embedder = createEmbedder(localConfig(64));
    const vec = await embedder.embed("capricorn local fallback");
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("honors configured dimensions", async () => {
    const embedder = createEmbedder(localConfig(32));
    const vec = await embedder.embed("test");
    expect(vec.length).toBe(32);
  });
});
