/**
 * Bottom sheets: the add form and every edit/confirm dialog.
 *
 * Anything that mutates S calls ctx.beginChange() first, which snapshots the
 * state so the toast can offer an undo.
 */

import { S, save } from "./store.js";
import {
  MON, parse, todayStr, thisMonth, PALETTE, colorFor, setColor, ensureColor,
  money2, allObligations, lockPast,
} from "./model.js";
import { esc } from "./util.js";

let ctx = null;
export function init(c) { ctx = c; }

/* ------------------------------------------------------------------ */
/* sheet primitive                                                     */
/* ------------------------------------------------------------------ */

const scrim = () => document.getElementById("scrim");
const sheet = () => document.getElementById("sheet");
let lastFocus = null;

export function open(html, label) {
  if (!sheet().classList.contains("open")) lastFocus = document.activeElement;
  sheet().setAttribute("aria-label", label || "Dialog");
  sheet().innerHTML = `<div class="grab"></div>${html}`;
  scrim().classList.add("open");
  sheet().classList.add("open");
  document.body.classList.add("locked");
  requestAnimationFrame(() => {
    const first = sheet().querySelector("input, select, textarea, button");
    if (first && !matchMedia("(pointer: coarse)").matches) first.focus();
  });
}

export function close() {
  dismissError();
  sheet().classList.remove("open");
  scrim().classList.remove("open");
  document.body.classList.remove("locked");
  if (lastFocus && lastFocus.isConnected) lastFocus.focus();
  lastFocus = null;
}

export const isOpen = () => sheet().classList.contains("open");

/* ------------------------------------------------------------------ */
/* error dialog                                                        */
/* ------------------------------------------------------------------ */

const alertScrim = () => document.getElementById("alertScrim");
let alertReturn = null;

export const errorIsOpen = () => !alertScrim().hidden;

/**
 * A blocking error stacked on top of whatever sheet is open.
 *
 * Deliberately not built on open(): that replaces the sheet's contents, which
 * would throw away everything already typed into the form being rejected.
 * `focusId` is the field at fault, focused again once the dialog is dismissed.
 */
export function showError(title, body, focusId) {
  document.getElementById("alertTitle").textContent = title;
  document.getElementById("alertBody").textContent = body;
  alertReturn = focusId || null;
  alertScrim().hidden = false;
  const ok = document.getElementById("alertOk");
  ok.onclick = dismissError;
  ok.focus();
}

export function dismissError() {
  if (!errorIsOpen()) return;
  alertScrim().hidden = true;
  const back = alertReturn && document.getElementById(alertReturn);
  alertReturn = null;
  if (back) back.focus();
}

