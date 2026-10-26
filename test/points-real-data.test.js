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
// Där appens lista och näringsvärdena skiljer mer än 1 poäng. Listan är handsatt i artefakten;
// här är det listan som avviker, inte uträkningen.
const KNOWN = {
  "Köttfärs 10 %": "listan 6 p, 125 g stekt nötfärs 10 % ger 8 p",
  "Semla": "listan 18 p, en semla på 120 g ger 14 p",
};

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

test("the known differences are still there (update KNOWN if the list changes)", () => {
  for (const name of Object.keys(KNOWN)) {
    const it = items.find(i => i.app === name);
    assert.ok(Math.abs(points(it) - it.appPoints) > 1, `${name}: ${KNOWN[name]}`);
  }
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
