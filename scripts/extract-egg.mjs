#!/usr/bin/env node
// Turns a picture of an egg into a 3D egg for the site.
//
//   npm run egg                          # uses egg-source/egg.jpeg
//   npm run egg -- path/to/my-egg.png    # any JPG/PNG
//
// How it works:
//   1. Finds the egg: the largest connected blob of warm (or --hue) coloured pixels.
//   2. Fits a smooth egg silhouette to that blob (ignoring flames/wings sticking out).
//   3. Writes src/assets/egg-profile.json — the lathe profile used to build the 3D shape.
//   4. Wraps the picture around that shape and writes src/assets/egg-texture.jpg.
//
// Options:  --hue=345-52  (egg colour range in degrees; default warm orange/red/yellow)
//           --sat=0.4   (minimum saturation)  --val=0.4 (minimum brightness)

import fs from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const input = args.find((a) => !a.startsWith('--')) || 'egg-source/egg.jpeg';
const outDir = 'src/assets';
const [hueLo, hueHi] = (opt.hue || '345-52').split('-').map(Number);
const minSat = Number(opt.sat ?? 0.42);
const minVal = Number(opt.val ?? 0.4);

// ---------- load ----------
const buf = fs.readFileSync(input);
const img = /\.png$/i.test(input) ? PNG.sync.read(buf) : jpeg.decode(buf, { useTArray: true });
const { width: W, height: H, data } = img;
console.log(`Loaded ${input} (${W}x${H})`);

const px = (x, y) => (y * W + x) * 4;
function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, mx ? d / mx : 0, mx];
}
const inHue = (h) => (hueLo <= hueHi ? h >= hueLo && h <= hueHi : h >= hueLo || h <= hueHi);

// ---------- 1. mask + largest blob ----------
const raw = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = px(x, y);
  const [h, s, v] = hsv(data[i], data[i + 1], data[i + 2]);
  raw[y * W + x] = inHue(h) && s >= minSat && v >= minVal ? 1 : 0;
}
const label = new Int32Array(W * H);
let best = { id: 0, size: 0 }, next = 1;
const stack = [];
for (let p = 0; p < W * H; p++) {
  if (!raw[p] || label[p]) continue;
  let size = 0;
  label[p] = next; stack.push(p);
  while (stack.length) {
    const q = stack.pop(); size++;
    const x = q % W, y = (q / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (raw[n] && !label[n]) { label[n] = next; stack.push(n); }
    }
  }
  if (size > best.size) best = { id: next, size };
  next++;
}
if (best.size < 500) throw new Error('Could not find an egg. Try --hue / --sat / --val options.');
const mask = new Uint8Array(W * H);
for (let p = 0; p < W * H; p++) mask[p] = label[p] === best.id ? 1 : 0;

// per-row span (fills holes such as highlights / dark outlines)
const L = new Int32Array(H).fill(-1), R = new Int32Array(H).fill(-1);
let minY = H, maxY = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) if (mask[y * W + x]) { if (L[y] < 0) L[y] = x; R[y] = x; }
  if (L[y] >= 0) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
}

// ---------- 2. fit a smooth egg ----------
// half-width model: f(ny) = Rad * sqrt(1 - ny^2) * (1 - k*ny), ny = +1 top … -1 bottom
const half = (y) => (L[y] < 0 ? 0 : (R[y] - L[y] + 1) / 2);
const centers = [];
for (let y = minY; y <= maxY; y++) if (L[y] >= 0) centers.push((L[y] + R[y]) / 2);
let maxHalf = 0;
for (let y = minY; y <= maxY; y++) maxHalf = Math.max(maxHalf, half(y));

