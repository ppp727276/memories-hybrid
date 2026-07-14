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

export interface Insight {
  id: string;
  memory_id: string;
  content: string;
  layer: "L0" | "L1" | "L2" | "L3";
  metadata: Record<string, unknown>;
  created_at: number;
}

export type SourceType = "user_explicit" | "user_implicit" | "agent_observation" | "system_derived";

export interface Preference {
  id: string;
  body: string;
  tier: "trial" | "confirmed" | "retired";
  confidence: number;
  evidence: PreferenceEvidence[];
  origin: string | null;
  created_at: number;
  updated_at: number;
}

export interface PreferenceEvidence {
  id: string;
  pref_id: string;
  memory_id: string;
  result: "applied" | "violated" | "outdated";
  session_id: string | null;
  source_type: SourceType;
  source_weight: number;
  created_at: number;
}

export interface Persona {
  id: string;
  profile: string;
  content: string;
  version: number;
  created_at: number;
}

export interface ValidationResult {
  score: number;
  flags: string[];
  hyper_tune: {
    coherence: number;
    relevance: number;
    quality: number;
  };
  halugard: {
    g2_claim_verify: boolean;
    g3_contradiction: boolean;
    g4_drift_detect: boolean;
  };
}
