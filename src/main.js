import './styles.css';
import { hydrateIcons, svg } from './icons.js';
import ROBLOX from './data/roblox.json';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let world = null;
const root = document.documentElement;

// ---------- Safe storage (private mode / blocked storage) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// ---------- Disclaimer gate (every visit) ----------
const consent = document.getElementById('consent');
function enterSite() {
  root.classList.remove('gated');
  if (consent.open) consent.close();
  world?.remeasure();
  document.getElementById('main').focus({ preventScroll: true });
}
if (root.classList.contains('gated') && consent?.showModal) {
  consent.showModal();
  consent.addEventListener('cancel', (e) => e.preventDefault()); // Esc can't skip it
  document.getElementById('consent-agree').addEventListener('click', enterSite);
} else {
  root.classList.remove('gated');
}

// ---------- Theme: system (follows the device), light or dark ----------
const sysLight = matchMedia('(prefers-color-scheme: light)');
const metaTheme = document.querySelector('meta[name="theme-color"]');
let themePref = root.dataset.themePref || 'system';
const resolveTheme = () => (themePref === 'system' ? (sysLight.matches ? 'light' : 'dark') : themePref);
function applyTheme() {
  const theme = resolveTheme();
  root.dataset.theme = theme;
  root.dataset.themePref = themePref;
  metaTheme?.setAttribute('content', theme === 'light' ? '#e4f2ff' : '#140f2e');
  $$('#theme-switch [data-theme-pref]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themePref === themePref)));
  world?.setTheme(theme);
}
$$('#theme-switch [data-theme-pref]').forEach((btn) => {
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
  const btns = $$('#theme-switch [data-theme-pref]');
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

// ---------- Hide Netlify's injected "nl-badge" (and similar) if it ever appears ----------
const KEEP = 'main,header,footer,dialog,canvas,script,.hud,.toast,.loader,.progress,.vignette,.skip';
const isNlBadge = (el) => el.nodeType === 1 && /nl-badge/i.test(`${el.tagName} ${el.id} ${typeof el.className === 'string' ? el.className : ''}`);
const dropBadge = (el) => { if (!el.matches(KEEP)) el.remove(); };
const sweepBadges = () => document.querySelectorAll('body > *').forEach((el) => {
  if (isNlBadge(el) || el.querySelector('[id*="nl-badge" i],[class*="nl-badge" i],nl-badge')) dropBadge(el);
});
sweepBadges();
new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => {
  if (isNlBadge(n)) dropBadge(n);
  else if (n.nodeType === 1 && n.parentNode === document.body) sweepBadges();
}))).observe(document.documentElement, { childList: true, subtree: true });

