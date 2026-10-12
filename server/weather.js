// Rain outlook per area from Open-Meteo (free, no key, non-commercial use).
// We send only the AREA CENTRE coordinates, never the user's position.
// Cached for 30 minutes per area so we stay far below fair-use limits.
const cache = new Map();
const TTL = 30 * 60 * 1000;

export function classify(mm) {
  if (mm == null) return "unknown";
  if (mm >= 20) return "heavy";
  if (mm >= 7.5) return "moderate";
  if (mm >= 0.5) return "light";
  return "none";
}

export async function rainOutlook(area) {
  const hit = cache.get(area.id);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${area.lat}&longitude=${area.lng}` +
    `&hourly=precipitation,precipitation_probability&forecast_hours=12&timezone=Africa%2FAccra`;
  let value;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("open-meteo " + r.status);
    const j = await r.json();
    const mm = (j.hourly?.precipitation || []).reduce((s, x) => s + (x || 0), 0);
    const maxProb = Math.max(0, ...(j.hourly?.precipitation_probability || [0]));
    value = { level: classify(mm), mm12h: Math.round(mm * 10) / 10, maxProbability: maxProb, source: "Open-Meteo", at: Date.now() };
  } catch {
    value = { level: "unknown", source: "Open-Meteo", at: Date.now() };
  }
  cache.set(area.id, { at: Date.now(), value });
  return value;
}
