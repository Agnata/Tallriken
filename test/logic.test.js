// The calculations the app is built on (public/js/logic.js), checked in Swedish time.
process.env.TZ = "Europe/Stockholm";
import { test } from "node:test";
import assert from "node:assert/strict";

const L = await import("../public/js/logic.js");

test("points: energy, sugar and fat up, protein down, never negative", () => {
  assert.equal(L.calcPoints(0, 0, 0, 0), 0);
  assert.equal(L.calcPoints(100, 0, 0, 0), 3);
  assert.equal(L.calcPoints(132, 0, 0, 0), 4);
  assert.ok(L.calcPoints(200, 0, 20, 0) > L.calcPoints(200, 0, 0, 0), "sugar costs");
  assert.ok(L.calcPoints(200, 0, 0, 10) > L.calcPoints(200, 0, 0, 0), "saturated fat costs");
  assert.ok(L.calcPoints(200, 20, 0, 0) < L.calcPoints(200, 0, 0, 0), "protein helps");
  assert.equal(L.calcPoints(50, 40, 0, 0), 0);
  // Plain quark, 2 dl: about 110 kcal, 22 g protein, 7 g sugar, 0.2 g saturated fat -> 2 p as in the food list.
  assert.equal(L.calcPoints(110, 22, 7, 0.2), 2);
});

test("activity points by minutes and intensity", () => {
  assert.equal(L.actPoints(30, 1), 1);
  assert.equal(L.actPoints(30, 2), 2);
  assert.equal(L.actPoints(30, 3), 4);
  assert.equal(L.actPoints(60, 2), 5);
  assert.equal(L.actPoints(5, 1), 0);
});

test("dates: days, Mondays and ISO weeks, across DST and new year", () => {
  assert.equal(L.addDays("2026-10-25", 1), "2026-10-26", "day after DST ends");
  assert.equal(L.addDays("2026-03-29", -1), "2026-03-28", "day before DST starts");
  assert.equal(L.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(L.mondayOf("2026-10-25"), "2026-10-19", "Sunday belongs to the week before");
  assert.equal(L.mondayOf("2026-10-26"), "2026-10-26");
  assert.equal(L.isoWeek("2026-10-25"), 43);
  assert.equal(L.isoWeek("2027-01-01"), 53, "1 January 2027 is in week 53 of 2026");
  assert.equal(L.isoWeek("2026-01-01"), 1);
  assert.equal(L.iso(new Date(2026, 9, 25, 23, 30)), "2026-10-25", "late evening is still the same local day");
});

test("daily points from energy need, with floors and limits", () => {
  const b = L.energyBudget({ sex: "kvinna", age: 58, height: 165, kg: 82, pal: 1.4 });
  assert.equal(Math.round(b.keep), 1960);
  assert.equal(Math.round(b.target), 1460, "500 kcal below what keeps the weight");
  assert.equal(b.pts, 22);
  const small = L.energyBudget({ sex: "kvinna", age: 75, height: 150, kg: 50, pal: 1.4 });
  assert.equal(small.target, 1200, "never below 1 200 kcal for women");
  assert.equal(small.pts, 18);
  assert.equal(L.energyBudget({ sex: "man", age: 70, height: 160, kg: 55, pal: 1.4 }).target, 1500);
  assert.equal(L.energyBudget({ sex: "man", age: 25, height: 200, kg: 150, pal: 1.7 }).pts, 45, "capped at 45");
});

test("sun: midwinter and midsummer in Luleå and Kiruna", () => {
  const winter = L.sunTimes("2026-12-21", 65.58, 22.15);
  assert.ok(winter.len < 4 * 60 && winter.len > 60, `Luleå midwinter daylight ${winter.len} min`);
  assert.ok(winter.rise > 9.5 * 60 && winter.set < 13.5 * 60, "sun up late morning to early afternoon");
  assert.ok(L.sunTimes("2026-12-21", 67.86, 20.23).polar, "polar night in Kiruna");
  assert.ok(L.sunTimes("2026-06-21", 67.86, 20.23).midnight, "midnight sun in Kiruna");
  const sthlm = L.sunTimes("2026-06-21", 59.33, 18.07);
  assert.ok(Math.abs(sthlm.rise - (3 * 60 + 31)) < 10, "Stockholm sunrise around 03:31 at midsummer");
});

test("portion units", () => {
  assert.deepEqual(L.parseUnit("2 dl"), { amt: 2, unit: "dl" });
  assert.deepEqual(L.parseUnit("2 skivor (20 g)"), { amt: 20, unit: "g" });
  assert.deepEqual(L.parseUnit("1,5 msk"), { amt: 1.5, unit: "msk" });
  assert.equal(L.parseUnit("valfri mängd"), null);
});

test("normalize repairs partial documents; looksLikeDiary spots copies", () => {
  const s = L.normalize({ settings: { daily: 25 }, days: { "2026-10-25": { foods: [{ name: "Äpple", points: 0 }] } }, weights: null });
  assert.equal(s.settings.daily, 25);
  assert.equal(s.settings.weekly, 30, "missing settings get defaults");
  assert.deepEqual(s.weights, []);
  assert.deepEqual(s.days["2026-10-25"].acts, []);
  assert.equal(s.bites.length, 5);
  assert.deepEqual(L.normalize(null).days, {});
  assert.ok(L.looksLikeDiary(L.blank()));
  assert.ok(!L.looksLikeDiary({ days: {} }));
  assert.ok(!L.looksLikeDiary([]));
  assert.ok(!L.looksLikeDiary(null));
});
