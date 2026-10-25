// Takes a backup right away (the service also does this every night by itself).
// Usage: npm run backup
import { config } from "../server/config.js";
import { openDb } from "../server/db.js";
import { createBackup } from "../server/backups.js";

const db = openDb(config.dbPath);
const b = createBackup(db, config.backupDir, config.backupKeep, new Date());
console.log(`Backup: ${config.backupDir}/${b.name} (${b.users} användare, ${(b.size / 1024).toFixed(0)} kB)`);
