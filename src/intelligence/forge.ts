import type { CapricornStorage } from "../storage/index.ts";
import type { Memory } from "../types.ts";
import type { LLMRunner } from "./llm.ts";
import { validate, decide, type Decision } from "./validate.ts";

export interface ForgeResult {
  processed: number;
  insights: number;
  personas: number;
  skipped: number;
  reviewQueue: number;
  warnings: number;
}

export class ForgePipeline {
  constructor(private storage: CapricornStorage, private llm: LLMRunner) {}

  async run(profile = "default", batchSize = 10): Promise<ForgeResult> {
    const memories = this.storage.memory.getUnprocessedMemories(batchSize);
    return this.processBatch(memories, profile);
  }

  async enrich(id: string, profile = "default"): Promise<ForgeResult> {
    const memory = this.storage.memory.getById(id);
    if (!memory) throw new Error(`memory not found: ${id}`);
    return this.processBatch([memory], profile);
  }

  private async processBatch(memories: Memory[], profile: string): Promise<ForgeResult> {
    let processed = 0;
    let insights = 0;
    let personas = 0;
    let skipped = 0;
    let reviewQueue = 0;
    let warnings = 0;

    for (const memory of memories) {
      try {
        const result = await this.processMemory(memory, profile);
        processed++;
        insights += result.insights;
        personas += result.personas;
        reviewQueue += result.reviewQueue;
        warnings += result.warnings;
      } catch (err) {
        this.storage.memory.markEnrichmentStatus(memory.id, "failed", String(err));
        skipped++;
      }
    }

    return { processed, insights, personas, skipped, reviewQueue, warnings };
  }

  private async processMemory(memory: Memory, profile: string): Promise<{ insights: number; personas: number; reviewQueue: number; warnings: number }> {
    let insights = 0;
    let personas = 0;
    let reviewQueue = 0;
    let warnings = 0;

    const existingPrefs = this.storage.memory.getAllPreferences().map((p) => p.body);
    const latest = this.storage.memory.getLatestPersona(profile);

    // L1 extraction
    const l1 = await this.extract(memory);
    if (l1) {
      const decision = await this.gate(memory.content, l1, existingPrefs, latest?.content);
      if (decision === "auto-merge" || decision === "merge-warning") {
        this.storage.memory.addInsight(memory.id, "L1", l1, { layer: "L1" });
        insights++;
        if (decision === "merge-warning") warnings++;
      } else {
        this.storage.memory.addReviewQueue("insight", l1, memory.id, 0, ["review_queue"]);
        reviewQueue++;
      }
    }

    // L2 scene synthesis
    const l2 = await this.synthesize(memory, l1);
    if (l2) {
      const decision = await this.gate(memory.content, l2, existingPrefs, latest?.content);
      if (decision === "auto-merge" || decision === "merge-warning") {
        this.storage.memory.addInsight(memory.id, "L2", l2, { layer: "L2" });
        insights++;
        if (decision === "merge-warning") warnings++;
      } else {
        this.storage.memory.addReviewQueue("insight", l2, memory.id, 0, ["review_queue"]);
        reviewQueue++;
      }
    }

    // L3 persona generation
    const l3 = await this.generatePersona(memory, l1, l2, profile);
    if (l3) {
      const decision = await this.gate(memory.content, l3, existingPrefs, latest?.content);
      if (decision === "auto-merge" || decision === "merge-warning") {
        this.storage.memory.addInsight(memory.id, "L3", l3, { layer: "L3" });
        this.storage.memory.savePersona(profile, l3);
        personas++;
        if (decision === "merge-warning") warnings++;
      } else {
        this.storage.memory.addReviewQueue("persona", l3, memory.id, 0, ["review_queue"]);
        reviewQueue++;
      }
    }

    this.storage.memory.markEnrichmentStatus(memory.id, "done");
    return { insights, personas, reviewQueue, warnings };
  }

  private async gate(source: string, output: string, existingPreferences: string[], previousPersona?: string): Promise<Decision> {
    const result = await validate({ source, output, existingPreferences, previousPersona });
    const { decision } = decide(result);
    return decision;
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
    return text || null;
  }
}
