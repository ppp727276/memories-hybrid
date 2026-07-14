import type { CapricornStorage } from "../storage/index.ts";

export async function handleTool(
  req: { method: string; params?: Record<string, unknown> },
  storage: CapricornStorage,
): Promise<unknown> {
  const { method, params = {} } = req;

  if (method === "capricorn.remember") {
    const content = String(params.content ?? "");
    if (!content) throw new Error("content required");
    const { memory, vaultPath } = storage.remember({
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
    return { results: storage.recall(query, topK, project) };
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
    const ok = storage.forget(id);
    return { id, status: ok ? "deleted" : "not_found" };
  }

  if (method === "capricorn.stats") {
    return storage.stats();
  }

  if (method === "capricorn.context") {
    const maxChars = Number(params.max_chars ?? 3000);
    const context = `Capricorn context (${maxChars} chars max)\nNo confirmed preferences yet.`;
    return { context, prefs_count: 0, persona_version: 0 };
  }

  if (method === "capricorn.ingest") {
    const memories = Array.isArray(params.memories) ? params.memories : [];
    const ids: string[] = [];
    for (const m of memories) {
      if (m && typeof m === "object" && "content" in m) {
        const { memory } = storage.remember({
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
    // Phase 1: no-op, stored for future Dream pass
    return { status: "recorded" };
  }

  if (method === "capricorn.brain_note") {
    const content = String(params.content ?? "");
    if (!content) throw new Error("content required");
    const { memory } = storage.remember({ content, source: "agent", tags: ["brain_note"] });
    return { id: memory.id, status: "stored" };
  }

  throw new Error(`unknown method: ${method}`);
}
