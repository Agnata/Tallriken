import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as defaultConfig } from "./config.js";
import { openDb } from "./db.js";
import { createAuth, requireUser, requireAdmin, sameOriginJson } from "./auth.js";
import { createMailer } from "./mailer.js";
import { accountRouter } from "./routes/account.js";
import { adminRouter } from "./routes/admin.js";
import { dataRouter } from "./routes/data.js";
import { health } from "./health.js";
import { startScheduler } from "./scheduler.js";
import { createTwoFactor } from "./twofactor.js";
import { createWithings } from "./withings.js";
import { withingsRouter } from "./routes/withings.js";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const page = name => path.join(PUBLIC, name);

export function createApp(config = defaultConfig, db = openDb(config.dbPath), mailer = createMailer(config.mail)) {
  const app = express();
  const auth = createAuth(db, config);
  const twoFactor = createTwoFactor(db);
  const withings = createWithings(db, config);
  app.locals.withings = withings;
  const loginLimiter = rateLimit({ windowMs: 15 * 60e3, limit: config.loginLimit ?? 10, standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: "För många försök. Vänta en kvart och försök igen." } });

  // Apache runs on the same machine and sets X-Forwarded-For/-Proto.
  app.set("trust proxy", "loopback");
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "style-src": ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
        "font-src": ["https://fonts.gstatic.com"],
        "img-src": ["'self'", "data:", "blob:"],
        "upgrade-insecure-requests": config.production ? [] : null,
      },
    },
  }));
  // The user's data document is the only large request body; everything else stays small.
  app.use("/api/data", express.json({ limit: "5mb" }));
  app.use(express.json({ limit: "50kb" }));
  // Signed-in pages and the API are never cached by browsers or proxies.
  app.use(["/api", "/app", "/konto", "/admin", "/login", "/losenord", "/withings"], (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(auth.middleware);

  // ---- Withings: the browser returns here after approving, and Withings posts new weighings
  // here (form-encoded, so outside /api and its JSON-only rule) ----
  app.get("/withings/callback", requireUser, async (req, res) => {
    if (!withings.enabled) return res.redirect("/app#installningar");
    try {
      const r = await withings.complete(req.user.id, req.query.code, req.query.state);
      res.redirect(`/app?withings=ok&nya=${r.added}#installningar`);
    } catch (err) {
      res.redirect(`/app?withings=fel&meddelande=${encodeURIComponent(err.message)}#installningar`);
    }
  });
  // Withings checks that the address answers before it accepts a subscription.
  app.head("/withings/notify", (_req, res) => res.status(200).end());
  app.get("/withings/notify", (_req, res) => res.status(200).end());
  app.post("/withings/notify", express.urlencoded({ extended: false, limit: "4kb" }), (req, res) => {
    res.status(200).end();
    if (!withings.enabled || req.query.k !== withings.notifyKey) return;
    if (String(req.body?.appli) !== "1") return;
    withings.notified(req.body?.userid).catch(err => console.error("Withings-notis:", err.message));
  });

  app.use("/api", sameOriginJson(config));

  // ---- public ----
  app.get("/", (req, res) => (req.user ? res.redirect("/app") : res.sendFile(page("index.html"))));
  app.get("/login", (req, res) => (req.user ? res.redirect("/app") : res.sendFile(page("login.html"))));

  app.get("/api/health", (_req, res) => {
    const h = health(db, config);
    res.status(h.ok ? 200 : 503).json(h);
  });
  // Liveness without details, used by the installer.
  app.get("/api/public", (_req, res) => res.json({ app: "tallriken" }));

  app.post("/api/login", loginLimiter, (req, res) => {
    const user = auth.login(req.body?.email, req.body?.password);
    if (!user) return res.status(401).json({ error: "Fel e-post eller lösenord." });
    if (user.totp_enabled) return res.json({ totp_required: true, ticket: auth.createChallenge(user.id) });
    auth.startSession(res, user.id);
    res.json({ id: user.id, name: user.name, email: user.email });
  });
  // Second step: a code from the authenticator app, or a recovery code.
  app.post("/api/login/totp", loginLimiter, (req, res) => {
    const r = auth.completeChallenge(req.body?.ticket, req.body?.code, twoFactor);
    if (r.error) return res.status(r.expired ? 410 : 401).json({ error: r.error });
    auth.startSession(res, r.userId);
    res.json({ ok: true, recoveryLeft: r.how === "recovery" ? twoFactor.status(r.userId).recoveryLeft : undefined });
  });
  app.post("/api/logout", (req, res) => { auth.endSession(req, res); res.status(204).end(); });
  app.get("/api/me", (req, res) => res.json({ user: req.user }));
  app.get("/losenord", (_req, res) => res.sendFile(page("losenord.html")));
  app.use("/api", accountRouter(db, auth, mailer, config, twoFactor));

  // ---- signed in ----
  app.get("/app", requireUser, (_req, res) => res.sendFile(page("app.html")));
  app.get("/konto", requireUser, (_req, res) => res.sendFile(page("konto.html")));
  app.use("/api/data", requireUser, dataRouter(db));
  app.use("/api/withings", requireUser, withingsRouter(withings));
  app.get("/admin", requireAdmin, (_req, res) => res.sendFile(page("admin.html")));
  app.use("/api/admin", requireAdmin, adminRouter(db, auth, mailer, config, twoFactor));

  app.use(express.static(PUBLIC, { index: false, extensions: [], maxAge: config.production ? "1h" : 0 }));
  app.use("/api", (_req, res) => res.status(404).json({ error: "Finns inte." }));
  app.use((_req, res) => res.status(404).sendFile(page("404.html")));
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Ogiltig JSON." });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Datan är för stor." });
    console.error(err);
    res.status(500).json({ error: "Något gick fel på servern." });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb(defaultConfig.dbPath);
  const mailer = createMailer(defaultConfig.mail);
  const app = createApp(defaultConfig, db, mailer);
  if (process.env.SCHEDULER !== "false") startScheduler(db, defaultConfig, app.locals.withings);
  app.listen(defaultConfig.port, defaultConfig.host, () =>
    console.log(`Tallriken lyssnar på http://${defaultConfig.host}:${defaultConfig.port}` +
      (defaultConfig.withings.enabled ? " (Withings på)" : "")));
}
