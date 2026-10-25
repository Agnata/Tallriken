import fs from "node:fs";
import path from "node:path";
import { calcPoints } from "../public/js/logic.js";

// Two sources beyond the app's own food list, both searched from the food dialog:
//  - Livsmedelsverkets livsmedelsdatabas (about 2 500 foods, open data, cite source and version).
//    The API (dataportal.livsmedelsverket.se/livsmedel/api/v1) has no text search, so the whole
//    list is fetched once, with energy, protein, sugar and saturated fat per 100 g, and kept in
//    DATA_DIR/livsmedel.json. It is refreshed monthly.
//  - Open Food Facts for branded products (open database, ODbL), searched live with their search
//    service search-a-licious (search.openfoodfacts.org; the old cgi/search.pl answers 503).
//    Products in Sweden come first. Nutrients missing from a hit are filled in from the product
//    API (world.openfoodfacts.org/api/v2/product/<code>).
const UA = "Tallriken/1.0 (https://tallriken.parnes.com)";
const NUTRIENTS = { ENERC: "kcal", PROT: "prot", SUGAR: "sug", FASAT: "fat" };

const norm = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

async function getJson(url, timeoutMs = 20_000) {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} svarade ${res.status}`);
  return res.json();
}

// The four values the points model needs, from a /livsmedel/{nummer}/naringsvarden answer.
// Energy comes twice (kJ and kcal) under the same code; only kcal is used.
export function pickNutrients(list) {
  const out = { kcal: null, prot: 0, sug: 0, fat: 0 };
  for (const n of list || []) {
    const key = NUTRIENTS[n.forkortning] || NUTRIENTS[n.euroFIRkod];
    if (!key || n.varde == null) continue;
    if (key === "kcal" && String(n.enhet).toLowerCase() !== "kcal") continue;
    out[key] = Number(n.varde);
  }
  return out;
}

// Fetches the whole database. Returns { version, fetched, foods: [{ n, name, kcal, prot, sug, fat }] }.
export async function fetchLivsmedel(baseUrl, { concurrency = 6, log = () => {} } = {}) {
  const base = baseUrl.replace(/\/$/, "");
  const list = [];
  for (let offset = 0, total = Infinity; offset < total;) {
    const page = await getJson(`${base}/livsmedel?offset=${offset}&limit=500&sprak=1`);
    if (!page?._meta || !Array.isArray(page.livsmedel)) throw new Error("Oväntat svar från Livsmedelsverket.");
    total = page._meta.totalRecords;
    list.push(...page.livsmedel);
    if (!page.livsmedel.length) break;
    offset += page.livsmedel.length;
  }
  log(`Livsmedelsverket: ${list.length} livsmedel, hämtar näringsvärden …`);
  const foods = [];
  let next = 0, version = "";
  async function worker() {
    while (next < list.length) {
      const f = list[next++];
      let tries = 0;
      for (;;) {
        try {
          const nut = pickNutrients(await getJson(`${base}/livsmedel/${f.nummer}/naringsvarden?sprak=1`));
          if (nut.kcal != null) foods.push({ n: f.nummer, name: String(f.namn).trim(), ...nut });
          if (f.version && f.version > version) version = f.version;
          break;
        } catch (err) {
          if (++tries >= 3) throw err;
          await new Promise(r => setTimeout(r, 1000 * tries));
        }
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  foods.sort((a, b) => a.name.localeCompare(b.name, "sv"));
  return { source: "Livsmedelsverkets livsmedelsdatabas", version, fetched: new Date().toISOString(), foods };
}

// Does the name contain the word? A Swedish compound like "surdegsbröd" also matches a name with
// both parts, e.g. "Bröd surdeg …", by trying every split into two parts of at least three letters
// (and dropping a linking s: "surdegs" + "bröd").
export function wordMatches(name, word) {
  if (name.includes(word)) return 2;
  for (let i = 3; i <= word.length - 3; i++) {
    const a = word.slice(0, i), b = word.slice(i);
    const a2 = a.endsWith("s") && a.length > 3 ? a.slice(0, -1) : a;
    if ((name.includes(a) || name.includes(a2)) && name.includes(b)) return 1;
  }
  return 0;
}

// Ranks names against a query: every word must match; whole-word and early matches first.
export function searchNames(items, query, limit = 30) {
  const words = norm(query).split(" ").filter(w => w.length >= 2);
  if (!words.length) return [];
  const hits = [];
  for (const it of items) {
    const name = it._n || (it._n = norm(it.name));
    let score = 0;
    for (const w of words) {
      const m = wordMatches(name, w);
      if (!m) { score = -1; break; }
      score += m * 10 + (name.startsWith(w) ? 5 : 0) + (new RegExp(`(^|[ ,(])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(name) ? 3 : 0);
    }
    if (score >= 0) hits.push([score - name.length / 100, it]);
  }
  return hits.sort((a, b) => b[0] - a[0]).slice(0, limit).map(h => h[1]);
}

