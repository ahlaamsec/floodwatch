// Voice: recording people, playing recordings, and speaking text aloud.
//
// How the app "speaks" a phrase, best option first:
//   1. A real person's recording of that phrase (made in the Language Studio)
//   2. English: the phone's built-in voice (speechSynthesis)
//   3. Twi / Dagbani: GhanaNLP machine voice, if the server has a key
//   4. Otherwise: the phone's voice reading the English version, with a notice
import { api, features, getMode } from "./api.js";
import { STRINGS, getLang } from "./i18n.js";

let phraseIndex = {};
export async function loadPhraseIndex() {
  try { phraseIndex = (await api.phraseAudioIndex()) || {}; } catch { phraseIndex = {}; }
  return phraseIndex;
}
export const hasRecording = (lang, key) => Boolean(phraseIndex[lang]?.[key]);

let currentAudio = null;
export function stopSpeaking() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

export function playUrl(url) {
  stopSpeaking();
  return new Promise((resolve) => {
    const a = new Audio(url);
    currentAudio = a;
    a.onended = a.onerror = () => resolve();
    a.play().catch(() => resolve());
  });
}

function browserSpeak(text, langTag = "en-GB") {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve(false);
    stopSpeaking();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langTag;
    u.rate = 0.9; // a little slower: easier for older listeners
    const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith("en"));
    if (v) u.voice = v;
    u.onend = u.onerror = () => resolve(true);
    speechSynthesis.speak(u);
  });
}

/**
 * Speak a phrase by key (preferred) or raw text.
 * onFallback(msg) is called when we had to fall back to English.
 */
export async function speak({ key, text, vars = {}, lang = getLang(), onFallback } = {}) {
  const fill = (s) => (s || "").replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  // 1. human recording (only when the phrase has no {placeholders} that change)
  if (key && hasRecording(lang, key) && !/\{\w+\}/.test(STRINGS.en[key] || "")) {
    const url = api.phraseAudioUrl(lang, key);
    if (url) return playUrl(url);
  }
  const localText = key ? fill(STRINGS[lang]?.[key]) : text;
  const englishText = key ? fill(STRINGS.en[key]) : text;
  if (lang === "en") return browserSpeak(englishText);
  // 3. machine voice for Twi / Dagbani
  if (localText && features.khaya && getMode() === "server") {
    return playUrl(`/api/tts?lang=${lang}&text=${encodeURIComponent(localText)}`);
  }
  // 4. fall back to English
  onFallback?.();
  return browserSpeak(englishText);
}

// ---------- recording ----------
export function canRecord() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

/** Start recording. Returns { stop(): Promise<Blob> }. Auto-stops after maxMs. */
export async function startRecording(maxMs = 30000) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
  const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 24000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  let resolveStop;
  const done = new Promise((r) => (resolveStop = r));
  rec.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    resolveStop(new Blob(chunks, { type: (rec.mimeType || "audio/webm").split(";")[0] }));
  };
  rec.start(250);
  const timer = setTimeout(() => rec.state !== "inactive" && rec.stop(), maxMs);
  return {
    stop() { clearTimeout(timer); if (rec.state !== "inactive") rec.stop(); return done; },
    done,
  };
}

/** Convert any recorded audio to 16 kHz mono WAV (what GhanaNLP speech recognition expects). */
export async function toWav16k(blob) {
  const buf = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(buf);
  ctx.close();
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const out = (await off.startRendering()).getChannelData(0);
  const view = new DataView(new ArrayBuffer(44 + out.length * 2));
  const w = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); view.setUint32(4, 36 + out.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  w(36, "data"); view.setUint32(40, out.length * 2, true);
  for (let i = 0; i < out.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, out[i])) * 0x7fff, true);
  return new Blob([view], { type: "audio/wav" });
}

/** English speech-to-text using the browser (Chrome/Android). Returns null if unsupported. */
export function browserDictation(lang = "en-GB") {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  return new Promise((resolve, reject) => {
    const r = new SR();
    r.lang = lang;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => resolve(e.results[0][0].transcript);
    r.onerror = (e) => reject(e.error);
    r.onend = () => resolve("");
    r.start();
  });
}
