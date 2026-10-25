import crypto from "node:crypto";
import { transaction } from "./db.js";
import { blank } from "../public/js/logic.js";

// Withings Public API: OAuth 2 (account.withings.com/oauth2_user/authorize2, token via
// wbsapi.withings.net/v2/oauth2 action=requesttoken), weights via measure action=getmeas
// (meastype 1, value × 10^unit kg) and notifications via notify action=subscribe (appli 1 = weight).
// Every Withings answer is { status, body }; status 0 is success.
const WEIGHT = 1, APPLI_WEIGHT = 1, SCOPE = "user.metrics";
const TZ = "Europe/Stockholm";

export class WithingsError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");

// "YYYY-MM-DD" for a Unix time in the given time zone.
export function localDate(seconds, timeZone = TZ) {
  let fmt;
  try { fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }); }
  catch { fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }); }
  return fmt.format(new Date(seconds * 1000));
}

// Withings measure groups -> [{date, kg, t}], one per day: the first weighing of the day, since
// mornings are the most comparable. Only real measurements (category 1), not goals.
export function weightsFromGroups(groups, timeZone = TZ) {
  const byDay = new Map();
  for (const g of groups || []) {
    if (g.category !== undefined && g.category !== 1) continue;
    const m = (g.measures || []).find(x => x.type === WEIGHT);
    if (!m) continue;
    const kg = Math.round(m.value * 10 ** m.unit * 10) / 10;
    if (!(kg >= 20 && kg <= 400)) continue;
    const date = localDate(g.date, timeZone);
    const prev = byDay.get(date);
    if (!prev || g.date < prev.t) byDay.set(date, { date, kg, t: g.date });
  }
  return [...byDay.values()];
}

// Puts Withings weighings into the diary's weights ([{date, kg}], one per date). A weight the user
// typed in by hand is never replaced; earlier Withings values for the day are replaced by an
// earlier weighing. Returns the number of days added or changed.
export function mergeWeights(weights, incoming) {
  let changed = 0;
  for (const w of incoming) {
    const i = weights.findIndex(x => x.date === w.date);
    const entry = { date: w.date, kg: w.kg, src: "withings", t: w.t };
    if (i < 0) { weights.push(entry); changed++; }
    else if (weights[i].src === "withings" && (w.t < (weights[i].t ?? Infinity) || (w.t === weights[i].t && w.kg !== weights[i].kg))) {
      weights[i] = entry; changed++;
    }
  }
  return changed;
}

