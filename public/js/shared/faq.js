// Vetted flood-safety answers used by the helper when no AI key is set (and offline).
// Shared by the server and the browser.
export const FAQ = [
  {
    keys: ["rising", "rise", "coming", "flood now", "flooding", "water is"],
    a: "When water is rising, move to higher ground now: an upper floor, a hill, or a strong building. Take your phone, documents and medicine in a plastic bag. Help children and older people first. If you are trapped, call 112.",
  },
  {
    keys: ["trapped", "stuck", "inside", "help me", "drowning", "missing", "child"],
    a: "If you or someone is trapped, go to the highest place you can reach, like a roof or upper floor. Call 112 now. Make noise or wave cloth so people can see you. Do not enter moving water.",
  },
  {
    keys: ["walk", "cross", "drive", "car", "road", "bridge", "gutter", "drain"],
    a: "Do not walk or drive through moving water. Even water up to your knees can sweep you away, and open gutters can be hidden under it. Wait, or find another way on higher ground.",
  },
  {
    keys: ["electric", "light", "wire", "pole", "socket", "ecg", "power"],
    a: "Stay far away from electric wires and poles near water. If water is entering your house, switch off the main power only if you are standing somewhere dry. Never touch sockets with wet hands.",
  },
  {
    keys: ["prepare", "before", "ready", "bag", "plan", "rain coming", "forecast"],
    a: "Before the rain: put documents, phones and medicine in a plastic bag up high. Keep a torch and a charged phone. Agree with your family where to meet on higher ground.",
  },
  {
    keys: ["phone", "document", "property", "things", "belongings", "room"],
    a: "Put phones, chargers, documents and money in a sealed plastic bag and keep them on a high shelf. Lift things off the floor. Your life matters more than things, so leave if water rises.",
  },
  {
    keys: ["after", "clean", "drink", "water safe", "disease", "sick", "mosquito"],
    a: "After a flood, do not drink tap or well water until it is boiled or treated. Wash hands with soap. Throw away food that touched flood water. See a doctor if anyone has fever or diarrhoea.",
  },
  {
    keys: ["true", "trust", "fake", "real", "believe", "rumour"],
    a: "An alert is more trustworthy when several neighbours tap 'I see it too' and it is recent. If many people say 'Not true', be careful. When unsure, check with someone near that place.",
  },
  {
    keys: ["location", "privacy", "name", "number", "track", "data"],
    a: "Flood Watch never keeps your name, phone number or exact location. Your phone checks your area by itself and only the area name is sent. Voice notes are deleted after 24 hours.",
  },
  {
    keys: ["how", "use", "report", "send", "warn", "app"],
    a: "To warn neighbours: tap 'I see flooding', choose how bad the water is, then hold the microphone and say where it is. Tap 'Send warning'. That's all.",
  },
  {
    keys: ["elderly", "old", "grandmother", "grandfather", "disabled", "neighbour", "neighbor"],
    a: "Check on older people and people who cannot walk well before the water rises. Help them move to higher ground early. Read the alerts aloud to anyone who cannot read.",
  },
];

export function faqAnswer(q) {
  const s = q.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const item of FAQ) {
    const score = item.keys.reduce((n, k) => n + (s.includes(k) ? 1 : 0), 0);
    if (score > bestScore) { best = item; bestScore = score; }
  }
  return best
    ? best.a
    : "I can help with flood safety and using this app. In danger, go to higher ground and call 112. You can ask me: what to do when water is rising, how to protect your things, or how to send a warning.";
}

