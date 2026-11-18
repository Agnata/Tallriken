// Photos, e.g. of a feast: upload, owner only, delete, and restore from a backup.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import { openDb } from "../server/db.js";
import { hashPassword } from "../server/auth.js";
import { createMailer } from "../server/mailer.js";
import { createBackup, restoreBackup } from "../server/backups.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
const dataUrl = (buf, type = "jpeg") => `data:image/${type};base64,${buf.toString("base64")}`;
let server, base, db, dataDir;
const cookies = {};

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-photos-"));
  db = openDb(":memory:");
  console.log = () => {};
  for (const [e, n] of [["a@example.se", "Anna"], ["b@example.se", "Bertil"]]) {
    db.prepare("INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)").run(e, n, hashPassword("hemligt-losenord"));
  }
  const config = { dbPath: ":memory:", production: false, origin: "", sessionDays: 1, baseUrl: "https://t.test", dataDir,
    backupDir: path.join(dataDir, "backups"), backupKeep: 5, loginLimit: 1000, offsiteTarget: "", mail: {} };
  server = createApp(config, db, createMailer({})).listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const e of ["a@example.se", "b@example.se"]) {
    const r = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, password: "hemligt-losenord" }) });
    cookies[e] = r.headers.get("set-cookie").split(";")[0];
  }
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const as = (who, p, opts = {}) => fetch(base + p, { ...opts, headers: { Cookie: cookies[who], ...(opts.body ? { "Content-Type": "application/json" } : {}) } });
const upload = (who, data) => as(who, "/api/photos", { method: "POST", body: JSON.stringify({ data }) });

test("upload a photo, see it, others cannot", async () => {
  const r = await upload("a@example.se", dataUrl(JPEG));
  assert.equal(r.status, 201);
  const { id } = await r.json();
  assert.match(id, /^[0-9a-f]{32}$/);
  const got = await as("a@example.se", `/api/photos/${id}`);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), JPEG);
  assert.equal((await as("b@example.se", `/api/photos/${id}`)).status, 404, "another user");
  assert.equal((await fetch(`${base}/api/photos/${id}`)).status, 401, "not signed in");
});

test("only real images, not too large", async () => {
  assert.equal((await upload("a@example.se", "inte en bild")).status, 400);
  assert.equal((await upload("a@example.se", dataUrl(Buffer.from("<svg onload=x>"), "svg+xml"))).status, 400, "content decides, not the label");
  const big = Buffer.alloc(3.5 * 1024 * 1024, 0); JPEG.copy(big);
  assert.equal((await upload("a@example.se", dataUrl(big))).status, 413);
});

test("delete, and a backup restores the photo", async () => {
  const { id } = await (await upload("a@example.se", dataUrl(JPEG))).json();
  const b = createBackup(db, path.join(dataDir, "backups"), 5, new Date());
  assert.equal((await as("a@example.se", `/api/photos/${id}`, { method: "DELETE" })).status, 204);
  assert.equal((await as("a@example.se", `/api/photos/${id}`)).status, 404);
  restoreBackup(db, path.join(dataDir, "backups"), b.name, 5);
  assert.equal((await as("a@example.se", `/api/photos/${id}`)).status, 200);
});

test("deleting a user deletes their photos", async () => {
  const id = db.prepare("SELECT id FROM users WHERE email = 'b@example.se'").get().id;
  await upload("b@example.se", dataUrl(JPEG));
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photos WHERE user_id = ?").get(id).n, 0);
});
