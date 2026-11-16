// Scroll-driven egg hatch: the prize egg cracks, bursts into shell shards, and the ArchAngel rises.
// Everything is a pure function of progress p (0…1), so scrolling back up plays it in reverse.
//
//   p 0.00–0.38  crack: shaking, glowing crack lines, swelling light
//   p 0.36–0.90  burst: shell shards fly out + fade, flash, shockwave ring
//   p 0.42–0.90  rise : light pillar, god rays, ArchAngel scales up out of the nest
//
// Theme: dark → white ArchAngel, light → black ArchAngel (crossfaded with the theme blend).

import * as THREE from 'three';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const bell = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// glowing crack lines that wrap around the egg (same UV layout as the egg texture)
function crackTexture() {
  return canvasTex(1024, 512, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.lineCap = 'round';
    x.lineJoin = 'round';
    const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const crack = (sx, sy, len, ang, width, depth) => {
      let px = sx, py = sy;
      x.beginPath();
      x.moveTo(px, py);
      for (let i = 0; i < len; i++) {
        ang += (rnd() - 0.5) * 1.1;
        px += Math.cos(ang) * 14; py += Math.sin(ang) * 14;
        x.lineTo(px, py);
        if (depth < 2 && rnd() < 0.12) { x.stroke(); crack(px, py, len * 0.5, ang + (rnd() - 0.5) * 2, width * 0.6, depth + 1); x.beginPath(); x.moveTo(px, py); }
      }
      x.lineWidth = width;
      x.stroke();
    };
    for (const pass of [{ c: 'rgba(255,170,60,0.55)', w: 14 }, { c: 'rgba(255,245,200,1)', w: 4 }]) {
      x.strokeStyle = pass.c;
      x.shadowColor = 'rgba(255,200,90,1)';
      x.shadowBlur = pass.w * 2;
      const r0 = rnd; void r0;
      for (let i = 0; i < 9; i++) crack((i / 9) * w + 40, h * (0.25 + (i % 3) * 0.2), 22, (i % 2 ? 0.3 : -0.3) + Math.PI * (i % 2), pass.w, 0);
    }
  });
}

function raysTexture() {
  return canvasTex(512, 512, (x, w, h) => {
    x.translate(w / 2, h / 2);
    const n = 18;
    for (let i = 0; i < n; i++) {
      x.rotate((Math.PI * 2) / n);
      const g = x.createLinearGradient(0, 0, 0, -w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(-6, 0);
      x.lineTo(-(i % 2 ? 22 : 34), -w / 2);
      x.lineTo(i % 2 ? 22 : 34, -w / 2);
      x.lineTo(6, 0);
      x.fill();
    }
  });
}

function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,220,150,0.35)') {
  return canvasTex(256, 256, (x, w) => {
    const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, mid);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, w, w);
  });
}

