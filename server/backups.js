import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { schemaVersion } from "./db.js";

// Each backup is a directory  tallriken-YYYYMMDD-HHMMSS/  with tallriken.db (a consistent copy made by
// SQLite's VACUUM INTO, safe while the app runs) and manifest.json. While being written the directory
// ends in .partial, so unfinished backups are never listed, restored or copied offsite.
const NAME = /^tallriken-\d{8}-\d{6}$/;
const FILE = "tallriken.db";

const sha256File = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

export function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n => NAME.test(n)).sort().reverse().flatMap(name => {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, name, "manifest.json"), "utf8"));
      return [{ name, ...manifest }];
    } catch { return []; }
  });
}

export function backupFile(dir, name) {
  if (!NAME.test(String(name))) return null;
  const file = path.join(dir, name, FILE);
  return fs.existsSync(file) ? file : null;
}

export function createBackup(db, dir, keep = 30, now = new Date()) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name = "tallriken-" + now.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const partial = path.join(dir, name + ".partial");
  const final = path.join(dir, name);
  if (fs.existsSync(final)) throw new Error(`Backupen ${name} finns redan.`);
  fs.rmSync(partial, { recursive: true, force: true });
  fs.mkdirSync(partial);
  try {
    const file = path.join(partial, FILE);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const manifest = {
      app: "tallriken",
      created: now.toISOString(),
      schema: schemaVersion(db),
      file: FILE,
      size: fs.statSync(file).size,
      sha256: sha256File(file),
      users: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
      documents: db.prepare("SELECT COUNT(*) AS n FROM user_data").get().n,
    };
    fs.writeFileSync(path.join(partial, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    fs.renameSync(partial, final);
    prune(dir, keep);
    return { name, ...manifest };
  } catch (err) {
    fs.rmSync(partial, { recursive: true, force: true });
    throw err;
  }
}

// Keeps the newest `keep` complete backups and removes leftovers from interrupted runs.
function prune(dir, keep) {
  for (const b of listBackups(dir).slice(keep)) fs.rmSync(path.join(dir, b.name), { recursive: true, force: true });
  for (const n of fs.readdirSync(dir)) {
    if (!n.endsWith(".partial")) continue;
    const p = path.join(dir, n);
    if (Date.now() - fs.statSync(p).mtimeMs > 36e5) fs.rmSync(p, { recursive: true, force: true });
  }
}

export function verifyBackup(dir, name) {
  const b = listBackups(dir).find(x => x.name === name);
  const file = backupFile(dir, name);
  return !!(b && file && sha256File(file) === b.sha256);
}

// Written by deploy/tallriken-backup-offsite.sh after each rsync run.
export function offsiteStatus(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, "offsite.json"), "utf8")); } catch { return null; }
}

// Restores everyone's Tallriken data from a backup. Accounts, sessions and two-step settings are
// left alone so nobody is locked out; data for users that no longer exist is skipped. A rescue
// backup of the current state is taken first. Versions are bumped so open apps notice the change.
export function restoreBackup(db, dir, name, keep = 30) {
  const backup = listBackups(dir).find(b => b.name === name);
  const file = backupFile(dir, name);
  if (!backup || !file) throw new Error("Backupen finns inte.");
  if (sha256File(file) !== backup.sha256) throw new Error("Kontrollsumman stämmer inte. Backupen kan vara skadad.");
  if (backup.schema > schemaVersion(db)) throw new Error("Backupen kommer från en nyare version av appen.");

  let rescue;
  for (let i = 0; !rescue; i++) {
    try { rescue = createBackup(db, dir, keep + 1, new Date(Date.now() + i * 1000)); }
    catch (err) { if (i >= 5 || !/finns redan/.test(err.message)) throw err; }
  }

  db.prepare("ATTACH DATABASE ? AS src").run(file);
  try {
    const old = new Map(db.prepare("SELECT user_id, version FROM main.user_data").all().map(r => [r.user_id, r.version]));
    const rows = db.prepare("SELECT user_id, data, updated_at FROM src.user_data WHERE user_id IN (SELECT id FROM main.users)").all();
    const insert = db.prepare("INSERT INTO main.user_data (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("DELETE FROM main.user_data");
      for (const r of rows) insert.run(r.user_id, r.data, (old.get(r.user_id) || 0) + 1, r.updated_at);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } finally {
    db.exec("DETACH DATABASE src");
  }
  const documents = db.prepare("SELECT COUNT(*) AS n FROM user_data").get().n;
  return { restored: name, rescue: rescue.name, documents };
}
