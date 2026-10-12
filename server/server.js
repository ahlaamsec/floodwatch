// Flood Watch v2 — backend
// One small Express server: serves the website from /public and a JSON API under /api.
// Data lives in data/db.json (plus audio files in data/), or in Upstash Redis when hosted on Vercel
// (see store.js). No accounts, no names, no exact locations.
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { CITIES, findArea } from "./areas.js";
import { createStore } from "./store.js";
import { redisFromEnv } from "./storage.js";
import { ask } from "./ai.js";
import { khayaEnabled, tts, asr, translate } from "./khaya.js";
import { rainOutlook } from "./weather.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_VERSION = "2.1.0";

const LEVELS = ["watching", "rising", "danger"];
const LANGS = ["en", "twi", "dag"];
const ALERT_SHOW_HOURS = 12; // shown in the list
const ALERT_KEEP_HOURS = 24; // deleted (with voice note) after this
const BLOB_TTL = (ALERT_KEEP_HOURS + 1) * 3600; // voice notes and photos expire by themselves in Redis
const TTS_TTL = 7 * 24 * 3600;
const VOICE_ID = /^[a-f0-9]{12}$/;

/** "One vote per phone" needs the same salt every time. Without TOKEN_SALT we derive one from the
 *  Redis token (stable across serverless restarts) or, on a normal server, make a random one. */
function makeHasher(redis) {
  const salt =
    process.env.TOKEN_SALT ||
    (redis ? crypto.createHash("sha256").update("fw-salt|" + redis.token).digest("hex") : crypto.randomBytes(16).toString("hex"));
  return (t) => crypto.createHash("sha256").update(salt + String(t)).digest("hex").slice(0, 16);
}
const newId = () => crypto.randomBytes(6).toString("hex");
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max);

/** Simple in-memory rate limiter (per IP, never stored). */
function rateLimit(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: "Too many requests. Please wait a little." });
    arr.push(now);
    hits.set(key, arr);
    next();
  };
}

/** Send bytes with HTTP Range support. Safari/iPhone will not play <audio> without it. */
function sendBytes(req, res, { data, type }, fallbackType) {
  res.set("Accept-Ranges", "bytes");
  res.type(type || fallbackType);
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.get("range") || "");
  if (m && (m[1] || m[2])) {
    let start = m[1] === "" ? Math.max(0, data.length - Number(m[2])) : Number(m[1]);
    let end = m[1] === "" || m[2] === "" ? data.length - 1 : Math.min(Number(m[2]), data.length - 1);
    if (start > end || start >= data.length) {
      res.set("Content-Range", `bytes */${data.length}`);
      return res.status(416).end();
    }
    res.status(206).set("Content-Range", `bytes ${start}-${end}/${data.length}`);
    return res.send(data.subarray(start, end + 1));
  }
  return res.send(data);
}

/** Express 4 does not catch errors thrown in async routes; this hands them to the error handler. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Where files go when the host has a normal disk. Vercel only allows writing in /tmp. */
const defaultDataDir = () => (process.env.VERCEL ? "/tmp/flood-watch-data" : path.join(__dirname, "..", "data"));

/**
 * createApp()                  -> uses Upstash Redis if its environment variables are set, else files
 * createApp({ dataDir })       -> always files (tests, local experiments)
 * createApp({ redis })         -> that Redis client (tests)
 */
