import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { eggGeometry, eggMaterial } from './eggs.js';

// Camera stops, keyed by each section's data-cam attribute.
// off = horizontal screen shift of the scene (+ pushes the island to the right).
const SHOTS = {
  hero: { pos: [9, 5, 14], look: [0, 1.2, 0], off: 0.2 },
  event: { pos: [-12, 7, 9], look: [0, 1, 0], off: -0.22 },
  stats: { pos: [0.01, 19, 8], look: [0, 0, 0], off: 0 },
  loop: { pos: [13, 3.2, 3], look: [0, 1.5, 0], off: 0.22 },
  guide: { pos: [-5, 9, -14], look: [0, 1, 0], off: -0.22 },
  eggs: { pos: [3.6, 3.1, 6.2], look: [0, 1.5, 0], off: 0.2 },
  passes: { pos: [-14, 10, 12], look: [0, 0, 0], off: 0 },
  faq: { pos: [10, 4.5, -12], look: [0, 1, 0], off: -0.2 },
};

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

// Night (dark) and day (light) palettes for the 3D world; the scene blends between them.
const PALETTES = {
  dark: {
    top: '#0b0820', mid: '#3a1f6b', glow: '#ff8a5c', low: '#2a1446', fog: '#2a1850',
    hemiSky: '#b9a6ff', hemiGround: '#4a2a3a', hemi: 1.1, sun: '#ffe2c4', sunI: 2.4, rimI: 1.4,
    stars: 0.9, env: 0.4, exposure: 1.05, eggLight: 10, sparks: 1,
  },
  light: {
    top: '#2f8fe0', mid: '#9fd4ff', glow: '#fff0c4', low: '#d6ecff', fog: '#c4e3ff',
    hemiSky: '#ffffff', hemiGround: '#7a9a6a', hemi: 1.5, sun: '#fff4e0', sunI: 3.1, rimI: 0.7,
    stars: 0, env: 0.65, exposure: 1.0, eggLight: 5, sparks: 0.45,
  },
};
for (const p of Object.values(PALETTES)) for (const k in p) if (typeof p[k] === 'string') p[k] = new THREE.Color(p[k]);

