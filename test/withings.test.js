// Withings: OAuth, fetching weighings, notifications and the hourly fallback, against a fake
// Withings API on localhost.
process.env.TZ = "Europe/Stockholm";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createApp } from "../server/app.js";
import { openDb } from "../server/db.js";
import { hashPassword } from "../server/auth.js";
import { createMailer } from "../server/mailer.js";
import { weightsFromGroups, mergeWeights, localDate } from "../server/withings.js";

// Unix seconds for a Stockholm wall-clock time.
const at = s => Math.floor(new Date(s).getTime() / 1000);
const group = (date, kg, extra = {}) => ({ grpid: date, attrib: 0, category: 1, date, created: date,
  measures: [{ type: 1, unit: -3, value: Math.round(kg * 1000) }], ...extra });

test("weighings become one weight per local day, the first of the day", () => {
  assert.equal(localDate(at("2026-10-25T00:30:00+02:00")), "2026-10-25", "just after midnight, summer time");
  assert.equal(localDate(at("2026-10-25T23:30:00+01:00")), "2026-10-25", "late evening, winter time");
  const w = weightsFromGroups([
    group(at("2026-10-20T19:00:00+02:00"), 83.1),
    group(at("2026-10-20T07:00:00+02:00"), 82.4),
    group(at("2026-10-21T06:45:00+02:00"), 81.95),
    group(at("2026-10-22T07:00:00+02:00"), 75, { category: 2 }),                     // a goal, not a weighing
    { grpid: 9, category: 1, date: at("2026-10-23T07:00:00+02:00"), measures: [{ type: 6, unit: -1, value: 312 }] }, // fat % only
  ]);
  assert.deepEqual(w.map(x => [x.date, x.kg]), [["2026-10-20", 82.4], ["2026-10-21", 82]]);
});

test("merging never replaces a weight typed in by hand", () => {
  const weights = [{ date: "2026-10-21", kg: 82.3 }, { date: "2026-10-20", kg: 83.1, src: "withings", t: 200 }];
  const changed = mergeWeights(weights, [
    { date: "2026-10-20", kg: 82.4, t: 100 }, // earlier weighing the same day: replaces
    { date: "2026-10-21", kg: 81.9, t: 300 }, // hand-typed: kept
    { date: "2026-10-22", kg: 81.5, t: 400 }, // new day
  ]);
  assert.equal(changed, 2);
  assert.deepEqual(weights.map(x => [x.date, x.kg]), [["2026-10-21", 82.3], ["2026-10-20", 82.4], ["2026-10-22", 81.5]]);
  assert.equal(mergeWeights(weights, [{ date: "2026-10-20", kg: 82.4, t: 100 }]), 0, "same data again changes nothing");
});

// ---------- fake Withings ----------
const fake = { tokens: new Map(), calls: [], groups: [], refreshes: 0, subscribed: [], revoked: [] };
let wServer, server, base, db, app, cookie = "";

before(async () => {
  const w = express();
  w.use(express.urlencoded({ extended: false }));
  const ok = (res, body) => res.json({ status: 0, body });
  w.post("/v2/oauth2", (req, res) => {
    const b = req.body;
    if (b.action !== "requesttoken" || b.client_id !== "cid" || b.client_secret !== "hemlis") return res.json({ status: 503, error: "Invalid params" });
    const issue = userid => {
      const n = fake.tokens.size + 1, access = `A${n}`, refresh = `R${n}`;
      fake.tokens.set(access, { userid, refresh });
      return { userid, access_token: access, refresh_token: refresh, expires_in: 10800, scope: "user.metrics", token_type: "Bearer" };
    };
    if (b.grant_type === "authorization_code") {
      if (b.redirect_uri !== "https://tallriken.test/withings/callback") return res.json({ status: 503, error: "redirect_uri mismatch" });
      const userid = { "kod-anna": 4711, "kod-bertil": 4711 }[b.code];
      return userid ? ok(res, issue(userid)) : res.json({ status: 503, error: "Invalid code" });
    }
    if (b.grant_type === "refresh_token") {
      const old = [...fake.tokens].find(([, t]) => t.refresh === b.refresh_token);
      if (!old) return res.json({ status: 401, error: "Invalid refresh token" });
      fake.tokens.delete(old[0]); fake.refreshes++;
      return ok(res, issue(old[1].userid));
    }
    res.json({ status: 503 });
  });
  const authed = (req, res, next) => {
    const t = fake.tokens.get((req.headers.authorization || "").replace("Bearer ", ""));
    if (!t) return res.json({ status: 401, error: "Invalid token" });
    next();
  };
  w.post("/measure", authed, (req, res) => {
    fake.calls.push({ ...req.body });
    assert.equal(req.body.action, "getmeas");
    const since = Number(req.body.lastupdate || 0);
    const all = fake.groups.filter(g => g.created > since);
    // Two per page, to exercise paging.
    const offset = Number(req.body.offset || 0);
    ok(res, { measuregrps: all.slice(offset, offset + 2), more: offset + 2 < all.length ? 1 : 0, offset: offset + 2,
      timezone: "Europe/Stockholm", updatetime: Math.max(since, ...all.map(g => g.created)) });
  });
  w.post("/notify", authed, (req, res) => {
    if (req.body.action === "subscribe") fake.subscribed.push(req.body);
    if (req.body.action === "revoke") fake.revoked.push(req.body);
    ok(res, {});
  });
  wServer = w.listen(0);
  await new Promise(r => wServer.once("listening", r));
  const wUrl = `http://127.0.0.1:${wServer.address().port}`;

  db = openDb(":memory:");
  console.log = () => {};
  console.error = () => {};
  for (const [email, name] of [["a@example.se", "Anna"], ["b@example.se", "Bertil"]]) {
    db.prepare("INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)").run(email, name, hashPassword("hemligt-losenord"));
  }
  const config = { dbPath: ":memory:", production: false, origin: "", sessionDays: 1, baseUrl: "https://tallriken.test",
    dataDir: "/tmp", backupDir: "/tmp/tr-withings-none", backupKeep: 2, loginLimit: 1000, offsiteTarget: "", mail: {},
    withings: { enabled: true, clientId: "cid", clientSecret: "hemlis", authUrl: "https://account.withings.test", apiUrl: wUrl } };
  app = createApp(config, db, createMailer({}));
  server = app.listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); wServer.close(); });

