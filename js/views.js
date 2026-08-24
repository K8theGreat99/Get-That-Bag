/**
 * Screen rendering. Every function here returns an HTML string and touches
 * nothing else — all mutation happens in app.js and sheets.js.
 */

import { S, status, daysSinceBackup } from "./store.js";
import {
  MON, MONFULL, DAYS, parse, todayStr, thisMonth, monthKey, weeksOfMonth,
  colorFor, money, money2, carryInto, monthPosition, nextDue, everyLabel,
} from "./model.js";
import { barsSVG, ringSVG } from "./charts.js";
import { esc } from "./util.js";
import { VERSION_NAME, BUILD } from "./version.js";

/* ------------------------------------------------------------------ */
/* flow — the home screen                                              */
/* ------------------------------------------------------------------ */

export function renderFlow(ctx) {
  const { obs, cursor } = ctx;
  if (!obs.length && !S.earnings.length) return firstRun();

  const { inMonth, due, filled, earned, carry, position } = monthPosition(cursor, obs);
  const weeks = weeksOfMonth(cursor);

  return `
    <section class="panel stats">
      <div class="stat"><span class="k">Earned</span><span class="v good">${money(earned)}</span></div>
      <div class="stat"><span class="k">Due</span><span class="v">${money(due)}</span></div>
      <div class="stat"><span class="k">${position >= 0 ? "Spare" : "Short"}</span>
        <span class="v ${position >= 0 ? "good" : "bad"}">${money(position)}</span></div>
    </section>

    <div class="split">
      <div class="col-wide"><section class="panel">
        <h2>Weeks</h2>
        <p class="sub">Monday to Sunday. Tap any segment to edit it or mark it paid.</p>
        <div class="barscroll">${barsSVG(weeks, obs)}</div>
        <p class="hint">Outline = not covered yet · Solid = covered by earnings · Hatched = actually paid</p>
      </section></div>

      <div class="col-narrow"><section class="panel">
        <h2>${MONFULL[+cursor.split("-")[1] - 1]} as a whole</h2>
        <p class="sub">By category, filling clockwise as money lands.</p>
        ${ringSVG(inMonth, due, filled, carry)}
      </section></div>
    </div>`;
}