export function createWorld(canvas, { onSteal = () => {}, onGuarded = () => {}, reducedMotion = false, theme = 'dark' } = {}) {
  const mq = matchMedia('(max-width: 820px)');
  let mobile = mq.matches;
  const lowPower = mobile || (navigator.hardwareConcurrency || 8) <= 4;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#2a1850', 22, 70);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 220);

  // ---------- Sky ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(100, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#0b0820') },
        mid: { value: new THREE.Color('#3a1f6b') },
        glow: { value: new THREE.Color('#ff8a5c') },
        low: { value: new THREE.Color('#2a1446') },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top, mid, glow, low; varying vec3 vP;
        void main(){ float h = vP.y;
          vec3 c = mix(low, mid, smoothstep(-0.45, 0.0, h));
          c = mix(c, top, smoothstep(0.1, 0.7, h));
          c += glow * exp(-pow((h + 0.02) * 9.0, 2.0)) * 0.55; // thin sunset band at the horizon
          gl_FragColor = vec4(c, 1.0); }`,
    })
  );
  scene.add(sky);

  const starGeo = new THREE.BufferGeometry();
  const starCount = lowPower ? 350 : 800;
  const sp = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.42;
    sp.set([Math.cos(th) * Math.sin(ph) * 90, Math.cos(ph) * 90, Math.sin(th) * Math.sin(ph) * 90], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#fff4d6', size: 0.55, fog: false, transparent: true, opacity: 0.9 }));
  scene.add(stars);

  // ---------- Lights ----------
  const hemi = new THREE.HemisphereLight('#b9a6ff', '#4a2a3a', 1.1);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight('#ffe2c4', 2.4);
  moon.position.set(8, 14, 6);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  moon.shadow.bias = -0.0015;
  scene.add(moon);
  const rim = new THREE.DirectionalLight('#7f6bff', 1.4);
  rim.position.set(-10, 4, -8);
  scene.add(rim);
  const eggLight = new THREE.PointLight('#ffc45a', 12, 9, 1.6);
  eggLight.position.set(0, 1.7, 0);
  scene.add(eggLight);

  // ---------- Island ----------
  function makeIsland(detail = 1) {
    const g = new THREE.Group();
    const rockGeo = new THREE.CylinderGeometry(6, 2.2, 3.4, 11, 4);
    const p = rockGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < 1.6) {
        const k = 0.35 + Math.random() * 0.45;
        p.setX(i, p.getX(i) * (1 + (Math.random() - 0.5) * k * 0.4));
        p.setZ(i, p.getZ(i) * (1 + (Math.random() - 0.5) * k * 0.4));
        p.setY(i, y + (Math.random() - 0.5) * 0.4);
      }
    }
    rockGeo.computeVertexNormals();
    const rock = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: '#7b5238', flatShading: true, roughness: 0.95 }));
    rock.position.y = -1.95;
    rock.receiveShadow = true;
    g.add(rock);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.6, 8), rock.material);
    tip.rotation.x = Math.PI;
    tip.position.y = -4.9;
    g.add(tip);
    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(6.25, 6.05, 0.5, 11),
      new THREE.MeshStandardMaterial({ color: '#58c26a', flatShading: true, roughness: 0.85 })
    );
    grass.receiveShadow = true;
    g.add(grass);
    if (detail) {
      const leaf = new THREE.MeshStandardMaterial({ color: '#2f9a5a', flatShading: true, roughness: 0.8 });
      const leaf2 = new THREE.MeshStandardMaterial({ color: '#3fb46a', flatShading: true, roughness: 0.8 });
      const trunk = new THREE.MeshStandardMaterial({ color: '#6b4226', flatShading: true });
      const stone = new THREE.MeshStandardMaterial({ color: '#9a93b0', flatShading: true, roughness: 0.9 });
      const spots = [[4.4, 1.2], [3.6, 2.6], [-4.6, -1.4], [-2.8, 4.2], [1.4, -4.8], [-4.2, 2.8], [4.6, -2.4]];
      spots.forEach(([x, z], i) => {
        const s = 0.7 + Math.random() * 0.5;
        const t = new THREE.Group();
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 5), trunk);
        tr.position.y = 0.6;
        const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.5, 6), i % 2 ? leaf : leaf2);
        c1.position.y = 1.5;
        const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 6), i % 2 ? leaf2 : leaf);
        c2.position.y = 2.2;
        [tr, c1, c2].forEach((m) => { m.castShadow = true; t.add(m); });
        t.position.set(x, 0, z);
        t.scale.setScalar(s);
        g.add(t);
      });
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2, r = 2.4 + Math.random() * 3.4;
        const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.25, 0), stone);
        st.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r);
        st.rotation.set(Math.random(), Math.random(), Math.random());
        st.castShadow = true;
        g.add(st);
      }
    }
    return g;
  }

  const island = makeIsland(1);
  scene.add(island);

  // Nest
  const straw = new THREE.MeshStandardMaterial({ color: '#c08a45', flatShading: true, roughness: 0.9 });
  const nest = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.42, 7, 18), straw);
  nest.rotation.x = Math.PI / 2;
  nest.position.y = 0.42;
  nest.castShadow = nest.receiveShadow = true;
  scene.add(nest);
  const stick = new THREE.CylinderGeometry(0.035, 0.035, 1.1, 4);
  const strawDark = new THREE.MeshStandardMaterial({ color: '#8f6230', roughness: 1 });
  for (let i = 0; i < (lowPower ? 18 : 40); i++) {
    const a = Math.random() * Math.PI * 2;
    const s = new THREE.Mesh(stick, i % 3 ? straw : strawDark);
    s.position.set(Math.cos(a) * (1.2 + (Math.random() - 0.5) * 0.6), 0.45 + Math.random() * 0.35, Math.sin(a) * (1.2 + (Math.random() - 0.5) * 0.6));
    s.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    scene.add(s);
  }

  // Prize egg
  const geo = eggGeometry(lowPower ? 36 : 56, lowPower ? 28 : 40);
  const texSize = lowPower ? 512 : 1024;
  const featuredMats = {};
  const getFeatured = (type) => (featuredMats[type] ||= eggMaterial(type, { physical: !lowPower, size: texSize }));
  const prize = new THREE.Mesh(geo, getFeatured('golden'));
  prize.position.set(0, 1.55, 0);
  prize.scale.setScalar(1.15);
  prize.castShadow = true;
  prize.userData = { kind: 'prize', jiggle: 0, pop: 0, spin: 0 };
  scene.add(prize);

  // Glow halo behind the prize egg
  const haloTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,214,120,.85)');
    g.addColorStop(0.4, 'rgba(255,150,70,.25)');
    g.addColorStop(1, 'rgba(255,120,60,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.setScalar(5.5);
  halo.position.copy(prize.position);
  scene.add(halo);

  // Security lasers + posts
  const postMat = new THREE.MeshStandardMaterial({ color: '#2b2440', metalness: 0.6, roughness: 0.35 });
  const lampMat = new THREE.MeshBasicMaterial({ color: '#ff3b5c' });
  const laserMat = new THREE.MeshBasicMaterial({ color: '#ff2e55', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const postPos = [0, 1, 2, 3].map((i) => {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    return new THREE.Vector3(Math.cos(a) * 2.7, 0, Math.sin(a) * 2.7);
  });
  postPos.forEach((p) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.6, 8), postMat);
    post.position.set(p.x, 1.3, p.z);
    post.castShadow = true;
    scene.add(post);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), lampMat);
    lamp.position.set(p.x, 2.65, p.z);
    scene.add(lamp);
  });
  const lasers = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      const a = postPos[i], b = postPos[(i + 1) % 4];
      const len = a.distanceTo(b);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 5), laserMat);
      beam.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
      beam.rotation.z = Math.PI / 2;
      beam.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      beam.userData = { phase: i * 0.8 + j * Math.PI, base: j ? 1.9 : 0.9 };
      scene.add(beam);
      lasers.push(beam);
    }
  }

  // Distant mini islands with their own eggs
  const minis = [];
  [[-17, -3, -14, 0.38], [18, -1, -10, 0.3], [-20, 2, 8, 0.26], [14, -6, 14, 0.32], [2, 4, -24, 0.34]].forEach(([x, y, z, s], i) => {
    const g = makeIsland(0);
    g.scale.setScalar(s);
    const e = new THREE.Mesh(geo, eggMaterial(['yeti', 'trex', 'phoenix', 'pastel', 'golden'][i], { physical: false, size: 512, seed: 40 + i }));
    e.scale.setScalar(2.4);
    e.position.y = 2.6;
    g.add(e);
    g.position.set(x, y, z);
    g.userData = { y, phase: i * 1.3 };
    scene.add(g);
    minis.push(g);
  });

  // Clouds
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#f3e8ff', flatShading: true, roughness: 1, transparent: true, opacity: 0.9 });
  const clouds = [];
  for (let i = 0; i < (lowPower ? 5 : 9); i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + Math.random() * 0.7, 0), cloudMat);
      b.position.set(k * 0.9 - 1.3, Math.random() * 0.4, (Math.random() - 0.5) * 0.6);
      c.add(b);
    }
    // keep clouds well outside the camera paths (cameras orbit at ~8–20 units): far ring, high or low band
    const a = (i / (lowPower ? 5 : 9)) * Math.PI * 2 + Math.random() * 0.4, r = 24 + Math.random() * 12;
    const y = i % 2 ? 9 + Math.random() * 5 : -9 + Math.random() * 3;
    c.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    c.scale.setScalar(0.8 + Math.random() * 0.9);
    c.userData = { a, r, speed: 0.01 + Math.random() * 0.02 };
    scene.add(c);
    clouds.push(c);
  }

  // Ambient sparkles
  const sparkCount = lowPower ? 140 : 320;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(sparkCount * 3);
  for (let i = 0; i < sparkCount; i++) {
    const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 11;
    sparkPos.set([Math.cos(a) * r, Math.random() * 8 - 1, Math.sin(a) * r], i * 3);
  }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const dotTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({ color: '#ffd98a', size: 0.18, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  scene.add(sparks);

  // ---------- Stealable floating eggs ----------
  const pool = [0, 1, 2, 3, 4, 5].map((s) => eggMaterial('pastel', { seed: 100 + s, physical: false, size: 512 }));
  const goldMat = eggMaterial('golden', { physical: false, size: 512, seed: 9 });
  const pickMat = () => {
    const jackpot = Math.random() < 0.1;
    const base = jackpot ? goldMat : pool[Math.floor(Math.random() * pool.length)];
    const mat = base.clone(); // own copy so hover glow is per-egg (textures stay shared)
    mat.userData = { ...base.userData };
    return { mat, jackpot };
  };
  const thieves = [];
  const N = 7;
  for (let i = 0; i < N; i++) {
    const { mat, jackpot } = pickMat();
    const e = new THREE.Mesh(geo, mat);
    e.castShadow = true;
    e.userData = {
      kind: 'loot', state: 'idle', jackpot,
      angle: (i / N) * Math.PI * 2, radius: 4.3 + (i % 3) * 0.8, height: 2.1 + (i % 4) * 0.55,
      speed: 0.12 + (i % 2) * 0.05, phase: i * 1.7, base: 0.36 + (i % 3) * 0.06,
      hover: 0, k: 0, timer: 0, from: new THREE.Vector3(),
    };
    e.scale.setScalar(e.userData.base);
    scene.add(e);
    thieves.push(e);
  }

  // Burst particles
  const bursts = [];
  function burst(at, color) {
    const n = 42;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2).normalize().multiplyScalar(2 + Math.random() * 3));
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color, size: 0.28, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const p = new THREE.Points(g, m);
    p.userData = { vel, life: 1 };
    scene.add(p);
    bursts.push(p);
  }

  // ---------- Interaction ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2(9, 9);
  const pointer = { x: 0, y: 0 };
  let hovered = null;
  let downAt = null;

  function pick(clientX, clientY) {
    ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = [prize, ...thieves.filter((t) => t.userData.state === 'idle')];
    const hit = ray.intersectObjects(targets, false)[0];
    return hit ? hit.object : null;
  }

  // canvas sits behind the page; listen on window and ignore events on interactive UI
  const isUi = (el) => el.closest('a,button,input,summary,details,.panel,.nav,.hud,[data-ui]');
  addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
    if (e.pointerType !== 'mouse') return;
    hovered = isUi(e.target) ? null : pick(e.clientX, e.clientY);
    document.body.classList.toggle('egg-hover', !!hovered);
  }, { passive: true });
  addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; }, { passive: true });
  addEventListener('pointerup', (e) => {
    if (!downAt || isUi(e.target)) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    if (moved > 12 || performance.now() - downAt.t > 600) return;
    const obj = pick(e.clientX, e.clientY);
    if (!obj) return;
    if (obj === prize) {
      prize.userData.jiggle = 1;
      alarm = 1;
      onGuarded();
    } else steal(obj);
  });

  let alarm = 0;
  const camDir = new THREE.Vector3();
  function steal(e) {
    const u = e.userData;
    u.state = 'stolen';
    u.k = 0;
    u.from.copy(e.position);
    burst(e.position, u.jackpot ? '#ffd23f' : '#ffffff');
    onSteal({ jackpot: u.jackpot, value: u.jackpot ? 5 : 1 });
    if (navigator.vibrate) navigator.vibrate(u.jackpot ? [20, 40, 20] : 15);
  }

  // ---------- Scroll-driven camera ----------
  let anchors = [];
  function measure(sections) {
    anchors = sections
      .map((el) => {
        const r = el.getBoundingClientRect();
        const top = r.top + scrollY;
        return { at: Math.max(0, top + r.height / 2 - innerHeight / 2), shot: SHOTS[el.dataset.cam] || SHOTS.hero };
      })
      .sort((a, b) => a.at - b.at);
    if (anchors.length) anchors[0].at = 0;
  }
  let sectionEls = [];

  const v3 = (a) => new THREE.Vector3(...a);
  const want = { pos: new THREE.Vector3(...SHOTS.hero.pos), look: new THREE.Vector3(...SHOTS.hero.look), off: SHOTS.hero.off, offY: 0 };
  const cur = { pos: want.pos.clone(), look: want.look.clone(), off: want.off, offY: 0 };
  let snapped = false;

  function shotFor(s) {
    const pos = v3(s.pos), look = v3(s.look);
    let off = s.off, offY = 0;
    if (mobile) {
      off = 0;
      offY = s.off === 0 ? 0 : 0.2; // panels sit low on phones → lift the island into the top half
      const d = pos.clone().sub(look);
      d.x *= 1.35; d.z *= 1.35; d.y *= 1.1;
      pos.copy(look).add(d);
    }
    return { pos, look, off, offY };
  }

  function targetShot() {
    if (!anchors.length) return shotFor(SHOTS.hero);
    const y = scrollY;
    let i = 0;
    while (i < anchors.length - 1 && y >= anchors[i + 1].at) i++;
    const a = shotFor(anchors[i].shot);
    if (i === anchors.length - 1) return a;
    const b = shotFor(anchors[i + 1].shot);
    const t = easeInOut(THREE.MathUtils.clamp((y - anchors[i].at) / (anchors[i + 1].at - anchors[i].at || 1), 0, 1));
    return { pos: a.pos.lerp(b.pos, t), look: a.look.lerp(b.look, t), off: a.off + (b.off - a.off) * t, offY: a.offY + (b.offY - a.offY) * t };
  }

  // ---------- Resize ----------
  function resize() {
    mobile = mq.matches;
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 55 : 42;
    camera.updateProjectionMatrix();
    measure(sectionEls);
  }
  addEventListener('resize', resize);

  // ---------- Loop ----------
  const clock = new THREE.Clock();
  let running = true;
  let firstFrame = null;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) clock.getDelta();
  });

  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (themeK !== themeTarget) {
      themeK += (themeTarget - themeK) * Math.min(1, dt * 3.5);
      if (Math.abs(themeK - themeTarget) <= 0.002) themeK = themeTarget;
      paintTheme(themeK);
    }
    const motion = reducedMotion ? 0.15 : 1;

    // camera
    const s = targetShot();
    want.pos.copy(s.pos);
    want.look.copy(s.look);
    want.off = s.off;
    want.offY = s.offY;
    if (!snapped) { cur.pos.copy(want.pos); cur.look.copy(want.look); cur.off = want.off; cur.offY = want.offY; snapped = true; }
    const damp = 1 - Math.exp(-dt * 3.2);
    cur.pos.lerp(want.pos, damp);
    cur.look.lerp(want.look, damp);
    cur.off += (want.off - cur.off) * damp;
    cur.offY += (want.offY - cur.offY) * damp;
    camera.position.copy(cur.pos);
    if (!mobile && !reducedMotion) {
      camera.position.x += pointer.x * 0.9;
      camera.position.y += -pointer.y * 0.5;
    }
    camera.position.y += Math.sin(t * 0.5) * 0.15 * motion;
    camera.lookAt(cur.look);
    const w = innerWidth, h = innerHeight;
    camera.setViewOffset(w, h, -cur.off * w, cur.offY * h, w, h);
    camera.getWorldDirection(camDir);

    // prize egg
    const pu = prize.userData;
    pu.jiggle = Math.max(0, pu.jiggle - dt * 1.6);
    pu.pop = Math.max(0, pu.pop - dt * 1.8);
    pu.spin = Math.max(0, pu.spin - dt * 1.4);
    prize.rotation.y += dt * (0.35 + pu.spin * 9) * motion;
    prize.rotation.z = Math.sin(t * 38) * 0.14 * pu.jiggle;
    prize.position.y = 1.55 + Math.sin(t * 1.4) * 0.06 * motion;
    prize.scale.setScalar(1.15 * (1 + Math.sin(pu.pop * Math.PI) * 0.18));
    halo.position.y = prize.position.y;
    halo.material.opacity = 0.75 + Math.sin(t * 2) * 0.15;
    eggLight.intensity = eggBase * (1 + Math.sin(t * 2) * 0.2);

    // lasers
    alarm = Math.max(0, alarm - dt * 0.7);
    lasers.forEach((l) => {
      l.position.y = l.userData.base + Math.sin(t * 1.2 + l.userData.phase) * 0.45 * motion;
    });
    laserMat.opacity = 0.55 + Math.sin(t * 6) * 0.15 + alarm * 0.4;
    laserMat.color.setHSL(0.97, 1, 0.55 + alarm * Math.abs(Math.sin(t * 20)) * 0.3);

    // loot eggs
    for (const e of thieves) {
      const u = e.userData;
      if (u.state === 'idle' || u.state === 'respawn') {
        const a = u.angle + t * u.speed * motion;
        e.position.set(Math.cos(a) * u.radius, u.height + Math.sin(t * 1.3 + u.phase) * 0.35 * motion, Math.sin(a) * u.radius);
        e.rotation.y += dt * 0.9;
        e.rotation.z = Math.sin(t + u.phase) * 0.25;
        u.hover += ((hovered === e ? 1 : 0) - u.hover) * Math.min(1, dt * 10);
        e.material.emissiveIntensity = e.material.userData.baseEmissive + u.hover * 0.35;
        if (u.state === 'respawn') {
          u.k = Math.min(1, u.k + dt / 0.7);
          e.scale.setScalar(u.base * Math.max(0.001, easeOutBack(u.k)));
          if (u.k >= 1) u.state = 'idle';
        } else e.scale.setScalar(u.base * (1 + u.hover * 0.2));
      } else if (u.state === 'stolen') {
        u.k = Math.min(1, u.k + dt / 0.55);
        const target = camera.position.clone().addScaledVector(camDir, 2.2);
        target.y -= 0.9;
        e.position.lerpVectors(u.from, target, u.k * u.k);
        e.rotation.y += dt * 14;
        e.scale.setScalar(u.base * (1 - u.k) * (1 + u.k));
        if (u.k >= 1) {
          u.state = 'gone';
          e.visible = false;
          u.timer = 2.2 + Math.random() * 1.5;
        }
      } else if (u.state === 'gone') {
        u.timer -= dt;
        if (u.timer <= 0) {
          const { mat, jackpot } = pickMat();
          e.material.dispose();
          e.material = mat;
          u.jackpot = jackpot;
          u.angle = Math.random() * Math.PI * 2;
          u.state = 'respawn';
          u.k = 0;
          e.scale.setScalar(0.001);
          e.visible = true;
        }
      }
    }
    if (hovered && hovered.userData.state !== 'idle' && hovered !== prize) hovered = null;

    // bursts
    for (let i = bursts.length - 1; i >= 0; i--) {
      const p = bursts[i];
      const u = p.userData;
      u.life -= dt * 1.4;
      const pos = p.geometry.attributes.position;
      u.vel.forEach((v, k) => {
        v.y -= dt * 3;
        pos.setXYZ(k, pos.getX(k) + v.x * dt, pos.getY(k) + v.y * dt, pos.getZ(k) + v.z * dt);
      });
      pos.needsUpdate = true;
      p.material.opacity = Math.max(0, u.life);
      if (u.life <= 0) {
        scene.remove(p);
        p.geometry.dispose();
        p.material.dispose();
        bursts.splice(i, 1);
      }
    }

    // ambience
    minis.forEach((m) => {
      m.position.y = m.userData.y + Math.sin(t * 0.6 + m.userData.phase) * 0.5 * motion;
      m.rotation.y += dt * 0.05 * motion;
    });
    clouds.forEach((c) => {
      c.userData.a += dt * c.userData.speed * motion;
      c.position.x = Math.cos(c.userData.a) * c.userData.r;
      c.position.z = Math.sin(c.userData.a) * c.userData.r;
    });
    sparks.rotation.y += dt * 0.04 * motion;
    stars.rotation.y += dt * 0.004 * motion;

    renderer.render(scene, camera);
    if (firstFrame) { firstFrame(); firstFrame = null; }
  }

  // ---------- Theme blending ----------
  const su = sky.material.uniforms;
  let themeTarget = theme === 'light' ? 1 : 0;
  let themeK = themeTarget;
  let eggBase = 10;
  const D = PALETTES.dark, L = PALETTES.light;
  const mixC = (out, k, key) => out.copy(D[key]).lerp(L[key], k);
  const mixN = (k, key) => D[key] + (L[key] - D[key]) * k;
  function paintTheme(k) {
    mixC(su.top.value, k, 'top'); mixC(su.mid.value, k, 'mid'); mixC(su.glow.value, k, 'glow'); mixC(su.low.value, k, 'low');
    mixC(scene.fog.color, k, 'fog');
    mixC(hemi.color, k, 'hemiSky'); mixC(hemi.groundColor, k, 'hemiGround'); hemi.intensity = mixN(k, 'hemi');
    mixC(moon.color, k, 'sun'); moon.intensity = mixN(k, 'sunI'); rim.intensity = mixN(k, 'rimI');
    stars.material.opacity = mixN(k, 'stars'); stars.visible = stars.material.opacity > 0.01;
    sparks.material.opacity = mixN(k, 'sparks');
    scene.environmentIntensity = mixN(k, 'env');
    renderer.toneMappingExposure = mixN(k, 'exposure');
    eggBase = mixN(k, 'eggLight');
  }
  paintTheme(themeK);

  return {
    setTheme(name) {
      themeTarget = name === 'light' ? 1 : 0;
      if (reducedMotion) { themeK = themeTarget; paintTheme(themeK); }
    },
    start(sections, onFirstFrame) {
      sectionEls = sections;
      firstFrame = onFirstFrame;
      resize();
      renderer.setAnimationLoop(frame);
    },
    remeasure: () => measure(sectionEls),
    setFeatured(type) {
      prize.material = getFeatured(type);
      prize.userData.pop = 1;
      prize.userData.spin = 1;
      const col = { golden: '#ffc45a', yeti: '#9fd6ff', trex: '#9cff7a', phoenix: '#ff6a2a' }[type] || '#ffc45a';
      eggLight.color.set(col);
      halo.material.color.set(col);
      burst(prize.position, col);
    },
  };
}
