/**
 * Convert OSB signals into a TencentDB seed-compatible conversation format.
 *
 * Each signal is framed as a short user/assistant exchange. This is still
 * synthetic, but it preserves the factual nature of the signal without
 * inventing a fake question that the LLM might misinterpret.
 */

import type { SeedInput, Signal } from "./types.js";

export interface ConvertOptions {
  sessionKey?: string;
}

export function signalsToSeedInput(
  signals: Signal[],
  opts: ConvertOptions = {},
): SeedInput {
  const sessionKey = opts.sessionKey ?? "hybrid-bridge";

  const conversations = signals
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((signal) => {
      const ts = signal.timestamp;
      const userContent = signal.content.trim();

      return [
        {
          role: "user" as const,
          content: `Just so you know, ${userContent}`,
          timestamp: ts,
        },
        {
          role: "assistant" as const,
          content: "Understood. I'll remember that.",
          timestamp: ts + 1,
        },
      ];
    });

  return {
    sessions: [
      {
        sessionKey,
        sessionId: sessionKey,
        conversations,
      },
    ],
  };
}

export function parseSignalFiles(files: string[]): Signal[] {
  // Placeholder: actual implementation will parse OSB signal markdown files.
  // Expected format per file:
  //   ---
  //   id: sig-001
  //   title: type-hints
  //   timestamp: 1710000000000
  //   tags: [preference]
  //   ---
  //   User prefers Python type hints on public functions.
  return [];
}
