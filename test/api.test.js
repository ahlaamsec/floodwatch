// Run with: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp, APP_VERSION } from "../server/server.js";
import { matchArea } from "../server/areas.js";
import { faqAnswer } from "../public/js/shared/faq.js";
import { classify } from "../server/weather.js";
import { STRINGS } from "../public/js/i18n.js";

let server, base, dir, app;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-"));
  app = createApp({ dataDir: dir });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await new Promise((r) => setTimeout(r, 100)); app.locals.store.flush(); fs.rmSync(dir, { recursive: true, force: true }); });

const post = (p, body) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("health reports features", async () => {
  const j = await (await fetch(base + "/api/health")).json();
  assert.equal(j.ok, true);
});

test("creating an alert needs a known area, a level and a place or voice", async () => {
  assert.equal((await post("/api/alerts", { areaId: "nowhere", level: "danger", landmark: "x" })).status, 400);
  assert.equal((await post("/api/alerts", { areaId: "kaneshie", level: "flood", landmark: "x" })).status, 400);
  assert.equal((await post("/api/alerts", { areaId: "kaneshie", level: "danger" })).status, 400);
  const r = await post("/api/alerts", { areaId: "kaneshie", level: "danger", landmark: "Near <script> market", deviceToken: "me" });
  assert.equal(r.status, 201);
  const { alert } = await r.json();
  assert.equal(alert.confirms, 1);
  assert.ok(!alert.landmark.includes("<"), "angle brackets stripped");
  assert.equal(alert.locationChecked, false);
});

test("alerts never expose coordinates or device tokens", async () => {
  const { alerts } = await (await fetch(base + "/api/alerts")).json();
  const json = JSON.stringify(alerts);
  for (const banned of ["lat", "lng", "deviceToken", "votes"]) assert.ok(!json.includes(`"${banned}"`), banned);
});

test("one phone = one vote; 'not true' replaces 'I see it too'", async () => {
  const { alert } = await (await post("/api/alerts", { areaId: "alajo", level: "rising", landmark: "gutter", deviceToken: "A" })).json();
  let a = (await (await post(`/api/alerts/${alert.id}/vote`, { type: "confirm", deviceToken: "B" })).json()).alert;
  a = (await (await post(`/api/alerts/${alert.id}/vote`, { type: "confirm", deviceToken: "B" })).json()).alert;
  assert.equal(a.confirms, 2);
  a = (await (await post(`/api/alerts/${alert.id}/vote`, { type: "false", deviceToken: "B" })).json()).alert;
  assert.equal(a.confirms, 1);
  assert.equal(a.falses, 1);
});

test("alert becomes 'disputed' when 3+ say not true and they outnumber confirmations", async () => {
  const { alert } = await (await post("/api/alerts", { areaId: "weija", level: "danger", landmark: "bridge", deviceToken: "A" })).json();
  let a;
  for (const d of ["x", "y", "z"]) a = (await (await post(`/api/alerts/${alert.id}/vote`, { type: "false", deviceToken: d })).json()).alert;
  assert.equal(a.status, "disputed");
});

test("research sessions require consent and valid round", async () => {
  assert.equal((await post("/api/sessions", { round: "before", consent: false })).status, 400);
  assert.equal((await post("/api/sessions", { round: "later", consent: true })).status, 400);
  const r = await post("/api/sessions", { round: "before", consent: true, testerId: "T1", trust: "4", completed: "with_help" });
  assert.equal(r.status, 201);
  const csv = await (await fetch(base + "/api/sessions.csv")).text();
  assert.match(csv, /"before","1.0","T1"/);
});

test("sessions keep the 'would recommend' score (1-5 only) and export it", async () => {
  const ok = await (await post("/api/sessions", { round: "after", consent: true, testerId: "T9", recommend: "5" })).json();
  assert.equal(ok.session.recommend, 5);
  const bad = await (await post("/api/sessions", { round: "after", consent: true, testerId: "T8", recommend: "9" })).json();
  assert.equal(bad.session.recommend, null);
  assert.equal((await (await post("/api/sessions", { round: "after", consent: true, testerId: "T7" })).json()).session.recommend, null);
  assert.equal(ok.session.appVersion, APP_VERSION, "an after-round session is tagged with the real app version");
  const csv = await (await fetch(base + "/api/sessions.csv")).text();
  assert.match(csv.split("\n")[0], /"?ease"?,"?recommend"?,/);
});

test("the home list has a heading that says these are the neighbours' warnings", () => {
  assert.equal(STRINGS.en.neighbourWarnings, "Warnings from your neighbours");
  assert.ok(STRINGS.twi.neighbourWarnings, "Twi draft exists (to be checked by native speakers)");
  assert.equal(STRINGS.dag.neighbourWarnings, undefined, "no Dagbani yet: shown in English until a speaker adds it");
});

test("voice notes upload and play back", async () => {
  const r = await fetch(base + "/api/voice", { method: "POST", headers: { "Content-Type": "audio/webm" }, body: new Uint8Array([1, 2, 3]) });
  const { id } = await r.json();
  const al = await post("/api/alerts", { areaId: "adabraka", level: "watching", voiceId: id });
  assert.equal((await al.json()).alert.hasVoice, true);
  const play = await fetch(base + "/api/voice/" + id);
  assert.equal(play.status, 200);
  assert.equal(play.headers.get("content-type"), "audio/webm");
});

test("phrase reviews validate verdicts", async () => {
  assert.equal((await post("/api/phrases/review", { lang: "dag", key: "yes", verdict: "maybe" })).status, 400);
  assert.equal((await post("/api/phrases/review", { lang: "dag", key: "yes", verdict: "correct", reviewer: "R1" })).status, 201);
});

test("location matching works on the phone side and rejects far-away points", () => {
  assert.equal(matchArea(5.5682, -0.2372)?.id, "kaneshie");
  assert.equal(matchArea(51.5, -0.12), null); // London
});

test("helper falls back to vetted answers and always mentions 112 when trapped", () => {
  assert.match(faqAnswer("I am trapped inside my house"), /112/);
  assert.match(faqAnswer("random question"), /112/);
});

test("rain classification", () => {
  assert.equal(classify(25), "heavy");
  assert.equal(classify(8), "moderate");
  assert.equal(classify(1), "light");
  assert.equal(classify(0), "none");
});

test("every Twi string exists for every English key", () => {
  const missing = Object.keys(STRINGS.en).filter((k) => !(k in STRINGS.twi));
  assert.deepEqual(missing, []);
});

test("photos: only JPEG accepted, attached to alert, served back", async () => {
  const bad = await fetch(base + "/api/photo", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: new Uint8Array([1, 2, 3]) });
  assert.equal(bad.status, 400);
  const ok = await fetch(base + "/api/photo", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) });
  const { id } = await ok.json();
  const { alert } = await (await post("/api/alerts", { areaId: "choggu", level: "rising", landmark: "school", photoId: id })).json();
  assert.equal(alert.photoUrl, `/api/photo/${id}`);
  assert.equal((await fetch(base + alert.photoUrl)).headers.get("content-type"), "image/jpeg");
});
