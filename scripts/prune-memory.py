#!/usr/bin/env python3
"""
Auto-prune MEMORY.md — Opsi A: trim oldest entries if > 2000 chars.
Safety: never prune if < 3 entries remaining.

Usage: python scripts/prune-memory.py
"""

import os
import sys
from pathlib import Path

MEMORY = Path(os.environ.get("APPDATA", "")) / "hermes" / "memories" / "MEMORY.md"
MAX_CHARS = 2000
MIN_ENTRIES = 3


def read_entries():
    if not MEMORY.exists():
        return None, []
    content = MEMORY.read_text(encoding="utf-8")
    sections = content.split("§")
    entries = []
    for s in sections:
        text = s.strip()
        if text and text != "x":
            entries.append(text)
    return content, entries


def main():
    original, entries = read_entries()
    if original is None:
        print("MEMORY.md not found")
        return 0

    if len(entries) <= MIN_ENTRIES:
        print(f"Only {len(entries)} entries, nothing to prune")
        return 0

    current_size = len(original)
    if current_size <= MAX_CHARS:
        print(f"Size {current_size} <= {MAX_CHARS}, nothing to prune")
        return 0

    # Keep latest entries, trim oldest until under threshold
    kept = entries.copy()
    removed = 0
    while len(kept) > MIN_ENTRIES:
        test = "x\n" + "".join(f"§\n{e}\n" for e in kept)
        if len(test) <= MAX_CHARS:
            break
        kept.pop(0)  # remove oldest
        removed += 1

    if removed == 0:
        print(f"Can't prune without dropping below {MIN_ENTRIES} entries")
        return 0

    new_content = "x\n" + "".join(f"§\n{e}\n" for e in kept)
    MEMORY.write_text(new_content, encoding="utf-8")

    print(f"Pruned: {removed} oldest entries removed, {len(kept)} kept")
    print(f"Size: {len(original)} → {len(new_content)} chars (-{len(original) - len(new_content)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())