// Tests for hosting on Vercel: the same API, but with all data in (a fake) Upstash Redis.
// Two separate app instances share one fake Redis, like two serverless functions would.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../server/server.js";
import { createRedis } from "../server/storage.js";

const TOKEN = "test-token";
let fake, redisUrl, kv, A, B, baseA, baseB, servers = [];

/** A tiny stand-in for Upstash's REST API: GET, SET (with EX), DEL, EXISTS. */
function startFakeUpstash() {
  kv = new Map(); // key -> { value, expires }
  fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.writeHead(401).end(JSON.stringify({ error: "Unauthorized" }));
      const [cmd, key, value, ...rest] = JSON.parse(body);
      const live = () => { const e = kv.get(key); if (e && e.expires && e.expires < Date.now()) { kv.delete(key); return undefined; } return e; };
      let result = null;
      if (cmd === "GET") result = live()?.value ?? null;
      else if (cmd === "SET") { kv.set(key, { value, expires: rest[0] === "EX" ? Date.now() + rest[1] * 1000 : 0, ttl: rest[0] === "EX" ? rest[1] : null }); result = "OK"; }
      else if (cmd === "DEL") result = kv.delete(key) ? 1 : 0;
      else if (cmd === "EXISTS") result = live() ? 1 : 0;
      else return res.writeHead(400).end(JSON.stringify({ error: "ERR unknown command" }));
      res.end(JSON.stringify({ result }));
    });
  });
  return new Promise((r) => fake.listen(0, () => r(`http://127.0.0.1:${fake.address().port}`)));
}
const listen = async (app) => { const s = app.listen(0); await new Promise((r) => s.once("listening", r)); servers.push(s); return `http://127.0.0.1:${s.address().port}`; };

before(async () => {
  redisUrl = await startFakeUpstash();
  A = createApp({ redis: createRedis(redisUrl, TOKEN) });
  B = createApp({ redis: createRedis(redisUrl, TOKEN) });
  baseA = await listen(A);
  baseB = await listen(B);
});
after(() => { servers.forEach((s) => s.close()); fake.close(); });

const post = (base, p, body) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

test("health says the data is in Redis and persistent", async () => {
  const j = await (await fetch(baseA + "/api/health")).json();
  assert.equal(j.storage, "redis");
  assert.equal(j.persistent, true);
});

test("an alert made on one instance is visible on another (data is in Redis, not in memory)", async () => {
  const r = await post(baseA, "/api/alerts", { areaId: "kaneshie", level: "danger", landmark: "Near the market", deviceToken: "phone-1" });
  assert.equal(r.status, 201);
  const { alert } = await r.json();
  const { alerts } = await (await fetch(baseB + "/api/alerts")).json();
  assert.ok(alerts.some((a) => a.id === alert.id && a.landmark === "Near the market"));
});

test("votes from different instances add up and stay one-per-phone", async () => {
  const { alert } = await (await post(baseA, "/api/alerts", { areaId: "alajo", level: "rising", landmark: "gutter", deviceToken: "A" })).json();
  await post(baseB, `/api/alerts/${alert.id}/vote`, { type: "confirm", deviceToken: "B" });
  await post(baseA, `/api/alerts/${alert.id}/vote`, { type: "confirm", deviceToken: "B" }); // same phone again
  const a = (await (await post(baseA, `/api/alerts/${alert.id}/vote`, { type: "confirm", deviceToken: "C" })).json()).alert;
  assert.equal(a.confirms, 3);
});

test("20 people voting at the same moment: no vote is lost", async () => {
  const { alert } = await (await post(baseA, "/api/alerts", { areaId: "weija", level: "danger", landmark: "bridge", deviceToken: "owner" })).json();
  await Promise.all(Array.from({ length: 20 }, (_, i) => post(baseA, `/api/alerts/${alert.id}/vote`, { type: "confirm", deviceToken: "p" + i })));
  const { alerts } = await (await fetch(baseB + "/api/alerts")).json();
  assert.equal(alerts.find((x) => x.id === alert.id).confirms, 21);
});

