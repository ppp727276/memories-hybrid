import type { CapricornStorage } from "../storage/index.ts";
import { loadConfig } from "../config.ts";
import { createLLMRunner } from "../intelligence/index.ts";

export async function handleTool(
  req: { method: string; params?: Record<string, unknown> },
  storage: CapricornStorage,
): Promise<unknown> {
  const { method, params = {} } = req;

  if (method === "capricorn.remember") {
    const content = String(params.content ?? "");
    if (!content) throw new Error("content required");
    const { memory, vaultPath } = await storage.remember({
      content,
      source: params.source ? String(params.source) : "agent",
      project: params.project ? String(params.project) : undefined,
      session_id: params.session_id ? String(params.session_id) : undefined,
      tags: Array.isArray(params.tags) ? params.tags.map(String) : undefined,
      metadata: params.metadata && typeof params.metadata === "object" ? (params.metadata as Record<string, unknown>) : {},
    });
    return { id: memory.id, status: "stored", vaultPath };
  }

  if (method === "capricorn.recall") {
    const query = String(params.query ?? "");
    const topK = Number(params.top_k ?? 5);
    const project = params.project ? String(params.project) : null;
    return { results: await storage.recall(query, topK, project) };
  }

  if (method === "capricorn.search") {
    const query = String(params.query ?? "");
    const limit = Number(params.limit ?? 10);
    const project = params.project ? String(params.project) : null;
    return { results: storage.search(query, limit, project) };
  }

  if (method === "capricorn.forget") {
    const id = String(params.id ?? "");
    if (!id) throw new Error("id required");
    const ok = await storage.forget(id);
    return { id, status: ok ? "deleted" : "not_found" };
  }

  if (method === "capricorn.stats") {
    return storage.stats();
  }

  if (method === "capricorn.context") {
    const maxChars = Number(params.max_chars ?? 3000);
    const profile = String(params.profile ?? "default");
    const confirmed = storage.memory.getAllPreferences().filter((p) => p.tier === "confirmed");
    const persona = storage.memory.getLatestPersona(profile);
    const lines: string[] = [];
    lines.push(`# Capricorn Context`);
    if (persona?.content) {
      lines.push(`## Persona`);
      lines.push(persona.content);
      lines.push(``);
    }
    lines.push(`## Preferences (${confirmed.length} confirmed)`);
    for (const pref of confirmed.slice(0, 20)) {
      lines.push(`- ${pref.body} (confidence: ${pref.confidence.toFixed(2)})`);
    }
    let context = lines.join("\n").slice(0, maxChars);
    if (context.length >= maxChars) context = context.slice(0, maxChars - 3) + "...";
    return { context, prefs_count: confirmed.length, persona_version: persona?.version ?? 0 };
  }

  if (method === "capricorn.ingest") {
    const memories = Array.isArray(params.memories) ? params.memories : [];
    const ids: string[] = [];
    for (const m of memories) {
      if (m && typeof m === "object" && "content" in m) {
        const { memory } = await storage.remember({
          content: String(m.content),
          source: "agent",
          tags: Array.isArray(m.tags) ? m.tags.map(String) : undefined,
          project: m.project ? String(m.project) : undefined,
        });
        ids.push(memory.id);
      }
    }
    return { imported: ids.length, ids };
  }

  if (method === "capricorn.brain_feedback") {
    const pref_id = String(params.pref_id ?? "");
    const result = String(params.result ?? "");
    if (!pref_id) throw new Error("pref_id required");
    if (!["applied", "violated", "outdated"].includes(result)) {
      throw new Error(`result must be one of: applied, violated, outdated (got ${result})`);
    }
    const { memory } = await storage.remember({
      content: `Feedback: preference ${pref_id} marked ${result}`,
      source: "agent",
      tags: ["brain_feedback", result],
      metadata: { pref_id, result },
    });
    return { id: memory.id, status: "recorded" };
  }

  if (method === "capricorn.brain_note") {
    const content = String(params.content ?? "");
    if (!content) throw new Error("content required");
    const { memory } = await storage.remember({ content, source: "agent", tags: ["brain_note"] });
    return { id: memory.id, status: "stored" };
  }

  if (method === "capricorn.bridge") {
    const profile = String(params.profile ?? "default");
    const batch_size = Number(params.batch_size ?? 10);
    const { createLLMRunner, ForgePipeline } = await import("../intelligence/index.ts");
    const llm = createLLMRunner(loadConfig());
    const forge = new ForgePipeline(storage, llm);
    const result = await forge.run(profile, batch_size);
    return { status: "bridge_complete", result };
  }

  if (method === "capricorn.dream") {
    const profile = String(params.profile ?? "default");
    const { DreamPipeline } = await import("../intelligence/index.ts");
    const dream = new DreamPipeline(storage);
    const result = await dream.run(profile);
    return { status: "dream_complete", result };
  }

  if (method === "capricorn.sync") {
    const { VaultSync } = await import("../storage/index.ts");
    const sync = new VaultSync(storage);
    const result = sync.sync();
    return { status: "sync_complete", result };
  }

  if (method === "capricorn.explain") {
    const id = String(params.id ?? "");
    if (!id) throw new Error("id required");
    const memory = storage.memory.getById(id);
    const insights = storage.memory.getInsights(id);
    return { id, memory, insights };
  }

  if (method === "capricorn.enrich") {
    const id = String(params.id ?? "");
    if (!id) throw new Error("id required");
    const memory = storage.memory.getById(id);
    if (!memory) throw new Error("memory not found");
    const { createLLMRunner, ForgePipeline } = await import("../intelligence/index.ts");
    const llm = createLLMRunner(loadConfig());
    const forge = new ForgePipeline(storage, llm);
    const result = await forge.enrich(id);
    return { status: "enrich_complete", result };
  }

  if (method === "capricorn.prompt_ops") {
    const sub = String(params.sub ?? "report");
    const task = String(params.task ?? "context");
    if (sub === "list") {
      return { task, variants: storage.promptOps.getVariants(task) };
    }
    if (sub === "report") {
      return { task, report: storage.promptOps.report(task) };
    }
    if (sub === "create") {
      const name = String(params.name ?? "");
      const template = String(params.template ?? "");
      if (!name || !template) throw new Error("name and template required");
      return { task, variant: storage.promptOps.createVariant(task, name, template) };
    }
    if (sub === "record") {
      const variantId = String(params.variant_id ?? "");
      const score = Number(params.score ?? 0);
      const input = String(params.input ?? "");
      const output = String(params.output ?? "");
      if (!variantId) throw new Error("variant_id required");
      return { task, outcome: storage.promptOps.recordOutcome(variantId, input, output, score, typeof params.metadata === "object" && params.metadata !== null ? (params.metadata as Record<string, unknown>) : {}) };
    }
    if (sub === "duel") {
      const winner = String(params.winner ?? "");
      const loser = String(params.loser ?? "");
      if (!winner || !loser) throw new Error("winner and loser required");
      storage.promptOps.recordDuel(winner, loser);
      return { status: "duel_recorded", winner, loser };
    }
    throw new Error(`unknown prompt_ops subcommand: ${sub}`);
  }

  if (method === "capricorn.bridgeOsb") {
    const { OsbBridge } = await import("../bridge/osb.ts");
    const config = loadConfig();
    const dryRun = params.dry_run === true || params.dryRun === true;
    const runner = async () => {
      const llm = createLLMRunner(config);
      const { ForgePipeline } = await import("../intelligence/forge.ts");
      const forge = new ForgePipeline(storage, llm);
      await forge.run("default", config.intelligence.forge.batch_size);
    };
    const bridge = new OsbBridge(storage, config.bridge!, runner);
    const result = await bridge.run(dryRun);
    return { status: "bridge_osb_complete", result };
  }

  if (method === "capricorn.review") {
    const sub = String(params.sub ?? "list");
    if (sub === "list") {
      const status = params.status ? String(params.status) : null;
      const limit = Number(params.limit ?? 100);
      const items = storage.memory.getReviewQueue(status, limit);
      return { status: "review_list", count: items.length, items };
    }
    if (sub === "resolve") {
      const id = String(params.id ?? "");
      if (!id) throw new Error("id required");
      storage.memory.updateReviewStatus(id, "resolved");
      return { status: "review_resolved", id };
    }
    if (sub === "dismiss") {
      const id = String(params.id ?? "");
      if (!id) throw new Error("id required");
      storage.memory.updateReviewStatus(id, "dismissed");
      return { status: "review_dismissed", id };
    }
    throw new Error(`unknown review subcommand: ${sub}`);
  }

  throw new Error(`unknown method: ${method}`);
}
