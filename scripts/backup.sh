#!/usr/bin/env bash
# Daily backup of Hermes memories vault.
# Run via cron or Hermes cronjob.
# Usage: bash scripts/backup.sh

set -uo pipefail

VAULT="C:/Users/rprad/Documents/second-brain-memory"
BACKUP_BASE="C:/Users/rprad/backups/second-brain-memory"
DATE=$(date +%Y-%m-%d)
DEST="$BACKUP_BASE/$DATE"

mkdir -p "$BACKUP_BASE"

# /E = include subdirectories (including empty)
# /R:3 = retry 3 times
# /W:10 = wait 10 seconds between retries
# NO /MIR — we never delete from backup snapshots
# No set -e: robocopy returns 0-7 for success, set -e would kill on 1-7.
MSYS_NO_PATHCONV=1 robocopy "$VAULT" "$DEST" /E /R:3 /W:10
RC=$?

# Robocopy exit codes 0-7 indicate success (1 = files copied, etc.)
if [ $RC -le 7 ]; then
  echo "Backup completed: $DEST"
  exit 0
else
  echo "Backup failed with robocopy exit code $RC" >&2
  exit $RC
fi
