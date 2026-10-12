// Talks to the backend. If the backend can't be reached (no internet, or the page
// was opened as a plain file / demo link), it switches to "local mode": everything
// is kept in this phone's browser storage so the app still works for one person.
import { faqAnswer } from "./shared/faq.js";
import { CITIES, ALL_AREAS } from "./shared/areas.js";

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
};

export function deviceToken() {
  let tok = LS.get("fw.device");
  if (!tok) { tok = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now(); LS.set("fw.device", tok); }
  return tok;
}

let mode = null; // "server" | "local"
export let features = { ai: false, khaya: false, researchPin: false };

export async function detect() {
  if (mode) return mode;
  try {
    const r = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw 0;
    const j = await r.json();
    features = j.features || features;
    mode = "server";
  } catch {
    mode = navigator.onLine === false && LS.get("fw.lastServer") ? "offline" : "local";
  }
  if (mode === "server") LS.set("fw.lastServer", true);
  return mode;
}
export const getMode = () => mode;

const pin = () => sessionStorage.getItem("fw.pin") || "";
async function j(method, url, body, extraHeaders = {}) {
  const opts = { method, headers: { "x-research-pin": pin(), ...extraHeaders } };
  if (body instanceof Blob) { opts.body = body; opts.headers["Content-Type"] = body.type || "application/octet-stream"; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers["Content-Type"] = "application/json"; }
  const r = await fetch(url, opts);
  const ct = r.headers.get("content-type") || "";
  const data = ct.includes("json") ? await r.json() : null;
  if (!r.ok) { const e = new Error(data?.error || `Error ${r.status}`); e.status = r.status; throw e; }
  return data;
}

// ---------- local-mode helpers ----------
const findArea = (id) => ALL_AREAS.find((a) => a.id === id);
function localPublic(a) {
  const ageMin = Math.floor((Date.now() - a.ts) / 60000);
  const confirms = a.votes.confirm.length, falses = a.votes.false.length;
  return {
    ...a, ageMin, confirms, falses, helpful: a.votes.helpful.length, unhelpful: a.votes.unhelpful.length,
    hasVoice: Boolean(a.voiceData), voiceUrl: a.voiceData || null,
    status: falses >= 3 && falses > confirms ? "disputed" : ageMin > 180 ? "old" : confirms >= 2 ? "confirmed" : "new",
  };
}
const blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });

