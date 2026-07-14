export interface OsbSignal {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  tags: string[];
  source: string;
}

export interface OsbBridgeResult {
  processed: number;
  skipped: number;
  newSignals: number;
  personaWritten: boolean;
  personaTarget: string;
}
