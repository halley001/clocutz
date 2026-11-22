/* ===== Event settings — edit these if anything changes ===== */
const CONFIG = {
  // When the 120-hour clock started, in Cameroon time (WAT = UTC+1).
  // ASSUMPTION: 08:00 WAT on Nov 17 2026. Ask the team and update if different.
  startWAT: { year: 2026, month: 11, day: 17, hour: 8, minute: 0 },
  // When the site stops taking requests and shows "COMPLETED", in Cameroon time.
  // Set to the end of Nov 22 (the flyer's last day). Move it if the attempt runs longer.
  endWAT: { year: 2026, month: 11, day: 23, hour: 0, minute: 0 },
  slotMinutes: 30,
  // Don't allow booking a slot that starts less than this many minutes from now.
  leadMinutes: 10,
  // WhatsApp number that receives bookings (country code, no +).
  whatsapp: "237678625055",
  timeZone: "Africa/Douala",
};
/* ============================================================ */

const HOUR = 3600e3;
const MIN = 60e3;
const s = CONFIG.startWAT;
const START = Date.UTC(s.year, s.month - 1, s.day, s.hour - 1, s.minute); // WAT -> UTC
const e = CONFIG.endWAT;
const END = Date.UTC(e.year, e.month - 1, e.day, e.hour - 1, e.minute); // WAT -> UTC

// Optional ?now=2026-11-20T14:00:00+01:00 to preview the site at another moment.
const nowOverride = (() => {
  const v = new URLSearchParams(location.search).get("now");
  const t = v ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? null : t - Date.now();
})();
const now = () => Date.now() + (nowOverride || 0);

const $ = (id) => document.getElementById(id);

const fmtTime = new Intl.DateTimeFormat("en-GB", { timeZone: CONFIG.timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDayLong = new Intl.DateTimeFormat("en-GB", { timeZone: CONFIG.timeZone, weekday: "long", day: "numeric", month: "long" });
const fmtWeekday = new Intl.DateTimeFormat("en-GB", { timeZone: CONFIG.timeZone, weekday: "short" });
const fmtDayNum = new Intl.DateTimeFormat("en-GB", { timeZone: CONFIG.timeZone, day: "numeric" });

// Hour of day in WAT for a UTC timestamp.
const watHour = (t) => new Date(t + HOUR).getUTCHours();
// Key for the WAT calendar day of a timestamp.
const watDayKey = (t) => new Date(t + HOUR).toISOString().slice(0, 10);

/* ---------- Live status badge ---------- */
function updateStatus() {
  const t = now();
  const live = t >= START && t < END;
  $("liveLabel").textContent = t < START ? "STARTING SOON" : t >= END ? "COMPLETED" : "LIVE NOW";
  $("livePill").classList.toggle("off", !live);
}

/* ---------- Slots ---------- */
const PERIODS = [
  { id: "night", label: "Night", from: 0, to: 6 },
  { id: "morning", label: "Morning", from: 6, to: 12 },
  { id: "afternoon", label: "Afternoon", from: 12, to: 18 },
  { id: "evening", label: "Evening", from: 18, to: 24 },
];

const allSlots = [];
for (let t = START; t < END; t += CONFIG.slotMinutes * MIN) allSlots.push(t);

const days = [];
for (const t of allSlots) {
  const key = watDayKey(t);
  let d = days.find((x) => x.key === key);
  if (!d) days.push((d = { key, first: t, slots: [] }));
  d.slots.push(t);
}

const isOpen = (t) => t >= now() + CONFIG.leadMinutes * MIN;

const state = { day: null, period: null, slot: null };

function chip(attrs, html) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.setAttribute("role", "radio");
  b.setAttribute("aria-checked", "false");
  Object.assign(b, attrs);
  b.innerHTML = html;
  return b;
}

function renderDays() {
  const wrap = $("days");
  wrap.innerHTML = "";
  const todayKey = watDayKey(now());
  for (const d of days) {
    const open = d.slots.filter(isOpen).length;
    const tag = d.key === todayKey ? "Today" : open ? `${open} slots` : "Closed";
    const b = chip(
      { disabled: open === 0 },
      `<small>${fmtWeekday.format(d.first)}</small><b>${fmtDayNum.format(d.first)}</b><span class="tag">${tag}</span>`
    );
    b.setAttribute("aria-label", `${fmtDayLong.format(d.first)}, ${open} open slots`);
    b.setAttribute("aria-checked", String(state.day === d.key));
    b.addEventListener("click", () => selectDay(d.key));
    wrap.appendChild(b);
  }
}

function selectDay(key) {
  state.day = key;
  state.slot = null;
  const d = days.find((x) => x.key === key);
  const firstOpen = d.slots.find(isOpen);
  state.period = firstOpen != null ? periodOf(firstOpen).id : PERIODS[0].id;
  renderDays();
  renderSlots();
  updateSummary();
}

const periodOf = (t) => PERIODS.find((p) => watHour(t) >= p.from && watHour(t) < p.to);

function renderSlots() {
  const tabs = $("periodTabs");
  const wrap = $("slots");
  tabs.innerHTML = "";
  wrap.innerHTML = "";

  const d = days.find((x) => x.key === state.day);
  if (!d) {
    $("slotHint").textContent = "Choose a day first.";
    return;
  }

  for (const p of PERIODS) {
    const inP = d.slots.filter((t) => periodOf(t).id === p.id);
    const open = inP.filter(isOpen).length;
    if (!inP.length) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(state.period === p.id));
    b.textContent = `${p.label} (${open})`;
    b.disabled = open === 0;
    b.addEventListener("click", () => {
      state.period = p.id;
      renderSlots();
    });
    tabs.appendChild(b);
  }

  const list = d.slots.filter((t) => periodOf(t).id === state.period);
  for (const t of list) {
    const b = chip({ disabled: !isOpen(t) }, fmtTime.format(t));
    b.setAttribute("aria-checked", String(state.slot === t));
    b.addEventListener("click", () => {
      state.slot = t;
      renderSlots();
      updateSummary();
    });
    wrap.appendChild(b);
  }

  $("slotHint").textContent =
    "All times are Cameroon time (WAT). Each slot is " + CONFIG.slotMinutes + " minutes. Greyed-out times have passed.";
}