const call = (path, { method = "GET", body, headers = {} } = {}) => fetch(base + path, {
  method, redirect: "manual",
  headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
  body: body ? JSON.stringify(body) : undefined,
});
const login = async email => {
  const r = await call("/api/login", { method: "POST", body: { email, password: "hemligt-losenord" } });
  cookie = r.headers.get("set-cookie").split(";")[0];
};
const connect = async code => {
  const { url } = await (await call("/api/withings/connect", { method: "POST", body: {} })).json();
  const u = new URL(url);
  return { u, back: await call(`/withings/callback?code=${code}&state=${u.searchParams.get("state")}`) };
};
const diary = async () => (await (await call("/api/data")).json());

test("connect: approve at Withings, come back, weights are fetched and notifications set up", async () => {
  await login("a@example.se");
  assert.deepEqual(await (await call("/api/withings")).json(), { enabled: true, connected: false, syncedAt: null, error: null });
  // A hand-typed weight that Withings must not replace.
  await call("/api/data", { method: "PUT", body: { version: 0, data: { settings: { name: "Anna" }, days: {}, weights: [{ date: "2026-10-21", kg: 82.3 }] } } });

  fake.groups = [
    group(at("2026-10-20T07:00:00+02:00"), 82.4), group(at("2026-10-20T19:00:00+02:00"), 83.1),
    group(at("2026-10-21T06:45:00+02:00"), 81.9), group(at("2026-10-22T07:05:00+02:00"), 81.6),
    group(at("2026-10-23T07:10:00+02:00"), 81.4),
  ];
  const { u, back } = await connect("kod-anna");
  assert.equal(u.origin + u.pathname, "https://account.withings.test/oauth2_user/authorize2");
  assert.deepEqual([u.searchParams.get("client_id"), u.searchParams.get("scope"), u.searchParams.get("response_type"), u.searchParams.get("redirect_uri")],
    ["cid", "user.metrics", "code", "https://tallriken.test/withings/callback"]);
  assert.equal(back.status, 302);
  assert.equal(back.headers.get("location"), "/app?withings=ok&nya=3#installningar");

  const d = await diary();
  assert.equal(d.version, 2, "the server's change bumps the version so open apps reload");
  assert.deepEqual(d.data.weights.map(w => [w.date, w.kg, w.src ?? "hand"]),
    [["2026-10-21", 82.3, "hand"], ["2026-10-20", 82.4, "withings"], ["2026-10-22", 81.6, "withings"], ["2026-10-23", 81.4, "withings"]]);
  assert.ok(fake.calls.length >= 3, "all pages were fetched");
  assert.ok(fake.calls.every(c => c.meastype === "1" && c.category === "1"));
  assert.equal(fake.subscribed.length, 1);
  assert.equal(fake.subscribed[0].appli, "1");
  assert.match(fake.subscribed[0].callbackurl, /^https:\/\/tallriken\.test\/withings\/notify\?k=[0-9a-f]{32}$/);

  const st = await (await call("/api/withings")).json();
  assert.equal(st.connected, true);
  assert.match(st.syncedAt, /Z$/);
});

