import { CapricornStorage } from "../storage/index.ts";
import { loadConfig } from "../config.ts";
import { handleTool } from "./tools.ts";
import { MCP_TOOLS } from "./tool-defs.ts";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

function makeSuccess(id: number | string | undefined, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function makeError(id: number | string | undefined, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function startMcpServer() {
  const config = loadConfig();
  const storage = new CapricornStorage(config.storage.db_path, config.vault.path);

  let buffer = "";
  let active = 0;
  const MAX_LINE = 1_000_000;
  const MAX_CONCURRENT = 8;
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    if (buffer.length > MAX_LINE) {
      buffer = "";
      process.stdout.write(JSON.stringify(makeError(undefined, -32600, "request too large")) + "\n");
      return;
    }
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      if (line.length > MAX_LINE) continue;
      if (active >= MAX_CONCURRENT) {
        process.stdout.write(JSON.stringify(makeError(undefined, -32000, "server busy")) + "\n");
        continue;
      }
      let req: JsonRpcRequest;
      try {
        req = JSON.parse(line) as JsonRpcRequest;
      } catch (err) {
        process.stdout.write(JSON.stringify(makeError(undefined, -32700, "Parse error: " + String(err))) + "\n");
        continue;
      }
      const isNotification = req.id === undefined;
      active++;
      handleMcpRequest(req, storage)
        .then((result) => {
          if (isNotification) return; // never respond to notifications
          const res = makeSuccess(req.id, result);
          process.stdout.write(JSON.stringify(res) + "\n");
        })
        .catch((err) => {
          if (isNotification) return;
          const res = makeError(req.id, -32000, err instanceof Error ? err.message : String(err));
          process.stdout.write(JSON.stringify(res) + "\n");
        }).finally(() => { active--; });
    }
  });
}

async function handleMcpRequest(
  req: JsonRpcRequest,
  storage: CapricornStorage,
): Promise<unknown> {
  if (req.method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "capricorn", version: "0.1.0" },
    };
  }
  if (req.method === "initialized" || req.method === "notifications/initialized") {
    return {};
  }
  if (req.method === "tools/list") {
    return { tools: MCP_TOOLS };
  }
  return handleTool(req, storage);
}

if (import.meta.main) {
  startMcpServer();
}