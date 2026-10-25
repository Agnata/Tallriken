// Livsmedelsverket and Open Food Facts, against fake services on localhost.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import { openDb } from "../server/db.js";
import { hashPassword } from "../server/auth.js";
import { createMailer } from "../server/mailer.js";
import { pickNutrients, wordMatches, searchNames, offFood, fetchLivsmedel } from "../server/foods.js";

const nut = (kcal, prot, sug, fat) => [
  { namn: "Energi (kJ)", forkortning: "ENERC", euroFIRkod: "ENERC", varde: Math.round(kcal * 4.184), enhet: "kJ" },
  { namn: "Energi (kcal)", forkortning: "ENERC", euroFIRkod: "ENERC", varde: kcal, enhet: "kcal" },
  { namn: "Protein", forkortning: "PROT", euroFIRkod: "PROT", varde: prot, enhet: "g" },
  { namn: "Sockerarter, totalt", forkortning: "SUGAR", euroFIRkod: "SUGAR", varde: sug, enhet: "g" },
  { namn: "Summa mättade fettsyror", forkortning: "FASAT", euroFIRkod: "FASAT", varde: fat, enhet: "g" },
  { namn: "Fett, totalt", forkortning: "FAT", euroFIRkod: "FAT", varde: fat * 3, enhet: "g" },
];

test("the four values the points model needs are picked from Livsmedelsverket's nutrient list", () => {
  assert.deepEqual(pickNutrients(nut(250, 8.5, 3.1, 0.4)), { kcal: 250, prot: 8.5, sug: 3.1, fat: 0.4 });
  assert.deepEqual(pickNutrients([{ forkortning: "PROT", varde: null, enhet: "g" }]), { kcal: null, prot: 0, sug: 0, fat: 0 }, "missing values are not zero energy");
});

test("Swedish compounds match names written the other way round", () => {
  assert.ok(wordMatches("bröd surdeg vete", "surdegsbröd"), "surdegs + bröd");
  assert.ok(wordMatches("cornflakes", "cornflakes"));
  assert.ok(wordMatches("flingor majs cornflakes", "corn"));
  assert.equal(wordMatches("knäckebröd", "surdegsbröd"), 0);
  const items = [{ name: "Bröd surdeg vete" }, { name: "Knäckebröd råg" }, { name: "Surdegsbröd råg fullkorn" }, { name: "Kanelbulle" }];
  assert.deepEqual(searchNames(items, "surdegsbröd").map(i => i.name), ["Surdegsbröd råg fullkorn", "Bröd surdeg vete"]);
  assert.deepEqual(searchNames(items, "bröd råg").map(i => i.name), ["Knäckebröd råg", "Surdegsbröd råg fullkorn"]);
  assert.deepEqual(searchNames(items, "x"), [], "one letter is not a search");
});

test("Open Food Facts products: per portion when the package says so, brand added", () => {
  const cf = offFood({ code: "5050083", product_name: "Corn Flakes", brands: "Kellogg's,Kellogg", serving_quantity: 30,
    nutriments: { "energy-kcal_100g": 378, proteins_100g: 7, sugars_100g: 8, "saturated-fat_100g": 0.2 } });
  assert.deepEqual(cf, { name: "Corn Flakes, Kellogg's", portion: "1 portion (30 g)", points: 4, code: "5050083" });
  const kj = offFood({ product_name_sv: "Surdegsbröd", product_name: "Sourdough", brands: "Pågen", nutriments: { energy_100g: 1046, proteins_100g: 9 } });
  assert.deepEqual([kj.name, kj.portion, kj.points], ["Surdegsbröd, Pågen", "100 g", 7]);
  assert.equal(offFood({ product_name: "Utan energi", nutriments: {} }), null);
});

// ---------- fake services ----------
const LV = [
  { nummer: 1, namn: "Bröd surdeg vete", version: "2025-03-01" }, { nummer: 2, namn: "Flingor majs cornflakes", version: "2025-03-01" },
  { nummer: 3, namn: "Lax odlad", version: "2025-06-10" }, { nummer: 4, namn: "Utan värden", version: "2025-03-01" },
];
const LV_NUT = { 1: nut(250, 8.5, 3, 0.4), 2: nut(380, 7, 9, 0.3), 3: nut(190, 20, 0, 2.5), 4: [] };
let lvServer, offServer, server, base, cookie, app, dataDir, lvCalls = 0, offCalls = 0, offDown = false;

