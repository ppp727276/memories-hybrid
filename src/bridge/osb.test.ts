import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "bun:test";
import { CapricornStorage } from "../storage/index.ts";
import { OsbBridge } from "./osb.ts";

describe("OsbBridge", () => {
  it("ingests signals and merges persona preserving frozen blocks", async () => {
    const root = mkdtempSync(join(tmpdir(), "osb-"));
    const inboxDir = join(root, "Brain", "inbox");
    mkdirSync(inboxDir, { recursive: true });

    const signalMd = `---
id: sig-test
title: Test Signal
tags: [preference]
---
User prefers concise output.
`;
    writeFileSync(join(inboxDir, "sig-test.md"), signalMd, "utf-8");

    const personaTarget = join(root, "Brain", "personas", "persona-core.md");
    const config = {
      osb_vault_path: root,
      osb_inbox_glob: "Brain/inbox/**/*.md",
      osb_persona_target: personaTarget,
      osb_profile: "default",
    };

    const storage = new CapricornStorage(join(root, "capricorn.db"), join(root, "vault"), {
      vault: { path: join(root, "vault"), auto_sync: false },
      storage: {
        db_path: join(root, "capricorn.db"),
        vector_provider: "none" as const,
        vector_model: "local",
        vector_dimensions: 384,
      },
      intelligence: {
        forge: { enabled: false, schedule: "", llm_provider: "none", llm_model: "", embedding_provider: "none", embedding_model: "", batch_size: 10 },
        dream: { enabled: false, schedule: "", confidence_threshold_confirm: 0.6, evidence_threshold_confirm: 3 },
      },
      mcp: { enabled: false, transport: "stdio" as const },
      http: { enabled: false, port: 0, host: "" },
    });

    let runCalled = false;
    const runner = async () => {
      runCalled = true;
      storage.memory.savePersona("default", "Concise and direct.");
    };

    const bridge = new OsbBridge(storage, config, runner);
    const result = await bridge.run(false);

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.newSignals).toBe(1);
    expect(result.personaWritten).toBe(true);
    expect(runCalled).toBe(true);

    const all = storage.search("User prefers", 10);
    expect(all.length).toBe(1);
    expect(all[0].content).toBe("User prefers concise output.");

    const personaContent = readFileSync(personaTarget, "utf-8");
    expect(personaContent).toContain("Concise and direct.");

    // Re-run should skip already processed signals
    const result2 = await bridge.run(false);
    expect(result2.processed).toBe(0);
    expect(result2.skipped).toBe(1);

    storage.close();
  });
});
