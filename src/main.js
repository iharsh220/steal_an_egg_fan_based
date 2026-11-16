import './styles.css';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let world = null;

// ---------- Safe storage (private mode / blocked storage) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// ---------- Theme: system (follows the device), light or dark ----------
const root = document.documentElement;
const sysLight = matchMedia('(prefers-color-scheme: light)');
const metaTheme = document.querySelector('meta[name="theme-color"]');
let themePref = root.dataset.themePref || 'system';
const resolveTheme = () => (themePref === 'system' ? (sysLight.matches ? 'light' : 'dark') : themePref);
function applyTheme() {
  const theme = resolveTheme();
  root.dataset.theme = theme;
  root.dataset.themePref = themePref;
  metaTheme?.setAttribute('content', theme === 'light' ? '#e4f2ff' : '#140f2e');
  $$('[data-theme-pref]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themePref === themePref)));
  world?.setTheme(theme);
}
$$('[data-theme-pref]').forEach((btn) => {
  btn.addEventListener('click', () => {
    themePref = btn.dataset.themePref;
    try { localStorage.setItem('sae-theme', themePref); } catch { /* ignore */ }
    applyTheme();
    const label = { system: '🖥️ Theme follows your device', light: '☀️ Light mode', dark: '🌙 Dark mode' }[themePref];
    toast(label);
  });
});
// arrow-key support inside the radiogroup
$('#theme-switch').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const btns = $$('[data-theme-pref]');
  const i = btns.findIndex((b) => b.dataset.themePref === themePref);
  const next = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
  next.click();
  next.focus();
});
sysLight.addEventListener('change', () => { if (themePref === 'system') applyTheme(); });

// ---------- Nav ----------
const nav = $('#nav');
const toggle = $('#nav-toggle');
const links = $('#nav-links');
const setMenu = (open) => {
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  document.body.classList.toggle('menu-open', open);
};
toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

const progress = $('#progress');
function onScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  nav.classList.toggle('scrolled', scrollY > 30);
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ---------- Reveal on scroll ----------
const io = new IntersectionObserver(
  (entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }),
  { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
);
$$('.reveal').forEach((el, i) => { el.style.setProperty('--d', `${(i % 3) * 90}ms`); io.observe(el); });

// ---------- Live stats ----------
const fmt = new Intl.NumberFormat('en-US');
const short = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
function countUp(el, to) {
  const suffix = el.dataset.suffix || '';
  const isShort = el.hasAttribute('data-short');
  const decimals = Number.isInteger(to) ? 0 : 1;
  const render = (v) => {
    el.textContent = (isShort ? short.format(v) : decimals ? v.toFixed(decimals) : fmt.format(Math.round(v))) + suffix;
  };
  if (reducedMotion) return render(to);
  const start = performance.now(), dur = 1400;
  const step = (now) => {
    const k = Math.min(1, (now - start) / dur);
    render(to * (1 - Math.pow(1 - k, 4)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function loadStats() {
  let data = null;
  try {
    const res = await fetch('/api/stats', { headers: { accept: 'application/json' } });
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) data = await res.json();
  } catch { /* offline: keep the HTML snapshot */ }
  if (!data) return;
  const badge = $('#stats-badge');
  if (data.live) {
    badge.innerHTML = '<span class="live-dot"></span> Live from Roblox';
    badge.classList.add('tag-live');
  }
  // animate each stat when it scrolls into view
  const statIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const v = data[el.dataset.stat];
      if (typeof v === 'number') countUp(el, v);
      statIO.unobserve(el);
    });
  });
  $$('[data-stat]').forEach((el) => statIO.observe(el));
}
loadStats();

// ---------- Toasts ----------
const toastEl = $('#toast');
let toastTimer;
function toast(html, kind = '') {
  toastEl.innerHTML = html;
  toastEl.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.className = 'toast'), 2600);
}

// ---------- Steal mini-game ----------
const RANKS = [
  [0, 'Rookie'], [1, 'Pickpocket'], [10, 'Egg Bandit'], [25, 'Nest Raider'], [50, 'Master Thief'], [100, 'Legendary Heister'],
];
const rankFor = (n) => RANKS.filter(([min]) => n >= min).pop()[1];
let stolen = store.get('sae-stolen', 0);
const stolenEl = $('#stolen');
const rankEl = $('#rank');
const hud = $('#hud');
function paintHud() {
  stolenEl.textContent = fmt.format(stolen);
  rankEl.textContent = rankFor(stolen);
  hud.classList.toggle('has', stolen > 0);
}
paintHud();

function onSteal({ jackpot, value }) {
  const before = rankFor(stolen);
  stolen += value;
  store.set('sae-stolen', stolen);
  paintHud();
  hud.classList.remove('bump');
  void hud.offsetWidth;
  hud.classList.add('bump');
  const after = rankFor(stolen);
  if (after !== before) toast(`🏆 New rank: <b>${after}</b>`, 'gold');
  else if (jackpot) toast('✨ <b>Golden egg!</b> +5', 'gold');
  $('.hint')?.classList.add('done');
}
let guardedCount = 0;
function onGuarded() {
  const lines = ['🚨 Lasers armed! That one\'s guarded.', '🚨 Nice try. Grab the floating ones!', '🚨 Security says no.'];
  toast(lines[guardedCount++ % lines.length], 'alarm');
}

// ---------- Egg index ----------
const EGGS = {
  yeti: { name: 'Yeti Egg', desc: 'Frosty fur and an ice-crystal crown.' },
  trex: { name: 'Trex Egg', desc: 'Scaly green shell with orange spots and a row of teeth.' },
  phoenix: { name: 'Eternal Phoenix Egg', desc: 'A shell that burns from crimson to gold.' },
};

// ---------- 3D world (lazy-loaded so text paints first) ----------
const loader = $('#loader');
const hideLoader = () => { loader.classList.add('gone'); setTimeout(() => loader.remove(), 800); };

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

if (webglOk()) {
  import('./world.js')
    .then(({ createWorld }) => {
      world = createWorld($('#world'), { onSteal, onGuarded, reducedMotion, theme: root.dataset.theme });
      world.start($$('[data-cam]'), hideLoader);
      // fonts/images can shift layout — remeasure camera anchors once settled
      document.fonts?.ready.then(() => world.remeasure());
      addEventListener('load', () => world.remeasure());
    })
    .catch((err) => {
      console.error(err);
      document.body.classList.add('no-webgl');
      hideLoader();
    });
} else {
  document.body.classList.add('no-webgl');
  hideLoader();
}
setTimeout(hideLoader, 6000); // never trap users behind the loader

$$('[data-egg]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('[data-egg]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    const e = EGGS[btn.dataset.egg];
    $('#egg-name').textContent = e.name;
    $('#egg-desc').textContent = e.desc;
    world?.setFeatured(btn.dataset.egg);
  });
});

// show the selected egg when the Egg Index scrolls into view; restore the golden prize when leaving
let eggsVisible = false;
new IntersectionObserver(([en]) => {
  if (en.isIntersecting === eggsVisible || !world) return;
  eggsVisible = en.isIntersecting;
  world.setFeatured(eggsVisible ? $('[data-egg][aria-selected="true"]').dataset.egg : 'golden');
}, { threshold: 0.35 }).observe($('#eggs'));

$('#year').textContent = new Date().getFullYear();
applyTheme();
