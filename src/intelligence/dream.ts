import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CapricornStorage } from "../storage/index.ts";
import type { Memory, SourceType } from "../types.ts";
import { computeConfidenceDelta, clampConfidence } from "./confidence.ts";
import { parseSignalFile } from "../utils/signal.ts";
import { validate, decide } from "./validate.ts";

export interface DreamResult {
  processed: number;
  promoted: number;
  retired: number;
  created: number;
  reviewQueue: number;
  warnings: number;
}

export class DreamPipeline {
  constructor(private storage: CapricornStorage) {}

  async run(profile = "default", confidenceThreshold = 0.6, evidenceThreshold = 3): Promise<DreamResult> {
    const signals = this.scanInbox();
    let prefs = this.storage.memory.getAllPreferences();
    let processed = 0;
    let promoted = 0;
    let retired = 0;
    let created = 0;
    let reviewQueue = 0;
    let warnings = 0;

    for (const signal of signals) {
      // preference_evidence.memory_id is a real FK; signals discovered directly
      // from the vault must exist in memories before evidence is recorded.
      if (!this.storage.memory.getById(signal.id)) {
        this.storage.memory.importMemory(signal);
      }
      const match = await this.findMatch(signal, prefs);
      if (match) {
        this.applyEvidence(match, signal);
        processed++;
      } else {
        const decision = await this.gate(signal.content);
        if (decision === "auto-merge" || decision === "merge-warning") {
          this.createTrial(signal);
          created++;
          if (decision === "merge-warning") warnings++;
        } else {
          this.storage.memory.addReviewQueue("preference", signal.content, signal.id, 0, ["review_queue"]);
          reviewQueue++;
        }
        prefs = this.storage.memory.getAllPreferences();
      }
    }

    for (const pref of prefs) {
      const evidence = this.storage.memory.getPreferenceEvidence(pref.id);
      const applied = evidence.filter((e) => e.result === "applied").length;
      const violated = evidence.filter((e) => e.result === "violated").length;
      const latestEvidence = evidence.length > 0 ? evidence[evidence.length - 1].created_at : pref.created_at;
      const daysSince = (Date.now() - latestEvidence) / (1000 * 60 * 60 * 24);

      let confidence = 0;
      for (const e of evidence) {
        const days = (Date.now() - e.created_at) / (1000 * 60 * 60 * 24);
        const delta = computeConfidenceDelta(e.result as "applied" | "violated" | "outdated", e.source_type, days);
        confidence += delta.delta;
      }
      const decay = Math.exp(-0.05 * daysSince);
      confidence = clampConfidence(confidence * decay);

      if (pref.tier === "trial" && confidence >= confidenceThreshold && evidence.length >= evidenceThreshold) {
        this.storage.memory.updatePreferenceConfidence(pref.id, confidence, "confirmed");
        promoted++;
      } else if (pref.tier === "confirmed" && violated >= 3) {
        this.storage.memory.updatePreferenceConfidence(pref.id, Math.max(0, confidence - 0.3), "retired");
        retired++;
      } else {
        this.storage.memory.updatePreferenceConfidence(pref.id, confidence, pref.tier as "trial" | "confirmed" | "retired");
      }
    }

    this.regenerateActiveMd(profile);
    return { processed, promoted, retired, created, reviewQueue, warnings };
  }

  private async gate(source: string): Promise<"auto-merge" | "merge-warning" | "review-queue"> {
    const existing = this.storage.memory.getAllPreferences().map((p) => p.body);
    const result = await validate({ source, output: source, existingPreferences: existing });
    return decide(result).decision;
  }

  private scanInbox(): Memory[] {
    const inbox = join(this.storage.vaultPath, "Brain", "inbox");
    const signals: Memory[] = [];
    try {
      for (const entry of readdirSync(inbox, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const path = join(inbox, entry.name);
        try {
          const content = readFileSync(path, "utf8");
          const memory = parseSignalFile(content);
          if (memory) signals.push(memory);
        } catch (err) {
          console.error("capricorn: dream signal parse failed:", String(err));
        }
      }
    } catch (err) {
      console.error("capricorn: dream inbox read failed:", String(err));
    }
    return signals;
  }

  private async findMatch(signal: Memory, prefs: { id: string; body: string }[]): Promise<{ id: string; body: string } | null> {
    for (const pref of prefs) {
      if (signal.content.toLowerCase().includes(pref.body.toLowerCase().slice(0, 20))) {
        return pref;
      }
      // fall back to keyword overlap heuristic
      const wordsA = new Set(signal.content.toLowerCase().split(/\s+/).filter(Boolean));
      const wordsB = new Set(pref.body.toLowerCase().split(/\s+/).filter(Boolean));
      let common = 0;
      for (const w of wordsA) if (wordsB.has(w)) common++;
      if (common >= 2) return pref;
    }
    return null;
  }

  private applyEvidence(pref: { id: string; body: string }, signal: Memory) {
    const sourceType: SourceType = signal.source === "user" ? "user_explicit" : "agent_observation";
    const result = this.classifyResult(signal);
    this.storage.memory.addPreferenceEvidence(pref.id, signal.id, result, sourceType, signal.session_id);
  }

  private createTrial(signal: Memory) {
    const body = `Preference inferred from: ${signal.content.slice(0, 80)}`;
    const prefId = this.storage.memory.createPreference(body, signal.id);
    const sourceType: SourceType = signal.source === "user" ? "user_explicit" : "agent_observation";
    const result = this.classifyResult(signal);
    this.storage.memory.addPreferenceEvidence(prefId, signal.id, result, sourceType, signal.session_id);
  }

  private classifyResult(signal: Memory): "applied" | "violated" | "outdated" {
    const lower = signal.content.toLowerCase();
    if (lower.includes("not") || lower.includes("don't") || lower.includes("violated")) return "violated";
    if (lower.includes("outdated") || lower.includes("expired")) return "outdated";
    return "applied";
  }

  private regenerateActiveMd(profile: string) {
    const confirmed = this.storage.memory.getAllPreferences().filter((p) => p.tier === "confirmed");
    const persona = this.storage.memory.getLatestPersona(profile);

    const lines = ["# Active Capricorn Context", "", "## Preferences", ""];
    for (const pref of confirmed) {
      lines.push(`- ${pref.body} (confidence: ${pref.confidence.toFixed(2)})`);
    }
    lines.push("", "## Persona", "", persona?.content ?? "(none yet)");

    const dir = join(this.storage.vaultPath, "Brain");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "active.md"), lines.join("\n"));
  }
}
