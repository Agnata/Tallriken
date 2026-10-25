import { stockholm } from "./clock.js";
import { createBackup, listBackups } from "./backups.js";
import { getMeta, setMeta } from "./db.js";

const BACKUP_HOUR = 3;

// Runs inside the Node service, checked every minute (no cron needed):
//  - backup: the first time none exists, then daily from 03:00 Swedish time; after a failure,
//    wait at least an hour.
//  - Withings: once an hour, fetch weighings for anyone not synced in 6 hours, in case a
//    notification from Withings was lost.
//  - Livsmedelsverket: fetch the food database when there is none, then monthly at 04:00;
//    at most one attempt a day.
export function startScheduler(db, config, withings = null, foods = null) {
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

      if (foods?.due() && getMeta(db, "foods_tried") !== sthlm.date && (foods.status().count === 0 || sthlm.hour === 4)) {
        setMeta(db, "foods_tried", sthlm.date);
        foods.refresh().catch(err => console.error("Livsmedelsverket:", err.message));
      }

      const hourKey = `${sthlm.date} ${sthlm.hour}`;
      if (withings?.enabled && getMeta(db, "withings_hour") !== hourKey) {
        setMeta(db, "withings_hour", hourKey);
        const r = await withings.syncStale(6);
        if (r.failed) console.log(`Withings: ${r.ok} hämtade, ${r.failed} misslyckade.`);
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
