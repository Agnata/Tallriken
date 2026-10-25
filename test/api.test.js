import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { openDb } from "../server/db.js";
import { hashPassword } from "../server/auth.js";
import { createMailer } from "../server/mailer.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-test-"));
const config = { dbPath: ":memory:", production: false, origin: "", sessionDays: 1, baseUrl: "https://tallriken.test",
  dataDir, backupDir: path.join(dataDir, "backups"), backupKeep: 2, loginLimit: 1000, offsiteTarget: "", mail: {} };
let server, base, db, mailer, cookie = "", annaRecovery = [];

before(async () => {
  db = openDb(":memory:");
  mailer = createMailer({});
  console.log = () => {}; // the unconfigured mailer logs every message
  db.prepare("INSERT INTO users (email, name, password_hash, is_admin) VALUES (?, ?, ?, 1)").run("a@example.se", "Anna", hashPassword("hemligt-losenord"));
  server = createApp(config, db, mailer).listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const call = (path, { method = "GET", body, headers = {} } = {}) => fetch(base + path, {
  method, redirect: "manual",
  headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
  body: body ? JSON.stringify(body) : undefined,
});
const diary = (extra = {}) => ({ settings: { name: "Anna", daily: 23, weekly: 30 }, days: {}, weights: [], ...extra });
const put = (data, version) => call("/api/data", { method: "PUT", body: { data, version } });

test("front page is public, the app and its data are not", async () => {
  const front = await call("/");
  assert.equal(front.status, 200);
  assert.match(await front.text(), /<h1>Tallriken<\/h1>/);
  assert.deepEqual(await (await call("/api/public")).json(), { app: "tallriken" });
  assert.equal((await call("/api/data")).status, 401);
  const page = await call("/app");
  assert.equal(page.status, 302);
  assert.match(page.headers.get("location"), /^\/login\?next=%2Fapp/);
  assert.equal((await call("/finns-inte")).status, 404);
  assert.equal((await call("/api/finns-inte")).status, 404);
});

test("security headers: CSP without inline scripts, no caching of the app", async () => {
  const r = await call("/");
  const csp = r.headers.get("content-security-policy");
  assert.match(csp, /default-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.equal(r.headers.get("x-powered-by"), null);
  assert.equal((await call("/api/health")).headers.get("cache-control"), "no-store");
});

test("wrong password is rejected", async () => {
  const r = await call("/api/login", { method: "POST", body: { email: "a@example.se", password: "fel" } });
  assert.equal(r.status, 401);
});

test("login, then the diary: empty, create, update, conflict", async () => {
  const r = await call("/api/login", { method: "POST", body: { email: "A@example.se", password: "hemligt-losenord" } });
  assert.equal(r.status, 200);
  cookie = r.headers.get("set-cookie").split(";")[0];
  assert.match(r.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  assert.equal((await (await call("/api/me")).json()).user.name, "Anna");
  assert.equal((await call("/")).headers.get("location"), "/app", "signed-in users go straight to the app");
  const app = await call("/app");
  assert.equal(app.status, 200);
  assert.equal(app.headers.get("cache-control"), "no-store");

  assert.deepEqual(await (await call("/api/data")).json(), { data: null, version: 0, updatedAt: null });

  const first = diary({ days: { "2026-10-25": { foods: [{ id: "x1", name: "Kvarg naturell", points: 2, meal: "Frukost" }], acts: [] } } });
  const created = await put(first, 0);
  assert.equal(created.status, 200);
  assert.equal((await created.json()).version, 1);

  const got = await (await call("/api/data")).json();
  assert.deepEqual(got.data, first);
  assert.equal(got.version, 1);
  assert.match(got.updatedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);

  const second = { ...first, weights: [{ date: "2026-10-25", kg: 82.5 }] };
  assert.equal((await (await put(second, 1)).json()).version, 2);

  // Another device still at version 1: rejected with the current document.
  const stale = await put(diary(), 1);
  assert.equal(stale.status, 409);
  const conflict = await stale.json();
  assert.equal(conflict.version, 2);
  assert.deepEqual(conflict.data.weights, [{ date: "2026-10-25", kg: 82.5 }]);
  assert.equal((await put(diary(), 0)).status, 409, "version 0 is only for the first save");
  assert.equal((await (await call("/api/data")).json()).version, 2, "nothing was overwritten");
});

test("diary input is validated", async () => {
  assert.equal((await put([1, 2], 2)).status, 400);
  assert.equal((await put("text", 2)).status, 400);
  assert.equal((await put(diary(), "2")).status, 400);
  assert.equal((await put(diary(), -1)).status, 400);
  const huge = diary({ note: "x".repeat(4.5 * 1024 * 1024) });
  assert.equal((await put(huge, 2)).status, 413);
  const bad = await fetch(base + "/api/data", { method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{inte json" });
  assert.equal(bad.status, 400);
});

test("cross-site and non-JSON writes are blocked", async () => {
  const evil = await call("/api/data", { method: "PUT", body: { data: diary(), version: 2 }, headers: { Origin: "https://evil.example" } });
  assert.equal(evil.status, 403);
  const form = await fetch(base + "/api/data", { method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=x" });
  assert.equal(form.status, 415);
  assert.equal((await (await call("/api/data")).json()).version, 2);
});

const lastLink = () => mailer.sent.at(-1).text.match(/https:\/\/tallriken\.test\/losenord\?t=(\S+)/)[1];

test("two-step verification: required for admin, login with code or recovery code", async () => {
  const { codeAt, currentStep } = await import("../server/totp.js");
  const denied = await call("/api/admin/users");
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, "totp_required");
  assert.match((await call("/admin")).headers.get("location"), /^\/konto/);

  assert.equal((await call("/api/account/totp/setup", { method: "POST", body: { password: "fel" } })).status, 400);
  const { secret, qr } = await (await call("/api/account/totp/setup", { method: "POST", body: { password: "hemligt-losenord" } })).json();
  assert.match(qr, /^<svg/);
  assert.equal((await call("/api/account/totp/confirm", { method: "POST", body: { code: "000000" } })).status, 400);
  const confirmed = await (await call("/api/account/totp/confirm", { method: "POST", body: { code: codeAt(secret, currentStep()) } })).json();
  assert.equal(confirmed.recoveryCodes.length, 10);
  annaRecovery = confirmed.recoveryCodes;
  assert.deepEqual(confirmed.totp, { enabled: true, recoveryLeft: 10 });
  assert.equal((await call("/api/admin/users")).status, 200);

  const login = async () => (await call("/api/login", { method: "POST", body: { email: "a@example.se", password: "hemligt-losenord" } })).json();
  const step2 = (ticket, code) => call("/api/login/totp", { method: "POST", body: { ticket, code } });

  let r = await login();
  assert.equal(r.totp_required, true);
  assert.equal((await step2(r.ticket, codeAt(secret, currentStep()))).status, 401, "code already used during setup");
  const ok = await step2(r.ticket, confirmed.recoveryCodes[0].toUpperCase());
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).recoveryLeft, 9);

  r = await login();
  assert.equal((await step2(r.ticket, confirmed.recoveryCodes[0])).status, 401, "recovery code is single-use");
  const viaApp = await step2(r.ticket, codeAt(secret, currentStep() + 1));
  assert.equal(viaApp.status, 200);
  cookie = viaApp.headers.get("set-cookie").split(";")[0];

  r = await login();
  for (let i = 0; i < 5; i++) await step2(r.ticket, "123456");
  assert.equal((await step2(r.ticket, codeAt(secret, currentStep() + 1))).status, 410, "ticket dies after 5 attempts");
});

test("admin invites a user who sets a password and signs in", async () => {
  const r = await call("/api/admin/users", { method: "POST", body: { name: "Bertil", email: "b@example.se" } });
  assert.equal(r.status, 201);
  const { user, link } = await r.json();
  assert.ok(link, "link returned when mail is not configured");
  assert.equal(mailer.sent.at(-1).to, "b@example.se");
  assert.equal((await call("/api/admin/users", { method: "POST", body: { name: "X", email: "B@example.se" } })).status, 409);

  const token = lastLink();
  const info = await (await call(`/api/password/token?t=${token}`)).json();
  assert.deepEqual([info.name, info.purpose], ["Bertil", "invite"]);
  assert.equal((await call("/api/password/set", { method: "POST", body: { token, password: "kort" } })).status, 400);

  const saved = cookie;
  const set = await call("/api/password/set", { method: "POST", body: { token, password: "bertils-losenord" } });
  assert.equal(set.status, 200);
  cookie = set.headers.get("set-cookie").split(";")[0];
  assert.equal((await (await call("/api/me")).json()).user.name, "Bertil");
  assert.equal((await call("/api/admin/users")).status, 403, "non-admin is blocked");
  assert.equal((await call("/admin")).status, 302);
  assert.equal((await call("/api/password/set", { method: "POST", body: { token, password: "bertils-losenord" } })).status, 400, "token is single-use");
  cookie = saved;

  const list = await (await call("/api/admin/users")).json();
  assert.equal(list.users.find(u => u.id === user.id).invited, 0);
});

test("admin guards: last admin, self", async () => {
  const { users } = await (await call("/api/admin/users")).json();
  const anna = users.find(u => u.name === "Anna"), bertil = users.find(u => u.name === "Bertil");
  assert.equal((await call(`/api/admin/users/${anna.id}`, { method: "PATCH", body: { is_admin: false } })).status, 400);
  assert.equal((await call(`/api/admin/users/${anna.id}`, { method: "DELETE" })).status, 400);
  const promoted = await (await call(`/api/admin/users/${bertil.id}`, { method: "PATCH", body: { is_admin: true, name: "Bertil B" } })).json();
  assert.deepEqual([promoted.is_admin, promoted.name], [1, "Bertil B"]);
  const link = await (await call(`/api/admin/users/${bertil.id}/link`, { method: "POST", body: {} })).json();
  assert.equal(link.purpose, "reset", "user who has signed in gets a reset link");
});

test("forgot password sends a reset link without revealing accounts", async () => {
  const before = mailer.sent.length;
  assert.equal((await call("/api/password/forgot", { method: "POST", body: { email: "finns-inte@example.se" } })).status, 200);
  assert.equal(mailer.sent.length, before);
  assert.equal((await call("/api/password/forgot", { method: "POST", body: { email: "a@example.se" } })).status, 200);
  assert.match(mailer.sent.at(-1).subject, /lösenord/);
  const token = lastLink();
  assert.equal((await (await call(`/api/password/token?t=${token}`)).json()).purpose, "reset");
  const set = await call("/api/password/set", { method: "POST", body: { token, password: "hemligt-losenord" } });
  assert.deepEqual(await set.json(), { ok: true, login: true }, "reset link does not bypass two-step verification");
  assert.equal(set.headers.get("set-cookie"), null);
  // The reset signed Anna out everywhere; sign in again (password + recovery code).
  const { ticket } = await (await call("/api/login", { method: "POST", body: { email: "a@example.se", password: "hemligt-losenord" } })).json();
  const again = await call("/api/login/totp", { method: "POST", body: { ticket, code: annaRecovery[5] } });
  assert.equal(again.status, 200);
  cookie = again.headers.get("set-cookie").split(";")[0];
});

test("each user only ever sees their own diary", async () => {
  const saved = cookie;
  const { ticket } = await (await call("/api/login", { method: "POST", body: { email: "b@example.se", password: "bertils-losenord" } })).json().catch(() => ({}));
  assert.equal(ticket, undefined, "Bertil has no two-step verification");
  const login = await call("/api/login", { method: "POST", body: { email: "b@example.se", password: "bertils-losenord" } });
  cookie = login.headers.get("set-cookie").split(";")[0];
  assert.deepEqual((await (await call("/api/data")).json()).data, null);
  assert.equal((await put(diary({ settings: { name: "Bertil" } }), 0)).status, 200);
  cookie = saved;
  const anna = await (await call("/api/data")).json();
  assert.equal(anna.data.settings.name, "Anna");
  assert.equal(anna.version, 2);
  assert.equal((await call("/api/admin/users")).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM user_data").get().n, 2);
});

test("account: change name and password", async () => {
  const a = await (await call("/api/account", { method: "PATCH", body: { name: "Anna A" } })).json();
  assert.equal(a.name, "Anna A");
  assert.equal(a.digest, undefined);
  assert.equal((await call("/api/account", { method: "PATCH", body: { name: "" } })).status, 400);
  assert.equal((await call("/api/account/password", { method: "POST", body: { current: "fel", password: "nytt-losenord-1" } })).status, 400);
  assert.equal((await call("/api/account/password", { method: "POST", body: { current: "hemligt-losenord", password: "kort" } })).status, 400);
  assert.equal((await call("/api/account/password", { method: "POST", body: { current: "hemligt-losenord", password: "nytt-losenord-1" } })).status, 200);
  assert.equal((await call("/api/me")).status, 200, "current session survives a password change");
});

test("health, backups and admin system view", async () => {
  let h = await call("/api/health");
  assert.equal(h.status, 503, "no backup yet");
  assert.equal((await h.json()).checks.backup.ok, false);

  for (let i = 0; i < 3; i++) {
    const r = await call("/api/admin/backups", { method: "POST", body: {} });
    assert.equal(r.status, 201);
    await new Promise(res => setTimeout(res, 1100)); // names have one-second resolution
  }
  const sys = await (await call("/api/admin/system")).json();
  assert.equal(sys.backups.length, 2, "pruned to backupKeep");
  assert.deepEqual([sys.backups[0].app, sys.backups[0].users, sys.backups[0].documents], ["tallriken", 2, 2]);
  assert.match(sys.backups[0].name, /^tallriken-\d{8}-\d{6}$/);
  assert.equal(sys.offsite, null);
  assert.ok(!fs.readdirSync(config.backupDir).some(n => n.endsWith(".partial")));

  h = await call("/api/health");
  const body = await h.json();
  assert.equal(h.status, 200, JSON.stringify(body));
  assert.deepEqual(body.checks.offsite, { ok: true, status: "off" });

  const dl = await call(`/api/admin/backups/${sys.backups[0].name}/download`);
  assert.equal(dl.status, 200);
  const bytes = Buffer.from(await dl.arrayBuffer());
  assert.equal(bytes.subarray(0, 15).toString(), "SQLite format 3");
  assert.equal((await call("/api/admin/backups/..%2Fetc/download")).status, 404);
});

test("restore a backup from admin", async () => {
  const before = await (await call("/api/data")).json();
  const b = await (await call("/api/admin/backups", { method: "POST", body: {} })).json();
  assert.equal((await put({ ...before.data, weights: [] }, before.version)).status, 200);

  const restore = body => call(`/api/admin/backups/${b.name}/restore`, { method: "POST", body });
  assert.equal((await restore({ confirm: "ja" })).status, 400);
  await new Promise(res => setTimeout(res, 1100));
  const r = await restore({ confirm: "ÅTERSTÄLL" });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.documents, 2);
  const after = await (await call("/api/data")).json();
  assert.deepEqual(after.data, before.data);
  assert.ok(after.version > before.version + 1, "version moves forward so open apps reload instead of overwriting");
  assert.equal((await call("/api/me")).status, 200, "accounts and sessions are untouched");
  assert.ok((await (await call("/api/admin/system")).json()).backups.some(x => x.name === body.rescue), "rescue copy listed");

  fs.appendFileSync(path.join(config.backupDir, b.name, "tallriken.db"), "x");
  const bad = await restore({ confirm: "ÅTERSTÄLL" });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /Kontrollsumman/);
});

test("deleting a user deletes their diary", async () => {
  const { users } = await (await call("/api/admin/users")).json();
  const bertil = users.find(u => u.email === "b@example.se");
  assert.equal((await call(`/api/admin/users/${bertil.id}`, { method: "DELETE" })).status, 204);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM user_data WHERE user_id = ?").get(bertil.id).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(bertil.id).n, 0);
});

test("offsite status feeds health", async () => {
  const cfg = { ...config, offsiteTarget: "backup@nas:/srv/tallriken" };
  const { health } = await import("../server/health.js");
  assert.equal(health(db, cfg).checks.offsite.ok, false);
  fs.writeFileSync(path.join(config.backupDir, "offsite.json"), JSON.stringify({ ok: true, lastSuccess: new Date().toISOString() }));
  assert.equal(health(db, cfg).checks.offsite.ok, true);
});

test("scheduler: backup at night, Swedish time", async () => {
  const { startScheduler } = await import("../server/scheduler.js");
  const cfg = { ...config, backupDir: path.join(dataDir, "sched") };
  const s = startScheduler(db, cfg);
  await s.tick(new Date("2026-11-02T00:30:00Z")); // 01:30 in Stockholm: first backup ever -> runs
  assert.equal(fs.readdirSync(cfg.backupDir).length, 1);
  await s.tick(new Date("2026-11-02T01:30:00Z")); // 02:30: same day, already done
  assert.equal(fs.readdirSync(cfg.backupDir).length, 1);
  await s.tick(new Date("2026-11-03T01:30:00Z")); // next day 02:30: before 03:00
  assert.equal(fs.readdirSync(cfg.backupDir).length, 1);
  await s.tick(new Date("2026-11-03T02:05:00Z")); // 03:05
  assert.equal(fs.readdirSync(cfg.backupDir).length, 2);
});

test("logout ends the session", async () => {
  assert.equal((await call("/api/logout", { method: "POST", body: {} })).status, 204);
  assert.equal((await call("/api/data")).status, 401);
});
