// Flood Watch v2 — main app (screens + navigation). Plain JavaScript, no framework.
import { t, setLang, getLang, LANGS, STRINGS } from "./i18n.js";
import { api, detect, features, getMode, LS } from "./api.js";
import { CITIES, ALL_AREAS, matchArea } from "./shared/areas.js";
import { speak, stopSpeaking, loadPhraseIndex, playUrl, canRecord, startRecording, toWav16k, browserDictation } from "./voice.js";
import { renderResearch, renderStudio, task } from "./research.js";

// ---------- tiny DOM helper (always uses textContent, never innerHTML for user text) ----------
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
export function icon(id, cls = "ic") {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("class", cls);
  s.setAttribute("aria-hidden", "true");
  const u = document.createElementNS("http://www.w3.org/2000/svg", "use");
  u.setAttribute("href", "#" + id);
  s.append(u);
  return s;
}
export function toast(msg, ms = 2600) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), ms);
}

// ---------- preferences (kept on this phone only) ----------
export const prefs = Object.assign({ lang: null, areaId: null, locationChecked: false, autoRead: false, big: false, introDone: false, howToDone: false }, LS.get("fw.prefs", {}));
export function savePrefs() { LS.set("fw.prefs", prefs); }
const area = () => ALL_AREAS.find((a) => a.id === prefs.areaId);

/** A speaker button that reads a phrase aloud in the current language. */
function sayBtn(key, vars, label) {
  const b = h("button", { class: "say", type: "button", "aria-label": `${t("listen")}: ${label || t(key, vars)}` }, icon("i-speaker"));
  b.addEventListener("click", async (e) => {
    e.stopPropagation(); e.preventDefault();
    b.classList.add("speaking");
    await speak({ key, vars, onFallback: () => toast(t("noVoiceYet")) });
    b.classList.remove("speaking");
  });
  return b;
}
function sayText(text) {
  const b = h("button", { class: "say", type: "button", "aria-label": t("listen") }, icon("i-speaker"));
  b.addEventListener("click", async (e) => {
    e.stopPropagation();
    b.classList.add("speaking");
    await speak({ text });
    b.classList.remove("speaking");
  });
  return b;
}
function autoRead(keys) {
  if (!prefs.autoRead) return;
  (async () => { for (const [key, vars] of keys) await speak({ key, vars }); })();
}

function topBar({ backTo, title, sub } = {}) {
  return h("header", { class: "top" },
    backTo ? h("a", { class: "iconbtn", href: backTo, "aria-label": t("back") }, icon("i-back")) : null,
    h("div", { class: "title" },
      h("h1", { tabindex: "-1" }, backTo ? null : icon("i-wave"), title || t("appTitle")),
      sub ? h("div", { class: "sub" }, sub) : null),
    !backTo ? h("a", { class: "iconbtn", href: "#/settings", "aria-label": t("settings") }, icon("i-gear")) : null,
  );
}

async function shrinkPhoto(file, max = 1280) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.72));
}

function timeAgo(ts) {
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (m < 1) return t("justNow");
  if (m < 60) return t("minutesAgo", { n: m });
  return t("hoursAgo", { n: Math.floor(m / 60) });
}

// ===================================================================================
// Screens
// ===================================================================================
const app = document.getElementById("app");
function mount(...nodes) {
  stopSpeaking();
  app.replaceChildren(...nodes.flat().filter((n) => n != null && n !== false));
  window.scrollTo(0, 0);
  app.querySelector("h1")?.focus({ preventScroll: true });
}

// 1) Language — every option speaks in its own language, so you don't need to read.
function Welcome() {
  const tiles = LANGS.map((L) =>
    h("div", { class: "tilewrap" },
      h("button", {
        class: "tile", type: "button", "aria-pressed": String(prefs.lang === L.code),
        onclick: () => { prefs.lang = L.code; setLang(L.code); savePrefs(); location.hash = prefs.areaId ? "#/" : "#/place"; },
      }, h("span", { class: "grow big" }, L.native)),
      (() => {
        const b = h("button", { class: "say", type: "button", "aria-label": `Listen: ${L.name}` }, icon("i-speaker"));
        b.onclick = async () => { b.classList.add("speaking"); await speak({ key: "pickLangSay", lang: L.code, onFallback: () => {} }); b.classList.remove("speaking"); };
        return b;
      })()));
  mount(
    h("div", { class: "center", style: "padding:34px 0 10px" },
      (() => { const i = icon("i-wave"); i.setAttribute("style", "width:64px;height:64px;color:var(--brand)"); return i; })(),
      h("h1", { tabindex: "-1", style: "font-size:2rem;color:var(--brand)" }, "Flood Watch"),
      h("p", { class: "muted" }, STRINGS.en.tagline), h("p", { class: "muted" }, STRINGS.twi.tagline)),
    h("div", { class: "heading" }, h("h2", {}, "Choose your language · Paw wo kasa")),
    h("div", { class: "stack" }, tiles),
  );
}

