#!/usr/bin/env node
// Cuts the ArchAngel out of the two game screenshots → transparent PNGs for the egg-hatch reveal.
//
//   npm run archangel:masks   (macOS only) Apple Vision subject masks → egg-source/masks/
//   npm run archangel         combine masks + colour cleanup → src/assets/archangel-{white,black}.png
//
// Steps: Vision subject mask × "not sky-blue / not wall-tan" → remove the player + title text →
//        drop specks → pull edge colours from inside (no blue sky fringe) → crop, 2x upscale, soft edge.

import fs from 'node:fs';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const JOBS = [
  {
    name: 'white', src: 'egg-source/arcangel_white.jpeg', mask: 'egg-source/masks/arcangel_white-mask-1.png',
    // [x0,y0,x1,y1] in the 447px source: title text, small player at the feet
    exclude: [[110, 0, 340, 104], [224, 360, 260, 447]],
    keepTan: [[200, 160, 255, 205]], // golden eyes / face glow
    minSpeck: 25,
  },
  {
    name: 'black', src: 'egg-source/arcangel_black.jpeg', mask: 'egg-source/masks/arcangel_black-mask-1.png',
    exclude: [[110, 0, 340, 104], [228, 366, 256, 447]],
    keepTan: [[200, 160, 255, 205], [255, 180, 300, 230]],
    minSpeck: 18,
  },
];

const inBox = (x, y, [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
function components(bin, W, H) {
  const label = new Int32Array(W * H), comps = [];
  for (let p = 0; p < W * H; p++) {
    if (!bin[p] || label[p]) continue;
    const id = comps.length + 1, stack = [p];
    let area = 0;
    label[p] = id;
    while (stack.length) {
      const q = stack.pop(), x = q % W, y = (q / W) | 0;
      area++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (bin[n] && !label[n]) { label[n] = id; stack.push(n); }
      }
    }
    comps.push({ id, area });
  }
  return { label, comps };
}
function blur(a, W, H, r) {
  const t = new Float32Array(W * H), o = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let k = -r; k <= r; k++) s += a[y * W + Math.min(W - 1, Math.max(0, x + k))]; t[y * W + x] = s / n; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let k = -r; k <= r; k++) s += t[Math.min(H - 1, Math.max(0, y + k)) * W + x]; o[y * W + x] = s / n; }
  return o;
}