let fit = null;
for (let yb = maxY; yb >= maxY - (maxY - minY) * 0.12; yb -= 2)
for (let yt = minY; yt <= minY + (maxY - minY) * 0.3; yt += 2) {
  for (let Rad = maxHalf * 0.5; Rad <= maxHalf * 1.05; Rad += 1) {
    for (let k = 0; k <= 0.4; k += 0.025) {
      let loss = 0;
      for (let y = minY; y <= maxY; y++) {
        const m = half(y);
        let f = 0;
        if (y >= yt) {
          const ny = 1 - (2 * (y - yt)) / (yb - yt);
          f = Rad * Math.sqrt(Math.max(0, 1 - ny * ny)) * (1 - k * ny);
        }
        const d = m - f;
        loss += d < 0 ? d * d : d * d * 0.015; // model poking outside the egg is bad; flames sticking out are OK
      }
      if (!fit || loss < fit.loss) fit = { loss, yt, yb, Rad, k };
    }
  }
}
const yb = fit.yb;
// body centre = median centre of the lower 70% (avoids crest flames)
const bodyCenters = [];
for (let y = Math.round(fit.yt + (yb - fit.yt) * 0.3); y <= yb; y++) if (L[y] >= 0) bodyCenters.push((L[y] + R[y]) / 2);
bodyCenters.sort((a, b) => a - b);
const cx = bodyCenters[bodyCenters.length >> 1] ?? centers[centers.length >> 1];
const halfH = (yb - fit.yt) / 2;
console.log(`Egg body: top=${fit.yt}px bottom=${yb}px centerX=${cx.toFixed(1)} radius=${fit.Rad.toFixed(1)} taper=${fit.k.toFixed(2)}`);

// ---------- 3. profile (uniform in angle, bottom → top) ----------
const N = 48;
const points = [];
for (let i = 0; i <= N; i++) {
  const a = (i / N) * Math.PI;
  const ny = -Math.cos(a);
  const r = (fit.Rad / halfH) * Math.sin(a) * (1 - fit.k * ny);
  points.push([+Math.max(r, 1e-4).toFixed(5), +ny.toFixed(5)]);
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'egg-profile.json'), JSON.stringify({ source: path.basename(input), points }, null, 0));

// ---------- 4. wrap the picture around the egg ----------
const TW = 1024, TH = 512;
const out = Buffer.alloc(TW * TH * 4);
function sample(x, y) {
  // bilinear
  x = Math.min(W - 1.001, Math.max(0, x)); y = Math.min(H - 1.001, Math.max(0, y));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
  const c = [0, 0, 0];
  for (const [ox, oy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const i = px(x0 + ox, y0 + oy);
    c[0] += data[i] * w; c[1] += data[i + 1] * w; c[2] += data[i + 2] * w;
  }
  return c;
}
const inside = (x, y) => {
  const xi = Math.round(x), yi = Math.round(y);
  return xi >= 0 && yi >= 0 && xi < W && yi < H && mask[yi * W + xi];
};
for (let ty = 0; ty < TH; ty++) {
  const v = 1 - (ty + 0.5) / TH;          // texture top row = egg top
  const ny = -Math.cos(v * Math.PI);       // same spacing as the lathe profile
  const iy = fit.yt + ((1 - ny) / 2) * (yb - fit.yt);
  const f = fit.Rad * Math.sqrt(Math.max(0, 1 - ny * ny)) * (1 - fit.k * ny) * 0.97;
  for (let tx = 0; tx < TW; tx++) {
    const phi = ((tx + 0.5) / TW) * Math.PI * 2;
    let ix = cx + f * Math.sin(phi);
    // if this lands on background (edge / outline gap), walk toward the centre
    for (let s = 0; s < 40 && !inside(ix, iy); s++) ix += (cx - ix) * 0.08;
    const c = sample(ix, iy);
    const o = (ty * TW + tx) * 4;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
  }
}
fs.writeFileSync(path.join(outDir, 'egg-texture.jpg'), jpeg.encode({ data: out, width: TW, height: TH }, 90).data);
console.log(`Wrote ${outDir}/egg-texture.jpg and ${outDir}/egg-profile.json`);