// 2) Where do you live — with optional on-phone location check
function Place() {
  let city = area()?.cityId || null;
  const msg = h("div", { role: "status" });
  const areaBox = h("div", { class: "stack" });

  function pick(a, checked) {
    prefs.areaId = a.id; prefs.locationChecked = checked; savePrefs();
    location.hash = prefs.introDone ? "#/" : "#/intro";
  }
  function drawAreas() {
    areaBox.replaceChildren();
    if (!city) return;
    const c = CITIES.find((x) => x.id === city);
    areaBox.append(h("div", { class: "heading" }, h("h2", {}, t("chooseArea")), sayBtn("chooseArea")));
    c.areas.forEach((a) => areaBox.append(
      h("button", { class: "tile", type: "button", "aria-pressed": String(prefs.areaId === a.id), onclick: () => pick(a, false) },
        icon("i-pin"), h("span", { class: "grow big" }, a.name))));
  }
  const cityChips = h("div", { class: "chips" }, CITIES.map((c) =>
    h("button", { class: "chipbtn", type: "button", "aria-pressed": String(city === c.id), onclick: (e) => {
      city = c.id; cityChips.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
      e.currentTarget.setAttribute("aria-pressed", "true"); drawAreas();
    } }, c.name)));

  const locBtn = h("button", { class: "btn primary", type: "button" }, icon("i-pin"), t("useMyLocation"));
  locBtn.onclick = () => {
    if (!navigator.geolocation) { msg.replaceChildren(h("p", { class: "banner off" }, t("locDenied"))); return; }
    msg.replaceChildren(h("p", { class: "muted" }, t("locating")));
    locBtn.disabled = true;
    navigator.geolocation.getCurrentPosition((pos) => {
      locBtn.disabled = false;
      // The match happens HERE on the phone. The coordinates are never sent anywhere.
      const a = matchArea(pos.coords.latitude, pos.coords.longitude);
      if (!a) { msg.replaceChildren(h("p", { class: "banner warn" }, t("locNotFound"))); return; }
      city = a.cityId; drawAreas();
      msg.replaceChildren(h("div", { class: "card box" },
        h("div", { class: "heading", style: "margin:0 0 10px" }, h("h2", {}, t("locFound", { area: a.name })), sayBtn("locFound", { area: a.name })),
        h("div", { class: "row" },
          h("button", { class: "btn ok", type: "button", onclick: () => pick(a, true) }, icon("i-check"), t("yes")),
          h("button", { class: "btn ghost", type: "button", onclick: () => msg.replaceChildren() }, icon("i-x"), t("no")))));
      speak({ key: "locFound", vars: { area: a.name } });
    }, () => {
      locBtn.disabled = false;
      msg.replaceChildren(h("p", { class: "banner off" }, t("locDenied")));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  };

  mount(
    topBar({ backTo: "#/welcome", title: t("chooseCity") }),
    h("div", { class: "heading" }, h("h2", {}, t("chooseCity")), sayBtn("chooseCity")),
    locBtn,
    h("p", { class: "muted", style: "display:flex;gap:8px;align-items:center" }, t("locPrivacy")),
    msg,
    h("div", { class: "mt" }, cityChips),
    areaBox,
  );
  drawAreas();
  autoRead([["chooseCity"]]);
}

// 2b) First run: what the app knows (answers the "can it track me?" worry from Round 1) + talk preference
function Intro() {
  const line = (ic, key, cls = "") => h("div", { class: "heading " + cls, style: "margin:10px 0" }, icon(ic), h("p", { style: "flex:1;margin:0" }, t(key)), sayBtn(key));
  const choose = (talk) => { prefs.autoRead = talk; prefs.introDone = true; savePrefs(); location.hash = "#/"; };
  mount(
    topBar({ backTo: "#/place", title: t("privacyTitle") }),
    h("div", { class: "card box" },
      line("i-check", "knows"),
      line("i-x", "neverKnows"),
      line("i-x", "cannotSee"),
      h("p", { class: "muted" }, t("testNote"))),
    h("div", { class: "heading" }, h("h2", {}, t("talkToMe")), sayBtn("talkToMe")),
    h("div", { class: "stack" },
      h("button", { class: "btn primary", type: "button", onclick: () => choose(true) }, icon("i-speaker"), t("talkYes")),
      h("button", { class: "btn ghost", type: "button", onclick: () => choose(false) }, t("talkNo"))),
  );
  autoRead([["privacyTitle"], ["neverKnows"], ["talkToMe"]]);
}

// 2c) Tell your family: "I am safe" / "I need help" — sent through WhatsApp by the person,
// never stored by Flood Watch. Exact location only if they tick the box (made on the phone).
function Checkin(kind) {
  const a = area();
  if (!a) { location.hash = "#/place"; return; }
  const msgKey = kind === "help" ? "msgHelp" : "msgSafe";
  const box = h("input", { type: "checkbox", style: "width:28px;height:28px" });
  const status = h("p", { class: "muted", role: "status" });
  const send = async () => {
    let text = t(msgKey, { area: `${a.name}, ${a.cityName}` });
    if (box.checked) {
      status.textContent = t("locating");
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 12000 }));
        text += ` https://maps.google.com/?q=${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`;
        status.textContent = "";
      } catch { status.textContent = t("locDenied"); }
    }
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
  };
  mount(
    topBar({ backTo: "#/", title: t("safeTitle") }),
    h("div", { class: `hero ${kind === "help" ? "danger" : "watching"}`, style: kind === "help" ? "" : "background:var(--ok-soft)" },
      h("b", { style: "font-size:1.4rem;flex:1" }, t(kind === "help" ? "needHelp" : "imSafe")), sayBtn(kind === "help" ? "needHelp" : "imSafe")),
    h("div", { class: "card box" }, h("p", { style: "font-size:1.1rem" }, t(msgKey, { area: `${a.name}, ${a.cityName}` }))),
    h("label", { class: "tile mt" }, h("span", { class: "grow" }, t("addExactLoc")), box),
    h("p", { class: "muted" }, t("exactLocNote")),
    status,
    h("button", { class: "btn ok mt", type: "button", onclick: send }, icon("i-share"), t("sendWhatsApp")),
    kind === "help" ? h("a", { class: "emergency mt", href: "tel:112" }, icon("i-phone"), t("emergency")) : null,
  );
  autoRead([[kind === "help" ? "needHelp" : "imSafe"]]);
}

