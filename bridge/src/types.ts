/**
 * Shared types for the hybrid memory bridge.
 */

export interface Signal {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  tags?: string[];
  source?: string;
}

export interface SeedInput {
  sessions: SeedSession[];
}

export interface SeedSession {
  sessionKey: string;
  sessionId?: string;
  conversations: SeedMessage[][];
}

export interface SeedMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export interface BridgeConfig {
  vaultPath: string;
  profile?: string;
  tencentdbPath: string;
  outputDir: string;
  personaTargetPath: string;
  sessionKey: string;
  pluginConfig: Record<string, unknown>;
}
