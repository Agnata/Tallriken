import { Router } from "express";
import { transaction } from "../db.js";

// The largest document we accept. A year of daily logging is around 1 MB.
export const MAX_BYTES = 4 * 1024 * 1024;

// The signed-in user's own Tallriken data: one JSON document, replaced as a whole.
// PUT carries the version it was based on; if another device saved in between, the answer
// is 409 with the current document so the app can show the latest state.
export function dataRouter(db) {
  const r = Router();
  const q = {
    get: db.prepare("SELECT data, version, updated_at FROM user_data WHERE user_id = ?"),
    insert: db.prepare("INSERT INTO user_data (user_id, data, version) VALUES (?, ?, 1)"),
    update: db.prepare("UPDATE user_data SET data = ?, version = version + 1, updated_at = datetime('now') WHERE user_id = ? AND version = ?"),
  };
  const view = row => row
    ? { data: JSON.parse(row.data), version: row.version, updatedAt: row.updated_at.replace(" ", "T") + "Z" }
    : { data: null, version: 0, updatedAt: null };

  r.get("/", (req, res) => res.json(view(q.get.get(req.user.id))));

  r.put("/", (req, res) => {
    const { data, version } = req.body || {};
    if (!data || typeof data !== "object" || Array.isArray(data)) return res.status(400).json({ error: "Ogiltig data." });
    if (!Number.isInteger(version) || version < 0) return res.status(400).json({ error: "Ogiltig version." });
    const json = JSON.stringify(data);
    if (Buffer.byteLength(json) > MAX_BYTES) return res.status(413).json({ error: "Datan är för stor." });

    const result = transaction(db, () => {
      const row = q.get.get(req.user.id);
      if (!row) {
        if (version !== 0) return { conflict: true, row };
        q.insert.run(req.user.id, json);
      } else if (q.update.run(json, req.user.id, version).changes !== 1) {
        return { conflict: true, row };
      }
      return { row: q.get.get(req.user.id) };
    });
    if (result.conflict) {
      return res.status(409).json({ error: "Datan har ändrats på en annan enhet.", ...view(result.row) });
    }
    const v = view(result.row);
    res.json({ version: v.version, updatedAt: v.updatedAt });
  });

  return r;
}