export function createApp(options = {}) {
  const redis = options.redis !== undefined ? options.redis : options.dataDir ? null : redisFromEnv();
  const dataDir = options.dataDir || defaultDataDir();
  const store = createStore(dataDir, { redis });
  const hashToken = makeHasher(redis);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), geolocation=(self), microphone=(self)",
      "X-Frame-Options": "SAMEORIGIN",
    });
    next();
  });
  app.use(express.json({ limit: "100kb" }));
  const rawAudio = express.raw({ type: ["audio/*", "application/octet-stream"], limit: "3mb" });
  const writeLimit = rateLimit(40, 10 * 60 * 1000);

  // Researcher-only routes can be protected with a PIN (set RESEARCH_PIN in .env).
  const researchOnly = (req, res, next) => {
    const pin = process.env.RESEARCH_PIN;
    if (pin && req.get("x-research-pin") !== pin) return res.status(401).json({ error: "Researcher PIN needed" });
    next();
  };

  // ---------- helpers ----------
  function publicAlert(a) {
    const ageMin = Math.floor((Date.now() - a.ts) / 60000);
    const confirms = a.votes.confirm.length;
    const falses = a.votes.false.length;
    return {
      id: a.id,
      areaId: a.areaId,
      areaName: a.areaName,
      cityId: a.cityId,
      level: a.level,
      landmark: a.landmark,
      lang: a.lang,
      hasVoice: Boolean(a.voiceId),
      photoUrl: a.photoId ? `/api/photo/${a.photoId}` : null,
      voiceUrl: a.voiceId ? `/api/voice/${a.voiceId}` : null,
      locationChecked: a.locationChecked,
      practice: Boolean(a.practice),
      ts: a.ts,
      ageMin,
      confirms,
      falses,
      helpful: a.votes.helpful.length,
      unhelpful: a.votes.unhelpful.length,
      // Trust status shown to users. Simple, explainable rules (no hidden score):
      status: falses >= 3 && falses > confirms ? "disputed" : ageMin > 180 ? "old" : confirms >= 2 ? "confirmed" : "new",
    };
  }

  function cleanup() {
    const cutoff = Date.now() - ALERT_KEEP_HOURS * 3600 * 1000;
    const keep = [];
    for (const a of store.db.alerts) {
      if (a.ts >= cutoff) keep.push(a);
      else {
        if (a.voiceId) store.blobs.del("voice", a.voiceId).catch(() => {});
        if (a.photoId) store.blobs.del("photos", a.photoId).catch(() => {});
      }
    }
    if (keep.length !== store.db.alerts.length) {
      store.db.alerts = keep;
      store.save();
    }
    // Uploaded but never attached to an alert (files only; in Redis they expire on their own)
    store.blobs.sweep?.(cutoff);
  }

  // ---------- Redis mode: load before, save before answering ----------
  // A serverless function can be frozen as soon as it has answered, so changes must be saved first.
  // Requests that touch the data wait for each other (one at a time per running instance) so two
  // people voting at the same moment cannot overwrite each other.
  if (store.mode === "redis") {
    const needsDb = /^\/(alerts|practice-alerts|phrases|sessions)/;
    let queue = Promise.resolve();
    app.use("/api", (req, res, next) => {
      if (!needsDb.test(req.path)) return next();
      const before = queue;
      let release;
      queue = new Promise((r) => (release = r));
      const unlock = () => release();
      const timeout = setTimeout(unlock, 15000); // never let one stuck request block everyone
      res.once("close", () => { clearTimeout(timeout); unlock(); });

      before.then(async () => {
        try {
          await store.load();
          cleanup();
        } catch (e) {
          console.error(e);
          return res.status(503).json({ error: "Storage is not available right now" });
        }
        const end = res.end.bind(res);
        res.end = (...args) => {
          store.commit().then(
            () => end(...args),
            (e) => {
              console.error(e);
              res.removeHeader("Content-Length");
              res.removeHeader("ETag");
              res.status(503).type("json");
              end(JSON.stringify({ error: "Could not save. Please try again." }));
            }
          );
          return res;
        };
        next();
      });
    });
  } else {
    cleanup();
    const cleanupTimer = setInterval(cleanup, 10 * 60 * 1000);
    cleanupTimer.unref();
  }

  // ---------- public API ----------
  app.get("/api/health", wrap(async (req, res) => {
    // On Vercel without Redis, data is lost whenever the function restarts; and a wrong or
    // unreachable Redis is the most likely deployment mistake. So this page really tests it.
    let persistent = store.mode === "redis" || !process.env.VERCEL;
    let problem;
    if (store.mode === "redis") {
      try {
        await store.redis.cmd("EXISTS", "fw:db");
      } catch (e) {
        persistent = false;
        problem = "Cannot reach Redis. Check the KV_REST_API_URL and KV_REST_API_TOKEN variables.";
      }
    }
    res.json({
      ok: true,
      version: APP_VERSION,
      features: { ai: Boolean(process.env.GEMINI_API_KEY), khaya: khayaEnabled(), researchPin: Boolean(process.env.RESEARCH_PIN) },
      storage: store.mode === "redis" ? "redis" : "files",
      persistent,
      ...(problem ? { problem } : {}),
    });
  }));

  app.get("/api/areas", (req, res) => res.json({ cities: CITIES }));

  app.get("/api/alerts", (req, res) => {
    const since = Date.now() - ALERT_SHOW_HOURS * 3600 * 1000;
    let list = store.db.alerts.filter((a) => a.ts >= since);
    if (req.query.city) list = list.filter((a) => a.cityId === req.query.city);
    if (req.query.area) list = list.filter((a) => a.areaId === req.query.area);
    res.json({ alerts: list.sort((a, b) => b.ts - a.ts).map(publicAlert), serverTime: Date.now() });
  });

  app.post("/api/alerts", writeLimit, wrap(async (req, res) => {
    const b = req.body || {};
    const area = findArea(b.areaId);
    if (!area) return res.status(400).json({ error: "Unknown area" });
    if (!LEVELS.includes(b.level)) return res.status(400).json({ error: "Choose how bad the water is" });
    const landmark = clean(b.landmark, 120);
    const voiceId = b.voiceId && VOICE_ID.test(b.voiceId) && (await store.blobs.has("voice", b.voiceId)) ? b.voiceId : null;
    const photoId = b.photoId && VOICE_ID.test(b.photoId) && (await store.blobs.has("photos", b.photoId)) ? b.photoId : null;
    if (!landmark && !voiceId) return res.status(400).json({ error: "Say or type where the water is" });

    const alert = {
      id: newId(),
      areaId: area.id,
      areaName: area.name,
      cityId: area.cityId,
      level: b.level,
      landmark,
      voiceId,
      photoId,
      lang: LANGS.includes(b.lang) ? b.lang : "en",
      // The phone checked it is inside this area. We get a yes/no, never coordinates.
      locationChecked: b.locationChecked === true,
      ts: Date.now(),
      votes: { confirm: b.deviceToken ? [hashToken(b.deviceToken)] : [], false: [], helpful: [], unhelpful: [] },
    };
    store.db.alerts.push(alert);
    store.save();
    res.status(201).json({ alert: publicAlert(alert) });
  }));

  // Research mode: add one clearly-labelled PRACTICE alert per area so every tester
  // has something to find in their own area during the timed task.
  app.post("/api/practice-alerts", researchOnly, (req, res) => {
    const examples = [
      ["danger", "Near the main road junction"],
      ["rising", "Behind the market"],
      ["watching", "By the big gutter near the school"],
      ["rising", "Near the mosque"],
      ["danger", "At the bridge by the filling station"],
    ];
    const created = [];
    CITIES.forEach((c) =>
      c.areas.forEach((area, i) => {
        const [level, landmark] = examples[i % examples.length];
        const a = {
          id: newId(), areaId: area.id, areaName: area.name, cityId: c.id, level, landmark, voiceId: null,
          lang: "en", locationChecked: false, practice: true, ts: Date.now() - (5 + i * 7) * 60000,
          votes: { confirm: ["p1", "p2", "p3"].slice(0, 1 + (i % 3)), false: [], helpful: [], unhelpful: [] },
        };
        store.db.alerts.push(a);
        created.push(a.id);
      })
    );
    store.save();
    res.status(201).json({ created: created.length });
  });
  app.delete("/api/practice-alerts", researchOnly, (req, res) => {
    store.db.alerts = store.db.alerts.filter((a) => !a.practice);
    store.save();
    res.json({ ok: true });
  });

  app.post("/api/alerts/:id/vote", writeLimit, (req, res) => {
    const a = store.db.alerts.find((x) => x.id === req.params.id);
    if (!a) return res.status(404).json({ error: "Alert not found" });
    const type = req.body?.type;
    if (!["confirm", "false", "helpful", "unhelpful"].includes(type)) return res.status(400).json({ error: "Bad vote" });
    if (!req.body?.deviceToken) return res.status(400).json({ error: "Missing device token" });
    const h = hashToken(req.body.deviceToken);
    // One person = one vote. "I see it too" and "Not true" cancel each other out.
    const opposite = { confirm: "false", false: "confirm", helpful: "unhelpful", unhelpful: "helpful" }[type];
    a.votes[opposite] = a.votes[opposite].filter((x) => x !== h);
    if (!a.votes[type].includes(h)) a.votes[type].push(h);
    store.save();
    res.json({ alert: publicAlert(a) });
  });

  // Voice notes: someone records "where" instead of typing. Deleted after 24h.
  app.post("/api/voice", writeLimit, rawAudio, wrap(async (req, res) => {
    if (!req.body?.length) return res.status(400).json({ error: "No audio" });
    const id = newId();
    await store.blobs.put("voice", id, req.body, { type: clean(req.get("content-type"), 60), ttl: BLOB_TTL });
    res.status(201).json({ id });
  }));
  app.get("/api/voice/:id", wrap(async (req, res) => {
    if (!VOICE_ID.test(req.params.id)) return res.status(400).end();
    const b = await store.blobs.get("voice", req.params.id);
    if (!b) return res.status(404).end();
    sendBytes(req, res, b, "audio/webm");
  }));

  // Photos of the water. The phone re-draws the picture before upload, which removes
  // hidden GPS/camera data (EXIF). Deleted with the alert after 24h.
  app.post("/api/photo", writeLimit, express.raw({ type: ["image/jpeg"], limit: "1.5mb" }), wrap(async (req, res) => {
    const b = req.body;
    if (!b?.length || b[0] !== 0xff || b[1] !== 0xd8) return res.status(400).json({ error: "Send a JPEG photo" });
    const id = newId();
    await store.blobs.put("photos", id, b, { type: "image/jpeg", ttl: BLOB_TTL });
    res.status(201).json({ id });
  }));
  app.get("/api/photo/:id", wrap(async (req, res) => {
    if (!VOICE_ID.test(req.params.id)) return res.status(400).end();
    const b = await store.blobs.get("photos", req.params.id);
    if (!b) return res.status(404).end();
    sendBytes(req, res, { data: b.data, type: "image/jpeg" });
  }));

  app.get("/api/rain/:areaId", async (req, res) => {
    const area = findArea(req.params.areaId);
    if (!area) return res.status(404).json({ error: "Unknown area" });
    res.json(await rainOutlook(area));
  });

  app.post("/api/assistant", rateLimit(20, 10 * 60 * 1000), async (req, res) => {
    const question = clean(req.body?.question, 500);
    if (!question) return res.status(400).json({ error: "Ask a question" });
    const lang = LANGS.includes(req.body?.lang) ? req.body.lang : "en";
    res.json(await ask(question, lang));
  });

  // Machine text-to-speech for Twi/Dagbani (only if a Khaya key is set). Cached (disk, or Redis for a week).
  app.get("/api/tts", wrap(async (req, res) => {
    const lang = req.query.lang;
    const text = clean(req.query.text, 400);
    if (!khayaEnabled()) return res.status(501).json({ error: "Machine voice not configured" });
    if (!["twi", "dag", "en"].includes(lang) || !text) return res.status(400).end();
    const key = crypto.createHash("sha1").update(lang + "|" + text).digest("hex");
    try {
      let b = await store.blobs.get("tts-cache", key);
      if (!b) {
        b = { data: Buffer.from(await tts(text, lang)), type: "audio/wav" };
        await store.blobs.put("tts-cache", key, b.data, { type: "audio/wav", ttl: TTS_TTL });
      }
      sendBytes(req, res, { data: b.data, type: "audio/wav" });
    } catch (e) {
      res.status(502).json({ error: "Voice service failed" });
    }
  }));

  // Machine speech-to-text (expects 16 kHz mono WAV, which the browser makes for us).
  app.post("/api/asr", rateLimit(30, 10 * 60 * 1000), rawAudio, async (req, res) => {
    const lang = req.query.lang;
    if (!["twi", "dag", "en"].includes(lang)) return res.status(400).end();
    if (!khayaEnabled()) return res.status(501).json({ error: "Speech recognition not configured" });
    try {
      res.json({ text: clean(await asr(req.body, lang), 300) });
    } catch {
      res.status(502).json({ error: "Speech service failed" });
    }
  });

  // ---------- Language Studio (native speakers review + record phrases) ----------
  const PHRASE_KEY = /^[a-zA-Z0-9_.]{1,60}$/;
  app.get("/api/phrases/audio", (req, res) => res.json(store.db.phraseAudio));
  app.get("/api/phrases/audio/:lang/:key", wrap(async (req, res) => {
    const { lang, key } = req.params;
    if (!LANGS.includes(lang) || !PHRASE_KEY.test(key)) return res.status(400).end();
    const meta = store.db.phraseAudio[lang]?.[key];
    const b = meta && (await store.blobs.get("phrases", `${lang}__${key}`));
    if (!b) return res.status(404).end();
    res.set("Cache-Control", "no-cache");
    sendBytes(req, res, { data: b.data, type: meta.type }, "audio/webm");
  }));
  app.put("/api/phrases/audio/:lang/:key", researchOnly, rawAudio, wrap(async (req, res) => {
    const { lang, key } = req.params;
    if (!LANGS.includes(lang) || !PHRASE_KEY.test(key)) return res.status(400).end();
    if (!req.body?.length) return res.status(400).json({ error: "No audio" });
    const type = clean(req.get("content-type"), 60);
    await store.blobs.put("phrases", `${lang}__${key}`, req.body, { type });
    store.db.phraseAudio[lang] ||= {};
    store.db.phraseAudio[lang][key] = { type, speaker: clean(req.get("x-speaker-id"), 10), at: Date.now() };
    store.save();
    res.status(201).json({ ok: true });
  }));
  app.delete("/api/phrases/audio/:lang/:key", researchOnly, wrap(async (req, res) => {
    const { lang, key } = req.params;
    if (!LANGS.includes(lang) || !PHRASE_KEY.test(key)) return res.status(400).end();
    if (store.db.phraseAudio[lang]) delete store.db.phraseAudio[lang][key];
    await store.blobs.del("phrases", `${lang}__${key}`);
    store.save();
    res.json({ ok: true });
  }));

  app.get("/api/phrases/review", (req, res) => res.json({ reviews: store.db.phraseReviews }));
  // Anyone may suggest a better wording (text only, rate-limited). Recordings still need the researcher PIN,
  // because recordings are played to everyone straight away.
  app.post("/api/phrases/review", rateLimit(60, 10 * 60 * 1000), (req, res) => {
    const b = req.body || {};
    if (!LANGS.includes(b.lang) || !PHRASE_KEY.test(b.key || "")) return res.status(400).json({ error: "Bad phrase" });
    if (!["correct", "awkward", "wrong"].includes(b.verdict)) return res.status(400).json({ error: "Choose correct, awkward or wrong" });
    const review = {
      id: newId(),
      lang: b.lang,
      key: b.key,
      verdict: b.verdict,
      better: clean(b.better, 400),
      note: clean(b.note, 300),
      reviewer: clean(b.reviewer, 10) || "R?",
      community: process.env.RESEARCH_PIN ? req.get("x-research-pin") !== process.env.RESEARCH_PIN : Boolean(b.community),
      at: Date.now(),
    };
    store.db.phraseReviews.push(review);
    store.save();
    res.status(201).json({ review });
  });

  app.get("/api/translate-draft", researchOnly, async (req, res) => {
    if (!khayaEnabled()) return res.status(501).json({ error: "Machine translation not configured" });
    const to = req.query.to;
    if (!["twi", "dag"].includes(to)) return res.status(400).end();
    try {
      res.json({ text: await translate(clean(req.query.text, 400), "en", to) });
    } catch {
      res.status(502).json({ error: "Translation failed" });
    }
  });

  // ---------- Research mode: test sessions (before / after) ----------
  const SESSION_FIELDS = {
    round: ["before", "after"],
    completed: ["yes", "with_help", "no", ""],
    language: ["en", "twi", "dag", "mixed", ""],
    ageRange: ["", "under-18", "18-29", "30-44", "45-59", "60-74", "75+"],
  };
  app.get("/api/sessions", researchOnly, (req, res) => res.json({ sessions: store.db.sessions }));
  app.post("/api/sessions", researchOnly, (req, res) => {
    const b = req.body || {};
    for (const [k, allowed] of Object.entries(SESSION_FIELDS)) {
      if (b[k] !== undefined && !allowed.includes(b[k])) return res.status(400).json({ error: `Bad value for ${k}` });
    }
    if (!SESSION_FIELDS.round.includes(b.round)) return res.status(400).json({ error: "Round must be before or after" });
    if (b.consent !== true) return res.status(400).json({ error: "Consent is required before saving a session" });
    const n = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));
    const session = {
      id: newId(),
      round: b.round,
      appVersion: clean(b.appVersion, 10) || (b.round === "before" ? "1.0" : APP_VERSION),
      testerId: clean(b.testerId, 10),
      area: clean(b.area, 40),
      ageRange: b.ageRange || "",
      language: b.language || "",
      date: clean(b.date, 10),
      consent: true,
      completed: b.completed || "",
      taskSeconds: n(b.taskSeconds),
      taskTaps: n(b.taskTaps),
      stuck: clean(b.stuck, 600),
      q1Purpose: clean(b.q1Purpose, 800),
      q2Advice: clean(b.q2Advice, 800),
      trust: n(b.trust),
      trustWhy: clean(b.trustWhy, 600),
      q4Sharing: clean(b.q4Sharing, 800),
      q5Change: clean(b.q5Change, 800),
      ease: n(b.ease),
      recommend: [1, 2, 3, 4, 5].includes(n(b.recommend)) ? n(b.recommend) : null,
      feeling: clean(b.feeling, 400),
      notes: clean(b.notes, 1500),
      source: clean(b.source, 40) || "entered",
      savedAt: Date.now(),
    };
    store.db.sessions.push(session);
    store.save();
    res.status(201).json({ session });
  });
  app.delete("/api/sessions/:id", researchOnly, (req, res) => {
    store.db.sessions = store.db.sessions.filter((s) => s.id !== req.params.id);
    store.save();
    res.json({ ok: true });
  });
  app.get("/api/sessions.csv", researchOnly, (req, res) => {
    const cols = ["round", "appVersion", "testerId", "area", "ageRange", "language", "date", "completed", "taskSeconds", "taskTaps", "stuck", "q1Purpose", "q2Advice", "trust", "trustWhy", "q4Sharing", "q5Change", "ease", "recommend", "feeling", "notes", "source"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...store.db.sessions.map((s) => cols.map((c) => esc(s[c])).join(","))].join("\n");
    res.type("text/csv").set("Content-Disposition", "attachment; filename=flood-watch-sessions.csv").send(csv);
  });

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

  // ---------- website ----------
  // (On Vercel the public/ folder is served by its CDN and this line is ignored.)
  app.use(express.static(path.join(__dirname, "..", "public"), { extensions: ["html"] }));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.status === 413 ? "File too big" : "Something went wrong" });
  });

  app.locals.store = store;
  return app;
}

// Start the server when run directly (not when imported by tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`Flood Watch running on http://localhost:${port}`));
}
