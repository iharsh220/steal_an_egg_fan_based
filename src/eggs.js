// Procedural egg geometry + hand-painted canvas textures (no external assets).
import * as THREE from 'three';

export function eggGeometry(seg = 48, rings = 36) {
  const pts = [];
  for (let i = 0; i <= rings; i++) {
    const a = (i / rings) * Math.PI; // bottom -> top
    const y = -Math.cos(a);
    const r = Math.sin(a) * (1 - 0.17 * y) * 0.76; // wider at the bottom
    pts.push(new THREE.Vector2(Math.max(r, 1e-4), y));
  }
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  return g;
}

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// gradient painted from bottom (0) to top (1) of the egg
function vgrad(ctx, w, h, stops) {
  const g = ctx.createLinearGradient(0, h, 0, 0);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// draw something twice near the seam so the texture wraps around the egg cleanly
function wrap(w, x, pad, fn) {
  fn(x);
  if (x < pad) fn(x + w);
  if (x > w - pad) fn(x - w);
}

function zigzag(ctx, w, y, amp, period, thick, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, y);
  for (let x = 0; x <= w; x += period / 2) {
    const up = Math.round(x / (period / 2)) % 2 === 0;
    ctx.lineTo(x, y + (up ? -amp : amp));
  }
  for (let x = w; x >= 0; x -= period / 2) {
    const up = Math.round(x / (period / 2)) % 2 === 0;
    ctx.lineTo(x, y + thick + (up ? -amp : amp));
  }
  ctx.closePath();
  ctx.fill();
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

const painters = {
  golden(ctx, w, h, r) {
    vgrad(ctx, w, h, [[0, '#b8650a'], [0.35, '#f2a516'], [0.7, '#ffd54a'], [1, '#fff6c2']]);
    zigzag(ctx, w, h * 0.5, 16, w / 12, 34, '#c4730a');
    zigzag(ctx, w, h * 0.5 - 12, 16, w / 12, 6, 'rgba(255,248,210,.9)');
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 70; i++) star(ctx, r() * w, r() * h, 3 + r() * 9);
  },
  yeti(ctx, w, h, r) {
    vgrad(ctx, w, h, [[0, '#9cc8ec'], [0.45, '#e2f1ff'], [1, '#ffffff']]);
    ctx.lineCap = 'round';
    for (let i = 0; i < 1800; i++) {
      const x = r() * w, y = r() * h, len = 8 + r() * 18, a = Math.PI / 2 + (r() - 0.5) * 0.9;
      ctx.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,.75)' : 'rgba(140,185,230,.45)';
      ctx.lineWidth = 2 + r() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    // ice crystal crown near the bottom
    ctx.fillStyle = '#5fb1e8';
    const n = 18;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (w / n), tall = 60 + r() * 70;
      ctx.beginPath();
      ctx.moveTo(x - 22, h * 0.78);
      ctx.lineTo(x, h * 0.78 - tall);
      ctx.lineTo(x + 22, h * 0.78);
      ctx.fill();
    }
    ctx.fillStyle = '#4a9ad6';
    ctx.fillRect(0, h * 0.78, w, 26);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    for (let i = 0; i < 40; i++) star(ctx, r() * w, r() * h * 0.6, 4 + r() * 6);
  },
  trex(ctx, w, h, r) {
    vgrad(ctx, w, h, [[0, '#2f6e2c'], [0.6, '#5fae46'], [1, '#a2d870']]);
    ctx.strokeStyle = 'rgba(20,60,20,.35)';
    ctx.lineWidth = 3;
    for (let y = 0, row = 0; y < h + 30; y += 26, row++) {
      for (let x = (row % 2) * 16; x < w + 32; x += 32) {
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, Math.PI);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = h * 0.15 + r() * h * 0.7, rx = 14 + r() * 26, ry = rx * (0.6 + r() * 0.4);
      wrap(w, x, 50, (xx) => {
        ctx.fillStyle = '#b8540f';
        ctx.beginPath(); ctx.ellipse(xx, y, rx + 5, ry + 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f39a2c';
        ctx.beginPath(); ctx.ellipse(xx, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      });
    }
    // jaw stripe with teeth
    ctx.fillStyle = '#26401f';
    ctx.fillRect(0, h * 0.44, w, 30);
    ctx.fillStyle = '#fffbe8';
    const n = 24;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (w / n);
      ctx.beginPath();
      ctx.moveTo(x - 14, h * 0.44 + 30);
      ctx.lineTo(x, h * 0.44 + 62);
      ctx.lineTo(x + 14, h * 0.44 + 30);
      ctx.fill();
    }
  },
  phoenix(ctx, w, h, r) {
    vgrad(ctx, w, h, [[0, '#5c0a1a'], [0.28, '#c8251a'], [0.58, '#ff7a1a'], [0.85, '#ffc43d'], [1, '#fff1a8']]);
    const n = 16;
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer ? 'rgba(255,240,170,.6)' : 'rgba(255,190,60,.55)';
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (w / n) + (r() - 0.5) * 20;
        const fw = (layer ? 18 : 34) + r() * 10;
        const top = h - h * (layer ? 0.3 + r() * 0.2 : 0.45 + r() * 0.35);
        wrap(w, x, 60, (xx) => {
          ctx.beginPath();
          ctx.moveTo(xx - fw, h);
          ctx.quadraticCurveTo(xx - fw * 1.2, (h + top) / 2, xx + (r() - 0.5) * 20, top);
          ctx.quadraticCurveTo(xx + fw * 1.2, (h + top) / 2, xx + fw, h);
          ctx.fill();
        });
      }
    }
    ctx.fillStyle = 'rgba(255,250,220,.95)';
    for (let i = 0; i < 90; i++) {
      ctx.beginPath();
      ctx.arc(r() * w, r() * h * 0.7, 1.5 + r() * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  pastel(ctx, w, h, r) {
    const hue = Math.floor(r() * 360);
    vgrad(ctx, w, h, [[0, `hsl(${hue},65%,48%)`], [1, `hsl(${hue},85%,82%)`]]);
    const style = Math.floor(r() * 3);
    const accent = `hsl(${(hue + 150 + r() * 60) % 360},80%,62%)`;
    if (style === 0) {
      ctx.fillStyle = accent;
      for (let i = 0; i < 40; i++) {
        const x = r() * w, y = r() * h, rad = 10 + r() * 26;
        wrap(w, x, 40, (xx) => { ctx.beginPath(); ctx.arc(xx, y, rad, 0, Math.PI * 2); ctx.fill(); });
      }
    } else if (style === 1) {
      for (let i = 0; i < 4; i++) zigzag(ctx, w, h * (0.2 + i * 0.2), 12, w / 14, 18, i % 2 ? accent : 'rgba(255,255,255,.8)');
    } else {
      ctx.fillStyle = accent;
      for (let i = 0; i < 5; i++) ctx.fillRect(0, h * (0.15 + i * 0.17), w, 22);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 0; i < 50; i++) star(ctx, r() * w, r() * h, 3 + r() * 6);
    }
  },
};

