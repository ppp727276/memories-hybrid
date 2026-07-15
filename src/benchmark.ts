import { CapricornStorage } from "./storage/index.ts";
import { createEmbedder } from "./embeddings.ts";
import type { CapricornConfig } from "./types.ts";

interface BenchmarkResult {
  name: string;
  total: number;
  hits: number;
  recall: number;
  meanLatencyMs: number;
}

export class BenchmarkRunner {
  constructor(private storage: CapricornStorage, private config: CapricornConfig) {}

  async run(name: string, cases: { query: string; expectedId: string }[]): Promise<BenchmarkResult> {
    const embedder = createEmbedder(this.config);
    let hits = 0;
    let totalLatency = 0;
    for (const c of cases) {
      const start = performance.now();
      const results = await this.storage.recall(c.query, 5, null);
      totalLatency += performance.now() - start;
      if (results.some((r) => r.id === c.expectedId)) hits++;
    }
    return {
      name,
      total: cases.length,
      hits,
      recall: cases.length === 0 ? 0 : hits / cases.length,
      meanLatencyMs: cases.length === 0 ? 0 : totalLatency / cases.length,
    };
  }
}