test("voice notes and photos are stored in Redis, expire on their own, and play back (with Range)", async () => {
  const audio = Buffer.from("0123456789abcdefghij");
  const v = await fetch(baseA + "/api/voice", { method: "POST", headers: { "Content-Type": "audio/webm" }, body: audio });
  assert.equal(v.status, 201);
  const { id: voiceId } = await v.json();
  const p = await fetch(baseA + "/api/photo", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: jpeg });
  const { id: photoId } = await p.json();

  const voiceKey = kv.get(`fw:blob:voice:${voiceId}`);
  assert.ok(voiceKey.ttl > 24 * 3600, "voice note has a 25h expiry");
  assert.ok(kv.get(`fw:blob:photos:${photoId}`).ttl > 0);

  const { alert } = await (await post(baseA, "/api/alerts", { areaId: "kaneshie", level: "rising", voiceId, photoId, lang: "twi", deviceToken: "x" })).json();
  assert.ok(alert.hasVoice && alert.photoUrl);

  const whole = await fetch(baseB + alert.voiceUrl); // other instance
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get("content-type").split(";")[0], "audio/webm");
  assert.deepEqual(Buffer.from(await whole.arrayBuffer()), audio);

  const part = await fetch(baseB + alert.voiceUrl, { headers: { Range: "bytes=5-9" } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), "bytes 5-9/20");
  assert.equal(Buffer.from(await part.arrayBuffer()).toString(), "56789");
  const tail = await fetch(baseB + alert.voiceUrl, { headers: { Range: "bytes=-4" } });
  assert.equal(Buffer.from(await tail.arrayBuffer()).toString(), "ghij");
  assert.equal((await fetch(baseB + alert.voiceUrl, { headers: { Range: "bytes=99-" } })).status, 416);

  const photo = await fetch(baseB + alert.photoUrl);
  assert.equal(photo.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), jpeg);
});

test("an alert pointing at a voice note that does not exist is not attached", async () => {
  const r = await post(baseA, "/api/alerts", { areaId: "kaneshie", level: "danger", landmark: "x", voiceId: "aaaaaaaaaaaa", deviceToken: "z" });
  assert.equal((await r.json()).alert.hasVoice, false);
});

test("Language Studio: a recording and a review saved on one instance work on another", async () => {
  const put = await fetch(baseA + "/api/phrases/audio/dag/appTitle", { method: "PUT", headers: { "Content-Type": "audio/webm", "x-speaker-id": "R1" }, body: Buffer.from("voice") });
  assert.equal(put.status, 201);
  const list = await (await fetch(baseB + "/api/phrases/audio")).json();
  assert.equal(list.dag.appTitle.speaker, "R1");
  assert.equal(Buffer.from(await (await fetch(baseB + "/api/phrases/audio/dag/appTitle")).arrayBuffer()).toString(), "voice");
  const rev = await post(baseB, "/api/phrases/review", { lang: "dag", key: "appTitle", verdict: "awkward", better: "x", reviewer: "R1" });
  assert.equal(rev.status, 201);
  assert.equal((await (await fetch(baseA + "/api/phrases/review")).json()).reviews.length, 1);
  assert.equal((await fetch(baseA + "/api/phrases/audio/dag/appTitle", { method: "DELETE" })).status, 200);
  assert.equal((await fetch(baseB + "/api/phrases/audio/dag/appTitle")).status, 404);
});

test("research sessions are saved in Redis and exported as CSV", async () => {
  const r = await post(baseA, "/api/sessions", { round: "after", consent: true, testerId: "T1", completed: "yes", taskSeconds: 41, taskTaps: 3 });
  assert.equal(r.status, 201);
  const csv = await (await fetch(baseB + "/api/sessions.csv")).text();
  assert.match(csv, /"after".*"T1"/);
});

test("alerts older than 24 hours are removed", async () => {
  const { alert } = await (await post(baseA, "/api/alerts", { areaId: "adabraka", level: "watching", landmark: "old one", deviceToken: "o" })).json();
  const db = JSON.parse(kv.get("fw:db").value);
  db.alerts.find((a) => a.id === alert.id).ts = Date.now() - 25 * 3600 * 1000;
  kv.get("fw:db").value = JSON.stringify(db);
  await fetch(baseB + "/api/alerts"); // any request that loads the data cleans up
  assert.ok(!JSON.parse(kv.get("fw:db").value).alerts.some((a) => a.id === alert.id));
});

test("if Redis is down the app answers 503 instead of crashing", async () => {
  const dead = createApp({ redis: createRedis("http://127.0.0.1:9", TOKEN) });
  const base = await listen(dead);
  assert.equal((await fetch(base + "/api/alerts")).status, 503);
  assert.equal((await post(base, "/api/alerts", { areaId: "kaneshie", level: "danger", landmark: "x" })).status, 503);
  const h = await fetch(base + "/api/health"); // answers, and says plainly that storage is not working
  assert.equal(h.status, 200);
  const j = await h.json();
  assert.equal(j.persistent, false);
  assert.match(j.problem, /Redis/);
});

test("a wrong Redis token is reported as 503, not leaked or crashed", async () => {
  const bad = createApp({ redis: createRedis(redisUrl, "wrong") });
  const base = await listen(bad);
  assert.equal((await fetch(base + "/api/alerts")).status, 503);
});
