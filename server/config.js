// All settings come from environment variables (see deploy/tallriken.env.example).
import path from "node:path";

const env = process.env;
const dbPath = env.DB_PATH || "./tallriken.db";
const dataDir = path.dirname(path.resolve(dbPath));

export const config = {
  port: Number(env.PORT || 3000),
  host: env.HOST || "127.0.0.1",
  dbPath,
  dataDir,
  backupDir: env.BACKUP_DIR || path.join(dataDir, "backups"),
  backupKeep: Number(env.BACKUP_KEEP || 30),
  // rsync target for deploy/tallriken-backup-offsite.sh; empty = off.
  offsiteTarget: env.BACKUP_OFFSITE_TARGET || "",
  production: env.NODE_ENV === "production",
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : env.NODE_ENV === "production",
  // Public origin, used to reject cross-site writes. Empty = accept same host only.
  origin: env.PUBLIC_ORIGIN || "",
  sessionDays: Number(env.SESSION_DAYS || 30),
  // Absolute base URL used in e-mail links.
  baseUrl: (env.PUBLIC_ORIGIN || `http://127.0.0.1:${env.PORT || 3000}`).replace(/\/$/, ""),
  // Livsmedelsverkets livsmedelsdatabas (fetched monthly into foodsFile) and Open Food Facts.
  foodsFile: env.FOODS_FILE || path.join(dataDir, "livsmedel.json"),
  foodsMin: Number(env.FOODS_MIN || 100),
  livsmedelUrl: env.LIVSMEDEL_URL || "https://dataportal.livsmedelsverket.se/livsmedel/api/v1",
  offUrl: env.OFF_URL || "https://se.openfoodfacts.org",
  // Withings scale (developer.withings.com). Off unless both id and secret are set.
  withings: {
    enabled: !!(env.WITHINGS_CLIENT_ID && env.WITHINGS_CLIENT_SECRET),
    clientId: env.WITHINGS_CLIENT_ID || "",
    clientSecret: env.WITHINGS_CLIENT_SECRET || "",
    authUrl: env.WITHINGS_AUTH_URL || "https://account.withings.com",
    apiUrl: env.WITHINGS_API_URL || "https://wbsapi.withings.net",
  },
  mail: {
    from: env.MAIL_FROM || "Tallriken <tallriken@parnes.com>",
    // Without SMTP_HOST, mail is logged to the console instead of sent.
    smtp: env.SMTP_HOST ? {
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: env.SMTP_SECURE === "true",
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      // A local postfix on the same machine is reached without TLS.
      ignoreTLS: ["localhost", "127.0.0.1"].includes(env.SMTP_HOST),
    } : null,
  },
};