// 3) Home — alerts + the big "I see flooding" button
let lastAlerts = [];
let homeTimer = null;
async function Home() {
  const a = area();
  if (!a) { location.hash = "#/place"; return; }
  let tab = LS.get("fw.tab", "mine");
  const list = h("div", { class: "list", "aria-live": "polite" });
  const rainBox = h("div");
  const offBox = h("div");

  const tabs = h("div", { class: "tabs", role: "tablist" },
    [["mine", t("alertsHere")], ["all", t("alertsAll")]].map(([id, label]) =>
      h("button", { class: "tab", role: "tab", type: "button", "aria-selected": String(tab === id), onclick: (e) => {
        tab = id; LS.set("fw.tab", id);
        tabs.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", "false"));
        e.currentTarget.setAttribute("aria-selected", "true"); draw();
      } }, label)));

  function card(al) {
    const where = al.landmark || (al.hasVoice ? "🎤 " + t("listenVoice") : "");
    return h("a", { class: `card alert ${al.level}`, href: `#/alert/${al.id}` },
      h("div", { class: `pic ${al.level}` }, icon("lvl-" + al.level)),
      h("div", { class: "body" },
        h("div", { class: `lvl ${al.level}` }, t("level." + al.level), al.photoUrl ? h("span", { class: "chip", style: "margin-left:8px" }, "📷") : null),
        h("div", { class: "where" }, where),
        h("div", { class: "meta" },
          h("span", {}, `${al.areaName} · ${timeAgo(al.ts)}`),
          h("span", {}, al.confirms === 1 ? t("confirmedBy1") : t("confirmedBy", { n: al.confirms }))),
        h("div", { class: "chips", style: "margin-top:6px" },
          al.practice ? h("span", { class: "chip" }, t("practice")) : null,
          al.locationChecked ? h("span", { class: "chip ok" }, icon("i-pin"), t("locChecked")) : null,
          al.status === "disputed" ? h("span", { class: "chip warn" }, t("disputedBy", { n: al.falses })) : null,
          al.status === "old" ? h("span", { class: "chip warn" }, t("oldAlert")) : null)));
  }

  async function draw() {
    let res;
    try { res = await api.alerts(); } catch { res = { alerts: [], offline: true }; }
    lastAlerts = res.alerts;
    offBox.replaceChildren(res.offline ? h("div", { class: "banner off" }, t("offline")) : "");
    const shown = tab === "mine" ? res.alerts.filter((x) => x.areaId === a.id) : res.alerts;
    list.replaceChildren(...(shown.length ? shown.map(card) : [h("div", { class: "card empty" }, h("p", {}, t("noAlerts")))]));
  }

  async function drawRain() {
    try {
      const r = await api.rain(a);
      if (!r || r.level === "unknown") return;
      rainBox.replaceChildren(h("div", { class: `banner rain ${r.level}` }, icon("i-cloud"),
        h("span", { style: "flex:1" }, t("rain." + r.level)), sayBtn("rain." + r.level)));
    } catch { /* forecast is a bonus; ignore failures */ }
  }

  const readAll = h("button", { class: "iconbtn", type: "button", "aria-label": t("readToMe") }, icon("i-speaker"));
  readAll.onclick = async () => {
    readAll.classList.add("speaking");
    const mine = lastAlerts.filter((x) => x.areaId === a.id);
    if (!mine.length) await speak({ key: "noAlerts" });
    for (const al of mine.slice(0, 3)) {
      await speak({ key: "level." + al.level });
      if (al.landmark) await speak({ text: al.landmark, lang: "en" });
      else if (al.voiceUrl) await playUrl(al.voiceUrl);
    }
    readAll.classList.remove("speaking");
  };

  const top = topBar({ sub: h("a", { href: "#/place", style: "color:inherit;display:inline-flex;align-items:center;gap:4px" }, icon("i-pin"), `${a.name}, ${a.cityName}`) });
  top.insertBefore(readAll, top.lastChild);

  mount(
    top, offBox, rainBox,
    h("button", { class: "report", type: "button", onclick: () => (location.hash = "#/report") },
      h("span", { class: "bubble" }, icon("i-wave")),
      h("span", {}, h("b", {}, t("reportBig")), h("span", {}, t("reportBigSub")))),
    h("a", { class: "emergency", href: "tel:112" }, icon("i-phone"), t("emergency")),
    h("div", { class: "row", style: "margin-bottom:14px" },
      h("a", { class: "btn ghost", href: "#/checkin/safe" }, icon("i-check"), t("imSafe")),
      h("a", { class: "btn ghost", href: "#/checkin/help", style: "color:var(--danger)" }, t("needHelp"))),
    prefs.howToDone ? null : (() => {
      const card = h("div", { class: "card box", style: "margin:0 0 14px" },
        h("div", { class: "heading", style: "margin:0 0 6px" }, h("h2", {}, t("howToTitle")), sayBtn("howToTitle")),
        ...["howTo1", "howTo2", "howTo3"].map((k, i) => h("div", { class: "heading", style: "margin:6px 0" }, h("b", { class: "step" }, String(i + 1)), h("span", { style: "flex:1" }, t(k)), sayBtn(k))),
        h("button", { class: "btn primary mt", type: "button", onclick: () => { prefs.howToDone = true; savePrefs(); card.remove(); } }, t("gotIt")));
      return card;
    })(),
    tabs, list,
    h("a", { class: "fab", href: "#/helper" }, icon("i-chat"), t("askHelper")),
  );
  await draw();
  drawRain();
  autoRead(prefs.howToDone ? [["reportBig"]] : [["howTo1"], ["howTo2"], ["howTo3"]]);
  clearInterval(homeTimer);
  homeTimer = setInterval(() => (location.hash === "#/" || location.hash === "") ? draw() : clearInterval(homeTimer), 60000);
}

