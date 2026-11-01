// Poängen för livsmedel från Livsmedelsverket jämförda med appens egen, handsatta matlista,
// på riktiga näringsvärden (test/fixtures/livsmedelsverket-urval.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { calcPoints, isZeroPointName } from "../public/js/logic.js";

const { items } = JSON.parse(fs.readFileSync(new URL("./fixtures/livsmedelsverket-urval.json", import.meta.url), "utf8"));
const points = it => {
  if (isZeroPointName(it.livsmedelsverket)) return 0;
  const k = it.grams / 100, n = it.per100g;
  return calcPoints(n.kcal * k, n.prot * k, n.sug * k, n.fat * k);
};
// Poster där appens lista medvetet avviker mer än 1 poäng från näringsvärdena. Tom sedan
// listan rättades efter Livsmedelsverket (köttfärs, köttbullar, semla, pannkakor, bearnaisesås,
// mörk choklad, pizza).
const KNOWN = {};

test("fruit, berries and vegetables from Livsmedelsverket are 0 points, as in the app's list", () => {
  for (const it of items.filter(i => i.appPoints === 0)) assert.equal(points(it), 0, it.livsmedelsverket);
});

test("other foods: Livsmedelsverket's values give the app's points within 1 point", () => {
  const off = [];
  for (const it of items.filter(i => i.appPoints > 0 && !KNOWN[i.app])) {
    if (Math.abs(points(it) - it.appPoints) > 1) off.push(`${it.app} ${it.portion}: listan ${it.appPoints} p, Livsmedelsverket ${points(it)} p`);
  }
  assert.deepEqual(off, []);
  const diffs = items.filter(i => i.appPoints > 0 && !KNOWN[i.app]).map(it => points(it) - it.appPoints);
  assert.ok(Math.abs(diffs.reduce((a, b) => a + b, 0) / diffs.length) < 0.5, "no systematic bias");
});


test("sweetened, dried, juice and cooked-with-fat stay with points", () => {
  for (const n of ["Banan torkad", "Blåbärssylt", "Apelsinjuice färskpressad", "Hallon sockrade frysta", "Spenat fräst",
    "Päron konserv m medelsöt lag", "Broccoligratäng m skinka", "Wokgrönsaker m nudlar", "Potatis kokt", "Avokado", "Majskolv"]) {
    assert.equal(isZeroPointName(n), false, n);
  }
  for (const n of ["Banan", "Blåbär frysta", "Broccoli kokt", "Tomater krossade konserv m lag", "Äpple m skal", "Lök röd"]) {
    assert.equal(isZeroPointName(n), true, n);
  }
});
