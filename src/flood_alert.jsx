import React, { useState, useEffect, useRef } from "react";
import { Droplets, TriangleAlert, Eye, Clock, MapPin, X, Check, Waves, ChevronRight, Share2, Globe } from "lucide-react";

const AREAS = ["Aboabo", "Sabon Gari", "Choggu", "Zongo", "Other"];

const LEVELS_META = {
  watching: { color: "#E3A63E", fill: 30, icon: Eye },
  rising: { color: "#E2622F", fill: 65, icon: Droplets },
  danger: { color: "#D93A3A", fill: 95, icon: TriangleAlert },
};

const T = {
  en: {
    appTitle: "Flood Watch",
    appSubtitle: "See what your neighbors are seeing, right now",
    reportPrompt: "See water rising near you?",
    reportSub: "Tap to warn your neighbors",
    nearbyReports: "Reports",
    active: "active",
    stillTrue: "Still true",
    sendAlert: "Send alert to neighbors",
    chooseArea: "Which area are you in?",
    chooseAreaSub: "So we can show you what's happening near you first",
    continue: "Continue",
    allAreas: "All areas",
    yourArea: "Your area",
    whatToDo: "What to do",
    close: "Close",
    alertSent: "Alert sent \u2014 your neighbors can see it now",
    streetLabel: "Street or landmark",
    streetPlaceholder: "e.g. near the big mango tree",
    severityQuestion: "How bad is it right now?",
    changeArea: "Change area",
    neighborsConfirmed: "neighbors confirmed",
    neighborConfirmed: "neighbor confirmed",
    levels: {
      watching: { label: "Watching", sub: "Water starting to pool" },
      rising: { label: "Rising", sub: "Water is rising fast" },
      danger: { label: "Danger", sub: "Get to higher ground now" },
    },
    guidance: {
      watching: "Keep an eye on drains and low spots near you. Move valuables off the floor, just in case.",
      rising: "Move to higher ground now. Do not walk or drive through moving water \u2014 even shallow water can sweep you off your feet.",
      danger: "Get to higher ground immediately. Stay away from flooded roads and any electrical wires. Call for help if you are trapped.",
    },
    reportedIn: "Reported in",
  },
  dag: {
    appTitle: "Kodibo Yulibu",
    appSubtitle: "Nyam ban miri a ni nyar bin sha' pun pongo",
    reportPrompt: "Nyam bee kom duri na a polo",
    reportSub: "Dihima n kpahi ban miri a zu'u ni",
    nearbyReports: "Din pun gari",
    active: "din ningdi lahibali",
    stillTrue: "Dihitabili 'yelmangli'",
    sendAlert: "Kpahimi ban miri a tibli",
    chooseArea: "Fong dini ka a be",
    chooseAreaSub: "Ka ti tooi wuhi a din chani din miri a",
    continue: "Tu'ma",
    allAreas: "Fongti zaa",
    yourArea: "A fong ni",
    whatToDo: "Bo ka a yan ning",
    close: "Yo ma",
    alertSent: "Zu'u kpahibu chang ya, ban mira pan tooi na pumpongo",
    streetLabel: "Palli bee bin she'u din yam dinni tooi song a ka bang fong",
    streetPlaceholder: "e.g. near the big mango tree",
    severityQuestion: "Wula ka di paai punpongo?",
    changeArea: "Ta'mi polo",
    neighborsConfirmed: "ban mira dihi tabili",
    neighborConfirmed: "ti dihi wun mira",
    levels: {
      watching: { label: "Yulibu", sub: "Kom maa nabira" },
      rising: { label: "Dubu", sub: "Kom maa durina yomyom" },
      danger: { label: "Sarati", sub: "Cham shali polo din du pumpongo" },
    },
    guidance: {
      watching: "Yulimi venyela kom dolibu shehi ni ting shenga dimbi du. Kpu'mi a binbora tinga sarati ti ning zu'u.",
      rising: "Cham di zani ting din du pumpongo, di chang bee n duhi loori ko zorili ni hali dii nyala kom maa bi gam, din tooi kwala fiebi.",
      danger: "Cham ti zani ting din du pumpongo zom ka che kom di lam lu'shenga ni anashaara binyera zaa. Kuhi bo songsim ayi kpalim sheli ni an ku tooi yi.",
    },
    reportedIn: "Din pun gari",
  },
};