// 4) Report — one question per screen, no typing needed
function Report() {
  const a = area();
  if (!a) { location.hash = "#/place"; return; }
  const st = { step: 1, level: null, voiceBlob: null, landmark: "", photo: null };

  function step1() {
    mount(
      topBar({ backTo: "#/", title: t("reportBig"), sub: "1 / 2" }),
      h("div", { class: "heading" }, h("h2", {}, t("howBad")), sayBtn("howBad")),
      h("div", { class: "stack" }, ["watching", "rising", "danger"].map((lv) =>
        h("div", { class: "tilewrap" },
          h("button", { class: `tile ${lv}`, type: "button", "aria-pressed": String(st.level === lv), onclick: () => { st.level = lv; step2(); } },
            h("span", { class: `pic ${lv}` }, icon("lvl-" + lv)),
            h("span", { class: "grow" }, h("span", { class: `lvl ${lv}`, style: "display:block" }, t("level." + lv)), h("span", { class: "muted" }, t(`level.${lv}.sub`)))),
          sayBtn(`level.${lv}`, {}, t(`level.${lv}`) + ". " + t(`level.${lv}.sub`))))),
    );
    autoRead([["howBad"]]);
  }

  function step2() {
    const status = h("p", { class: "center muted", role: "status" });
    const playBox = h("div", { class: "center" });
    const input = h("input", { type: "text", maxlength: "120", placeholder: t("landmarkPlaceholder"), value: st.landmark, "aria-label": t("typeInstead") });
    const send = h("button", { class: "btn primary mt", type: "button" }, icon("i-check"), t("send"));
    const refresh = () => (send.disabled = !(st.voiceBlob || input.value.trim()));
    input.oninput = () => { st.landmark = input.value; refresh(); };

    let rec = null;
    const mic = h("button", { class: "mic", type: "button", "aria-label": t("tapToSpeak") }, icon("i-mic"), h("span", {}, t("tapToSpeak")));
    mic.onclick = async () => {
      if (rec) { // stop
        const blob = await rec.stop(); rec = null;
        mic.classList.remove("rec"); mic.lastChild.textContent = t("recordAgain");
        mic.replaceChild(icon("i-mic"), mic.firstChild);
        st.voiceBlob = blob;
        const url = URL.createObjectURL(blob);
        status.textContent = "✓ " + t("recorded");
        playBox.replaceChildren(h("button", { class: "btn ghost", type: "button", onclick: () => playUrl(url) }, icon("i-play"), t("listen")));
        refresh();
        return;
      }
      try {
        stopSpeaking();
        rec = await startRecording(30000);
        mic.classList.add("rec"); mic.lastChild.textContent = t("recording");
        mic.replaceChild(icon("i-stop"), mic.firstChild);
        status.textContent = "";
        rec.done.then(() => { if (rec) mic.click(); });
      } catch {
        status.textContent = "🎤 ✗";
        toast("Microphone not allowed");
      }
    };

    // Optional photo of the water. Re-drawing it on a canvas shrinks it AND strips hidden EXIF data (incl. GPS).
    const photoBox = h("div");
    const fileIn = h("input", { type: "file", accept: "image/*", capture: "environment", class: "sr", id: "photo-in" });
    fileIn.onchange = async () => {
      const f = fileIn.files?.[0];
      if (!f) return;
      try {
        st.photo = await shrinkPhoto(f);
        drawPhoto();
      } catch { toast("Photo ✗"); }
    };
    function drawPhoto() {
      photoBox.replaceChildren(...(st.photo
        ? [h("img", { src: URL.createObjectURL(st.photo), alt: t("seePhoto"), style: "width:100%;border-radius:14px;margin-top:8px" }),
           h("p", { class: "muted" }, "✓ " + t("photoAdded") + " · " + t("photoPrivacy")),
           h("button", { class: "btn ghost", type: "button", onclick: () => { st.photo = null; fileIn.value = ""; drawPhoto(); } }, icon("i-x"), t("removePhoto"))]
        : [h("label", { class: "btn ghost", for: "photo-in" }, "📷 " + t("addPhoto")), h("p", { class: "muted" }, t("photoTip"))]));
    }
    drawPhoto();

    send.onclick = async () => {
      send.disabled = true; send.lastChild.textContent = t("sending");
      try {
        // Quietly re-check location if the person already allowed it. Only yes/no leaves the phone.
        let checked = prefs.locationChecked;
        try {
          const perm = await navigator.permissions?.query({ name: "geolocation" });
          if (perm?.state === "granted") {
            const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 120000 }));
            checked = matchArea(pos.coords.latitude, pos.coords.longitude)?.id === a.id;
          }
        } catch { /* keep earlier answer */ }
        const voice = st.voiceBlob ? await api.uploadVoice(st.voiceBlob) : null;
        const photo = st.photo ? await api.uploadPhoto(st.photo) : null;
        await api.createAlert({ areaId: a.id, level: st.level, landmark: input.value.trim(), voice, photo, lang: getLang(), locationChecked: checked });
        toast("✓ " + t("sent"), 3500);
        speak({ key: "sent" });
        location.hash = "#/";
      } catch (e) {
        toast(e.message || "Error");
        send.disabled = false; send.lastChild.textContent = t("send");
      }
    };

    mount(
      topBar({ backTo: "#/report", title: t("reportBig"), sub: "2 / 2" }),
      h("div", { class: `hero ${st.level}` }, h("span", { class: "pic" }, icon("lvl-" + st.level)), h("b", { class: `lvl ${st.level}` }, t("level." + st.level))),
      h("div", { class: "heading" }, h("h2", {}, t("where")), sayBtn("where")),
      canRecord() ? mic : null, status, playBox,
      h("label", { class: "f" }, t("typeInstead")), input,
      h("div", { class: "mt" }, fileIn, photoBox),
      send,
      h("p", { class: "muted mt" }, t("privacyNote")),
    );
    refresh();
    app.querySelector(".top a.iconbtn").addEventListener("click", (e) => { e.preventDefault(); if (rec) rec.stop(); step1(); });
    autoRead([["where"]]);
  }

  if (location.hash === "#/report" || !st.level) step1();
}

