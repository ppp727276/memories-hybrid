import type { SourceType } from "../types.ts";

export interface ConfidenceDelta {
  base: number;
  sourceWeight: number;
  decayFactor: number;
  delta: number;
}

export function sourceWeight(type: SourceType): number {
  const weights: Record<SourceType, number> = {
    user_explicit: 1.0,
    user_implicit: 0.7,
    agent_observation: 0.5,
    system_derived: 0.3,
  };
  return weights[type];
}

export function decayFactor(daysSinceLastEvidence: number, lambda = 0.05): number {
  return Math.exp(-lambda * daysSinceLastEvidence);
}

export function computeConfidenceDelta(
  result: "applied" | "violated" | "outdated",
  sourceType: SourceType,
  daysSinceLastEvidence: number,
): ConfidenceDelta {
  const base = result === "applied" ? 0.15 : result === "violated" ? -0.25 : -0.1;
  const weight = sourceWeight(sourceType);
  const decay = decayFactor(daysSinceLastEvidence);
  return {
    base,
    sourceWeight: weight,
    decayFactor: decay,
    delta: base * decay * weight,
  };
}

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}
