/**
 * Dates, money, bill projection, and the allocation model.
 */

import { S, save } from "./store.js";

/* ------------------------------------------------------------------ */
/* dates — all local, all "YYYY-MM-DD" strings                         */
/* ------------------------------------------------------------------ */

export const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const MONFULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const parse = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const todayStr = () => ymd(new Date());
export const thisMonth = () => todayStr().slice(0, 7);
export const monthKey = (s) => s.slice(0, 7);

export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function mondayOf(s) {
  const d = parse(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}

/** Add months without rolling over — Jan 31 + 1 month lands on Feb 28/29. */
export function addMonthsClamped(s, n) {
  const d = parse(s);
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, last));
  return ymd(t);
}

export function shiftMonth(mk, n) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** A week belongs to whichever month its Monday falls in. */
export function weeksOfMonth(mk) {
  const [y, m] = mk.split("-").map(Number);
  const out = [];
  let d = parse(mondayOf(ymd(new Date(y, m - 1, 1))));
  if (d.getMonth() !== m - 1 || d.getFullYear() !== y) d.setDate(d.getDate() + 7);
  while (d.getMonth() === m - 1 && d.getFullYear() === y) {
    out.push(ymd(d));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* money                                                               */
/* ------------------------------------------------------------------ */

export const money = (n) => "$" + Math.round(Math.abs(n)).toLocaleString();
export const money2 = (n) =>
  "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, "");

/* ------------------------------------------------------------------ */
/* colors                                                              */
/* ------------------------------------------------------------------ */

export const PALETTE = [
  "#4F8DF7","#F2A93B","#8B5CF6","#2DBE9C","#E2685E","#E86FB0","#5AC8E8",
  "#B8CE45","#C2743D","#7C89F5","#4FB477","#D95F8B","#9AA5B1","#E8C24A",
];

const ckey = (kind, name) => kind + ":" + String(name).trim().toLowerCase();

/**
 * Colors are assigned when a thing is created, not when it's drawn — rendering
 * stays free of side effects, so a color can't silently change between reloads.
 */
export function ensureColor(kind, name) {
  const k = ckey(kind, name);
  if (!S.colors[k]) {
    const used = new Set(Object.values(S.colors));
    S.colors[k] = PALETTE.find((c) => !used.has(c)) || hashColor(k);
  }
  return S.colors[k];
}

function hashColor(k) {
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Read-only lookup. Falls back to a stable hash for anything unassigned. */
export function colorFor(kind, name) {
  return S.colors[ckey(kind, name)] || hashColor(ckey(kind, name));
}

export function setColor(kind, name, hex) {
  S.colors[ckey(kind, name)] = hex;
  save();
}

/* ------------------------------------------------------------------ */
/* bill occurrences                                                    */
/* ------------------------------------------------------------------ */

export const HORIZON_MONTHS = 3;

export function horizonEnd() {
  const t = new Date();
  return ymd(new Date(t.getFullYear(), t.getMonth() + HORIZON_MONTHS + 1, 0));
}

export function occurrences(bill, end) {
  if (!bill.every) return bill.anchor <= end ? [bill.anchor] : [];
  const out = [];
  let d = bill.anchor;
  let n = 0;
  while (d <= end && n < 600) {
    out.push(d);
    n++;
    d = addMonthsClamped(bill.anchor, bill.every * n);
  }
  return out;
}

/**
 * Freeze every occurrence that has already come due at the amount it was
 * estimated at, so changing a bill's estimate later never rewrites history.
 */
export function lockPast() {
  const t = todayStr();
  let changed = false;
  for (const b of S.bills) {
    for (const d of occurrences(b, t)) {
      const k = b.id + "|" + d;
      if (!S.inst[k]) {
        S.inst[k] = { amount: b.amount, paid: false, skipped: false };
        changed = true;
      }
    }
  }
  if (changed) save();
}

/* ------------------------------------------------------------------ */
/* obligations + allocation                                            */
/* ------------------------------------------------------------------ */

export function allObligations() {
  const end = horizonEnd();
  const out = [];

  for (const b of S.bills) {
    for (const d of occurrences(b, end)) {
      const k = b.id + "|" + d;
      const ov = S.inst[k];
      if (ov && ov.skipped) continue;
      out.push({
        kind: "bill", key: k, billId: b.id, date: d,
        name: b.name, cat: b.cat,
        amount: ov ? ov.amount : b.amount,
        paid: ov ? !!ov.paid : false,
        projected: !ov,
        seq: b.seq || 0,
      });
    }
  }

  for (const s of S.spends) {
    out.push({
      kind: "spend", key: s.id, date: s.date, name: s.name, cat: s.cat,
      amount: s.amount, paid: true, projected: false, seq: s.seq || 0,
    });
  }

  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));
  return out.filter((o) => o.amount > 0);
}

/**
 * Money is poured into obligations in date order, and only money that has
 * already landed can cover them — an earning on the 20th cannot back-fill a
 * bill that came due on the 5th.
 *
 * The running balance is allowed to go negative; that debt carries forward and
 * is what pulls later weeks down until earnings catch up.
 *
 * Mutates each obligation with `filled` and `balanceAfter`.
 */
export function allocate(obs) {
  const events = [
    ...S.earnings.map((e) => ({ date: e.date, seq: e.seq || 0, kind: "in", amount: e.amount })),
    ...obs.map((o) => ({ date: o.date, seq: o.seq || 0, kind: "out", ob: o })),
  ];
  // Same day: money in lands before money out.
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "in" ? -1 : 1;
    return a.seq - b.seq;
  });

  let balance = 0;
  let owed = 0;
  for (const ev of events) {
    if (ev.kind === "in") {
      balance += ev.amount;
    } else {
      ev.ob.filled = Math.max(0, Math.min(ev.ob.amount, balance));
      balance -= ev.ob.amount;
      ev.ob.balanceAfter = balance;
      owed += ev.ob.amount;
    }
  }

  const pot = S.earnings.reduce((a, e) => a + e.amount, 0);
  return { pot, owed, balance, spill: Math.max(0, balance) };
}

