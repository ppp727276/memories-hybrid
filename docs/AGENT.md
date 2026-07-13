# Hybrid Memory Agent Setup

## Role
Agent (Hermes) adalah consumer dan producer signal bagi sistem hybrid memory. Agent menulis signal ke OSB vault, lalu bridge memproses signal tersebut menjadi persona.

## Integration Flow

```
User chat → Hermes → OSB captures signal → Cron runs bridge →
Forge enriches → persona-core.md updated → OSB injects active.md →
Next turn uses richer persona
```

## Required Hermes Config

`~/.hermes/config.yaml`:
```yaml
memory:
  provider: open-second-brain
```

OSB provider reads `vault`, `agent`, and `timezone` from its own config. Do **not** duplicate `vault_path` under the `memory:` block.

## Cron Entry

Tambahkan ke Hermes cron untuk run tiap 6 jam:

```yaml
cron:
  - name: hybrid-memory-bridge
    schedule: "0 */6 * * *"
    command: "cd ~/memories-hybrid && npx tsx bridge/src/bridge.ts --config bridge-config.json"
```

Or use the `cronjob` tool:
```
cronjob action='create' schedule='0 */6 * * *' prompt='cd ~/memories-hybrid && npx tsx bridge/src/bridge.ts --config bridge-config.json' name='hybrid-memory-bridge' enabled_toolsets='["terminal"]'
```

## Agent Behavior

1. **Write signals**: Saat user menyampaikan preferensi/fakta, agent menulis ke `Brain/inbox/<slug>.md` dengan frontmatter:
   ```yaml
   ---
   id: pref-dark-theme
   title: prefers dark theme
   timestamp: 1710000000000
   tags: [ui, preference]
   ---
   User prefers dark mode UI.
   ```

2. **Read active persona**: Sebelum reply, OSB injects `Brain/active.md` ke system prompt. Agent gunakan persona tersebut untuk tone/context.

3. **Do not manually edit persona-core.md**: Edit manual harus dibungkus dengan `<!-- status: frozen -->` agar tidak tertimpa.

4. **Do not reprocess signals**: Bridge mengurus checkpoint. Agent tidak perlu tracking.

## Tools / Commands

- `npx tsx bridge/src/bridge.ts --config bridge-config.json --dry-run` — preview input.
- `npx tsx bridge/src/bridge.ts --config bridge-config.json` — run bridge.
- `bash scripts/backup.sh` — backup vault.

## Fallback
Kalau bridge gagal:
- Continue pakai OSB-only.
- User edit `persona-core.md` manual dengan frozen markers.