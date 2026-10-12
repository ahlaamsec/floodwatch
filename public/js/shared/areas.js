// Towns and areas Flood Watch knows about.
// Coordinates are APPROXIMATE area centres (good to roughly a few hundred metres)
// and the radius is how far from the centre we still count someone as "in" that area.
// Check and correct these with people who live there before any real use.
export const CITIES = [
  {
    id: "tamale",
    name: "Tamale",
    areas: [
      { id: "aboabo-tml", name: "Aboabo", lat: 9.4045, lng: -0.8305, radiusKm: 1.5 },
      { id: "sabon-gari-tml", name: "Sabon Gari", lat: 9.4115, lng: -0.8455, radiusKm: 1.5 },
      { id: "choggu", name: "Choggu", lat: 9.4300, lng: -0.8540, radiusKm: 2 },
      { id: "zongo-tml", name: "Zongo", lat: 9.3990, lng: -0.8420, radiusKm: 1.5 },
    ],
  },
  {
    id: "kumasi",
    name: "Kumasi",
    areas: [
      { id: "aboabo-ksi", name: "Aboabo", lat: 6.7010, lng: -1.6045, radiusKm: 1.5 },
      { id: "asawase", name: "Asawase", lat: 6.7120, lng: -1.5935, radiusKm: 1.5 },
      { id: "moshie-zongo", name: "Moshie Zongo", lat: 6.7060, lng: -1.6160, radiusKm: 1.2 },
      { id: "atonsu", name: "Atonsu", lat: 6.6610, lng: -1.5920, radiusKm: 1.8 },
      { id: "sepe-dote", name: "Sepe Dote", lat: 6.7190, lng: -1.5840, radiusKm: 1.5 },
    ],
  },
  {
    id: "accra",
    name: "Accra",
    areas: [
      { id: "kaneshie", name: "Kaneshie", lat: 5.5680, lng: -0.2370, radiusKm: 1.5 },
      { id: "odawna-circle", name: "Odawna / Circle", lat: 5.5720, lng: -0.2160, radiusKm: 1.2 },
      { id: "alajo", name: "Alajo", lat: 5.5960, lng: -0.2210, radiusKm: 1.2 },
      { id: "adabraka", name: "Adabraka", lat: 5.5600, lng: -0.2080, radiusKm: 1.2 },
      { id: "dansoman", name: "Dansoman", lat: 5.5400, lng: -0.2650, radiusKm: 2 },
      { id: "weija", name: "Weija", lat: 5.5620, lng: -0.3400, radiusKm: 2.5 },
    ],
  },
];

export const ALL_AREAS = CITIES.flatMap((c) => c.areas.map((a) => ({ ...a, cityId: c.id, cityName: c.name })));

export function findArea(id) {
  return ALL_AREAS.find((a) => a.id === id) || null;
}

export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Return the closest area whose radius contains the point, or null. */
export function matchArea(lat, lng) {
  let best = null;
  for (const a of ALL_AREAS) {
    const d = distanceKm(lat, lng, a.lat, a.lng);
    if (d <= a.radiusKm && (!best || d < best.d)) best = { area: a, d };
  }
  return best ? best.area : null;
}