// 5) Alert detail
async function AlertDetail(id) {
  if (!lastAlerts.find((x) => x.id === id)) { try { lastAlerts = (await api.alerts()).alerts; } catch { /* offline */ } }
  let al = lastAlerts.find((x) => x.id === id);
  if (!al) { mount(topBar({ backTo: "#/" }), h("div", { class: "card empty" }, t("noAlerts"))); return; }
  task.onOpenAlert(al, prefs.areaId);

  const trust = h("div");
  function drawTrust() {
    trust.replaceChildren(...[h("div", { class: "chips" },
      h("span", { class: "chip ok" }, icon("i-check"), al.confirms === 1 ? t("confirmedBy1") : t("confirmedBy", { n: al.confirms })),
      al.falses ? h("span", { class: "chip warn" }, icon("i-x"), t("disputedBy", { n: al.falses })) : null,
      al.locationChecked ? h("span", { class: "chip ok" }, icon("i-pin"), t("locChecked")) : null,
      al.practice ? h("span", { class: "chip" }, t("practice")) : null),
      al.status === "disputed" ? h("p", { class: "banner warn" }, t("disputed")) : null,
      al.status === "old" ? h("p", { class: "banner off" }, t("oldAlert")) : null].filter(Boolean));
  }
  drawTrust();
  async function vote(type, msgKey) {
    try { al = await api.vote(al.id, type); lastAlerts = lastAlerts.map((x) => (x.id === al.id ? al : x)); drawTrust(); toast("✓ " + t(msgKey)); }
    catch (e) { toast(e.message); }
  }
  const share = () => {
    const text = `⚠️ ${t("appTitle")}: ${t("level." + al.level)} — ${al.landmark || "🎤"} (${al.areaName}, ${timeAgo(al.ts)}). ${t("level." + al.level + ".sub")}. ${location.origin}${location.pathname}#/alert/${al.id}`;
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
  };

  mount(
    topBar({ backTo: "#/", title: al.areaName, sub: timeAgo(al.ts) }),
    h("div", { class: `hero ${al.level}` },
      h("span", { class: "pic" }, icon("lvl-" + al.level)),
      h("div", { style: "flex:1" }, h("div", { class: `lvl ${al.level}`, style: "font-size:1.4rem" }, t("level." + al.level)), h("div", {}, t(`level.${al.level}.sub`))),
      sayBtn(`level.${al.level}`, {}, t("level." + al.level))),
    h("div", { class: "card box" },
      al.landmark ? h("div", { class: "heading", style: "margin:0" }, icon("i-pin"), h("p", { class: "where", style: "flex:1" }, al.landmark), sayText(al.landmark)) : null,
      al.voiceUrl ? h("button", { class: "btn ghost mt", type: "button", onclick: () => playUrl(al.voiceUrl) }, icon("i-play"), t("listenVoice")) : null,
      al.photoUrl ? h("img", { src: al.photoUrl, alt: t("seePhoto"), style: "width:100%;border-radius:14px;margin-top:12px" }) : null,
      h("div", { class: "mt" }, trust)),
    h("div", { class: "card box" },
      h("div", { class: "heading", style: "margin:0 0 6px" }, h("h2", {}, t("whatToDo")), sayBtn("guidance." + al.level)),
      h("p", { class: "todo" }, t("guidance." + al.level))),
    h("div", { class: "row mt" },
      h("button", { class: "btn ok", type: "button", onclick: () => vote("confirm", "thanks") }, icon("i-check"), t("seeItToo")),
      h("button", { class: "btn ghost", type: "button", onclick: () => vote("false", "thanks") }, icon("i-x"), t("notTrue"))),
    h("button", { class: "btn ghost mt", type: "button", onclick: share }, icon("i-share"), t("share")),
    h("div", { class: "card box center" },
      h("p", { style: "font-weight:700" }, t("helpful")),
      h("div", { class: "row" },
        h("button", { class: "btn ghost", type: "button", "aria-label": t("yes"), onclick: () => vote("helpful", "thanks") }, icon("i-thumb"), t("yes")),
        h("button", { class: "btn ghost", type: "button", "aria-label": t("no"), onclick: () => vote("unhelpful", "thanks") }, h("span", { style: "display:inline-flex;transform:rotate(180deg)" }, icon("i-thumb")), t("no")))),
    h("a", { class: "emergency mt", href: "tel:112" }, icon("i-phone"), t("emergency")),
  );
  autoRead([[`level.${al.level}`], [`guidance.${al.level}`]]);
}

