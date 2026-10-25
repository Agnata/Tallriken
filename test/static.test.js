// The pages must work under the server's CSP (no inline scripts or handlers) and only reference files that exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PUBLIC = new URL("../public/", import.meta.url).pathname;
const pages = fs.readdirSync(PUBLIC).filter(f => f.endsWith(".html"));

test("no inline scripts or event handler attributes", () => {
  for (const p of pages) {
    const html = fs.readFileSync(path.join(PUBLIC, p), "utf8");
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, `${p} has an inline <script>`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/, `${p} has an inline event handler`);
  }
  const js = fs.readFileSync(path.join(PUBLIC, "js/app.js"), "utf8");
  assert.doesNotMatch(js, /window\.claude/, "the artifact runtime is not used on the server");
});

test("local scripts, styles and icons exist", () => {
  for (const p of pages) {
    const html = fs.readFileSync(path.join(PUBLIC, p), "utf8");
    for (const [, ref] of html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|svg))"/g)) {
      assert.ok(fs.existsSync(path.join(PUBLIC, ref)), `${p} refers to missing ${ref}`);
    }
  }
});

test("every #id the app looks up exists in app.html", () => {
  const html = fs.readFileSync(path.join(PUBLIC, "app.html"), "utf8");
  const js = fs.readFileSync(path.join(PUBLIC, "js/app.js"), "utf8");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  // Ids created at runtime by the app itself.
  const dynamic = new Set([...js.matchAll(/id=\\?"([A-Za-z]\w*)\\?"/g)].map(m => m[1]));
  const missing = [...js.matchAll(/\$\("#([A-Za-z]\w*)"\)/g)].map(m => m[1]).filter(id => !ids.has(id) && !dynamic.has(id));
  assert.deepEqual([...new Set(missing)], []);
});
