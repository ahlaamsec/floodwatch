// A tiny JSON-file "database". One file, written atomically.
// Simple on purpose: easy to read, easy to back up, easy to delete.
import fs from "node:fs";
import path from "node:path";

const EMPTY = { alerts: [], sessions: [], phraseReviews: [], phraseAudio: {} };

export function createStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, "voice"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "phrases"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "tts-cache"), { recursive: true });
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

  return { get db() { return db; }, save, flush, dataDir };
}
