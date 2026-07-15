import type { CapricornStorage } from "../storage/index.ts";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: "capricorn.remember",
    description: "Store a memory",
    inputSchema: {
      type: "object",
      required: ["content"],
      properties: {
        content: { type: "string" },
        source: { type: "string" },
        session_id: { type: "string" },
        project: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        metadata: { type: "object" },
      },
    },
  },
  {
    name: "capricorn.recall",
    description: "Recall memories by keyword",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        top_k: { type: "integer", default: 5 },
        project: { type: "string" },
      },
    },
  },
  {
    name: "capricorn.search",
    description: "Full-text keyword search",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        limit: { type: "integer", default: 10 },
        project: { type: "string" },
      },
    },
  },
  {
    name: "capricorn.forget",
    description: "Delete a memory",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "capricorn.stats",
    description: "Memory statistics",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "capricorn.context",
    description: "Get distilled context for injection into agent system prompt",
    inputSchema: {
      type: "object",
      properties: {
        profile: { type: "string", default: "default" },
        max_chars: { type: "integer", default: 3000 },
      },
    },
  },
  {
    name: "capricorn.ingest",
    description: "Bulk import memories",
    inputSchema: {
      type: "object",
      required: ["memories"],
      properties: {
        memories: { type: "array" },
        project: { type: "string" },
      },
    },
  },
  {
    name: "capricorn.brain_feedback",
    description: "Record user feedback on a preference",
    inputSchema: {
      type: "object",
      required: ["pref_id", "result"],
      properties: {
        pref_id: { type: "string" },
        result: { type: "string", enum: ["applied", "violated", "outdated"] },
      },
    },
  },
  {
    name: "capricorn.brain_note",
    description: "Record a narrative milestone",
    inputSchema: {
      type: "object",
      required: ["content"],
      properties: { content: { type: "string" }, tags: { type: "array" } },
    },
  },
  {
    name: "capricorn.bridge",
    description: "Run the Forge enrichment pipeline on unprocessed memories",
    inputSchema: {
      type: "object",
      properties: {
        profile: { type: "string", default: "default" },
        batch_size: { type: "integer", default: 10 },
      },
    },
  },
  {
    name: "capricorn.dream",
    description: "Run the Dream preference compounding pass",
    inputSchema: {
      type: "object",
      properties: {
        profile: { type: "string", default: "default" },
      },
    },
  },
  {
    name: "capricorn.sync",
    description: "Synchronize vault markdown files with SQLite storage",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "capricorn.explain",
    description: "Explain why a memory exists and list its insights",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "capricorn.enrich",
    description: "Run enrichment on a specific memory",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "capricorn.prompt_ops",
    description: "Prompt optimization operations: list, report, create, record, duel",
    inputSchema: {
      type: "object",
      required: [],
      properties: {
        sub: { type: "string", enum: ["list", "report", "create", "record", "duel"], default: "report" },
        task: { type: "string", default: "context" },
        name: { type: "string" },
        template: { type: "string" },
        variant_id: { type: "string" },
        score: { type: "number" },
        input: { type: "string" },
        output: { type: "string" },
        winner: { type: "string" },
        loser: { type: "string" },
        metadata: { type: "object" },
      },
    },
  },
  {
    name: "capricorn.bridgeOsb",
    description: "Run OSB bridge: ingest signals, enrich, and merge persona",
    inputSchema: {
      type: "object",
      required: [],
      properties: {
        dry_run: { type: "boolean", description: "Run without writing files" },
      },
    },
  },
  {
    name: "capricorn.review",
    description: "List, resolve, or dismiss review queue items from the validation layer",
    inputSchema: {
      type: "object",
      required: [],
      properties: {
        sub: { type: "string", enum: ["list", "resolve", "dismiss"], default: "list" },
        id: { type: "string" },
        status: { type: "string", enum: ["pending", "resolved", "dismissed"], description: "Filter list by status" },
        limit: { type: "integer", default: 100 },
      },
    },
  },
  {
    name: "capricorn.health",
    description: "Run health check: DB, vault, LLM, embedding, disk",
    inputSchema: { type: "object", properties: {} },
  },
]
