import type { Preference } from "../types.ts";

const ANTONYMS: [string, string][] = [
  ["dark", "light"],
  ["light", "dark"],
  ["yes", "no"],
  ["no", "yes"],
  ["always", "never"],
  ["never", "always"],
  ["love", "hate"],
  ["hate", "love"],
  ["fast", "slow"],
  ["slow", "fast"],
];

export interface Conflict {
  prefA: string;
  prefB: string;
  reason: string;
}

export function detectConflicts(preferences: Preference[]): Conflict[] {
  const confirmed = preferences.filter((p) => p.tier === "confirmed");
  const conflicts: Conflict[] = [];
  for (let i = 0; i < confirmed.length; i++) {
    for (let j = i + 1; j < confirmed.length; j++) {
      const a = confirmed[i].body.toLowerCase();
      const b = confirmed[j].body.toLowerCase();
      for (const [wordA, wordB] of ANTONYMS) {
        if (a.includes(wordA) && b.includes(wordB)) {
          conflicts.push({
            prefA: confirmed[i].id,
            prefB: confirmed[j].id,
            reason: `antonym pair: ${wordA}/${wordB}`,
          });
        }
      }
    }
  }
  return conflicts;
}