for (const job of JOBS) {
  if (!fs.existsSync(job.mask)) { console.error(`Missing ${job.mask}. Run: npm run archangel:masks (macOS)`); process.exit(1); }
  const img = jpeg.decode(fs.readFileSync(job.src), { useTArray: true });
  const { width: W, height: H, data } = img;
  const m = PNG.sync.read(fs.readFileSync(job.mask));
  if (m.width !== W || m.height !== H) throw new Error('mask size mismatch');

  // 1. alpha = subject mask × not-sky × not-wall, minus text/player boxes
  const alpha = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (job.exclude.some((b) => inBox(x, y, b))) continue;
    let a = m.data[p * 4] / 255;
    if (a <= 0) continue;
    const [h, s, v] = hsv(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
    // sky: blue/cyan, clearly saturated (white-blue lightning has low saturation → kept)
    const sky = (h > 185 && h < 232 ? 1 : 0) * smooth(0.3, 0.45, s) * smooth(0.45, 0.6, v);
    // walls/floor/grass: tan, orange, brick, green
    const tanHue = (h > 8 && h < 50) || (h > 70 && h < 186);
    const wall = tanHue && !job.keepTan.some((b) => inBox(x, y, b)) ? smooth(0.22, 0.38, s) * smooth(0.3, 0.45, v) : 0;
    a *= (1 - sky) * (1 - wall);
    alpha[p] = a;
  }

  // 2. remove tiny specks left behind
  const bin = alpha.map((a) => (a > 0.35 ? 1 : 0));
  const { label, comps } = components(bin, W, H);
  const tiny = new Set(comps.filter((c) => c.area < job.minSpeck).map((c) => c.id));
  for (let p = 0; p < W * H; p++) if (tiny.has(label[p]) || (!bin[p] && alpha[p] < 0.2)) alpha[p] = 0;

  // 3. colour decontamination: semi-transparent edge pixels take colour from solid neighbours
  const rgb = new Float32Array(W * H * 3);
  for (let p = 0; p < W * H; p++) for (let c = 0; c < 3; c++) rgb[p * 3 + c] = data[p * 4 + c];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (alpha[p] <= 0 || alpha[p] >= 0.9) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (alpha[q] >= 0.9) { r += data[q * 4]; g += data[q * 4 + 1]; b += data[q * 4 + 2]; n++; }
    }
    if (n) { rgb[p * 3] = r / n; rgb[p * 3 + 1] = g / n; rgb[p * 3 + 2] = b / n; }
  }

  // 4. crop, 3x bicubic upscale + sharpen, soft edge
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (alpha[y * W + x] > 0.05) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = 8;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  // 3x bicubic (Catmull-Rom) — much crisper than bilinear on a 447px source
  const S = 3, CW = (x1 - x0 + 1) * S, CH = (y1 - y0 + 1) * S;
  const cr = (t) => { const a = Math.abs(t); return a < 1 ? 1.5 * a ** 3 - 2.5 * a ** 2 + 1 : a < 2 ? -0.5 * a ** 3 + 2.5 * a ** 2 - 4 * a + 2 : 0; };
  const samp = (arr, stride, ch, fx, fy) => {
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let s = 0, ws = 0;
    for (let j = -1; j <= 2; j++) {
      const yy = Math.min(H - 1, Math.max(0, iy + j)), wy = cr(fy - (iy + j));
      for (let i = -1; i <= 2; i++) {
        const xx = Math.min(W - 1, Math.max(0, ix + i)), w = cr(fx - (ix + i)) * wy;
        s += arr[(yy * W + xx) * stride + ch] * w; ws += w;
      }
    }
    return s / ws;
  };
  const out = new PNG({ width: CW, height: CH });
  const big = new Float32Array(CW * CH);
  const up = new Float32Array(CW * CH * 3);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const fx = x0 + (x + 0.5) / S - 0.5, fy = y0 + (y + 0.5) / S - 0.5, p = y * CW + x;
    for (let c = 0; c < 3; c++) up[p * 3 + c] = samp(rgb, 3, c, fx, fy);
    big[p] = samp(alpha, 1, 0, fx, fy);
  }
  // unsharp mask (sharpen detail) + a little contrast and vibrance for a crisp, punchy look
  const chan = (c) => { const a = new Float32Array(CW * CH); for (let p = 0; p < CW * CH; p++) a[p] = up[p * 3 + c]; return a; };
  const blurred = [0, 1, 2].map((c) => blur(chan(c), CW, CH, 2));
  for (let p = 0; p < CW * CH; p++) {
    let r = up[p * 3] + (up[p * 3] - blurred[0][p]) * 1.1;
    let g = up[p * 3 + 1] + (up[p * 3 + 1] - blurred[1][p]) * 1.1;
    let b = up[p * 3 + 2] + (up[p * 3 + 2] - blurred[2][p]) * 1.1;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const vib = 1.18; // saturation boost
    r = l + (r - l) * vib; g = l + (g - l) * vib; b = l + (b - l) * vib;
    const con = (v) => (v - 128) * 1.08 + 128; // contrast
    out.data[p * 4] = Math.min(255, Math.max(0, con(r)));
    out.data[p * 4 + 1] = Math.min(255, Math.max(0, con(g)));
    out.data[p * 4 + 2] = Math.min(255, Math.max(0, con(b)));
  }
  const soft = blur(big, CW, CH, 1);
  for (let p = 0; p < CW * CH; p++) out.data[p * 4 + 3] = Math.round(Math.min(1, Math.max(0, (soft[p] - 0.12) / 0.76)) * 255);
  const file = `src/assets/archangel-${job.name}.png`;
  fs.writeFileSync(file, PNG.sync.write(out));
  console.log(`${job.name}: crop ${x1 - x0 + 1}x${y1 - y0 + 1} → ${file} (${CW}x${CH})`);
}
