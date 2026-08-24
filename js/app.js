/**
 * Boot, routing, and every event handler that mutates state.
 */

import * as store from "./store.js";
import { S } from "./store.js";
import { allObligations, allocate, lockPast, thisMonth, shiftMonth, monthsWithData, HORIZON_MONTHS } from "./model.js";
import { renderFlow, renderLedger, renderBills, renderSettings, renderHeader } from "./views.js";
import * as sheets from "./sheets.js";

const $ = (id) => document.getElementById(id);

const ui = {
  view: "flow",
  cursor: thisMonth(),
  filter: "all",
  theme: localStorage.getItem("gtb:theme") || "system",
  canInstall: false,
};

/* ------------------------------------------------------------------ */
/* theme                                                               */
/* ------------------------------------------------------------------ */

function applyTheme(t) {
  ui.theme = t;
  try { localStorage.setItem("gtb:theme", t); } catch (e) {}
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  const meta = document.querySelector('meta[name="theme-color"]');
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (meta) meta.content = dark ? "#1B1E24" : "#F4F5F7";
}

/* ------------------------------------------------------------------ */
/* toast + undo                                                        */
/* ------------------------------------------------------------------ */

let undoSnapshot = null;
let toastTimer = null;

function toast(msg, withUndo) {
  const t = $("toast");
  t.innerHTML = `<span>${msg}</span>${withUndo ? `<button id="undoBtn">Undo</button>` : ""}`;
  t.classList.add("show");
  if (withUndo) $("undoBtn").onclick = doUndo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), withUndo ? 6000 : 2600);
}

/** Snapshot before a mutation so the toast can offer to put it back. */
function beginChange() {
  undoSnapshot = store.snapshot();
}

/** Persist, redraw, and announce — the tail end of every mutation. */
function commit(msg) {
  store.save();
  render();
  if (msg) toast(msg, !!undoSnapshot);
}

function doUndo() {
  if (!undoSnapshot) return;
  store.replace(undoSnapshot);
  undoSnapshot = null;
  render();
  toast("Put back.");
}

/* ------------------------------------------------------------------ */
/* render                                                              */
/* ------------------------------------------------------------------ */

function render() {
  const obs = allObligations();
  allocate(obs);
  const ctx = { ...ui, obs };

  renderHeader(ctx);

  const main = $("main");
  if (ui.view === "flow") main.innerHTML = renderFlow(ctx);
  else if (ui.view === "ledger") main.innerHTML = renderLedger(ctx);
  else if (ui.view === "bills") main.innerHTML = renderBills(ctx);
  else main.innerHTML = renderSettings(ctx);

  if (ui.view === "flow") centerCurrentWeek();

  const ms = monthsWithData(ui.cursor);
  $("prevM").disabled = ui.cursor <= ms[0];
  $("nextM").disabled = ui.cursor >= shiftMonth(thisMonth(), HORIZON_MONTHS);
  $("fab").hidden = ui.view === "settings";

  if (ui.view === "settings") wireSettings();
}

/**
 * The bar strip is wider than the phone, and the week that matters is today's.
 * Scroll it into the middle rather than leaving the user to swipe for it.
 */
function centerCurrentWeek() {
  const strip = document.querySelector(".barscroll");
  const now = strip && strip.querySelector("[data-now]");
  if (!now) return;
  const svg = strip.querySelector("svg");
  const scale = svg.clientWidth / svg.viewBox.baseVal.width || 1;
  const target = parseFloat(now.dataset.now) * scale - strip.clientWidth / 2;
  strip.scrollLeft = Math.max(0, target);
}

