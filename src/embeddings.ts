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

function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function seededRandom(seed: string): number {
  return (Math.sin(djb2Hash(seed)) + 1) / 2;
}

class LocalEmbedder implements Embedder {
  private dims: number;
  constructor(dims: number) {
    this.dims = dims;
  }
  enabled(): boolean { return true; }
  dimensions(): number { return this.dims; }
  async embed(text: string): Promise<number[]> {
    const words = text.toLowerCase().split(/\W+/).filter(Boolean);
    if (words.length === 0) return new Array(this.dims).fill(0);
    const vec = new Array(this.dims).fill(0);
    for (let d = 0; d < this.dims; d++) {
      let sum = 0;
      for (const word of words) {
        sum += seededRandom(`${word}:${d}`) * 2 - 1;
      }
      vec[d] = sum / words.length;
    }
    const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0));
    return norm === 0 ? vec : vec.map((v) => v / norm);
  }
}

class ApiEmbedder implements Embedder {
  private apiKey: string | undefined;
  private baseUrl: string;
  private model: string;
  private dims: number;

  constructor(config: CapricornConfig) {
    this.apiKey = process.env.CAPRICORN_EMBEDDING_API_KEY;
    this.baseUrl = process.env.CAPRICORN_EMBEDDING_BASE_URL ?? "http://localhost:20128/v1";
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
  if (config.storage.vector_provider === "local") return new LocalEmbedder(config.storage.vector_dimensions);
  if (config.storage.vector_provider === "onnx") return new OnnxEmbedder(config.storage.vector_dimensions);
  return new NoneEmbedder();
}

class OnnxEmbedder implements Embedder {
  private dims: number;
  private fallback: LocalEmbedder;
  private session: unknown = null;
  private tokenizer: unknown = null;

  constructor(dims: number) {
    this.dims = dims;
    this.fallback = new LocalEmbedder(dims);
  }

  enabled(): boolean { return true; }

  dimensions(): number { return this.dims; }

  async embed(text: string): Promise<number[]> {
      if (!this.session) {
        try {
                  // @ts-expect-error onnxruntime-node is optional
                  const ort = await import("onnxruntime-node");
          this.session = ort;
        } catch {
          // onnxruntime-node not installed — fall through to fallback
        }
      }
      return this.fallback.embed(text);
    }

    async loadModel(modelPath: string): Promise<boolean> {
      try {
                // @ts-expect-error onnxruntime-node is optional
                const ort = await import("onnxruntime-node");
        this.session = await ort.InferenceSession.create(modelPath);
        return true;
    } catch {
      return false;
    }
  }
}
