import { stockholm } from "./clock.js";
import { createBackup, listBackups } from "./backups.js";
import { getMeta, setMeta } from "./db.js";

const BACKUP_HOUR = 3;

// Runs inside the Node service, checked every minute (no cron needed): a backup the first time
// none exists, then daily from 03:00 Swedish time; after a failure, wait at least an hour.
export function startScheduler(db, config) {
  let running = false;

  async function tick(now = new Date()) {
    if (running) return;
    running = true;
    try {
      const sthlm = stockholm(now);
      const last = listBackups(config.backupDir)[0];
      const failedAt = getMeta(db, "backup_failed_at");
      const due = !last || (stockholm(new Date(last.created)).date < sthlm.date && sthlm.hour >= BACKUP_HOUR);
      if (due && !(failedAt && now - new Date(failedAt) < 36e5)) {
        try {
          const b = createBackup(db, config.backupDir, config.backupKeep, now);
          setMeta(db, "backup_error", "");
          setMeta(db, "backup_failed_at", "");
          console.log(`Backup klar: ${b.name}`);
        } catch (err) {
          setMeta(db, "backup_error", err.message);
          setMeta(db, "backup_failed_at", now.toISOString());
          console.error("Backup misslyckades:", err.message);
        }
      }
    } catch (err) {
      console.error("Schemaläggaren:", err);
    } finally {
      running = false;
    }
  }

  setTimeout(tick, 5000).unref();
  setInterval(tick, 60_000).unref();
  return { tick };
}