export function createWithings(db, config) {
  const cfg = config.withings || { enabled: false, clientId: "", clientSecret: "" };
  const redirectUri = `${config.baseUrl}/withings/callback`;
  // Withings posts to this URL when there is a new weighing. The key keeps strangers from making
  // the server fetch data on their behalf; it changes if the client secret changes.
  const notifyKey = sha256(`tallriken-notify:${cfg.clientSecret}`).slice(0, 32);
  const notifyUrl = `${config.baseUrl}/withings/notify?k=${notifyKey}`;

  const q = {
    get: db.prepare("SELECT * FROM withings WHERE user_id = ?"),
    byWithingsUser: db.prepare("SELECT * FROM withings WHERE withings_userid = ?"),
    all: db.prepare("SELECT user_id FROM withings WHERE synced_at IS NULL OR synced_at < ?"),
    upsert: db.prepare(`INSERT INTO withings (user_id, withings_userid, access_token, refresh_token, expires_at)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(user_id) DO UPDATE SET withings_userid = excluded.withings_userid,
                          access_token = excluded.access_token, refresh_token = excluded.refresh_token,
                          expires_at = excluded.expires_at, last_error = NULL`),
    tokens: db.prepare("UPDATE withings SET access_token = ?, refresh_token = ?, expires_at = ? WHERE user_id = ?"),
    synced: db.prepare("UPDATE withings SET last_update = ?, synced_at = datetime('now'), last_error = NULL WHERE user_id = ?"),
    failed: db.prepare("UPDATE withings SET last_error = ?, synced_at = datetime('now') WHERE user_id = ?"),
    remove: db.prepare("DELETE FROM withings WHERE user_id = ?"),
    insertState: db.prepare("INSERT INTO oauth_states (state_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+15 minutes'))"),
    takeState: db.prepare("DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > datetime('now') RETURNING user_id"),
    purgeStates: db.prepare("DELETE FROM oauth_states WHERE expires_at <= datetime('now')"),
    doc: db.prepare("SELECT data, version FROM user_data WHERE user_id = ?"),
    insertDoc: db.prepare("INSERT INTO user_data (user_id, data, version) VALUES (?, ?, 1)"),
    updateDoc: db.prepare("UPDATE user_data SET data = ?, version = version + 1, updated_at = datetime('now') WHERE user_id = ?"),
  };

  async function call(path, params, accessToken) {
    const res = await fetch(cfg.apiUrl.replace(/\/$/, "") + path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(20_000),
    });
    const json = await res.json().catch(() => null);
    if (!json || typeof json.status !== "number") throw new WithingsError(`Oväntat svar från Withings (HTTP ${res.status}).`);
    if (json.status !== 0) throw new WithingsError(`Withings svarade med fel ${json.status}${json.error ? `: ${json.error}` : ""}.`, json.status);
    return json.body || {};
  }

  const tokenRequest = params => call("/v2/oauth2", { action: "requesttoken", client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params });
  const saveTokens = (userId, b) => q.tokens.run(b.access_token, b.refresh_token, Date.now() + Number(b.expires_in || 10800) * 1000, userId);

  // A valid access token, refreshed when it has (almost) run out. Withings replaces the refresh
  // token on every refresh, so the new one is stored right away.
  async function accessToken(row) {
    if (row.expires_at > Date.now() + 60_000) return row.access_token;
    const b = await tokenRequest({ grant_type: "refresh_token", refresh_token: row.refresh_token });
    saveTokens(row.user_id, b);
    return b.access_token;
  }

  // Applies fn to the user's diary in one transaction and bumps its version when anything changed,
  // so open apps pick up the new weights instead of overwriting them.
  function updateDiary(userId, fn) {
    return transaction(db, () => {
      const row = q.doc.get(userId);
      const data = row ? JSON.parse(row.data) : blank();
      if (!Array.isArray(data.weights)) data.weights = [];
      const changed = fn(data);
      if (!changed) return 0;
      if (row) q.updateDoc.run(JSON.stringify(data), userId);
      else q.insertDoc.run(userId, JSON.stringify(data));
      return changed;
    });
  }

  async function sync(userId) {
    const row = q.get.get(userId);
    if (!row) throw new WithingsError("Ingen Withings-våg är kopplad.");
    try {
      const token = await accessToken(row);
      const groups = [];
      let offset, timezone = TZ, updatetime = row.last_update;
      for (let page = 0; page < 50; page++) {
        const body = await call("/measure", { action: "getmeas", meastype: WEIGHT, category: 1, lastupdate: row.last_update, ...(offset ? { offset } : {}) }, token);
        groups.push(...(body.measuregrps || []));
        if (body.timezone) timezone = body.timezone;
        if (body.updatetime) updatetime = Math.max(updatetime, Number(body.updatetime));
        if (!body.more) break;
        offset = body.offset;
      }
      const incoming = weightsFromGroups(groups, timezone);
      const added = updateDiary(userId, data => mergeWeights(data.weights, incoming));
      q.synced.run(updatetime, userId);
      return { added, measurements: groups.length };
    } catch (err) {
      q.failed.run(err.message, userId);
      throw err;
    }
  }

  return {
    enabled: cfg.enabled,
    redirectUri,
    notifyUrl,
    notifyKey,

    status(userId) {
      const row = q.get.get(userId);
      return { enabled: cfg.enabled, connected: !!row, syncedAt: row?.synced_at ? row.synced_at.replace(" ", "T") + "Z" : null, error: row?.last_error || null };
    },

    // Where to send the browser to approve access. The state ties the answer to this user.
    authorizeUrl(userId) {
      q.purgeStates.run();
      const state = crypto.randomBytes(24).toString("base64url");
      q.insertState.run(sha256(state), userId);
      const p = new URLSearchParams({ response_type: "code", client_id: cfg.clientId, scope: SCOPE, redirect_uri: redirectUri, state });
      return `${cfg.authUrl.replace(/\/$/, "")}/oauth2_user/authorize2?${p}`;
    },

    // The browser comes back with ?code&state. The code is valid for a short time only.
    async complete(userId, code, state) {
      const owner = state ? q.takeState.get(sha256(String(state)))?.user_id : null;
      if (!owner || owner !== userId) throw new WithingsError("Kopplingen har gått ut eller hör till någon annan. Försök igen.");
      if (!code) throw new WithingsError("Withings skickade ingen kod. Försök igen.");
      const b = await tokenRequest({ grant_type: "authorization_code", code: String(code), redirect_uri: redirectUri });
      const other = q.byWithingsUser.get(String(b.userid));
      if (other && other.user_id !== userId) throw new WithingsError("Den här Withings-vågen är redan kopplad till en annan användare.");
      q.upsert.run(userId, String(b.userid), b.access_token, b.refresh_token, Date.now() + Number(b.expires_in || 10800) * 1000);
      // Notifications are a bonus; the hourly check covers us if they cannot be set up.
      try { await call("/notify", { action: "subscribe", callbackurl: notifyUrl, appli: APPLI_WEIGHT }, b.access_token); }
      catch (err) { console.error("Withings-notiser:", err.message); }
      return sync(userId);
    },

    sync,

    async disconnect(userId) {
      const row = q.get.get(userId);
      if (!row) return;
      try {
        await call("/notify", { action: "revoke", callbackurl: notifyUrl, appli: APPLI_WEIGHT }, await accessToken(row));
      } catch (err) { console.error("Withings, avsluta notiser:", err.message); }
      q.remove.run(userId);
    },

    // A notification names the Withings user; unknown users are ignored.
    async notified(withingsUserId) {
      const row = q.byWithingsUser.get(String(withingsUserId || ""));
      if (!row) return null;
      return sync(row.user_id);
    },

    // Fallback in case notifications are lost: everyone not synced in the last `hours` hours.
    async syncStale(hours = 6) {
      const cutoff = new Date(Date.now() - hours * 36e5).toISOString().replace("T", " ").slice(0, 19);
      let ok = 0, failed = 0;
      for (const { user_id } of q.all.all(cutoff)) {
        try { await sync(user_id); ok++; } catch (err) { failed++; console.error(`Withings för användare ${user_id}:`, err.message); }
      }
      return { ok, failed };
    },
  };
}
