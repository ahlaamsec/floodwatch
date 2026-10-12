// GhanaNLP "Khaya" API: translation, speech-to-text and text-to-speech
// for Ghanaian languages (Twi = "twi", Dagbani = "dag").
// Endpoints taken from the official khaya Python SDK (v0.3.0).
// Only used when KHAYA_API_KEY is set. The key stays on the server.
const BASE = process.env.KHAYA_BASE_URL || "https://translation-api.ghananlp.org";

export const khayaEnabled = () => Boolean(process.env.KHAYA_API_KEY);

const LANG = { en: "eng", twi: "twi", dag: "dag" };

function headers(extra = {}) {
  return { "Ocp-Apim-Subscription-Key": process.env.KHAYA_API_KEY, "Cache-Control": "no-cache", ...extra };
}

/** Translate text. from/to are app codes: en | twi | dag. One side must be English. */
export async function translate(text, from, to) {
  if (from === to) return text;
  const pair = `${from === "twi" ? "tw" : from}-${to === "twi" ? "tw" : to}`;
  const r = await fetch(`${BASE}/v1/translate`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ in: text, lang: pair }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Khaya translate ${r.status}`);
  const body = await r.json();
  return typeof body === "string" ? body : body.text || body.out || String(body);
}

/** Text to speech. Returns a WAV Buffer. */
export async function tts(text, lang, speaker = "female") {
  const r = await fetch(`${BASE}/tts/v1/tts`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ text, language: LANG[lang] || lang, speaker_id: speaker }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Khaya TTS ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Speech to text. wav = 16 kHz mono PCM WAV Buffer. */
export async function asr(wav, lang) {
  const r = await fetch(`${BASE}/asr/v3/transcribe?language=${encodeURIComponent(LANG[lang] || lang)}`, {
    method: "POST",
    headers: headers({ "Content-Type": "audio/wav" }),
    body: wav,
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Khaya ASR ${r.status}`);
  const body = await r.json();
  return typeof body === "string" ? body : body.text || "";
}