/** Keep Tab inside the sheet while it's up. */
export function trapFocus(e) {
  if (e.key !== "Tab") return;
  if (errorIsOpen()) {
    e.preventDefault();
    return document.getElementById("alertOk").focus();
  }
  if (!isOpen()) return;
  const f = [...sheet().querySelectorAll("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")]
    .filter((el) => !el.disabled && el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

const val = (id) => (document.getElementById(id)?.value ?? "").trim();
const numVal = (id) => parseFloat(val(id));

/**
 * Earnings are a record of money that has already landed, so a date ahead of
 * today is always a mistake — usually a bill typed into the Earned tab. Left
 * in, it inflates the earned total while the ledger files it away under
 * "Coming up", which makes the two disagree for no visible reason.
 *
 * Returns true when the entry was rejected, so callers can bail.
 */
function rejectFutureEarning(date, fieldId) {
  if (!date || date <= todayStr()) return false;
  showError(
    "That day hasn't happened yet",
    "Earnings are money you've already been paid, so they can't be dated ahead of today. " +
    "If this is money you owe, add it on the Bill tab instead.",
    fieldId,
  );
  return true;
}

/** Category <select> with a "+ New" escape hatch that reveals a text field. */
function catSelect(id, selected) {
  const opts = S.cats
    .map((c) => `<option ${c === selected ? "selected" : ""}>${esc(c)}</option>`)
    .join("");
  return `<select id="${id}">${opts}<option value="__new">+ New category</option></select>
    <input id="${id}new" placeholder="Name the new category" hidden class="newcat">`;
}

function wireCatSelect(id) {
  const sel = document.getElementById(id);
  const box = document.getElementById(id + "new");
  if (!sel || !box) return;
  sel.onchange = () => {
    box.hidden = sel.value !== "__new";
    if (!box.hidden) box.focus();
  };
}

/** Resolve a category select to a name, registering a new one if needed. */
function readCat(id) {
  const sel = document.getElementById(id);
  if (!sel) return "";
  if (sel.value !== "__new") return sel.value;
  const v = val(id + "new");
  if (!v) return null;
  if (!S.cats.includes(v)) S.cats.push(v);
  return v;
}

/* ------------------------------------------------------------------ */
/* add                                                                 */
/* ------------------------------------------------------------------ */

let addTab = "in";

export function openAdd(tab) {
  if (tab) addTab = tab;
  const t = todayStr();

  const forms = {
    in: `
      <label for="a1">How much</label>
      <input id="a1" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" autocomplete="off">
      <label for="a2">Where it came from</label>
      <input id="a2" placeholder="DoorDash, tips, side job…" autocomplete="off" list="sources">
      <datalist id="sources">${[...new Set(S.earnings.map((e) => e.source))]
        .filter(Boolean).slice(0, 12).map((s) => `<option value="${esc(s)}">`).join("")}</datalist>
      <label for="a3">Note <span class="opt">optional</span></label>
      <input id="a3" placeholder="lunch block, 4 orders" autocomplete="off">
      <label for="a4">Day earned</label>
      <input id="a4" type="date" value="${t}" max="${t}">`,
    out: `
      <label for="b1">How much</label>
      <input id="b1" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" autocomplete="off">
      <label for="b2">Where you spent it</label>
      <input id="b2" placeholder="Kroger, gas, pharmacy…" autocomplete="off">
      <div class="two">
        <div><label for="b3">Category</label>${catSelect("b3")}</div>
        <div><label for="b4">Day spent</label><input id="b4" type="date" value="${t}"></div>
      </div>`,
    bill: `
      <label for="c1">What is it</label>
      <input id="c1" placeholder="Rent, card payment, insurance…" autocomplete="off">
      <label for="c2">Amount due</label>
      <input id="c2" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" autocomplete="off">
      <div class="two">
        <div><label for="c3">Next due date</label><input id="c3" type="date" value="${t}"></div>
        <div><label for="c4">Repeats</label><select id="c4">
          <option value="1" selected>Monthly</option>
          <option value="2">Every 2 months</option>
          <option value="3">Every 3 months</option>
          <option value="6">Every 6 months</option>
          <option value="12">Yearly</option>
          <option value="0">Doesn't repeat</option>
        </select></div>
      </div>
      <label for="c5">Category</label>${catSelect("c5")}`,
  };

  open(`
    <div class="segs" role="tablist">
      ${[["in", "Earned"], ["out", "Spent"], ["bill", "Bill"]].map(([k, l]) =>
        `<button role="tab" data-tab="${k}" aria-selected="${addTab === k}">${l}</button>`).join("")}
    </div>
    ${forms[addTab]}
    <button class="btn primary save" id="doSave">Add it</button>`, "Add an entry");

  for (const b of sheet().querySelectorAll("[data-tab]")) {
    b.onclick = () => { addTab = b.dataset.tab; openAdd(); };
  }
  wireCatSelect("b3");
  wireCatSelect("c5");

  document.getElementById("doSave").onclick = () => {
    const seq = Date.now();

    if (addTab === "in") {
      const amt = numVal("a1");
      if (!(amt > 0)) return ctx.toast("Enter an amount above zero.");
      const date = val("a4") || todayStr();
      if (rejectFutureEarning(date, "a4")) return;
      ctx.beginChange();
      const source = val("a2") || "Earnings";
      S.earnings.push({ id: "e" + seq, amount: amt, source, note: val("a3"), date, seq });
      ensureColor("n", source);
      ctx.commit("Added.");
    } else if (addTab === "out") {
      const amt = numVal("b1");
      if (!(amt > 0)) return ctx.toast("Enter an amount above zero.");
      if (!val("b2")) return ctx.toast("Name where the money went.");
      const cat = readCat("b3");
      if (cat === null) return ctx.toast("Name the new category first.");
      ctx.beginChange();
      S.spends.push({ id: "s" + seq, amount: amt, name: val("b2"), cat, date: val("b4") || todayStr(), seq });
      ensureColor("n", val("b2"));
      ensureColor("c", cat);
      ctx.commit("Added.");
    } else {
      const amt = numVal("c2");
      if (!val("c1")) return ctx.toast("Give the bill a name.");
      if (!(amt > 0)) return ctx.toast("Enter an amount above zero.");
      const cat = readCat("c5");
      if (cat === null) return ctx.toast("Name the new category first.");
      ctx.beginChange();
      S.bills.push({
        id: "b" + seq, name: val("c1"), amount: amt, anchor: val("c3") || todayStr(),
        every: parseInt(val("c4"), 10), cat, seq,
      });
      ensureColor("n", val("c1"));
      ensureColor("c", cat);
      lockPast();
      ctx.commit("Bill added — it'll project forward on its own.");
    }
    close();
  };
}

/* ------------------------------------------------------------------ */
/* one obligation (a bill occurrence or a purchase)                    */
/* ------------------------------------------------------------------ */

export function openSegment(key) {
  const o = allObligations().find((x) => x.key === key);
  if (!o) return;

  const d = parse(o.date);
  const col = colorFor("n", o.name);
  const pct = Math.round((o.filled / o.amount) * 100);
  const swatches = PALETTE.map((c) =>
    `<button class="sw-btn" data-hex="${c}" style="background:${c}"
       aria-pressed="${c === col}" aria-label="Use ${c}"></button>`).join("");

  open(`
    <div class="detailhead"><h3>${esc(o.name)}</h3><span class="n">${money2(o.amount)}</span></div>
    <p class="detailmeta">${o.kind === "bill" ? "Due" : "Spent"} ${MON[d.getMonth()]} ${d.getDate()} ·
      ${esc(o.cat || "no category")} · ${pct}% covered${o.projected ? " · projected" : ""}</p>

    <label for="ea">Amount</label>
    <input id="ea" type="number" inputmode="decimal" step="0.01" min="0" value="${o.amount}">
    ${o.kind === "bill"
      ? `<p class="hint">Changing this updates this date and future projections. Earlier months keep theirs.</p>`
      : ""}

    <label>Color</label><div class="swatches">${swatches}</div>

    ${o.kind === "bill" ? `
      <div class="toggle">
        <span><b>Actually paid</b><span>Adds the hatch mark to this segment</span></span>
        <button class="switch" id="paidSw" aria-pressed="${o.paid}" aria-label="Mark paid"><i></i></button>
      </div>` : ""}

    <button class="btn primary save" id="segSave">Save</button>
    <button class="btn ghost" id="segDel">${o.kind === "bill" ? "Skip this occurrence" : "Delete purchase"}</button>`,
    o.name);

  for (const b of sheet().querySelectorAll(".sw-btn")) {
    b.onclick = () => {
      setColor("n", o.name, b.dataset.hex);
      for (const x of sheet().querySelectorAll(".sw-btn")) {
        x.setAttribute("aria-pressed", String(x === b));
      }
      ctx.rerender();
    };
  }

  const sw = document.getElementById("paidSw");
  if (sw) {
    sw.onclick = () => {
      const now = sw.getAttribute("aria-pressed") !== "true";
      sw.setAttribute("aria-pressed", String(now));
      ctx.beginChange();
      S.inst[o.key] = { amount: o.amount, skipped: false, ...S.inst[o.key], paid: now };
      save();
      ctx.rerender();
    };
  }

  document.getElementById("segSave").onclick = () => {
    const v = numVal("ea");
    if (!(v > 0)) return ctx.toast("Enter an amount above zero.");
    ctx.beginChange();
    if (o.kind === "bill") {
      S.inst[o.key] = { paid: false, skipped: false, ...S.inst[o.key], amount: v };
      // Only let an edit move the series estimate forward, never backward in time.
      const b = S.bills.find((x) => x.id === o.billId);
      if (b && o.date >= thisMonth() + "-01") b.amount = v;
    } else {
      const s = S.spends.find((x) => x.id === o.key);
      if (s) s.amount = v;
    }
    close();
    ctx.commit("Updated.");
  };

  document.getElementById("segDel").onclick = () => {
    ctx.beginChange();
    if (o.kind === "bill") {
      S.inst[o.key] = { amount: o.amount, paid: false, ...S.inst[o.key], skipped: true };
    } else {
      S.spends = S.spends.filter((x) => x.id !== o.key);
    }
    close();
    ctx.commit(o.kind === "bill" ? "Skipped this one." : "Deleted.");
  };
}

/* ------------------------------------------------------------------ */
/* earnings                                                            */
/* ------------------------------------------------------------------ */

export function openEarning(id) {
  const e = S.earnings.find((x) => x.id === id);
  if (!e) return;

  open(`
    <div class="detailhead"><h3>${esc(e.source || "Earnings")}</h3><span class="n good">${money2(e.amount)}</span></div>
    <p class="detailmeta">Money in. It covers obligations dated on or after the day it landed.</p>

    <label for="ee1">Amount</label>
    <input id="ee1" type="number" inputmode="decimal" step="0.01" min="0" value="${e.amount}">
    <label for="ee2">Source</label><input id="ee2" value="${esc(e.source || "")}">
    <label for="ee3">Note <span class="opt">optional</span></label><input id="ee3" value="${esc(e.note || "")}">
    <label for="ee4">Day earned</label><input id="ee4" type="date" value="${e.date}" max="${todayStr()}">

    <button class="btn primary save" id="eSave">Save</button>
    <button class="btn ghost" id="eDel">Delete this entry</button>`, "Edit earnings");

  document.getElementById("eSave").onclick = () => {
    const v = numVal("ee1");
    if (!(v > 0)) return ctx.toast("Enter an amount above zero.");
    const date = val("ee4") || e.date;
    if (rejectFutureEarning(date, "ee4")) return;
    ctx.beginChange();
    e.amount = v;
    e.source = val("ee2") || "Earnings";
    e.note = val("ee3");
    e.date = date;
    ensureColor("n", e.source);
    close();
    ctx.commit("Updated.");
  };

  document.getElementById("eDel").onclick = () => {
    ctx.beginChange();
    S.earnings = S.earnings.filter((x) => x.id !== id);
    close();
    ctx.commit("Deleted.");
  };
}

/* ------------------------------------------------------------------ */
/* bill series                                                         */
/* ------------------------------------------------------------------ */

export function openBill(id) {
  const b = S.bills.find((x) => x.id === id);
  if (!b) return;

  const repeats = [[1, "Monthly"], [2, "Every 2 months"], [3, "Every 3 months"],
                   [6, "Every 6 months"], [12, "Yearly"], [0, "Doesn't repeat"]];

  open(`
    <div class="detailhead"><h3>${esc(b.name)}</h3></div>
    <p class="detailmeta">Changes apply to this month forward. Past months keep their recorded amounts.</p>

    <label for="bn">Name</label><input id="bn" value="${esc(b.name)}">
    <label for="bam">Estimated amount</label>
    <input id="bam" type="number" inputmode="decimal" step="0.01" min="0" value="${b.amount}">
    <div class="two">
      <div><label for="ban">Next due</label><input id="ban" type="date" value="${b.anchor}"></div>
      <div><label for="bev">Repeats</label><select id="bev">${repeats
        .map(([v, l]) => `<option value="${v}" ${b.every === v ? "selected" : ""}>${l}</option>`)
        .join("")}</select></div>
    </div>
    <label for="bc">Category</label>${catSelect("bc", b.cat)}

    <button class="btn primary save" id="bSave">Save</button>
    <button class="btn ghost" id="bDel">Delete this bill and all its dates</button>`, b.name);

  wireCatSelect("bc");

  document.getElementById("bSave").onclick = () => {
    const v = numVal("bam");
    if (!(v > 0)) return ctx.toast("Enter an amount above zero.");
    const cat = readCat("bc");
    if (cat === null) return ctx.toast("Name the new category first.");
    ctx.beginChange();
    b.name = val("bn") || b.name;
    b.amount = v;
    b.anchor = val("ban") || b.anchor;
    b.every = parseInt(val("bev"), 10);
    b.cat = cat;
    ensureColor("n", b.name);
    ensureColor("c", cat);
    lockPast();
    close();
    ctx.commit("Saved.");
  };

  document.getElementById("bDel").onclick = () => {
    const recorded = Object.keys(S.inst).filter((k) => k.startsWith(b.id + "|")).length;
    open(`
      <div class="detailhead"><h3>Delete ${esc(b.name)}?</h3></div>
      <p class="detailmeta">This removes every date for it — ${recorded} already recorded, plus all
        projections ahead.</p>
      <button class="btn ghost" id="bNo">Keep it</button>
      <button class="btn danger" id="bYes">Delete it</button>`, "Confirm delete");
    document.getElementById("bNo").onclick = () => openBill(id);
    document.getElementById("bYes").onclick = () => {
      ctx.beginChange();
      S.bills = S.bills.filter((x) => x.id !== b.id);
      for (const k of Object.keys(S.inst)) if (k.startsWith(b.id + "|")) delete S.inst[k];
      close();
      ctx.commit("Deleted.");
    };
  };
}