const cache = new Map();
export function eggTexture(type, seed = 7, size = 1024) {
  const key = `${type}:${seed}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const [c, ctx] = canvas(size, size / 2);
  painters[type](ctx, c.width, c.height, rng(seed));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

const LOOKS = {
  golden: { roughness: 0.22, metalness: 0.55, clearcoat: 1, emissive: 0.08 },
  yeti: { roughness: 0.55, metalness: 0, clearcoat: 0.4, emissive: 0.04 },
  trex: { roughness: 0.45, metalness: 0, clearcoat: 0.6, emissive: 0 },
  phoenix: { roughness: 0.3, metalness: 0.1, clearcoat: 0.8, emissive: 0.75 },
  pastel: { roughness: 0.35, metalness: 0, clearcoat: 0.6, emissive: 0.02 },
};

export function eggMaterial(type, { seed = 7, physical = true, size = 1024 } = {}) {
  const map = eggTexture(type, seed, size);
  const look = LOOKS[type];
  const Mat = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new Mat({
    map,
    roughness: look.roughness,
    metalness: look.metalness,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: map,
    emissiveIntensity: look.emissive,
  });
  if (physical) {
    m.clearcoat = look.clearcoat;
    m.clearcoatRoughness = 0.2;
  }
  m.userData.baseEmissive = look.emissive;
  return m;
}