// ---------- API ----------
export const api = {
  areas: () => CITIES,

  async alerts(filter = {}) {
    if (mode === "server") {
      try {
        const q = new URLSearchParams(filter).toString();
        const res = await j("GET", "/api/alerts" + (q ? "?" + q : ""));
        LS.set("fw.cache.alerts", { at: Date.now(), alerts: res.alerts, filter });
        return { alerts: res.alerts, offline: false };
      } catch (e) {
        const c = LS.get("fw.cache.alerts");
        if (c) return { alerts: c.alerts, offline: true, cachedAt: c.at };
        throw e;
      }
    }
    if (mode === "offline") {
      const c = LS.get("fw.cache.alerts", { alerts: [] });
      return { alerts: c.alerts, offline: true, cachedAt: c.at };
    }
    const since = Date.now() - 12 * 3600e3;
    let list = LS.get("fw.local.alerts", []).filter((a) => a.ts >= since);
    if (filter.city) list = list.filter((a) => a.cityId === filter.city);
    if (filter.area) list = list.filter((a) => a.areaId === filter.area);
    return { alerts: list.sort((a, b) => b.ts - a.ts).map(localPublic), offline: false, local: true };
  },

  async uploadVoice(blob) {
    if (mode === "server") return (await j("POST", "/api/voice", blob)).id;
    return blobToDataUrl(blob); // local mode keeps the recording in the browser
  },

  async uploadPhoto(jpegBlob) {
    if (mode === "server") return (await j("POST", "/api/photo", jpegBlob)).id;
    return blobToDataUrl(jpegBlob);
  },

  async createAlert({ areaId, level, landmark, voice, photo, lang, locationChecked }) {
    if (mode === "server") {
      return (await j("POST", "/api/alerts", { areaId, level, landmark, voiceId: voice || undefined, photoId: photo || undefined, lang, locationChecked, deviceToken: deviceToken() })).alert;
    }
    const area = findArea(areaId);
    const a = {
      id: Math.random().toString(16).slice(2, 14), areaId, areaName: area.name, cityId: area.cityId, level,
      landmark, voiceData: voice || null, photoUrl: photo || null, lang, locationChecked, ts: Date.now(),
      votes: { confirm: [deviceToken()], false: [], helpful: [], unhelpful: [] },
    };
    const all = LS.get("fw.local.alerts", []);
    all.push(a);
    LS.set("fw.local.alerts", all);
    return localPublic(a);
  },

  async vote(id, type) {
    if (mode === "server") return (await j("POST", `/api/alerts/${id}/vote`, { type, deviceToken: deviceToken() })).alert;
    const all = LS.get("fw.local.alerts", []);
    const a = all.find((x) => x.id === id);
    const me = deviceToken();
    const opposite = { confirm: "false", false: "confirm", helpful: "unhelpful", unhelpful: "helpful" }[type];
    a.votes[opposite] = a.votes[opposite].filter((x) => x !== me);
    if (!a.votes[type].includes(me)) a.votes[type].push(me);
    LS.set("fw.local.alerts", all);
    return localPublic(a);
  },

  async rain(area) {
    if (mode === "server") return j("GET", `/api/rain/${area.id}`);
    try { // Open-Meteo allows calls straight from the browser. Area centre only.
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${area.lat}&longitude=${area.lng}&hourly=precipitation&forecast_hours=12`);
      const d = await r.json();
      const mm = (d.hourly?.precipitation || []).reduce((s, x) => s + (x || 0), 0);
      return { level: mm >= 20 ? "heavy" : mm >= 7.5 ? "moderate" : mm >= 0.5 ? "light" : "none", mm12h: mm };
    } catch { return { level: "unknown" }; }
  },

  async ask(question, lang) {
    if (mode === "server") return j("POST", "/api/assistant", { question, lang });
    return { answer: faqAnswer(question), source: "vetted", translated: false };
  },

  async asr(wavBlob, lang) {
    return (await j("POST", `/api/asr?lang=${lang}`, wavBlob)).text;
  },

  // ---- Language Studio ----
  async phraseAudioIndex() {
    if (mode === "server") return j("GET", "/api/phrases/audio");
    return LS.get("fw.local.phraseIndex", {});
  },
  phraseAudioUrl(lang, key) {
    if (mode === "server") return `/api/phrases/audio/${lang}/${key}?v=${Date.now() >> 16}`;
    return LS.get(`fw.local.phrase.${lang}.${key}`);
  },
  async savePhraseAudio(lang, key, blob, speaker) {
    if (mode === "server") return j("PUT", `/api/phrases/audio/${lang}/${key}`, blob, { "x-speaker-id": speaker || "" });
    LS.set(`fw.local.phrase.${lang}.${key}`, await blobToDataUrl(blob));
    const idx = LS.get("fw.local.phraseIndex", {});
    (idx[lang] ||= {})[key] = { at: Date.now(), speaker };
    LS.set("fw.local.phraseIndex", idx);
  },
  async reviews() {
    if (mode === "server") return (await j("GET", "/api/phrases/review")).reviews;
    return LS.get("fw.local.reviews", []);
  },
  async saveReview(r) {
    if (mode === "server") return (await j("POST", "/api/phrases/review", r)).review;
    const all = LS.get("fw.local.reviews", []);
    const rev = { ...r, id: String(Date.now()), at: Date.now() };
    all.push(rev);
    LS.set("fw.local.reviews", all);
    return rev;
  },
  async machineDraft(text, to) {
    return (await j("GET", `/api/translate-draft?to=${to}&text=${encodeURIComponent(text)}`)).text;
  },

  // ---- Research sessions ----
  async sessions() {
    if (mode === "server") return (await j("GET", "/api/sessions")).sessions;
    return LS.get("fw.local.sessions", []);
  },
  async saveSession(s) {
    if (mode === "server") return (await j("POST", "/api/sessions", s)).session;
    if (!s.consent) throw new Error("Consent is required before saving a session");
    const all = LS.get("fw.local.sessions", []);
    const saved = { ...s, id: String(Date.now()), savedAt: Date.now() };
    all.push(saved);
    LS.set("fw.local.sessions", all);
    return saved;
  },
  async deleteSession(id) {
    if (mode === "server") return j("DELETE", `/api/sessions/${id}`);
    LS.set("fw.local.sessions", LS.get("fw.local.sessions", []).filter((s) => s.id !== id));
  },
  async addPracticeAlerts() {
    if (mode === "server") return j("POST", "/api/practice-alerts");
    const all = LS.get("fw.local.alerts", []);
    const ex = [["danger", "Near the main road junction"], ["rising", "Behind the market"], ["watching", "By the big gutter near the school"], ["rising", "Near the mosque"], ["danger", "At the bridge by the filling station"]];
    ALL_AREAS.forEach((area, i) => {
      const [level, landmark] = ex[i % ex.length];
      all.push({ id: "p" + i + Date.now(), areaId: area.id, areaName: area.name, cityId: area.cityId, level, landmark, lang: "en", locationChecked: false, practice: true, ts: Date.now() - (5 + i * 7) * 60000, votes: { confirm: ["a", "b", "c"].slice(0, 1 + (i % 3)), false: [], helpful: [], unhelpful: [] } });
    });
    LS.set("fw.local.alerts", all);
  },
  async clearPracticeAlerts() {
    if (mode === "server") return j("DELETE", "/api/practice-alerts");
    LS.set("fw.local.alerts", LS.get("fw.local.alerts", []).filter((a) => !a.practice));
  },
  csvUrl: () => (mode === "server" ? "/api/sessions.csv" : null),
};

export { LS };