function go(view) {
  ui.view = view;
  render();
  window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------------------ */
/* settings wiring — these controls need real elements, not delegation */
/* ------------------------------------------------------------------ */

function wireSettings() {
  $("dl").onclick = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([store.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `get-that-bag-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    store.markBackedUp();
    render();
    toast("Backup downloaded.");
  };

  $("copyJson").onclick = async () => {
    try {
      await navigator.clipboard.writeText(store.exportJSON());
      store.markBackedUp();
      render();
      toast("Backup copied to the clipboard.");
    } catch (e) {
      toast("Couldn't copy — use Download instead.");
    }
  };

  $("restoreFile").onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      restore(await file.text());
    } catch (err) {
      toast("Couldn't read that file.");
    }
  };

  $("restoreBtn").onclick = () => {
    const raw = $("restoreText").value.trim();
    if (!raw) return toast("Paste a backup first.");
    restore(raw);
  };

  $("wipe").onclick = () => {
    sheets.open(`
      <div class="detailhead"><h3>Erase everything?</h3></div>
      <p class="detailmeta">All ${S.earnings.length + S.spends.length + S.bills.length} entries in this
        browser will be deleted. This can't be undone from here — only from a backup file.</p>
      <button class="btn ghost" id="wNo">Keep my data</button>
      <button class="btn danger" id="wYes">Erase it all</button>`, "Confirm erase");
    $("wNo").onclick = sheets.close;
    $("wYes").onclick = () => {
      beginChange();
      store.replace(store.normalize({}));
      sheets.close();
      render();
      toast("Erased.", true);
    };
  };

  for (const b of document.querySelectorAll("[data-theme]")) {
    b.onclick = () => { applyTheme(b.dataset.theme); render(); };
  }

  const install = $("installBtn");
  if (install) install.onclick = doInstall;
}

function restore(raw) {
  try {
    beginChange();
    store.importJSON(raw);
    lockPast();
    go("flow");
    toast("Restored.", true);
  } catch (e) {
    toast("That doesn't look like a Get That Bag backup.");
  }
}

/* ------------------------------------------------------------------ */
/* events                                                              */
/* ------------------------------------------------------------------ */

$("fab").onclick = () => sheets.openAdd("in");
$("prevM").onclick = () => { ui.cursor = shiftMonth(ui.cursor, -1); render(); };
$("nextM").onclick = () => { ui.cursor = shiftMonth(ui.cursor, 1); render(); };
$("todayBtn").onclick = () => { ui.cursor = thisMonth(); render(); };
$("scrim").onclick = sheets.close;

for (const b of document.querySelectorAll("nav.tabs button")) {
  b.onclick = () => go(b.dataset.view);
}

$("main").addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) return sheets.openAdd(add.dataset.add);

  const seg = e.target.closest(".seg");
  if (seg) return sheets.openSegment(seg.dataset.key);

  const chip = e.target.closest("[data-filter]");
  if (chip) { ui.filter = chip.dataset.filter; return render(); }

  const eb = e.target.closest("[data-editbill]");
  if (eb) return sheets.openBill(eb.dataset.editbill);

  const row = e.target.closest("[data-open]");
  if (row) {
    const raw = row.dataset.open;
    const t = raw.slice(0, raw.indexOf(":"));
    const id = raw.slice(raw.indexOf(":") + 1);
    return t === "in" ? sheets.openEarning(id) : sheets.openSegment(id);
  }
});

// Bar segments are SVG groups, so they need keyboard activation wired by hand.
$("main").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const seg = e.target.closest(".seg");
  if (seg) { e.preventDefault(); sheets.openSegment(seg.dataset.key); }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sheets.isOpen()) return sheets.close();
  sheets.trapFocus(e);
});

// Never lose a pending debounced write to a backgrounded tab.
addEventListener("visibilitychange", () => { if (document.hidden) store.flush(); });
addEventListener("pagehide", () => store.flush());

/* ------------------------------------------------------------------ */
/* install + service worker                                            */
/* ------------------------------------------------------------------ */

let installEvent = null;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
  ui.canInstall = true;
  if (ui.view === "settings") render();
});

async function doInstall() {
  if (!installEvent) return toast("Use your browser's Share menu → Add to Home Screen.");
  installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  ui.canInstall = false;
  render();
}

if ("serviceWorker" in navigator) {
  addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("sw.js");
      // Don't swap code out from under an in-progress entry; offer it instead.
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) showUpdate(sw);
        });
      });
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    } catch (e) { /* offline support is a bonus, not a requirement */ }
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

function showUpdate(sw) {
  const bar = $("update");
  bar.hidden = false;
  bar.querySelector("button").onclick = () => {
    store.flush();
    sw.postMessage({ type: "SKIP_WAITING" });
  };
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

sheets.init({ toast, beginChange, commit, rerender: render });

applyTheme(ui.theme);
store.load();
store.watchOtherTabs(render);
lockPast();
render();
store.requestPersistence().then((granted) => {
  if (granted && ui.view === "settings") render();
});

// A gentle nudge rather than a modal — it's a reminder, not an error.
const since = store.daysSinceBackup();
if (S.earnings.length + S.bills.length > 0 && (since === null || since >= 21)) {
  setTimeout(() => toast("Worth downloading a backup — Settings → Backup."), 1200);
}
