/**
 * SVG charts. Colors for text and rules come from CSS classes rather than
 * inline fills so both themes work without redrawing.
 */

import { MON, parse, addDays, todayStr, colorFor, money } from "./model.js";
import { esc } from "./util.js";

/* ------------------------------------------------------------------ */
/* weekly bars                                                         */
/* ------------------------------------------------------------------ */

export function barsSVG(weeks, obs) {
  const BW = 46, GAP = 30;
  const W = Math.max(weeks.length * (BW + GAP) + GAP, 300);
  const H = 292, PAD_B = 58, PAD_T = 34;
  const usable = H - PAD_B - PAD_T;

  const groups = weeks.map((w0) => {
    const w1 = addDays(w0, 6);
    const items = obs.filter((o) => o.date >= w0 && o.date <= w1);
    return {
      w0, w1, items,
      total: items.reduce((a, o) => a + o.amount, 0),
      filled: items.reduce((a, o) => a + o.filled, 0),
    };
  });

  const max = Math.max(1, ...groups.map((g) => g.total));
  const today = todayStr();
  const yBase = H - PAD_B;

  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
      aria-label="Weekly expenses, filling as earnings land">
    <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="none"/><line x1="0" y1="0" x2="0" y2="6" stroke-width="3"/>
    </pattern></defs>`;

  groups.forEach((g, i) => {
    const x = GAP + i * (BW + GAP);
    const isNow = today >= g.w0 && today <= g.w1;
    const h = (g.total / max) * usable;

    if (isNow) {
      s += `<rect class="nowbox" data-now="${x + BW / 2}" x="${x - 6}" y="${PAD_T - 12}"
             width="${BW + 12}" height="${H - PAD_B - PAD_T + 20}" rx="8"/>`;
    }

    if (g.total === 0) {
      s += `<rect class="emptybar" x="${x}" y="${yBase - 16}" width="${BW}" height="16" rx="4"/>`;
    } else {
      let y = yBase;
      for (const o of g.items) {
        const sh = (o.amount / max) * usable;
        const col = colorFor("n", o.name);
        const fh = (o.filled / o.amount) * sh;
        y -= sh;
        s += `<g class="seg" data-key="${esc(o.key)}" role="button" tabindex="0"
                aria-label="${esc(o.name)}, ${money(o.amount)}">
          <rect x="${x}" y="${y}" width="${BW}" height="${Math.max(sh, 1)}" fill="${col}"
                fill-opacity=".14" stroke="${col}" stroke-width="1.5" rx="3"/>`;
        if (fh > 0.4) {
          s += `<rect x="${x}" y="${y + sh - fh}" width="${BW}" height="${fh}" fill="${col}" rx="3"/>`;
          if (o.paid && o.kind === "bill") {
            s += `<rect x="${x}" y="${y + sh - fh}" width="${BW}" height="${fh}" fill="url(#hatch)" rx="3"/>`;
          }
        }
        s += `<rect x="${x}" y="${y}" width="${BW}" height="${Math.max(sh, 1)}" fill="transparent"/></g>`;
      }

      if (g.filled > 0 && g.filled < g.total) {
        const wl = yBase - (g.filled / max) * usable;
        s += `<line class="waterline" x1="${x - 5}" y1="${wl}" x2="${x + BW + 5}" y2="${wl}"/>`;
      }

      const pct = Math.round((g.filled / g.total) * 100);
      s += `<text class="pct ${pct >= 100 ? "good" : ""}" x="${x + BW / 2}" y="${yBase - h - 12}"
             text-anchor="middle">${pct}%</text>`;
    }

    const a = parse(g.w0), z = parse(g.w1);
    const mLabel = a.getMonth() === z.getMonth()
      ? MON[a.getMonth()].toUpperCase()
      : `${MON[a.getMonth()].toUpperCase()}–${MON[z.getMonth()].toUpperCase()}`;

    s += `<text class="wk ${isNow ? "now" : ""}" x="${x + BW / 2}" y="${yBase + 20}"
           text-anchor="middle">${a.getDate()}–${z.getDate()}</text>
          <text class="wkmon" x="${x + BW / 2}" y="${yBase + 34}" text-anchor="middle">${mLabel}</text>
          <text class="wkamt" x="${x + BW / 2}" y="${yBase + 49}" text-anchor="middle">${
            g.total ? money(g.total) : "clear"
          }</text>`;
  });

  return s + `</svg>`;
}

/* ------------------------------------------------------------------ */
/* month ring                                                          */
/* ------------------------------------------------------------------ */

export function ringSVG(inMonth, total, filled, carry) {
  if (total === 0) return `<p class="empty-inline">Nothing due this month yet.</p>`;

  const R = 76, r = 48, cx = 84, cy = 84;
  const byCat = {};
  for (const o of inMonth) {
    const c = o.cat || "Other";
    byCat[c] = (byCat[c] || 0) + o.amount;
  }
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const pct = Math.min(100, Math.round((filled / total) * 100));
  const sweep = Math.min(1, filled / total) * Math.PI * 2;

  const arc = (a0, a1, ro, ri) => {
    const p = (a, rr) => [cx + rr * Math.sin(a), cy - rr * Math.cos(a)];
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const [x1, y1] = p(a0, ro), [x2, y2] = p(a1, ro);
    const [x3, y3] = p(a1, ri), [x4, y4] = p(a0, ri);
    return `M${x1},${y1} A${ro},${ro} 0 ${big} 1 ${x2},${y2} L${x3},${y3} A${ri},${ri} 0 ${big} 0 ${x4},${y4} Z`;
  };

  let a = 0, faint = "", solid = "";
  for (const [c, v] of cats) {
    const a1 = a + (v / total) * Math.PI * 2;
    const col = colorFor("c", c);
    // Trim a hair off each slice so adjacent wedges read as separate.
    const d = arc(a, Math.max(a1 - 0.012, a + 0.001), R, r);
    faint += `<path d="${d}" fill="${col}" fill-opacity=".16" stroke="${col}" stroke-width="1.2"/>`;
    solid += `<path d="${d}" fill="${col}"/>`;
    a = a1;
  }

  // A full sweep can't be drawn as a single arc (start meets end), so use a circle.
  const clip = sweep >= Math.PI * 2 - 0.001
    ? `<circle cx="${cx}" cy="${cy}" r="${R}"/>`
    : `<path d="${arc(0, Math.max(sweep, 0.0001), R + 2, 0)}"/>`;

  let legend = cats.map(([c, v]) => `<li>
      <span class="sw" style="background:${colorFor("c", c)}"></span>
      <span class="nm">${esc(c)}</span><span class="amt">${money(v)}</span></li>`).join("");

  if (Math.abs(carry) >= 1) {
    legend += `<li class="carry"><span class="nm">${carry > 0 ? "Carried in" : "Behind coming in"}</span>
      <span class="amt ${carry > 0 ? "good" : "bad"}">${carry > 0 ? "+" : "−"}${money(carry)}</span></li>`;
  }
  legend += `<li class="total"><span class="nm">Covered so far</span>
      <span class="amt ${filled >= total ? "good" : ""}">${money(filled)}</span></li>`;

  return `<div class="ringwrap">
    <svg class="chart ring" viewBox="0 0 168 168" width="168" height="168" role="img"
      aria-label="${pct} percent of this month's expenses covered">
      <defs><clipPath id="sweep">${clip}</clipPath></defs>
      ${faint}<g clip-path="url(#sweep)">${solid}</g>
      <text class="ringpct ${pct >= 100 ? "good" : ""}" x="${cx}" y="${cy + 2}" text-anchor="middle">${pct}%</text>
      <text class="ringsub" x="${cx}" y="${cy + 20}" text-anchor="middle">${money(filled)} / ${money(total)}</text>
    </svg>
    <ul class="legend">${legend}</ul>
  </div>`;
}
