export interface Memory {
  id: string;
  content: string;
  source: string;
  session_id: string | null;
  project: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface MemoryInput {
  content: string;
  source?: string;
  session_id?: string | null;
  project?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  content: string;
  source: string;
  project: string | null;
  tags: string[];
  score: number;
  created_at: number;
}

export interface CapricornConfig {
  vault: {
    path: string;
    auto_sync: boolean;
  };
  storage: {
    db_path: string;
    vector_provider: "api" | "local" | "none";
    vector_model: string;
    vector_dimensions: number;
  };
  intelligence: {
    forge: {
      enabled: boolean;
      schedule: string;
      llm_provider: string;
      llm_model: string;
      embedding_provider: string;
      embedding_model: string;
      batch_size: number;
    };
    dream: {
      enabled: boolean;
      schedule: string;
      confidence_threshold_confirm: number;
      evidence_threshold_confirm: number;
    };
  };
  mcp: {
    enabled: boolean;
    transport: "stdio";
  };
  http: {
    enabled: boolean;
    port: number;
    host: string;
  };
}

export interface StatsResult {
  total_memories: number;
  total_insights: number;
  preferences_count: number;
  db_size: number;
  vault_size: number;
}
