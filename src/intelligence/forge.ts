import type { CapricornStorage } from "../storage/index.ts";
import type { Memory } from "../types.ts";
import type { LLMRunner } from "./llm.ts";
import { validate } from "./validate.ts";

export interface ForgeResult {
  processed: number;
  insights: number;
  personas: number;
  skipped: number;
}

export class ForgePipeline {
  constructor(private storage: CapricornStorage, private llm: LLMRunner) {}

  async run(profile = "default", batchSize = 10): Promise<ForgeResult> {
    const memories = this.storage.memory.getUnprocessedMemories(batchSize);
    let processed = 0;
    let insights = 0;
    let personas = 0;
    let skipped = 0;

    for (const memory of memories) {
      try {
        const result = await this.processMemory(memory, profile);
        processed++;
        insights += result.insights;
        personas += result.personas;
      } catch (err) {
        this.storage.memory.markEnrichmentStatus(memory.id, "failed", String(err));
        skipped++;
      }
    }

    return { processed, insights, personas, skipped };
  }

  private async processMemory(memory: Memory, profile: string): Promise<{ insights: number; personas: number }> {
    let insights = 0;
    let personas = 0;

    // L1 extraction
    const l1 = await this.extract(memory);
    if (l1) {
      this.storage.memory.addInsight(memory.id, "L1", l1, { layer: "L1" });
      insights++;
    }

    // L2 scene synthesis
    const l2 = await this.synthesize(memory, l1);
    if (l2) {
      this.storage.memory.addInsight(memory.id, "L2", l2, { layer: "L2" });
      insights++;
    }

    // L3 persona generation
    const l3 = await this.generatePersona(memory, l1, l2, profile);
    if (l3) {
      this.storage.memory.addInsight(memory.id, "L3", l3, { layer: "L3" });
      this.storage.memory.savePersona(profile, l3);
      personas++;
    }

    this.storage.memory.markEnrichmentStatus(memory.id, "done");
    return { insights, personas };
  }

  private async extract(memory: Memory): Promise<string | null> {
    if (!this.llm.enabled()) return null;
    const prompt = `Extract one concise preference or fact from this memory. Return only the extracted statement, nothing else.\n\nMemory: ${memory.content}`;
    const text = await this.llm.complete(prompt, "You are a memory extraction assistant.");
    return text || null;
  }

  private async synthesize(memory: Memory, l1: string | null): Promise<string | null> {
    if (!this.llm.enabled()) return null;
    const prompt = `Given this memory and extracted insight, synthesize a brief scene or narrative.\n\nMemory: ${memory.content}\nInsight: ${l1 ?? ""}`;
    const text = await this.llm.complete(prompt, "You are a scene synthesis assistant.");
    return text || null;
  }

  private async generatePersona(memory: Memory, l1: string | null, l2: string | null, profile: string): Promise<string | null> {
    if (!this.llm.enabled()) return null;
    const latest = this.storage.memory.getLatestPersona(profile);
    const prompt = `Update the following persona based on the new memory. Return only the updated persona text.\n\nExisting persona: ${latest?.content ?? "(none)"}\nMemory: ${memory.content}\nInsight: ${l1 ?? ""}\nScene: ${l2 ?? ""}`;
    const text = await this.llm.complete(prompt, "You are a persona generation assistant.");
    if (!text) return null;

    const existingPrefs = this.storage.memory.getAllPreferences().map((p) => p.body);
    const validation = await validate({
      source: memory.content,
      output: text,
      existingPreferences: existingPrefs,
      previousPersona: latest?.content,
    });

    if (validation.score < 0.4 || validation.flags.length > 0) {
      // Advisory flag only; processMemory will store the insight
      return text;
    }

    return text;
  }
}
