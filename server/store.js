// Where Flood Watch keeps its data. Two interchangeable back-ends with the same shape:
//
//   file  : one JSON file (db.json) + audio/photo files in data/. Used on your computer, in tests,
//           and on any host with a normal disk (Render, a Raspberry Pi...).
//   redis : Upstash Redis. Used on Vercel, where files cannot be kept.
//
// The rest of the server only sees:
//   store.db            the data (alerts, sessions, phrase reviews, phrase-audio notes)
//   store.save()        "I changed store.db"
//   store.blobs         put / get / has / del for voice notes, photos, recordings, cached speech
//
// File mode loads once and writes to disk shortly after each change.
// Redis mode loads before each request that needs the data and commits before the answer is sent
// (a serverless function may be frozen the moment it has answered, so nothing can wait until later).
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const EMPTY = { alerts: [], sessions: [], phraseReviews: [], phraseAudio: {} };
const EXT = { voice: ".audio", photos: ".jpg", phrases: ".audio", "tts-cache": ".wav" };
const DB_KEY = "fw:db";
const blobKey = (kind, id) => `fw:blob:${kind}:${id}`;

export function createStore(dataDir, { redis = null } = {}) {
  return redis ? createRedisStore(redis) : createFileStore(dataDir);
}

// ---------------------------------------------------------------- files
function createFileStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const kind of Object.keys(EXT)) fs.mkdirSync(path.join(dataDir, kind), { recursive: true });
  const file = path.join(dataDir, "db.json");

  let db = structuredClone(EMPTY);
  if (fs.existsSync(file)) {
    try {
      db = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(file, "utf8")) };
    } catch (e) {
      // Keep the broken file for inspection instead of silently losing data.
      fs.renameSync(file, file + ".broken-" + Date.now());
    }
  }

  let timer = null;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(flush, 50);
  }
  function flush() {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, file);
  }

  const where = (kind, id) => path.join(dataDir, kind, id + EXT[kind]);
  const typeFile = (kind, id) => path.join(dataDir, kind, id + ".type");
  const blobs = {
    async put(kind, id, data, { type } = {}) {
      await fsp.writeFile(where(kind, id), data);
      if (type) await fsp.writeFile(typeFile(kind, id), type);
    },
    async get(kind, id) {
      let data;
      try {
        data = await fsp.readFile(where(kind, id));
      } catch {
        return null;
      }
      const type = await fsp.readFile(typeFile(kind, id), "utf8").catch(() => undefined);
      return { data, type };
    },
    async has(kind, id) {
      return fs.existsSync(where(kind, id));
    },
    async del(kind, id) {
      await fsp.rm(where(kind, id), { force: true });
      await fsp.rm(typeFile(kind, id), { force: true });
    },
    /** Remove voice notes / photos that were uploaded but never attached to an alert (older than cutoff). */
    sweep(cutoff) {
      for (const kind of ["voice", "photos"]) {
        const dir = path.join(dataDir, kind);
        for (const f of fs.readdirSync(dir)) {
          const p = path.join(dir, f);
          if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { force: true });
        }
      }
    },
  };

  return { mode: "file", persistent: true, get db() { return db; }, save, flush, dataDir, blobs };
}

// ---------------------------------------------------------------- redis
function createRedisStore(redis) {
  let db = structuredClone(EMPTY);
  let dirty = false;

  const blobs = {
    // ttl (seconds): voice notes and photos disappear on their own, so nothing needs sweeping.
    async put(kind, id, data, { type, ttl } = {}) {
      const value = `${type || ""}|${data.toString("base64")}`;
      await redis.cmd("SET", blobKey(kind, id), value, ...(ttl ? ["EX", ttl] : []));
    },
    async get(kind, id) {
      const v = await redis.cmd("GET", blobKey(kind, id));
      if (v == null) return null;
      const i = v.indexOf("|");
      return { type: v.slice(0, i) || undefined, data: Buffer.from(v.slice(i + 1), "base64") };
    },
    async has(kind, id) {
      return (await redis.cmd("EXISTS", blobKey(kind, id))) === 1;
    },
    async del(kind, id) {
      await redis.cmd("DEL", blobKey(kind, id));
    },
  };

  return {
    mode: "redis",
    persistent: true,
    get db() { return db; },
    save() { dirty = true; },
    flush() {}, // nothing to do: commit() is what writes
    /** Read the latest data from Redis. Call at the start of a request. */
    async load() {
      const raw = await redis.cmd("GET", DB_KEY);
      db = raw ? { ...structuredClone(EMPTY), ...JSON.parse(raw) } : structuredClone(EMPTY);
      dirty = false;
    },
    /** Write back if something changed. Call before the answer is sent. */
    async commit() {
      if (!dirty) return;
      dirty = false;
      await redis.cmd("SET", DB_KEY, JSON.stringify(db));
    },
    blobs,
    redis,
  };
}