export function createHatch({ scene, prize, geo, profile, eggMaterial, dotTex, lowPower, angelUrls }) {
  const group = new THREE.Group();
  scene.add(group);
  const base = new THREE.Vector3(0, 0.45, 0); // top of the nest

  // --- glowing cracks: a second skin on the egg, additive ---
  const crackMat = new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const cracks = new THREE.Mesh(geo, crackMat);
  cracks.scale.setScalar(1.004);
  prize.add(cracks);

  // --- shell shards: small curved triangles sampled on the egg surface ---
  const pts = profile.points; // [r, y] bottom → top
  const radiusAt = (y) => {
    for (let i = 1; i < pts.length; i++) if (pts[i][1] >= y) {
      const [r0, y0] = pts[i - 1], [r1, y1] = pts[i];
      return r0 + (r1 - r0) * ((y - y0) / (y1 - y0 || 1));
    }
    return 0;
  };
  const shardCount = lowPower ? 26 : 44;
  const shards = [];
  // share the egg's material so shards show the real egg texture (it loads asynchronously)
  const shardMat = eggMaterial;
  shardMat.side = THREE.DoubleSide;
  for (let i = 0; i < shardCount; i++) {
    const y = -0.85 + Math.random() * 1.7;
    const a = Math.random() * Math.PI * 2;
    const r = radiusAt(y);
    const s = 0.16 + Math.random() * 0.22;
    const g = new THREE.BufferGeometry();
    // a slightly bent triangle so shards catch the light
    const v = new Float32Array([-s, -s * 0.7, 0, s * 0.9, -s * 0.5, 0.04, (Math.random() - 0.5) * s, s, -0.03]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    const u = 0.5 + Math.random() * 0.2 - 0.1, vv = (y + 1) / 2;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([u, vv, u + 0.05, vv, u + 0.02, vv + 0.06]), 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, shardMat);
    const local = new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
    const dir = new THREE.Vector3(Math.sin(a), 0.35 + y * 0.6 + Math.random() * 0.5, Math.cos(a)).normalize();
    m.userData = { local, dir, dist: 2.2 + Math.random() * 3.2, spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), delay: Math.random() * 0.12 };
    m.visible = false;
    group.add(m);
    shards.push(m);
  }

  // --- flash + shockwave ---
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }));
  group.add(flash);
  const shock = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 64),
    new THREE.MeshBasicMaterial({ color: '#ffe3a1', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  );
  shock.rotation.x = -Math.PI / 2;
  shock.position.copy(base).add(new THREE.Vector3(0, 0.2, 0));
  group.add(shock);

  // --- light pillar ---
  const pillarMat = new THREE.MeshBasicMaterial({
    map: canvasTex(4, 256, (x, w, h) => { const g = x.createLinearGradient(0, h, 0, 0); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }),
    color: '#ffe9b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.25, 9, 32, 1, true), pillarMat);
  pillar.position.copy(base).add(new THREE.Vector3(0, 4.5, 0));
  group.add(pillar);

  // --- ArchAngel: camera-facing quads with a live "shine" shader ---
  //   • a bright streak sweeps diagonally across the armour on a loop
  //   • a pulsing glow outline hugs the silhouette (gold on the white angel, violet on the black one)
  //   • bright pixels twinkle
  const loader = new THREE.TextureLoader();
  const ANGEL_H = 4.4;
  const PAD = 1.12; // quad is a bit larger than the image so the outline glow isn't clipped
  const angelGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); // origin at the feet
  const angelVert = `
    varying vec2 vUv;
    uniform float pad;
    void main() {
      vUv = (uv - 0.5) * pad + 0.5;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const angelFrag = `
    #include <common>
    uniform sampler2D map;
    uniform float opacity, time, glowAmt, ready, gain, contrast;
    uniform vec3 glowColor, shineColor;
    uniform vec2 texel;
    varying vec2 vUv;
    float A(vec2 uv) { return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? 0.0 : texture2D(map, uv).a; }
    void main() {
      if (ready < 0.5) discard;
      vec4 c = (vUv.x < 0.0 || vUv.y < 0.0 || vUv.x > 1.0 || vUv.y > 1.0) ? vec4(0.0) : texture2D(map, vUv);
      // outline glow: how much silhouette is nearby (two rings of samples)
      float g = 0.0;
      for (int i = 0; i < 12; i++) {
        float a = float(i) / 12.0 * 6.2831853;
        vec2 d = vec2(cos(a), sin(a)) * texel;
        g = max(g, A(vUv + d * 7.0));
        g = max(g, A(vUv + d * 15.0) * 0.55);
        g = max(g, A(vUv + d * 24.0) * 0.25);
      }
      float outer = clamp(g - c.a, 0.0, 1.0);
      float pulse = 0.72 + 0.28 * sin(time * 2.3);
      // sweeping shine band (diagonal), with a thin secondary streak
      float sweep = fract(time * 0.16);
      float d = (vUv.x * 0.85 + (1.0 - vUv.y) * 0.65) - (sweep * 3.0 - 0.75);
      float band = exp(-d * d * 70.0) + 0.6 * exp(-pow(d + 0.13, 2.0) * 500.0);
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      vec3 col = pow(max(c.rgb, 0.0), vec3(contrast)) * gain * (1.0 + 0.06 * sin(time * 1.7)); // contrast curve keeps armour detail readable
      col += shineColor * band * (0.45 + lum * 1.2);
      // twinkling glints on bright detail
      float tw = smoothstep(0.55, 0.85, lum) * pow(0.5 + 0.5 * sin(time * 5.0 + vUv.x * 90.0 + vUv.y * 70.0), 6.0);
      col += shineColor * tw * 0.9;
      vec3 rgb = col * c.a + glowColor * outer * glowAmt * pulse;
      float alpha = clamp(c.a + outer * glowAmt * pulse * 0.9, 0.0, 1.0);
      if (alpha < 0.003) discard;
      gl_FragColor = vec4(rgb / max(alpha, 1e-4), alpha * opacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  const makeAngel = (url, glowColor, shineColor, gain = 1, contrast = 1) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null }, opacity: { value: 0 }, time: { value: 0 }, ready: { value: 0 },
        glowAmt: { value: 0.9 }, pad: { value: PAD }, gain: { value: gain }, contrast: { value: contrast },
        glowColor: { value: new THREE.Color(glowColor) }, shineColor: { value: new THREE.Color(shineColor) },
        texel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
      },
      vertexShader: angelVert,
      fragmentShader: angelFrag,
      transparent: true,
      depthWrite: false,
    });
    const s = new THREE.Mesh(angelGeo, mat);
    s.visible = false;
    s.userData.aspect = 1;
    // texture is fetched lazily (see ensure()), so only the current theme's image is downloaded
    s.userData.load = () => loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      mat.uniforms.map.value = tex;
      mat.uniforms.texel.value.set(1 / tex.image.width, 1 / tex.image.height);
      mat.uniforms.ready.value = 1;
      s.userData.aspect = tex.image.width / tex.image.height;
    });
    group.add(s);
    return s;
  };
  // white angel slightly dimmed so bloom only catches the moving shine, not the whole body
  const angelWhite = makeAngel(angelUrls.white, '#ffc861', '#fff3d6', 0.95, 1.6);
  const angelBlack = makeAngel(angelUrls.black, '#b56bff', '#f0d6ff');
  // Where the character's body centre (u, 0–1 from the left) and feet (v, 0–1 from the bottom) are
  // inside each cut-out PNG — the spear/aura make the images off-centre. Measured from
  // src/assets/archangel-*.png; re-measure if those images change.
  angelWhite.userData.anchor = { u: 0.527, v: 0.044 };
  angelBlack.userData.anchor = { u: 0.519, v: 0.027 };

  // twinkling star sparkles drifting up around the angel
  const sparkN = lowPower ? 40 : 90;
  const sparkGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(sparkN * 3), ph = new Float32Array(sparkN);
  for (let i = 0; i < sparkN; i++) {
    sp.set([(Math.random() - 0.5) * 1.3, Math.random(), (Math.random() - 0.5) * 0.4], i * 3);
    ph[i] = Math.random() * 6.28;
  }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sparkGeo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 0 }, color: { value: new THREE.Color('#fff2c8') }, scale: { value: 1 } },
    vertexShader: `
      attribute float phase; uniform float time, scale; varying float vTw;
      void main() {
        vec3 p = position; p.y = fract(p.y + time * 0.05 + phase * 0.1);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vTw = pow(abs(sin(time * 1.8 + phase * 3.0)), 4.0);
        gl_PointSize = (4.0 + 14.0 * vTw) * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float opacity; uniform vec3 color; varying float vTw;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float core = exp(-dot(q, q) * 40.0);
        float star = exp(-abs(q.x) * 40.0) * exp(-abs(q.y) * 6.0) + exp(-abs(q.y) * 40.0) * exp(-abs(q.x) * 6.0);
        float a = (core + star * 0.8) * (0.25 + vTw) * opacity;
        gl_FragColor = vec4(color * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sparkles = new THREE.Points(sparkGeo, sparkMat);
  sparkles.frustumCulled = false;
  group.add(sparkles);
  // draw order: glow/rays first, then the angel, then sparkles on top
  angelWhite.renderOrder = angelBlack.renderOrder = 2;
  sparkles.renderOrder = 3;
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,0.9)', 'rgba(200,180,255,0.3)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }));
  group.add(glowSprite);
  const rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: raysTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }));
  group.add(rays);

  const tmp = new THREE.Vector3();
  let pulse = 0;

  return {
    targets: [angelWhite, angelBlack],
    pulse() { pulse = 1; },
    /** p: hatch progress 0…1, k: theme blend (0 dark, 1 light) */
    update(p, t, dt, k, motion, eggLight, halo, camera) {
      pulse = Math.max(0, pulse - dt * 1.5);

      // 1) crack phase — shake, glow, swell
      const crack = smooth(0.02, 0.36, p);
      const shake = crack * (0.06 + crack * 0.12) * (motion > 0.5 ? 1 : 0.3);
      prize.rotation.z += Math.sin(t * 47) * shake;
      prize.rotation.x = Math.sin(t * 39) * shake * 0.6;
      prize.position.x = Math.sin(t * 53) * shake * 0.25;
      prize.scale.multiplyScalar(1 + crack * 0.07);
      crackMat.opacity = crack;
      const broken = p > 0.38;
      prize.userData.hatched = broken;
      if (prize.material.emissiveIntensity !== undefined) {
        const base0 = prize.material.userData.baseEmissive ?? 0.2;
        prize.material.emissiveIntensity = base0 + crack * 0.9;
      }

      // 2) burst — shards, flash, shockwave
      const burstT = clamp01((p - 0.36) / 0.54);
      shards.forEach((m) => {
        const u = m.userData;
        const s = clamp01((burstT - u.delay) / (1 - u.delay));
        m.visible = burstT > 0 && s < 1;
        if (!m.visible) return;
        const e = easeOutCubic(s);
        tmp.copy(u.local).multiplyScalar(1.15);
        m.position.set(tmp.x, tmp.y + 1.55, tmp.z).addScaledVector(u.dir, e * u.dist);
        m.position.y -= s * s * 1.6; // a little gravity
        m.rotation.set(u.spin.x * e, u.spin.y * e, u.spin.z * e);
        m.scale.setScalar(1 - smooth(0.45, 0.9, s));
      });
      const f = bell(p, 0.4, 0.06);
      flash.material.opacity = f * 0.55;
      flash.scale.setScalar(2 + f * 6);
      flash.position.set(0, 1.6, 0);
      const sh = clamp01((p - 0.37) / 0.3);
      shock.material.opacity = sh > 0 && sh < 1 ? (1 - sh) * 0.9 : 0;
      shock.scale.setScalar(1 + sh * 6);

      // 3) rise — pillar, rays, ArchAngel
      const rise = smooth(0.42, 0.9, p);
      const pop = easeOutBack(clamp01((p - 0.42) / 0.48));
      pillarMat.opacity = bell(p, 0.55, 0.13) * 0.8; // only during the reveal
      pillar.scale.set(1 + bell(p, 0.5, 0.1) * 0.4, 0.3 + smooth(0.38, 0.6, p) * 0.7, 1 + bell(p, 0.5, 0.1) * 0.4);
      pillar.rotation.y += dt * 0.6;

      const h = ANGEL_H * Math.max(0.001, pop) * (1 + pulse * 0.06);
      const yLift = (1 - rise) * -0.6 + Math.sin(t * 1.2) * 0.08 * rise * motion;
      // billboard: face the camera, but stay upright (yaw only)
      const yaw = Math.atan2(camera.position.x, camera.position.z);
      for (const [s, op] of [[angelWhite, 1 - k], [angelBlack, k]]) {
        if (op > 0.01 && !s.userData.requested) { s.userData.requested = true; s.userData.load(); }
        s.visible = rise > 0.001 && op > 0.01;
        const aspect = s.userData.aspect || 1;
        const { u: au, v: av } = s.userData.anchor;
        s.scale.set(h * aspect * PAD, h * PAD, 1);
        // stand in the centre of the nest ring: body centre on the nest axis, feet on the nest
        const dx = (au - 0.5) * h * aspect;
        s.position.set(-dx * Math.cos(yaw), base.y + yLift - ((av - 0.5) * h + 0.5 * h * PAD), dx * Math.sin(yaw));
        s.rotation.set(0, yaw, 0);
        const u = s.material.uniforms;
        u.opacity.value = rise * op;
        u.time.value = t * (motion > 0.5 ? 1 : 0.25);
        u.glowAmt.value = 0.5 + pulse * 0.5;
      }
      sparkles.visible = rise > 0.01;
      sparkles.position.set(0, base.y + yLift, 0);
      sparkles.rotation.set(0, yaw, 0);
      sparkles.scale.set(h * 1.2, h, h);
      sparkMat.uniforms.time.value = t;
      sparkMat.uniforms.opacity.value = rise * (motion > 0.5 ? 1 : 0.4);
      sparkMat.uniforms.scale.value = innerHeight * 0.06;
      sparkMat.uniforms.color.value.setRGB(1, 0.95 - k * 0.15, 0.8 + k * 0.2);
      // the white angel needs a warm glow on dark; the black angel a violet one on light
      glowSprite.material.color.setRGB(1 - k * 0.3, 0.9 - k * 0.4, 1);
      // glow + rays always sit BEHIND the angel as seen from the camera
      const bx = -Math.sin(yaw) * 0.25, bz = -Math.cos(yaw) * 0.25;
      glowSprite.material.opacity = rise * (0.1 + k * 0.08) + pulse * 0.25;
      glowSprite.scale.setScalar(h * 1.4);
      glowSprite.position.set(bx, base.y + yLift + h * 0.5, bz);
      rays.material.opacity = rise * (0.07 + k * 0.08) + bell(p, 0.5, 0.12) * 0.25;
      rays.material.rotation += dt * 0.15 * motion;
      rays.material.color.setRGB(1, 0.92 - k * 0.3, 0.75 + k * 0.25);
      rays.scale.setScalar(h * 1.9);
      rays.position.set(bx * 1.6, base.y + yLift + h * 0.55, bz * 1.6);

      // light: builds while cracking, peaks at the burst, then the angel's own glow
      eggLight.intensity *= 1 + crack * 1.5 + f * 2.5;
      halo.material.opacity *= 1 - rise * 0.6;
      halo.scale.setScalar(5.5 + crack * 2.5);
    },
  };
}