// 6) Helper (AI assistant), with voice in and voice out
const chatLog = [];
function Helper() {
  const log = h("div", { class: "chat", "aria-live": "polite" });
  const input = h("input", { type: "text", placeholder: t("askPlaceholder"), "aria-label": t("askPlaceholder"), maxlength: "500" });
  const draw = () => log.replaceChildren(...chatLog.map((m) =>
    m.me ? h("div", { class: "msg me" }, m.text)
         : h("div", { class: "msg bot" }, h("div", { class: "txt" }, m.text, m.source === "gemini" ? h("div", { class: "muted", style: "font-size:.75rem" }, "AI") : null), sayText(m.text))));

  async function send(q) {
    q = (q || input.value).trim();
    if (!q) return;
    input.value = "";
    chatLog.push({ me: true, text: q }); draw();
    try {
      const r = await api.ask(q, getLang());
      chatLog.push({ text: r.answer, source: r.source }); draw();
      if (getLang() === "en" || r.translated) speak({ text: r.answer, lang: r.translated ? getLang() : "en" });
    } catch (e) { toast(e.message); }
  }

  // Voice question: English uses the phone's own speech recognition; Twi/Dagbani use GhanaNLP if available.
  const lang = getLang();
  const voiceIn = (lang === "en" && (window.SpeechRecognition || window.webkitSpeechRecognition)) || (lang !== "en" && features.khaya && canRecord());
  let rec = null;
  const mic = h("button", { class: "iconbtn", type: "button", "aria-label": t("tapToSpeak") }, icon("i-mic"));
  mic.onclick = async () => {
    if (lang === "en") {
      mic.classList.add("speaking");
      try { const said = await browserDictation(); if (said) send(said); } catch { toast("🎤 ✗"); }
      mic.classList.remove("speaking");
      return;
    }
    if (rec) {
      const blob = await rec.stop(); rec = null; mic.classList.remove("speaking");
      try { const said = await api.asr(await toWav16k(blob), lang); if (said) send(said); else toast("🎤 ?"); } catch (e) { toast(e.message); }
      return;
    }
    try { rec = await startRecording(15000); mic.classList.add("speaking"); rec.done.then(() => rec && mic.click()); } catch { toast("🎤 ✗"); }
  };

  const suggestions = ["What do I do if water is rising?", "How do I protect my phone and documents?", "Is it safe to cross flowing water?"];
  mount(
    topBar({ backTo: "#/", title: t("askHelper") }),
    h("p", { class: "banner off" }, t("aiDisclaimer")),
    chatLog.length ? null : h("div", { class: "chips" }, suggestions.map((s) => h("button", { class: "chipbtn", type: "button", onclick: () => send(s) }, s))),
    log,
    h("form", { class: "row askrow", onsubmit: (e) => { e.preventDefault(); send(); } },
      input, voiceIn ? mic : null,
      h("button", { class: "btn primary", type: "submit", style: "flex:0 0 auto;width:auto" }, t("ask"))),
    h("a", { class: "emergency mt", href: "tel:112" }, icon("i-phone"), t("emergency")),
  );
  draw();
}

