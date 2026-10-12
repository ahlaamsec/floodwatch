// The "Ask the helper" assistant.
// 1. If GEMINI_API_KEY is set, ask Google Gemini (free tier) with strict safety instructions.
// 2. Otherwise (or if Gemini fails) answer from a small set of vetted flood-safety answers.
// Twi/Dagbani: if Khaya is configured, we translate the question to English and the answer back,
// because general AI models are weak in Dagbani and Twi.
import { khayaEnabled, translate } from "./khaya.js";

const SYSTEM = `You are the helper inside "Flood Watch", a community flood-alert app used in Ghana
(Accra, Kumasi, Tamale). Many users are older adults with little formal schooling.
Rules:
- Answer ONLY about floods, heavy rain, staying safe, helping neighbours, and using this app.
- Use very simple words. Short sentences. At most 4 sentences. No lists longer than 3 items.
- Never invent phone numbers other than 112 (Ghana's emergency number).
- If someone may be in danger now (trapped, water rising inside, someone missing, electric wires in water), tell them first to get to higher ground and call 112.
- Never ask for or repeat names, phone numbers or exact addresses.
- If you are not sure, say so and suggest asking NADMO, the assembly member, or local radio.
- You cannot see real alerts or real water levels. Do not claim to.`;

import { faqAnswer } from "../public/js/shared/faq.js";

async function askGemini(question) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: question }] }],
      generationConfig: { maxOutputTokens: 300, temperature: 0.3 },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}`);
  const j = await r.json();
  const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim();
  if (!text) throw new Error("Gemini empty answer");
  return text;
}

/** Returns { answer, source: "gemini"|"vetted", translated: bool } */
export async function ask(question, lang = "en") {
  let q = question;
  let translated = false;
  if (lang !== "en" && khayaEnabled()) {
    try { q = await translate(question, lang, "en"); translated = true; } catch { /* use original */ }
  }

  let answer;
  let source = "vetted";
  if (process.env.GEMINI_API_KEY) {
    try { answer = await askGemini(q); source = "gemini"; } catch (e) { console.warn(e.message); }
  }
  if (!answer) answer = faqAnswer(q);

  if (lang !== "en" && khayaEnabled()) {
    try { answer = await translate(answer, "en", lang); translated = true; } catch { /* keep English */ }
  }
  return { answer, source, translated };
}