/** Balance carried into a month, before any of that month's activity. */
export function carryInto(mk, obs) {
  const first = mk + "-01";
  const earned = S.earnings.filter((e) => e.date < first).reduce((a, e) => a + e.amount, 0);
  const due = obs.filter((o) => o.date < first).reduce((a, o) => a + o.amount, 0);
  return earned - due;
}

export function monthsWithData(cursor) {
  const set = new Set([thisMonth(), cursor]);
  for (const e of S.earnings) set.add(monthKey(e.date));
  for (const o of allObligations()) set.add(monthKey(o.date));
  return [...set].sort();
}

export function nextDue(b) {
  const t = todayStr();
  const d = occurrences(b, horizonEnd()).find((x) => x >= t) || b.anchor;
  const p = parse(d);
  return `${MON[p.getMonth()]} ${p.getDate()}`;
}

export const everyLabel = (n) =>
  n === 0 ? "one-time" : n === 1 ? "monthly" : n === 12 ? "yearly" : `every ${n} months`;

/**
 * The month's headline numbers.
 *
 * `filled` is how much of the month's obligations earnings actually reached,
 * and so it can never exceed `due` — which makes it useless for showing a
 * surplus. `position` is the honest answer to "how am I doing": what carried
 * in, plus what came in this month, minus everything the month owes. It goes
 * properly positive when you're ahead and negative when you're behind.
 */
export function monthPosition(mk, obs) {
  const inMonth = obs.filter((o) => monthKey(o.date) === mk);
  const due = inMonth.reduce((a, o) => a + o.amount, 0);
  const filled = inMonth.reduce((a, o) => a + o.filled, 0);
  const earned = S.earnings
    .filter((e) => monthKey(e.date) === mk)
    .reduce((a, e) => a + e.amount, 0);
  const carry = carryInto(mk, obs);
  return { inMonth, due, filled, earned, carry, position: carry + earned - due };
}