/* ---------- Summary & submit ---------- */
const slotLabel = (t) => `${fmtTime.format(t)} – ${fmtTime.format(t + CONFIG.slotMinutes * MIN)}`;

function updateSummary() {
  const btn = $("submitBtn");
  if (state.slot == null) {
    $("summaryText").textContent = state.day ? "Now pick a time." : "Pick a day and a time.";
    btn.disabled = true;
    return;
  }
  $("summaryText").textContent = `${fmtDayLong.format(state.slot)} · ${slotLabel(state.slot)}`;
  btn.disabled = false;
}

const cleanPhone = (v) => v.replace(/[^\d+]/g, "");
const validPhone = (v) => cleanPhone(v).replace(/\D/g, "").length >= 9;

// A plain enquiry: it asks whether a time is free and doesn't claim a booking.
function buildMessage(r) {
  return [
    `Hello Clocutz! I'd like to get a haircut during the 120-hour record attempt at Molyko Stadium.`,
    ``,
    `Is this time available?`,
    `${fmtDayLong.format(r.slot)}, ${slotLabel(r.slot)} (WAT)`,
    ``,
    `Name: ${r.name}`,
    `Phone: ${r.phone}`,
    r.note ? `Note: ${r.note}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

const waLink = (r) => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(buildMessage(r))}`;

// Clear any booking ticket saved by the earlier version of this page.
try { localStorage.removeItem("clocutz-booking"); } catch {}

$("bookingForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("name").value.trim();
  const phone = $("phone").value.trim();
  const note = $("note").value.trim();
  const err = $("formError");

  $("name").setAttribute("aria-invalid", String(!name));
  $("phone").setAttribute("aria-invalid", String(!validPhone(phone)));

  if (state.slot == null) return (err.textContent = "Please pick a time slot.");
  if (!isOpen(state.slot)) {
    err.textContent = "That slot has just passed. Please pick another time.";
    renderDays();
    renderSlots();
    return;
  }
  if (!name) return (err.textContent = "Please enter your name."), $("name").focus();
  if (!validPhone(phone)) return (err.textContent = "Please enter a valid phone number."), $("phone").focus();
  err.textContent = "";

  window.open(waLink({ name, phone, note, slot: state.slot }), "_blank", "noopener");
});

/* ---------- Init ---------- */
updateStatus();
setInterval(updateStatus, 60e3);

const firstOpenDay = days.find((d) => d.slots.some(isOpen));
if (firstOpenDay) selectDay(firstOpenDay.key);
else {
  renderDays();
  renderSlots();
  $("slotHint").textContent = "The marathon has ended. Thank you for supporting Clocutz!";
}

// Refresh availability every minute so passed slots grey out.
setInterval(() => {
  if (state.slot != null && !isOpen(state.slot)) state.slot = null;
  renderDays();
  renderSlots();
  updateSummary();
}, 60e3);
