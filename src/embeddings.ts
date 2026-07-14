import type { CapricornConfig } from "./types.ts";

export interface Embedder {
  embed(text: string): Promise<number[]>;
  dimensions(): number;
  enabled(): boolean;
}

class NoneEmbedder implements Embedder {
  enabled(): boolean { return false; }
  embed(): Promise<number[]> { throw new Error("embeddings disabled"); }
  dimensions(): number { return 0; }
}

class LocalEmbedder implements Embedder {
  enabled(): boolean { return true; }
  dimensions(): number { return 0; }
  async embed(): Promise<number[]> {
    throw new Error("local embedder not implemented");
  }
}

class ApiEmbedder implements Embedder {
  private apiKey: string | undefined;
  private baseUrl: string;
  private model: string;
  private dims: number;

  constructor(config: CapricornConfig) {
    this.apiKey = process.env.CAPRICORN_EMBEDDING_API_KEY;
    this.baseUrl = process.env.CAPRICORN_EMBEDDING_BASE_URL ?? "https://api.openai.com/v1";
    this.model = config.storage.vector_model;
    this.dims = config.storage.vector_dimensions;
  }

  enabled(): boolean { return true; }

  dimensions(): number { return this.dims; }

  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) throw new Error("CAPRICORN_EMBEDDING_API_KEY not set");
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ input: text, model: this.model, dimensions: this.dims }),
    });
    if (!res.ok) throw new Error(`embedding API error: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data[0].embedding;
  }
}

export function createEmbedder(config: CapricornConfig): Embedder {
  if (config.storage.vector_provider === "none") return new NoneEmbedder();
  if (config.storage.vector_provider === "api") return new ApiEmbedder(config);
  if (config.storage.vector_provider === "local") return new LocalEmbedder();
  return new NoneEmbedder();
}