// 7) Settings
function Settings() {
  const toggle = (key, label, after) => {
    const box = h("input", { type: "checkbox", style: "width:28px;height:28px" });
    box.checked = prefs[key];
    box.onchange = () => { prefs[key] = box.checked; savePrefs(); after?.(); };
    return h("label", { class: "tile" }, h("span", { class: "grow" }, label), box);
  };
  mount(
    topBar({ backTo: "#/", title: t("settings") }),
    h("div", { class: "heading" }, h("h2", {}, t("language"))),
    h("div", { class: "chips" }, LANGS.map((L) => h("button", { class: "chipbtn", type: "button", "aria-pressed": String(getLang() === L.code), onclick: () => { prefs.lang = L.code; setLang(L.code); savePrefs(); Settings(); } }, L.native))),
    getLang() === "dag" ? h("p", { class: "muted" }, "Dagbani words are still being checked by Dagbani speakers. Some screens show English for now.") : null,
    getLang() === "twi" ? h("p", { class: "muted" }, "Twi words are still being checked by Twi speakers.") : null,
    h("div", { class: "stack mt" },
      h("a", { class: "btn ghost", href: "#/place" }, icon("i-pin"), t("changeArea")),
      toggle("big", t("textSize"), () => document.documentElement.classList.toggle("big", prefs.big)),
      toggle("autoRead", t("autoRead"))),
    h("a", { class: "btn ghost mt", href: "#/studio" }, t("helpTranslate")),
    h("div", { class: "card box" }, h("p", {}, t("privacyNote")), h("a", { href: "#/about" }, t("about")),
      h("button", { class: "btn ghost mt", type: "button", onclick: (e) => {
        const b = e.currentTarget;
        if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = t("deleteMine") + " ?"; return; }
        try { Object.keys(localStorage).filter((k) => k.startsWith("fw.")).forEach((k) => localStorage.removeItem(k)); } catch { /* blocked */ }
        toast(t("deleted")); setTimeout(() => { location.hash = "#/welcome"; location.reload(); }, 800);
      } }, t("deleteMine"))),
    h("details", { class: "card box" },
      h("summary", { style: "font-weight:700;cursor:pointer" }, "For the research team"),
      h("div", { class: "stack mt" },
        h("a", { class: "btn ghost", href: "#/research" }, "Test sessions (before / after)"),
        h("a", { class: "btn ghost", href: "#/studio" }, "Language Studio (check & record phrases)")),
      h("p", { class: "muted" }, `Version 2.0 · ${getMode() === "server" ? "connected" : "this phone only (demo mode)"}`)),
  );
}

