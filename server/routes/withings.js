import { Router } from "express";

// The signed-in user's Withings connection. Mounted behind requireUser.
export function withingsRouter(withings) {
  const r = Router();
  const fail = (res, err) => res.status(502).json({ error: err.message });

  r.get("/", (req, res) => res.json(withings.status(req.user.id)));
  r.use((_req, res, next) => (withings.enabled ? next() : res.status(404).json({ error: "Withings är inte inställt på servern." })));

  r.post("/connect", (req, res) => res.json({ url: withings.authorizeUrl(req.user.id) }));
  r.post("/sync", async (req, res) => {
    try { res.json({ ...(await withings.sync(req.user.id)), ...withings.status(req.user.id) }); }
    catch (err) { fail(res, err); }
  });
  r.delete("/", async (req, res) => {
    await withings.disconnect(req.user.id);
    res.json(withings.status(req.user.id));
  });
  return r;
}