const SEED_ALERTS = [
  { id: "a1", street: "near the market road", area: "Aboabo", level: "danger", ts: Date.now() - 4 * 60 * 1000, confirms: 6 },
  { id: "a2", street: "junction by the pharmacy", area: "Sabon Gari", level: "rising", ts: Date.now() - 14 * 60 * 1000, confirms: 3 },
  { id: "a3", street: "behind St. Peter's school", area: "Choggu", level: "watching", ts: Date.now() - 40 * 60 * 1000, confirms: 1 },
  { id: "a4", street: "near the mosque", area: "Aboabo", level: "watching", ts: Date.now() - 22 * 60 * 1000, confirms: 2 },
];

function timeAgo(ts) {
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr ago`;
}

function GaugeBar({ level, animated }) {
  const cfg = LEVELS_META[level];
  return (
    <div style={{ background: "#171F29", borderRadius: 8, height: 10, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${cfg.fill}%`, background: cfg.color, borderRadius: 8, transition: animated ? "width 0.6s ease" : "none" }} />
    </div>
  );
}

function LangToggle({ lang, setLang }) {
  return (
    <button
      onClick={() => setLang(lang === "en" ? "dag" : "en")}
      style={{ background: "#212B37", border: "1px solid #2A3542", borderRadius: 20, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
    >
      <Globe size={13} color="#9AA5B1" />
      <span style={{ color: "#EDEAE2", fontSize: 12, fontWeight: 700 }}>{lang === "en" ? "EN" : "DAG"}</span>
    </button>
  );
}

function AlertCard({ alert, tr, onOpen }) {
  const cfg = LEVELS_META[alert.level];
  const Icon = cfg.icon;
  const meta = tr.levels[alert.level];
  return (
    <div
      onClick={() => onOpen(alert)}
      style={{ background: "#212B37", border: `1px solid ${cfg.color}33`, borderRadius: 14, padding: "14px 16px", cursor: "pointer" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ background: `${cfg.color}22`, borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={20} color={cfg.color} strokeWidth={2.4} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ color: cfg.color, fontWeight: 700, fontSize: 14, fontFamily: "'Space Grotesk', sans-serif" }}>{meta.label}</span>
            <span style={{ color: "#9AA5B1", fontSize: 12, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <Clock size={12} /> {timeAgo(alert.ts)}
            </span>
          </div>
          <div style={{ color: "#EDEAE2", fontSize: 15, fontWeight: 500, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
            <MapPin size={13} color="#9AA5B1" style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {alert.street} <span style={{ color: "#66707C" }}>&middot; {alert.area}</span>
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            <GaugeBar level={alert.level} animated />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <span style={{ color: "#9AA5B1", fontSize: 12 }}>
              {alert.confirms} {alert.confirms === 1 ? tr.neighborConfirmed : tr.neighborsConfirmed}
            </span>
            <span style={{ color: "#5D6875", display: "flex", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 600 }}>
              {tr.whatToDo} <ChevronRight size={14} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailSheet({ alert, tr, onClose, onConfirm }) {
  if (!alert) return null;
  const cfg = LEVELS_META[alert.level];
  const Icon = cfg.icon;
  const meta = tr.levels[alert.level];
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const msg = `${tr.appTitle}: ${meta.label} \u2014 ${alert.street}, ${alert.area} (${timeAgo(alert.ts)})`;
    try {
      if (navigator.share) await navigator.share({ text: msg });
      else {
        await navigator.clipboard.writeText(msg);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch (e) {}
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0B1017CC", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1B2530", borderTopLeftRadius: 20, borderTopRightRadius: 20, width: "100%", maxWidth: 440, padding: "20px 20px 26px", borderTop: `1px solid ${cfg.color}44` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: `${cfg.color}22`, borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon size={20} color={cfg.color} strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ color: cfg.color, fontWeight: 700, fontSize: 16, fontFamily: "'Space Grotesk', sans-serif" }}>{meta.label}</div>
              <div style={{ color: "#9AA5B1", fontSize: 12.5 }}>{alert.street} &middot; {alert.area}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#9AA5B1", cursor: "pointer", padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <GaugeBar level={alert.level} />

        <div style={{ marginTop: 16, background: "#212B37", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ color: "#EDEAE2", fontWeight: 700, fontSize: 13.5, marginBottom: 6, fontFamily: "'Space Grotesk', sans-serif" }}>{tr.whatToDo}</div>
          <div style={{ color: "#C9D1DA", fontSize: 14, lineHeight: 1.5 }}>{tr.guidance[alert.level]}</div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            onClick={() => onConfirm(alert.id)}
            style={{ flex: 1, background: "transparent", border: "1px solid #3FA9A055", color: "#3FA9A0", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}
          >
            <Check size={15} /> {tr.stillTrue}
          </button>
          <button
            onClick={share}
            style={{ flex: 1, background: "transparent", border: "1px solid #2A3542", color: "#9AA5B1", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}
          >
            <Share2 size={15} /> {copied ? "\u2713" : "Share"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportSheet({ tr, defaultArea, onClose, onSubmit }) {
  const [street, setStreet] = useState("");
  const [area, setArea] = useState(defaultArea || AREAS[0]);
  const [level, setLevel] = useState(null);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0B1017CC", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1B2530", borderTopLeftRadius: 20, borderTopRightRadius: 20, width: "100%", maxWidth: 440, padding: "20px 20px 28px", borderTop: "1px solid #2A3542", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ color: "#EDEAE2", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18 }}>{tr.reportPrompt}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#9AA5B1", cursor: "pointer", padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <label style={{ color: "#9AA5B1", fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>{tr.streetLabel}</label>
        <input
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          placeholder={tr.streetPlaceholder}
          style={{ width: "100%", background: "#212B37", border: "1px solid #2A3542", borderRadius: 10, padding: "12px 14px", color: "#EDEAE2", fontSize: 15, outline: "none", marginBottom: 16, boxSizing: "border-box" }}
        />

        <label style={{ color: "#9AA5B1", fontSize: 13, fontWeight: 500, display: "block", marginBottom: 8 }}>{tr.yourArea}</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          {AREAS.map((a) => (
            <button
              key={a}
              onClick={() => setArea(a)}
              style={{ background: area === a ? "#E2622F22" : "#212B37", border: `1.5px solid ${area === a ? "#E2622F" : "#2A3542"}`, color: area === a ? "#E2622F" : "#9AA5B1", borderRadius: 20, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {a}
            </button>
          ))}
        </div>

        <label style={{ color: "#9AA5B1", fontSize: 13, fontWeight: 500, display: "block", marginBottom: 8 }}>{tr.severityQuestion}</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
          {Object.entries(LEVELS_META).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const active = level === key;
            const meta = tr.levels[key];
            return (
              <button
                key={key}
                onClick={() => setLevel(key)}
                style={{ display: "flex", alignItems: "center", gap: 12, background: active ? `${cfg.color}1A` : "#212B37", border: `1.5px solid ${active ? cfg.color : "#2A3542"}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ width: 38, height: 38, borderRadius: 9, background: `${cfg.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={19} color={cfg.color} strokeWidth={2.4} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#EDEAE2", fontWeight: 600, fontSize: 15 }}>{meta.label}</div>
                  <div style={{ color: "#9AA5B1", fontSize: 12.5, marginTop: 1 }}>{meta.sub}</div>
                </div>
                <div style={{ width: 46 }}>
                  <GaugeBar level={key} />
                </div>
              </button>
            );
          })}
        </div>

        <button
          disabled={!street.trim() || !level}
          onClick={() => onSubmit({ street: street.trim(), area, level })}
          style={{ width: "100%", background: !street.trim() || !level ? "#2A3542" : "#E2622F", color: !street.trim() || !level ? "#66707C" : "#171219", border: "none", borderRadius: 12, padding: "14px 0", fontSize: 16, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", cursor: !street.trim() || !level ? "not-allowed" : "pointer" }}
        >
          {tr.sendAlert}
        </button>
      </div>
    </div>
  );
}

function Onboarding({ tr, onDone }) {
  const [area, setArea] = useState(null);
  return (
    <div style={{ minHeight: "100vh", background: "#171F29", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, justifyContent: "center" }}>
          <Waves size={26} color="#E2622F" strokeWidth={2.5} />
          <span style={{ color: "#EDEAE2", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 24 }}>{tr.appTitle}</span>
        </div>
        <p style={{ color: "#9AA5B1", fontSize: 14, textAlign: "center", marginBottom: 26 }}>{tr.appSubtitle}</p>

        <div style={{ color: "#EDEAE2", fontWeight: 700, fontSize: 16, marginBottom: 4, fontFamily: "'Space Grotesk', sans-serif" }}>{tr.chooseArea}</div>
        <div style={{ color: "#9AA5B1", fontSize: 13, marginBottom: 16 }}>{tr.chooseAreaSub}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {AREAS.map((a) => (
            <button
              key={a}
              onClick={() => setArea(a)}
              style={{ background: area === a ? "#E2622F22" : "#212B37", border: `1.5px solid ${area === a ? "#E2622F" : "#2A3542"}`, color: "#EDEAE2", borderRadius: 12, padding: "13px 16px", fontSize: 15, fontWeight: 600, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              {a}
              {area === a && <Check size={17} color="#E2622F" />}
            </button>
          ))}
        </div>

        <button
          disabled={!area}
          onClick={() => onDone(area)}
          style={{ width: "100%", background: !area ? "#2A3542" : "#E2622F", color: !area ? "#66707C" : "#171219", border: "none", borderRadius: 12, padding: "14px 0", fontSize: 16, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", cursor: !area ? "not-allowed" : "pointer" }}
        >
          {tr.continue}
        </button>
      </div>
    </div>
  );
}

// Browser storage (works outside Claude's artifact sandbox). Note: localStorage is
// per-device, so alerts are NOT shared between different people's phones yet.
const store = {
  get(key) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? null : { value };
    } catch (e) {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {}
  },
};

export default function FloodAlertApp() {
  const [lang, setLang] = useState("en");
  const [userArea, setUserArea] = useState(null);
  const [booted, setBooted] = useState(false);
  const [alerts, setAlerts] = useState(SEED_ALERTS);
  const [filter, setFilter] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openAlert, setOpenAlert] = useState(null);
  const [justSent, setJustSent] = useState(false);

  const tr = T[lang];

  useEffect(() => {
    (async () => {
      try {
        const areaRes = store.get("flood-user-area");
        if (areaRes?.value) setUserArea(areaRes.value);
      } catch (e) {}
      try {
        const alertsRes = store.get("flood-alerts");
        if (alertsRes?.value) {
          const parsed = JSON.parse(alertsRes.value);
          if (Array.isArray(parsed) && parsed.length) setAlerts(parsed);
        }
      } catch (e) {}
      setBooted(true);
    })();
  }, []);

  const persistAlerts = async (next) => {
    try {
      store.set("flood-alerts", JSON.stringify(next));
    } catch (e) {}
  };

  const finishOnboarding = async (area) => {
    setUserArea(area);
    try {
      store.set("flood-user-area", area);
    } catch (e) {}
  };

  const handleSubmit = ({ street, area, level }) => {
    const next = [{ id: `a${Date.now()}`, street, area, level, ts: Date.now(), confirms: 1 }, ...alerts];
    setAlerts(next);
    persistAlerts(next);
    setSheetOpen(false);
    setJustSent(true);
    setTimeout(() => setJustSent(false), 2600);
  };

  const handleConfirm = (id) => {
    const next = alerts.map((a) => (a.id === id ? { ...a, confirms: a.confirms + 1 } : a));
    setAlerts(next);
    persistAlerts(next);
    setOpenAlert((cur) => (cur ? next.find((a) => a.id === cur.id) : cur));
  };

  if (!booted) return <div style={{ minHeight: "100vh", background: "#171F29" }} />;

  if (!userArea) return <Onboarding tr={tr} onDone={finishOnboarding} />;

  const sorted = [...alerts].sort((a, b) => b.ts - a.ts);
  const visible = filter === "mine" ? sorted.filter((a) => a.area === userArea) : sorted;
  const mineCount = sorted.filter((a) => a.area === userArea).length;

  return (
    <div style={{ minHeight: "100vh", background: "#171F29", fontFamily: "'Inter', system-ui, sans-serif", display: "flex", justifyContent: "center" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes rainfall { 0% { background-position: 0 0; } 100% { background-position: 0 40px; } }
        .rain-bg { background-image: repeating-linear-gradient(115deg, #EDEAE211 0px, #EDEAE211 1px, transparent 1px, transparent 14px); animation: rainfall 1.4s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .rain-bg { animation: none; } }
        input::placeholder { color: #66707C; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 440, padding: "0 0 32px" }}>
        <div className="rain-bg" style={{ background: "linear-gradient(180deg, #1E2A38 0%, #171F29 100%)", padding: "24px 20px 20px", borderBottom: "1px solid #212B37" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Waves size={20} color="#E2622F" strokeWidth={2.5} />
              <span style={{ color: "#EDEAE2", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 20 }}>{tr.appTitle}</span>
            </div>
            <LangToggle lang={lang} setLang={setLang} />
          </div>
          <p style={{ color: "#9AA5B1", fontSize: 13.5, margin: "2px 0 10px" }}>{tr.appSubtitle}</p>
          <button
            onClick={() => setUserArea(null)}
            style={{ background: "none", border: "none", color: "#5D95E8", fontSize: 12.5, fontWeight: 600, padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          >
            <MapPin size={12} /> {userArea} &middot; {tr.changeArea}
          </button>
        </div>

        <div style={{ padding: "18px 16px 6px" }}>
          <button
            onClick={() => setSheetOpen(true)}
            style={{ width: "100%", background: "#212B37", border: "1.5px solid #E2622F55", borderRadius: 16, padding: "18px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", textAlign: "left" }}
          >
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "#E2622F22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Droplets size={24} color="#E2622F" strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ color: "#EDEAE2", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16.5 }}>{tr.reportPrompt}</div>
              <div style={{ color: "#9AA5B1", fontSize: 13, marginTop: 1 }}>{tr.reportSub}</div>
            </div>
          </button>
          {justSent && <div style={{ color: "#3FA9A0", fontSize: 13, fontWeight: 600, marginTop: 10, textAlign: "center" }}>&#10003; {tr.alertSent}</div>}
        </div>

        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button
              onClick={() => setFilter("mine")}
              style={{ flex: 1, background: filter === "mine" ? "#E2622F22" : "#212B37", border: `1.5px solid ${filter === "mine" ? "#E2622F" : "#2A3542"}`, color: filter === "mine" ? "#E2622F" : "#9AA5B1", borderRadius: 10, padding: "9px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              {tr.yourArea} ({mineCount})
            </button>
            <button
              onClick={() => setFilter("all")}
              style={{ flex: 1, background: filter === "all" ? "#E2622F22" : "#212B37", border: `1.5px solid ${filter === "all" ? "#E2622F" : "#2A3542"}`, color: filter === "all" ? "#E2622F" : "#9AA5B1", borderRadius: 10, padding: "9px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              {tr.allAreas} ({sorted.length})
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: "#EDEAE2", fontWeight: 700, fontSize: 15, fontFamily: "'Space Grotesk', sans-serif" }}>{tr.nearbyReports}</span>
            <span style={{ color: "#66707C", fontSize: 12 }}>{visible.length} {tr.active}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visible.length === 0 && (
              <div style={{ color: "#5D6875", fontSize: 13.5, textAlign: "center", padding: "24px 0" }}>
                {tr.reportedIn} {userArea}: 0
              </div>
            )}
            {visible.map((a) => (
              <AlertCard key={a.id} alert={a} tr={tr} onOpen={setOpenAlert} />
            ))}
          </div>
        </div>
      </div>

      {sheetOpen && <ReportSheet tr={tr} defaultArea={userArea} onClose={() => setSheetOpen(false)} onSubmit={handleSubmit} />}
      {openAlert && <DetailSheet alert={openAlert} tr={tr} onClose={() => setOpenAlert(null)} onConfirm={handleConfirm} />}
    </div>
  );
}