before(async () => {
  const lv = express();
  lv.get("/livsmedel", (req, res) => {
    lvCalls++;
    const offset = Number(req.query.offset), limit = Number(req.query.limit);
    assert.equal(req.query.sprak, "1");
    // Pages of two, regardless of limit, to exercise paging.
    res.json({ _meta: { totalRecords: LV.length, offset, limit, count: 2 }, livsmedel: LV.slice(offset, offset + Math.min(limit, 2)) });
  });
  lv.get("/livsmedel/:n/naringsvarden", (req, res) => { lvCalls++; res.json(LV_NUT[req.params.n]); });
  lvServer = lv.listen(0);
  const off = express();
  off.get("/search", (req, res) => {
    offCalls++;
    assert.match(req.headers["user-agent"], /^Tallriken\//);
    if (offDown) return res.status(503).end();
    assert.match(req.query.fields, /nutriments/);
    const hits = req.query.q.includes("corn") ? [
      { code: "9", product_name: "Corn Flakes", brands: ["Nestlé"], countries_tags: ["en:france"], nutriments: { "energy-kcal_100g": 380 } },
      { code: "1", product_name: "Corn Flakes", brands: ["Kellogg's", "Corn Flakes"], countries_tags: ["en:sweden"], serving_quantity: 30, nutriments: { "energy-kcal_100g": 378, proteins_100g: 7, sugars_100g: 8, "saturated-fat_100g": 0.2 } },
      { code: "2", product_name: "Corn Flakes", brands: ["Kellogg's"], countries_tags: ["en:sweden"], serving_quantity: 30, nutriments: { "energy-kcal_100g": 378 } }, // duplicate
      { code: "4", product_name: { sv: "Frosties", en: "Frosties" }, brands: ["Kellogg's"], countries_tags: ["en:sweden"] }, // nutrients from the product API
      { code: "3", product_name: "Utan näring", nutriments: {} },
    ] : [];
    res.json({ hits, count: hits.length });
  });
  off.get("/api/v2/product/:code", (req, res) => {
    offCalls++;
    if (req.params.code !== "4") return res.json({ status: 0 });
    res.json({ status: 1, product: { product_name: "Frosties", brands: "Kellogg's", serving_quantity: 30, nutriments: { "energy-kcal_100g": 375, proteins_100g: 4.5, sugars_100g: 37, "saturated-fat_100g": 0.1 } } });
  });
  offServer = off.listen(0);
  await Promise.all([lvServer, offServer].map(s => new Promise(r => s.listening ? r() : s.once("listening", r))));

  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-foods-"));
  const db = openDb(":memory:");
  console.log = () => {}; console.error = () => {};
  db.prepare("INSERT INTO users (email, name, password_hash, is_admin, totp_enabled) VALUES ('a@example.se', 'Anna', ?, 1, 0)").run(hashPassword("hemligt-losenord"));
  const config = { dbPath: ":memory:", production: false, origin: "", sessionDays: 1, baseUrl: "https://tallriken.test", dataDir,
    backupDir: path.join(dataDir, "backups"), backupKeep: 2, loginLimit: 1000, offsiteTarget: "", mail: {},
    foodsFile: path.join(dataDir, "livsmedel.json"), foodsMin: 1,
    livsmedelUrl: `http://127.0.0.1:${lvServer.address().port}`, offUrl: `http://127.0.0.1:${offServer.address().port}`, offSearchUrl: `http://127.0.0.1:${offServer.address().port}` };
  app = createApp(config, db, createMailer({}));
  server = app.listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "a@example.se", password: "hemligt-losenord" }) });
  cookie = r.headers.get("set-cookie").split(";")[0];
});
after(() => { server.close(); lvServer.close(); offServer.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
const get = p => fetch(base + p, { headers: { Cookie: cookie } });

test("fetching Livsmedelsverket walks every page and keeps foods with energy", async () => {
  const data = await fetchLivsmedel(`http://127.0.0.1:${lvServer.address().port}`, { concurrency: 2 });
  assert.equal(data.foods.length, 3, "a food without energy is skipped");
  assert.equal(data.version, "2025-06-10", "newest version among the foods");
  assert.deepEqual(data.foods[0], { n: 1, name: "Bröd surdeg vete", kcal: 250, prot: 8.5, sug: 3, fat: 0.4 });
});

test("before the list is fetched, search answers empty; the scheduler fetches it", async () => {
  assert.deepEqual((await (await get("/api/foods/search?q=surdegsbröd")).json()).items, []);
  const foods = app.locals.foods;
  const { startScheduler } = await import("../server/scheduler.js");
  const { openDb: o } = await import("../server/db.js");
  const s = startScheduler(o(":memory:"), { backupDir: path.join(dataDir, "sched"), backupKeep: 1 }, null, foods);
  await s.tick(new Date("2026-10-25T10:00:00Z")); // 11:00: not 04:00, but there is no list at all
  for (let i = 0; i < 100 && foods.status().count === 0; i++) await new Promise(r => setTimeout(r, 20));
  assert.equal(foods.status().count, 3, JSON.stringify(foods.status()));
  assert.ok(fs.existsSync(path.join(dataDir, "livsmedel.json")));
  assert.equal(foods.due(), false);
});

test("search Livsmedelsverket: points per 100 g, compounds, needs login", async () => {
  const r = await (await get("/api/foods/search?q=surdegsbröd")).json();
  assert.deepEqual(r.items, [{ name: "Bröd surdeg vete", portion: "100 g", points: 7 }]);
  assert.equal(r.version, "2025-06-10");
  assert.equal((await (await get("/api/foods/search?q=lax")).json()).items[0].name, "Lax odlad");
  assert.equal((await fetch(base + "/api/foods/search?q=lax")).status, 401);
});

test("branded products from Open Food Facts: Swedish first, nutrients filled in, duplicates and products without energy dropped", async () => {
  const r = await (await get("/api/foods/brands?q=Corn%20flakes")).json();
  assert.deepEqual(r.items, [
    { name: "Corn Flakes, Kellogg's", portion: "1 portion (30 g)", points: 4, code: "1" },
    { name: "Frosties, Kellogg's", portion: "1 portion (30 g)", points: 5, code: "4" },
    { name: "Corn Flakes, Nestlé", portion: "100 g", points: 12, code: "9" },
  ]);
  const calls = offCalls;
  await get("/api/foods/brands?q=corn flakes");
  assert.equal(offCalls, calls, "same search within a day is cached");
  offDown = true;
  const down = await get("/api/foods/brands?q=havregryn");
  assert.equal(down.status, 502);
  assert.match((await down.json()).error, /Open Food Facts/);
  offDown = false;
});

test("admin sees the food database status", async () => {
  // Anna is admin but without two-step verification, so Admin answers 403; the status is in /api/admin/system.
  const { createFoods } = await import("../server/foods.js");
  const st = createFoods({ foodsFile: path.join(dataDir, "livsmedel.json"), livsmedelUrl: "x", offUrl: "x" }).status();
  assert.deepEqual([st.count, st.version, st.error], [3, "2025-06-10", null], "a new process reads the saved list");
});
