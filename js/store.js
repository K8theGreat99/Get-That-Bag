/**
 * Persistence.
 *
 * Everything lives in this browser's localStorage under one key. Nothing is
 * ever uploaded, so the public URL exposes the app but never the data.
 *
 * The rest of the app only touches `S` and calls `save()`. If a sync backend
 * is ever added, it slots in behind load/save without the views knowing.
 */

const KEY = "gtb:data:v2";
const LEGACY_KEYS = ["flow:data", "flowdata", "flow-tracker-v1"];
const SCHEMA = 2;

export const DEFAULT_CATS = ["Groceries", "Gas", "Bills", "Car", "Home", "Personal"];

function blank() {
  return {
    v: SCHEMA,
    earnings: [],
    spends: [],
    bills: [],
    inst: {},
    colors: {},
    cats: [...DEFAULT_CATS],
    meta: { lastBackup: null, created: new Date().toISOString() },
  };
}

export let S = blank();

/** Why saving is or isn't working, surfaced in Settings. */
export const status = {
  ok: false,
  why: "not checked yet",
  persisted: false,
  lastSave: null,
};

/* ------------------------------------------------------------------ */
/* shape guards — an import or a half-written record shouldn't be able */
/* to wedge the app on the next boot                                   */
/* ------------------------------------------------------------------ */

const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
const str = (v) => (typeof v === "string" ? v : "");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v, fallback) => (DATE_RE.test(v) ? v : fallback);

export function normalize(raw) {
  const today = new Date().toISOString().slice(0, 10);
  const d = raw && typeof raw === "object" ? raw : {};
  const arr = (x) => (Array.isArray(x) ? x : []);

  const out = blank();
  out.created = undefined;

  out.earnings = arr(d.earnings)
    .filter((e) => e && num(e.amount) > 0)
    .map((e, i) => ({
      id: str(e.id) || "e" + (Date.now() + i),
      amount: num(e.amount),
      source: str(e.source) || "Earnings",
      note: str(e.note),
      date: date(e.date, today),
      seq: num(e.seq),
    }));

  out.spends = arr(d.spends)
    .filter((s) => s && num(s.amount) > 0)
    .map((s, i) => ({
      id: str(s.id) || "s" + (Date.now() + i),
      amount: num(s.amount),
      name: str(s.name) || "Purchase",
      cat: str(s.cat),
      date: date(s.date, today),
      seq: num(s.seq),
    }));

  out.bills = arr(d.bills)
    .filter((b) => b && num(b.amount) > 0)
    .map((b, i) => ({
      id: str(b.id) || "b" + (Date.now() + i),
      name: str(b.name) || "Bill",
      amount: num(b.amount),
      anchor: date(b.anchor, today),
      every: [0, 1, 2, 3, 6, 12].includes(b.every) ? b.every : 1,
      cat: str(b.cat),
      seq: num(b.seq),
    }));

  if (d.inst && typeof d.inst === "object") {
    for (const [k, v] of Object.entries(d.inst)) {
      if (!v || typeof v !== "object") continue;
      out.inst[k] = {
        amount: num(v.amount),
        paid: !!v.paid,
        skipped: !!v.skipped,
      };
    }
  }

  if (d.colors && typeof d.colors === "object") {
    for (const [k, v] of Object.entries(d.colors)) {
      if (/^#[0-9a-f]{6}$/i.test(v)) out.colors[k] = v;
    }
  }

  const cats = arr(d.cats).map(str).filter(Boolean);
  out.cats = cats.length ? [...new Set(cats)] : [...DEFAULT_CATS];

  out.meta = {
    lastBackup: str(d.meta && d.meta.lastBackup) || null,
    created: str(d.meta && d.meta.created) || new Date().toISOString(),
  };
  out.v = SCHEMA;
  return out;
}

/* ------------------------------------------------------------------ */
/* load / save                                                         */
/* ------------------------------------------------------------------ */

function readRaw() {
  const mine = localStorage.getItem(KEY);
  if (mine) return mine;
  // First run after the move off artifacts: adopt anything the old build left.
  for (const k of LEGACY_KEYS) {
    const legacy = localStorage.getItem(k);
    if (legacy) return legacy;
  }
  return null;
}

export function load() {
  try {
    localStorage.setItem("gtb:probe", "1");
    localStorage.removeItem("gtb:probe");
    status.ok = true;
    status.why = "Saved on this device.";
  } catch (e) {
    status.ok = false;
    status.why =
      "This browser is blocking storage — private windows and " +
      "'block cookies' settings both do it. Entries will vanish when you close the tab.";
    return;
  }
  try {
    const raw = readRaw();
    if (raw) S = normalize(JSON.parse(raw));
  } catch (e) {
    // Corrupt payload: keep it around rather than silently clobbering it.
    try {
      localStorage.setItem(KEY + ":corrupt:" + Date.now(), readRaw() || "");
    } catch (_) {}
    status.why = "Couldn't read the last save, so this started fresh. The unreadable copy was kept.";
  }
}

let timer = null;
let dirty = false;

export function saveNow() {
  if (!status.ok) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
    status.lastSave = new Date();
    dirty = false;
    return true;
  } catch (e) {
    status.ok = false;
    status.why =
      e && e.name === "QuotaExceededError"
        ? "Out of storage space in this browser. Export a backup before adding more."
        : "Saving stopped working: " + String((e && e.message) || e);
    return false;
  }
}

/** Debounced — typing in a sheet shouldn't hit localStorage on every keystroke. */
export function save() {
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(saveNow, 200);
}

/**
 * Write immediately, but only if this tab actually has something pending.
 * Writing unconditionally would let a second tab closing overwrite whatever
 * the first tab had just saved.
 */
export function flush() {
  clearTimeout(timer);
  if (dirty) saveNow();
}

/**
 * Another tab saved. Adopt it only when this tab has nothing of its own
 * in flight, so a background tab can never overwrite what you're typing.
 */
export function watchOtherTabs(onAdopt) {
  addEventListener("storage", (e) => {
    if (e.key !== KEY || !e.newValue || dirty) return;
    try {
      S = normalize(JSON.parse(e.newValue));
      onAdopt();
    } catch (err) { /* leave this tab's copy alone */ }
  });
}

/* ------------------------------------------------------------------ */
/* durability                                                          */
/* ------------------------------------------------------------------ */

/**
 * Ask the browser not to evict this origin under storage pressure.
 * Chrome and Firefox grant it for installed apps; Safari ignores it, which
 * is exactly why the backup reminder in Settings exists.
 */
export async function requestPersistence() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    status.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    return status.persisted;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* backup                                                              */
/* ------------------------------------------------------------------ */

export function exportJSON() {
  return JSON.stringify(S, null, 2);
}

export function markBackedUp() {
  S.meta.lastBackup = new Date().toISOString();
  save();
}

/** Days since the last export, or null if there has never been one. */
export function daysSinceBackup() {
  if (!S.meta.lastBackup) return null;
  const then = new Date(S.meta.lastBackup);
  if (isNaN(then)) return null;
  return Math.floor((Date.now() - then.getTime()) / 86400000);
}

export function importJSON(text) {
  const d = JSON.parse(text);
  if (!d || typeof d !== "object") throw new Error("not an object");
  if (!Array.isArray(d.earnings) && !Array.isArray(d.bills)) {
    throw new Error("no earnings or bills in there");
  }
  S = normalize(d);
  saveNow();
  return S;
}

/** Replace the whole state — used by undo. */
export function replace(next) {
  S = next;
  saveNow();
}

export function snapshot() {
  return JSON.parse(JSON.stringify(S));
}
