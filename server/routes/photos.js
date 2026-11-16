import { Router } from "express";
import crypto from "node:crypto";

export const MAX_PHOTO = 3 * 1024 * 1024;
// Recognised by their first bytes, whatever the client says.
const TYPES = [["image/jpeg", [0xff, 0xd8, 0xff]], ["image/png", [0x89, 0x50, 0x4e, 0x47]], ["image/webp", [0x52, 0x49, 0x46, 0x46]]];

// The signed-in user's own photos, e.g. for a feast. The app shrinks them before upload.
// POST { data: "data:image/jpeg;base64,…" } -> { id }; GET /:id serves it to its owner only.
export function photosRouter(db) {
  const r = Router();
  const q = {
    insert: db.prepare("INSERT INTO photos (id, user_id, type, data) VALUES (?, ?, ?, ?)"),
    get: db.prepare("SELECT type, data FROM photos WHERE id = ? AND user_id = ?"),
    remove: db.prepare("DELETE FROM photos WHERE id = ? AND user_id = ?"),
  };

  r.post("/", (req, res) => {
    const m = /^data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.data || ""));
    if (!m) return res.status(400).json({ error: "Förväntade en bild." });
    const buf = Buffer.from(m[1], "base64");
    if (buf.length > MAX_PHOTO) return res.status(413).json({ error: "Bilden är för stor." });
    const type = TYPES.find(([, magic]) => magic.every((b, i) => buf[i] === b))?.[0];
    if (!type) return res.status(400).json({ error: "Bara JPEG, PNG och WebP går att spara." });
    const id = crypto.randomBytes(16).toString("hex");
    q.insert.run(id, req.user.id, type, buf);
    res.status(201).json({ id });
  });

  r.get("/:id", (req, res) => {
    const row = q.get.get(String(req.params.id), req.user.id);
    if (!row) return res.status(404).json({ error: "Bilden finns inte." });
    res.type(row.type).set("Cache-Control", "private, max-age=31536000, immutable").send(Buffer.from(row.data));
  });

  r.delete("/:id", (req, res) => {
    q.remove.run(String(req.params.id), req.user.id);
    res.status(204).end();
  });
  return r;
}