function firstRun() {
  return `<section class="panel">
    <div class="empty">
      <b>Nothing tracked yet</b>
      <p>Start with a bill you know is coming, then log what you earn. The bars fill in as the money lands.</p>
      <button class="btn primary" data-add="bill">Add a bill</button>
      <button class="btn ghost" data-add="in">Log earnings</button>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* ledger                                                              */
/* ------------------------------------------------------------------ */

export function renderLedger(ctx) {
  const { obs, filter } = ctx;
  const rows = [];

  if (filter === "all" || filter === "in") {
    for (const e of S.earnings) {
      rows.push({
        date: e.date, t: "in", id: e.id, name: e.source || "Earnings",
        sub: e.note || "", amount: e.amount,
      });
    }
  }
  for (const o of obs) {
    if (o.kind === "spend" && (filter === "all" || filter === "out")) {
      rows.push({ date: o.date, t: "out", id: o.key, name: o.name, sub: o.cat || "", amount: -o.amount });
    }
    if (o.kind === "bill" && (filter === "all" || filter === "bill")) {
      rows.push({
        date: o.date, t: "bill", id: o.key, name: o.name,
        sub: [o.cat, o.paid ? "paid" : o.projected ? "projected" : "due"].filter(Boolean).join(" · "),
        amount: -o.amount,
      });
    }
  }
  const chips = [["all", "Everything"], ["in", "Earned"], ["out", "Spent"], ["bill", "Bills"]]
    .map(([k, l]) => `<button class="chip" data-filter="${k}" aria-pressed="${filter === k}">${l}</button>`)
    .join("");

  if (!rows.length) {
    return `<section class="panel"><div class="chips">${chips}</div>
      <div class="empty"><b>Nothing here</b><p>Entries show up newest first.</p></div></section>`;
  }

  // Bills project three months out, so a plain newest-first list would open on
  // rows that haven't happened yet. What's already happened is the main list;
  // what's still coming is tucked into a fold above it.
  const today = todayStr();
  const past = rows.filter((r) => r.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1));
  const soon = rows.filter((r) => r.date > today).sort((a, b) => (a.date < b.date ? -1 : 1));

  const upcoming = soon.length
    ? `<details class="fold upcoming"><summary>Coming up · ${soon.length}</summary>
        ${group(soon, today)}</details>`
    : "";

  const history = past.length
    ? group(past, today)
    : `<div class="empty"><b>Nothing logged yet</b><p>What you add shows up here.</p></div>`;

  return `<section class="panel"><div class="chips">${chips}${upcoming ? "" : ""}</div>
    ${upcoming}${history}</section>`;
}

/** Rows already ordered; adds a date heading whenever the day changes. */
function group(rows, today) {
  let out = "", last = "";
  for (const r of rows) {
    if (r.date !== last) {
      const d = parse(r.date);
      const label = r.date === today ? "Today"
        : `${DAYS[d.getDay()]} · ${MON[d.getMonth()]} ${d.getDate()}`;
      out += `<h3 class="daygroup">${label}</h3>`;
      last = r.date;
    }
    out += `<button class="entry" data-open="${r.t}:${esc(r.id)}">
      <span class="sw" style="background:${r.t === "in" ? "var(--ahead)" : colorFor("n", r.name)}"></span>
      <span class="who"><b>${esc(r.name)}</b><span>${esc(r.sub)}</span></span>
      <span class="val ${r.t === "in" ? "good" : ""}">${r.amount > 0 ? "+" : "−"}${money2(r.amount)}</span>
    </button>`;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* bills                                                               */
/* ------------------------------------------------------------------ */

export function renderBills() {
  if (!S.bills.length) {
    return `<section class="panel"><div class="empty">
      <b>No bills yet</b>
      <p>Add one with its next due date and how often it repeats — it projects forward on its own.</p>
      <button class="btn primary" data-add="bill">Add a bill</button>
    </div></section>`;
  }
  const rows = S.bills
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((b) => `<button class="billrow" data-editbill="${esc(b.id)}">
      <span class="sw" style="background:${colorFor("n", b.name)}"></span>
      <span class="meta"><b>${esc(b.name)}</b>
        <span>${everyLabel(b.every)} · next ${nextDue(b)} · ${esc(b.cat || "—")}</span></span>
      <span class="amt">${money2(b.amount)}</span>
    </button>`)
    .join("");

  const monthly = S.bills.reduce((a, b) => a + (b.every === 1 ? b.amount : b.every ? b.amount / b.every : 0), 0);

  return `<section class="panel">
    <h2>Recurring</h2>
    <p class="sub">Editing an amount updates this month and everything projected after it. Past months keep
      whatever they were recorded at.</p>
    ${rows}
    <p class="hint">Roughly ${money(monthly)} a month across all of them.</p>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

export function renderSettings(ctx) {
  const n = (c, one, many) => `${c} ${c === 1 ? one : many}`;
  const counts = [n(S.earnings.length, "earning", "earnings"),
                  n(S.spends.length, "purchase", "purchases"),
                  n(S.bills.length, "bill", "bills")].join(" · ");
  const since = daysSinceBackup();
  const backupLine =
    since === null ? "You haven't exported a backup yet."
    : since === 0 ? "Backed up today."
    : `Last backup was ${since} ${since === 1 ? "day" : "days"} ago.`;
  const stale = since === null || since >= 14;

  return `
    <section class="panel ${stale ? "warn" : ""}">
      <h2>Backup</h2>
      <p class="sub">${esc(backupLine)} Your data lives only in this browser, so a file is the only copy
        that survives clearing your history or switching phones.</p>
      <button class="btn primary" id="dl">Download backup</button>
      <button class="btn ghost" id="copyJson">Copy backup to clipboard</button>
      <details class="fold"><summary>Restore from a backup</summary>
        <p class="sub">This replaces everything currently in the app.</p>
        <input type="file" id="restoreFile" accept="application/json,.json">
        <p class="sub or">or paste the file's contents:</p>
        <textarea id="restoreText" rows="4" placeholder='{"earnings":[...]}'></textarea>
        <button class="btn ghost" id="restoreBtn">Restore</button>
      </details>
    </section>

    <section class="panel">
      <h2>Appearance</h2>
      <div class="seg-row" role="group" aria-label="Theme">
        ${["system", "dark", "light"].map((t) =>
          `<button class="seg" data-theme="${t}" aria-pressed="${ctx.theme === t}">${t}</button>`).join("")}
      </div>
    </section>

    <section class="panel">
      <h2>Storage</h2>
      <p class="sub ${status.ok ? "good" : "bad"}">${esc(status.why)}</p>
      <p class="sub">Holding ${counts}.${
        status.persisted ? " This browser has marked the data as persistent, so it won't be evicted automatically." : ""
      }</p>
      ${ctx.canInstall ? `<button class="btn ghost" id="installBtn">Install to home screen</button>` : ""}
      <details class="fold"><summary>Start over</summary>
        <p class="sub">Deletes everything in this browser. Download a backup first if you might want it back.</p>
        <button class="btn danger" id="wipe">Erase all data</button>
      </details>
    </section>

    <section class="panel">
      <h2>About</h2>
      <p class="version">${esc(VERSION_NAME)}<span>build ${esc(BUILD)}</span></p>
      <p class="sub">Check the version against the one you're expecting. If the build doesn't match what was
        just deployed, you're seeing a cached copy — close the app fully and reopen it, or take the Reload
        banner when it appears.</p>
      <p class="sub" style="margin-bottom:0">Get That Bag runs entirely in your browser. Nothing is uploaded,
        there is no account, and no server ever sees these numbers. Add it to your home screen and it works
        offline.</p>
    </section>`;
}

/* ------------------------------------------------------------------ */
/* header                                                              */
/* ------------------------------------------------------------------ */

export function renderHeader(ctx) {
  const { obs, cursor, view } = ctx;
  const { due, position } = monthPosition(cursor, obs);

  const st = document.getElementById("status");
  st.className = "status " + (due === 0 ? "" : position >= 0 ? "good" : "bad");
  st.innerHTML = due === 0
    ? `<small>nothing due</small>`
    : `${money(position)}<small>${position >= 0 ? "spare" : "still short"}</small>`;

  const [yy, mm] = cursor.split("-");
  document.getElementById("monthLabel").innerHTML =
    `${MONFULL[+mm - 1]}<span class="yr">${yy.slice(2)}</span>`;
  document.getElementById("todayBtn").hidden = cursor === thisMonth();

  for (const b of document.querySelectorAll("nav.tabs button")) {
    b.setAttribute("aria-selected", String(b.dataset.view === view));
  }
  // The month stepper is meaningless on screens that aren't month-scoped.
  document.getElementById("stepper").hidden = view === "settings" || view === "bills";
}