// ---------- Badges + game passes (official data from src/data/roblox.json, refreshed by `npm run assets`) ----------
const nf = new Intl.NumberFormat('en-US');
const fmtDate = (d) => new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function renderOfficial() {
  $('#badge-count').textContent = ROBLOX.badges.length;
  $('#badge-grid').innerHTML = ROBLOX.badges.map((b) => `
    <article class="panel badge-card reveal">
      <div class="badge-img">${b.icon ? `<img src="${b.icon}" width="150" height="150" loading="lazy" alt="${esc(b.name)} badge icon" />` : svg('trophy')}</div>
      <span class="src-tag">${svg('check')}Official source</span>
      <h3>${esc(b.name)}</h3>
      <p><b data-badge-awards="${b.id}">${nf.format(b.awarded)}</b> total awards</p>
      <p class="meta">Created ${fmtDate(b.created)}${b.enabled ? '' : ' · disabled'}</p>
      <a class="card-link" href="${b.url}" target="_blank" rel="noopener">Official badge page ${svg('external')}</a>
    </article>`).join('');
  $('#pass-count').textContent = words[ROBLOX.passes.length] || ROBLOX.passes.length;
  $('#pass-grid').innerHTML = ROBLOX.passes.map((p) => `
    <article class="panel pass-card reveal">
      <div class="pass-img">${p.icon ? `<img src="${p.icon}" width="150" height="150" loading="lazy" alt="${esc(p.name)} game pass icon" />` : svg('ticket')}</div>
      <div class="pass-body">
        <span class="src-tag">${svg('ticket')}Roblox game pass</span>
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.desc)}</p>
        <div class="price-row"><span>Snapshot price</span><b><span class="robux" aria-hidden="true"></span><span data-pass-price="${p.id}">${nf.format(p.price)}</span> <small>Robux</small></b></div>
        <p class="meta" data-pass-checked>Checked ${fmtDate(ROBLOX.checkedAt)}</p>
        <a class="card-link" href="${p.url}" target="_blank" rel="noopener">Roblox pass page ${svg('external')}</a>
      </div>
    </article>`).join('');
  const sb = $('#stats-badge');
  if (sb) sb.textContent = `Snapshot checked ${fmtDate(ROBLOX.checkedAt)}`;
}
renderOfficial();
hydrateIcons();

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
  // live badge award counts + pass prices
  if (data.badges) $$('[data-badge-awards]').forEach((el) => { const b = data.badges[el.dataset.badgeAwards]; if (b?.awarded) el.textContent = nf.format(b.awarded); });
  if (data.passes) {
    $$('[data-pass-price]').forEach((el) => { const p = data.passes[el.dataset.passPrice]; if (p?.price) el.textContent = nf.format(p.price); });
    $$('[data-pass-checked]').forEach((el) => (el.textContent = `Checked live · ${fmtDate(new Date().toISOString())}`));
  }
  $$('[data-date="updated"]').forEach((el) => data.updated && (el.textContent = fmtDate(data.updated)));
  if (data.live) $$('[data-checked]').forEach((el) => (el.textContent = `Live from Roblox · ${fmtDate(new Date().toISOString())}`));
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
function onAngel() {
  const name = root.dataset.theme === 'light' ? 'Fractured ArchAngel' : 'Silver ArchAngel';
  toast(`✨ <b>Divine · ${name}</b> hatched!`, 'gold');
}
let guardedCount = 0;
function onGuarded() {
  const lines = ['🚨 Lasers armed! That one\'s guarded.', '🚨 Nice try. Grab the floating ones!', '🚨 Security says no.'];
  toast(lines[guardedCount++ % lines.length], 'alarm');
}

// ---------- Egg index ----------
const EGGS = {
  yeti: { name: 'Yeti Egg', desc: 'Fan render: frosty fur and an ice-crystal crown.' },
  trex: { name: 'Trex Egg', desc: 'Fan render: scaly shell with spots and a row of teeth.' },
  phoenix: { name: 'Eternal Phoenix Egg', desc: 'Fiery orange shell with flame wings. This 3D model is generated from the official artwork.' },
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
      world = createWorld($('#world'), { onSteal, onGuarded, onAngel, reducedMotion, theme: root.dataset.theme });
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

// "View in 3D" on the artwork cards → jump to the 3D viewer with that egg selected
$$('[data-show-egg]').forEach((btn) => btn.addEventListener('click', () => {
  $(`[data-egg="${btn.dataset.showEgg}"]`)?.click();
  $('#eggs').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
}));

// show the selected egg when the Egg Index scrolls into view; restore the golden prize when leaving
let eggsVisible = false;
new IntersectionObserver(([en]) => {
  if (en.isIntersecting === eggsVisible || !world) return;
  eggsVisible = en.isIntersecting;
  world.setHatchHold(eggsVisible); // egg re-forms in the 3D viewer
  world.setFeatured(eggsVisible ? $('[data-egg][aria-selected="true"]').dataset.egg : 'hero');
}, { threshold: 0.35 }).observe($('#eggs'));

$('#year').textContent = new Date().getFullYear();
applyTheme();
