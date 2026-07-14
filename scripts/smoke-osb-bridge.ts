import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CapricornStorage } from "../src/storage/index.ts";
import { OsbBridge } from "../src/bridge/osb.ts";

const root = mkdtempSync(join(tmpdir(), "osb-smoke-"));
const inboxDir = join(root, "Brain", "inbox");
mkdirSync(inboxDir, { recursive: true });

const signalMd = `---
id: sig-smoke
title: Smoke Signal
tags: [preference]
---
User prefers test-driven workflows.
`;
writeFileSync(join(inboxDir, "sig-smoke.md"), signalMd, "utf-8");

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

const runner = async () => {
  storage.memory.savePersona("default", "Test-driven and rigorous.");
};

const bridge = new OsbBridge(storage, config, runner);
const result = await bridge.run(false);

if (result.processed !== 1 || result.newSignals !== 1 || !result.personaWritten) {
  console.error("OSB BRIDGE SMOKE FAIL", result);
  process.exit(1);
}

const personaContent = readFileSync(personaTarget, "utf-8");
if (!personaContent.includes("Test-driven and rigorous.")) {
  console.error("OSB BRIDGE SMOKE FAIL: persona not merged");
  process.exit(1);
}

console.log("OSB BRIDGE SMOKE PASS", result);
storage.close();