// Open Food Facts product -> a food the app can log: per portion when the package states one
// in grams, else per 100 g. Products without energy are skipped.
// search-a-licious may return a text field per language ({ sv, en, main }) and brands as a list.
const text = v => v && typeof v === "object" && !Array.isArray(v) ? (v.sv || v.main || v.en || Object.values(v)[0] || "") : (v || "");
export function offFood(p) {
  const n = p.nutriments || {};
  let kcal = n["energy-kcal_100g"];
  if (kcal == null && n.energy_100g != null) kcal = n.energy_100g / 4.184;
  const productName = text(p.product_name_sv) || text(p.product_name);
  if (kcal == null || !productName) return null;
  const per100 = calcPoints(Number(kcal), Number(n.proteins_100g || 0), Number(n.sugars_100g || 0), Number(n["saturated-fat_100g"] || 0));
  const brand = String((Array.isArray(p.brands) ? p.brands[0] : String(p.brands || "").split(",")[0]) || "").trim();
  const name = String(productName).trim();
  const g = Number(p.serving_quantity);
  const portion = g > 0 && g < 1000 ? `1 portion (${Math.round(g)} g)` : "100 g";
  const points = g > 0 && g < 1000
    ? calcPoints(kcal * g / 100, (n.proteins_100g || 0) * g / 100, (n.sugars_100g || 0) * g / 100, (n["saturated-fat_100g"] || 0) * g / 100)
    : per100;
  return { name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name}, ${brand}` : name, portion, points, code: String(p.code || "") };
}

export function createFoods(config) {
  const file = config.foodsFile;
  const lvUrl = config.livsmedelUrl;
  const offUrl = (config.offUrl || "https://world.openfoodfacts.org").replace(/\/$/, "");
  const offSearchUrl = (config.offSearchUrl || "https://search.openfoodfacts.org").replace(/\/$/, "");
  const productCache = new Map();
  // One product's name, brand and nutrients from the product API, cached for a week.
  async function product(code) {
    const c = productCache.get(code);
    if (c && c.expires > Date.now()) return c.p;
    const d = await getJson(`${offUrl}/api/v2/product/${encodeURIComponent(code)}?fields=product_name,product_name_sv,brands,nutriments,serving_quantity`, 8000);
    const p = d?.product || {};
    productCache.set(code, { p, expires: Date.now() + 7 * 864e5 });
    if (productCache.size > 2000) productCache.delete(productCache.keys().next().value);
    return p;
  }
  let db = null;           // { version, fetched, foods }
  let importing = null;
  let lastError = null;
  const offCache = new Map();

  function load() {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const f of data.foods) f.points = calcPoints(f.kcal, f.prot, f.sug, f.fat);
      db = data;
    } catch { db = null; }
  }
  load();

  async function refresh(log = console.log) {
    if (importing) return importing;
    importing = (async () => {
      try {
        const data = await fetchLivsmedel(lvUrl, { log });
        // Guards against replacing a good list with a broken answer.
        if (data.foods.length < (config.foodsMin ?? 100)) throw new Error(`Bara ${data.foods.length} livsmedel hämtades.`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file + ".tmp", JSON.stringify(data));
        fs.renameSync(file + ".tmp", file);
        load();
        lastError = null;
        log(`Livsmedelsverket: ${data.foods.length} livsmedel sparade (version ${data.version || "okänd"}).`);
        return db;
      } catch (err) {
        lastError = err.message;
        throw err;
      } finally { importing = null; }
    })();
    return importing;
  }

  return {
    status() {
      return { count: db?.foods.length || 0, version: db?.version || null, fetched: db?.fetched || null, error: lastError, importing: !!importing };
    },
    refresh,
    // Due when there is no list yet or it is older than 30 days.
    due: () => !db || Date.now() - new Date(db.fetched).getTime() > 30 * 864e5,

    search(q) {
      if (!db) return [];
      return searchNames(db.foods, q, 30).map(f => ({ name: f.name, portion: "100 g", points: f.points }));
    },

    async brands(q) {
      const key = norm(q);
      if (key.length < 2) return [];
      const hit = offCache.get(key);
      if (hit && hit.expires > Date.now()) return hit.items;
      const fields = "code,product_name,product_name_sv,brands,nutriments,serving_quantity,countries_tags";
      let data;
      try {
        data = await getJson(`${offSearchUrl}/search?${new URLSearchParams({ q: key, page_size: "30", langs: "sv,en", fields })}`, 10_000);
      } catch (err) {
        console.error("Open Food Facts, sökning:", err.message);
        throw err;
      }
      const inSweden = h => (h.countries_tags || []).includes("en:sweden") ? 1 : 0;
      const hits = (data.hits || []).map((h, i) => [h, i]).sort((a, b) => inSweden(b[0]) - inSweden(a[0]) || a[1] - b[1]).map(x => x[0]);
      // Fill in nutrients for the first hits if the search did not return them.
      await Promise.all(hits.slice(0, 12).filter(h => !h.nutriments && h.code).map(async h => {
        try { Object.assign(h, await product(h.code)); } catch (err) { console.error(`Open Food Facts, produkt ${h.code}:`, err.message); }
      }));
      const seen = new Set();
      const items = hits.map(offFood).filter(f => f && !seen.has(f.name.toLowerCase()) && seen.add(f.name.toLowerCase())).slice(0, 15);
      offCache.set(key, { items, expires: Date.now() + 864e5 });
      if (offCache.size > 500) offCache.delete(offCache.keys().next().value);
      return items;
    },
  };
}