// 8) About — plain-language explanation of how it works and what it keeps
function About() {
  const P = (x) => h("p", {}, x);
  mount(
    topBar({ backTo: "#/settings", title: t("about") }),
    h("div", { class: "card box" }, h("h2", {}, "What it is"),
      P("Flood Watch lets neighbours warn each other about flooding. You choose how bad the water is and say where it is. People in your area see the warning, can confirm it (\"I see it too\") or say it is not true."),
      P("This is a student research prototype. It is not an official warning system. For emergencies call 112. Follow NADMO and local radio.")),
    h("div", { class: "card box" }, h("h2", {}, "What we keep, and what we don't"),
      P("We keep: the area name, how bad the water is, the place you typed or a short voice note, the time, and counts of \"I see it too\" / \"Not true\"."),
      P("We never keep: your name, phone number, or exact location."),
      P("\"Find my area\" works on your phone. The phone compares where you are with the list of areas and only tells us yes or no."),
      P("Warnings and voice notes are deleted after 24 hours. The rain forecast uses the centre of your area, not your position.")),
    h("div", { class: "card box" }, h("h2", {}, "How we judge if a warning is true"),
      P("No hidden score. You see exactly: how many neighbours confirmed it, how many said it is not true, how old it is, and whether the reporter's phone was in that area."),
      P("If 3 or more people say \"Not true\" and they outnumber the confirmations, the warning is marked as doubtful.")),
    h("div", { class: "card box" }, h("h2", {}, "The helper"),
      P("The helper is a computer program. With an AI key it uses Google Gemini, with strict instructions to talk only about flood safety. Without a key it uses a short list of checked safety answers. It can be wrong. In danger, call 112.")),
  );
}

// ===================================================================================
// Router
// ===================================================================================
async function route() {
  clearInterval(homeTimer);
  const hash = location.hash || "#/";
  if (!prefs.lang && !["#/research", "#/studio"].includes(hash)) { setLang("en"); return Welcome(); }
  setLang(prefs.lang || "en");
  const [, p1, p2] = hash.split("/");
  switch (p1) {
    case "welcome": return Welcome();
    case "place": return Place();
    case "intro": return Intro();
    case "checkin": return Checkin(p2 === "help" ? "help" : "safe");
    case "report": return Report();
    case "alert": return AlertDetail(p2);
    case "helper": return Helper();
    case "settings": return Settings();
    case "about": return About();
    case "research": return renderResearch(mount);
    case "studio": return renderStudio(mount);
    default: return Home();
  }
}

(async function start() {
  document.documentElement.classList.toggle("big", prefs.big);
  await detect();
  await loadPhraseIndex();
  task.restoreBar();
  window.addEventListener("hashchange", route);
  route();
  if ("serviceWorker" in navigator && getMode() === "server") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
