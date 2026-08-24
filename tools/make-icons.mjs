/**
 * Generates the PWA icon set with no image libraries — just zlib.
 * Everything is drawn at 4x and box-filtered down, which is why the
 * rounded corners and bar edges come out smooth.
 *
 *   node tools/make-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const GROUND = [0x1b, 0x1e, 0x24];
const BARS = [
  [0x4f, 0x8d, 0xf7], // blue
  [0xf2, 0xa9, 0x3b], // amber
  [0x6f, 0xd0, 0x8c], // green — the "ahead" color, tallest bar
];

const SS = 4; // supersample factor

function canvas(w, h, rgb, alpha = 255) {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = rgb[0]; px[i * 4 + 1] = rgb[1];
    px[i * 4 + 2] = rgb[2]; px[i * 4 + 3] = alpha;
  }
  return { w, h, px };
}

function put(c, x, y, rgb) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  c.px[i] = rgb[0]; c.px[i + 1] = rgb[1]; c.px[i + 2] = rgb[2]; c.px[i + 3] = 255;
}

/** Rounded rectangle, drawn by testing each pixel against the corner radii. */
function roundRect(c, x0, y0, w, h, r, rgb) {
  const x1 = x0 + w, y1 = y0 + h;
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      let cx = null, cy = null;
      if (x < x0 + r && y < y0 + r) { cx = x0 + r; cy = y0 + r; }
      else if (x > x1 - r && y < y0 + r) { cx = x1 - r; cy = y0 + r; }
      else if (x < x0 + r && y > y1 - r) { cx = x0 + r; cy = y1 - r; }
      else if (x > x1 - r && y > y1 - r) { cx = x1 - r; cy = y1 - r; }
      if (cx !== null) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy > r * r) continue;
      }
      put(c, x, y, rgb);
    }
  }
}

/** Average each SSxSS block down to one pixel. */
function downsample(c, factor) {
  const w = c.w / factor, h = c.h / factor;
  const out = canvas(w, h, [0, 0, 0]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const i = ((y * factor + sy) * c.w + (x * factor + sx)) * 4;
          r += c.px[i]; g += c.px[i + 1]; b += c.px[i + 2];
        }
      }
      const n = factor * factor;
      put(out, x, y, [Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(c) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0);
  ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // truecolor + alpha
  // Prefix every scanline with filter type 0.
  const raw = Buffer.alloc(c.h * (c.w * 4 + 1));
  for (let y = 0; y < c.h; y++) {
    raw[y * (c.w * 4 + 1)] = 0;
    Buffer.from(c.px.buffer, y * c.w * 4, c.w * 4).copy(raw, y * (c.w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * @param size    final pixel size
 * @param inset   fraction of the canvas kept clear around the artwork.
 *                Maskable icons need a wide margin so nothing important
 *                lands outside the platform's safe zone.
 * @param corner  corner radius as a fraction of size (0 = full bleed square)
 */
function icon(size, { inset, corner }) {
  const S = size * SS;
  const c = canvas(S, S, GROUND);
  if (corner > 0) {
    // Transparent outside the rounded square: repaint the whole canvas clear,
    // then lay the rounded ground back down.
    c.px.fill(0);
    roundRect(c, 0, 0, S, S, corner * S, GROUND);
  }

  const pad = S * inset;
  const artW = S - pad * 2;
  const gap = artW * 0.085;
  const bw = (artW - gap * 2) / 3;
  const heights = [0.5, 0.72, 1.0];
  const baseY = S - pad;

  heights.forEach((hf, i) => {
    const h = artW * hf;
    roundRect(c, pad + i * (bw + gap), baseY - h, bw, h, bw * 0.22, BARS[i]);
  });

  return downsample(c, SS);
}

mkdirSync("icons", { recursive: true });
const out = [
  ["icons/icon-192.png", icon(192, { inset: 0.16, corner: 0.22 })],
  ["icons/icon-512.png", icon(512, { inset: 0.16, corner: 0.22 })],
  ["icons/icon-maskable-512.png", icon(512, { inset: 0.26, corner: 0 })],
  ["icons/apple-touch-icon.png", icon(180, { inset: 0.16, corner: 0 })],
];
for (const [path, img] of out) {
  writeFileSync(path, encodePNG(img));
  console.log("wrote", path, img.w + "x" + img.h);
}