test("a state is single-use and bound to the user", async () => {
  const { url } = await (await call("/api/withings/connect", { method: "POST", body: {} })).json();
  const state = new URL(url).searchParams.get("state");
  const saved = cookie;
  await login("b@example.se");
  const stolen = await call(`/withings/callback?code=kod-bertil&state=${state}`);
  assert.match(stolen.headers.get("location"), /^\/app\?withings=fel/);
  cookie = saved;
  const reused = await call(`/withings/callback?code=kod-anna&state=${state}`);
  assert.match(reused.headers.get("location"), /^\/app\?withings=fel/, "already used by the attempt above");
  assert.match((await call("/withings/callback?code=kod-anna")).headers.get("location"), /withings=fel/);
});

test("one Withings account can only belong to one user", async () => {
  const saved = cookie;
  await login("b@example.se");
  const { back } = await connect("kod-bertil");
  assert.match(decodeURIComponent(back.headers.get("location")), /redan kopplad till en annan användare/);
  assert.equal((await (await call("/api/withings")).json()).connected, false);
  cookie = saved;
});

test("a notification fetches only what is new", async () => {
  const before = fake.calls.length;
  fake.groups.push(group(at("2026-10-24T07:00:00+02:00"), 81.2));
  const k = app.locals.withings.notifyKey;
  const post = (key, body) => fetch(`${base}/withings/notify?k=${key}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  assert.equal((await fetch(`${base}/withings/notify`, { method: "HEAD" })).status, 200, "Withings checks the address");
  assert.equal((await post("fel", "userid=4711&appli=1&startdate=1&enddate=2")).status, 200);
  assert.equal((await post(k, "userid=999&appli=1")).status, 200, "unknown Withings user is ignored");
  await new Promise(r => setTimeout(r, 100));
  assert.equal(fake.calls.length, before, "wrong key or unknown user: nothing fetched");

  assert.equal((await post(k, "userid=4711&appli=1&startdate=1&enddate=2")).status, 200);
  for (let i = 0; i < 50 && (await diary()).data.weights.length < 5; i++) await new Promise(r => setTimeout(r, 20));
  const d = await diary();
  assert.deepEqual(d.data.weights.at(-1), { date: "2026-10-24", kg: 81.2, src: "withings", t: at("2026-10-24T07:00:00+02:00") });
  assert.ok(Number(fake.calls.at(-1).lastupdate) >= at("2026-10-23T07:10:00+02:00"), "asks only for changes since last time");
});

test("an expired access token is refreshed, and the new refresh token kept", async () => {
  db.prepare("UPDATE withings SET expires_at = 0").run();
  const r = await (await call("/api/withings/sync", { method: "POST", body: {} })).json();
  assert.equal(r.added, 0);
  assert.equal(fake.refreshes, 1);
  const row = db.prepare("SELECT access_token, refresh_token, expires_at FROM withings").get();
  assert.ok(fake.tokens.has(row.access_token));
  assert.equal(fake.tokens.get(row.access_token).refresh, row.refresh_token);
  assert.ok(row.expires_at > Date.now() + 3 * 36e5 - 60e3);
});

test("errors from Withings are reported, not swallowed", async () => {
  db.prepare("UPDATE withings SET access_token = 'ogiltig', expires_at = ?").run(Date.now() + 36e5);
  const r = await call("/api/withings/sync", { method: "POST", body: {} });
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /fel 401/);
  assert.match((await (await call("/api/withings")).json()).error, /fel 401/);
});

test("the hourly fallback syncs anyone not synced lately", async () => {
  const valid = [...fake.tokens.keys()].at(-1);
  db.prepare("UPDATE withings SET access_token = ?, synced_at = datetime('now', '-7 hours')").run(valid);
  fake.groups.push(group(at("2026-10-25T07:00:00+01:00"), 81.0));
  const { startScheduler } = await import("../server/scheduler.js");
  const s = startScheduler(db, { backupDir: "/tmp/tr-withings-sched-" + process.pid, backupKeep: 1 }, app.locals.withings);
  await s.tick(new Date("2026-10-25T10:00:00Z"));
  assert.equal((await diary()).data.weights.at(-1).date, "2026-10-25");
  const calls = fake.calls.length;
  await s.tick(new Date("2026-10-25T10:20:00Z")); // same hour: no new round
  assert.equal(fake.calls.length, calls);
  assert.equal((await (await call("/api/withings")).json()).error, null);
});

test("disconnect revokes notifications and keeps the weights", async () => {
  const r = await (await call("/api/withings", { method: "DELETE" })).json();
  assert.equal(r.connected, false);
  assert.equal(fake.revoked.length, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM withings").get().n, 0);
  assert.ok((await diary()).data.weights.some(w => w.src === "withings"));
  assert.equal((await call("/api/withings/sync", { method: "POST", body: {} })).status, 502);
});

test("deleting a user removes their Withings connection", async () => {
  await connect("kod-anna");
  const id = db.prepare("SELECT id FROM users WHERE email = 'a@example.se'").get().id;
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM withings").get().n, 0);
});
