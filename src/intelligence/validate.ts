import type { ValidationResult } from "../types.ts";
import { cosineSimilarity } from "./similarity.ts";

export type Decision = "auto-merge" | "merge-warning" | "review-queue";

export interface ValidationInput {
  source: string;
  output: string;
  existingPreferences: string[];
  previousPersona?: string;
}

export async function validate(input: ValidationInput, embed?: (text: string) => Promise<number[]>): Promise<ValidationResult> {
  const coherence = await computeCoherence(input.output, embed);
  const relevance = await computeRelevance(input.source, input.output, embed);
  const quality = computeQuality(input.output);

  const g2 = await claimVerify(input.output, input.existingPreferences, embed);
  const g3 = await contradictionCheck(input.output, input.existingPreferences, embed);
  const g4 = await driftDetect(input.output, input.previousPersona, embed);

  const score = 0.4 * coherence + 0.4 * relevance + 0.2 * quality;
  const flags: string[] = [];
  if (g2) flags.push("g2_claim_verified");
  if (g3) flags.push("g3_contradiction_detected");
  if (g4) flags.push("g4_drift_detected");

  return {
    score,
    flags,
    hyper_tune: { coherence, relevance, quality },
    halugard: { g2_claim_verify: g2, g3_contradiction: g3, g4_drift_detect: g4 },
  };
}

export function decide(result: ValidationResult, thresholds?: { autoMerge: number; reviewQueue: number }): { decision: Decision; warnings: string[] } {
  const { autoMerge = 0.7, reviewQueue = 0.4 } = thresholds ?? {};
  const warnings: string[] = [];
  if (result.score >= autoMerge && result.flags.length === 0) {
    return { decision: "auto-merge", warnings };
  }
  if (result.score >= autoMerge && result.flags.length > 0) {
    warnings.push(...result.flags);
    return { decision: "merge-warning", warnings };
  }
  if (result.score >= reviewQueue) {
    warnings.push(...result.flags, "low_score");
    return { decision: "merge-warning", warnings };
  }
  warnings.push(...result.flags, "low_score");
  return { decision: "review-queue", warnings };
}

async function computeCoherence(text: string, embed?: (text: string) => Promise<number[]>): Promise<number> {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return 1.0;
  if (!embed) return heuristicCoherence(sentences);
  return embedCoherence(sentences, embed);
}

async function computeRelevance(source: string, output: string, embed?: (text: string) => Promise<number[]>): Promise<number> {
  if (!embed) return heuristicSimilarity(source, output);
  return semanticSimilarity(source, output, embed);
}

function computeQuality(text: string): number {
  const lower = text.toLowerCase();
  const degenerate = ["i don't know", "i'm not sure", "no information", "empty", "null", "undefined"].some((p) => lower.includes(p));
  if (degenerate) return 0.1;
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 5) return 0.3;
  if (words < 15) return 0.6;
  return 0.9;
}

async function claimVerify(output: string, preferences: string[], embed?: (text: string) => Promise<number[]>): Promise<boolean> {
  if (!embed || preferences.length === 0) return output.length > 20;
  // G2: verify claim against existing evidence in preferences
  // A claim is "verified" if it's semantically similar to at least one existing preference
  for (const pref of preferences.slice(0, 10)) {
    const sim = await semanticSimilarity(output, pref, embed);
    if (sim > 0.6) return true;
  }
  return false;
}

async function contradictionCheck(output: string, existing: string[], embed?: (text: string) => Promise<number[]>): Promise<boolean> {
  if (existing.length === 0) return false;
  for (const pref of existing) {
    const sim = embed ? await semanticSimilarity(output, pref, embed) : heuristicSimilarity(output, pref);
    if (sim > 0.8 && !heuristicEquivalent(output, pref)) return true;
  }
  return false;
}

async function driftDetect(output: string, previous?: string, embed?: (text: string) => Promise<number[]>): Promise<boolean> {
  if (!previous) return false;
  const sim = embed ? await semanticSimilarity(output, previous, embed) : heuristicSimilarity(output, previous);
  return sim < 0.5;
}

function splitSentences(text: string): string[] {
  return text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
}

function heuristicCoherence(sentences: string[]): number {
  if (sentences.length < 2) return 1.0;
  let total = 0;
  for (let i = 1; i < sentences.length; i++) {
    total += heuristicSimilarity(sentences[i - 1], sentences[i]);
  }
  return total / (sentences.length - 1);
}

async function embedCoherence(sentences: string[], embed: (text: string) => Promise<number[]>): Promise<number> {
  const vectors = await Promise.all(sentences.map((s) => embed(s)));
  let total = 0;
  let count = 0;
  for (let i = 1; i < vectors.length; i++) {
    total += cosineSimilarity(vectors[i - 1], vectors[i]);
    count++;
  }
  return count === 0 ? 1.0 : total / count;
}

function heuristicSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  return intersection / Math.sqrt(setA.size * setB.size);
}

async function semanticSimilarity(a: string, b: string, embed: (text: string) => Promise<number[]>): Promise<number> {
  const [ea, eb] = await Promise.all([embed(a), embed(b)]);
  return cosineSimilarity(ea, eb);
}

function heuristicEquivalent(a: string, b: string): boolean {
  return a.toLowerCase().trim() === b.toLowerCase().trim();
}
