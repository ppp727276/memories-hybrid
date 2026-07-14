import type { CapricornStorage } from "../storage/index.ts";

export interface McpTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: "capricorn.remember",
    description: "Store a memory",
    parameters: {
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
    parameters: {
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
    parameters: {
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
    parameters: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "capricorn.stats",
    description: "Memory statistics",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "capricorn.context",
    description: "Get distilled context for injection into agent system prompt",
    parameters: {
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
    parameters: {
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
    parameters: {
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
    parameters: {
      type: "object",
      required: ["content"],
      properties: { content: { type: "string" }, tags: { type: "array" } },
    },
  },
];
