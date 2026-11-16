# StealAnEgg.net: 3D fan guide

Interactive 3D fan site for the Roblox game **Steal An Egg**, built with **Three.js + Vite**. A **Node.js Netlify Function** serves live Roblox stats.

## Features
- Full-screen 3D floating island with a guarded prize egg. The camera flies to a new shot for each section as you scroll.
- Mini-game: tap or click the floating eggs to steal them. It tracks a counter and ranks, and golden eggs give a +5 jackpot. The count is saved in the browser.
- Disclaimer popup on every visit: the site appears only after the visitor accepts that it is an unofficial fan-made demo.
- Picture-to-3D egg: `npm run egg` builds the 3D egg (shape and texture) from `egg-source/egg.jpeg`. The nest egg, the Phoenix tab and the recoloured floating eggs all use it.
- Egg Index: switch the nest egg between Eternal Phoenix (your egg), Yeti and Trex.
- Bloom glow, rising embers and a glowing ring (desktop), plus a marquee band and gradient-bordered glass panels.
- Live stats come from `/api/stats` (players, visits, favorites, rating). If Roblox can't be reached, the page shows the last snapshot.
- Theme: **System** (follows the device), **Light** (daytime sky) or **Dark** (night sky). The choice is saved, and the page doesn't flash the wrong theme while loading.
- Responsive and mobile-friendly. Lower GPU settings on phones, respects reduced motion, and has a fallback if WebGL isn't available.

## Run locally
```bash
npm install
npm run dev        # http://localhost:5173  (the /api/stats function also runs locally)
npm run build      # outputs to dist/
npm run preview
npm run egg        # rebuild the 3D egg from egg-source/egg.jpeg (or: npm run egg -- my-egg.png)
```

## Deploy to Netlify
`netlify.toml` already holds the build settings (`npm run build` → `dist`, functions in `netlify/functions`, Node 20).

1. **Git:** push this folder to GitHub/GitLab. In Netlify, choose **Add new site → Import an existing project**, pick the repo and deploy. No extra settings are needed.
2. **CLI:** `npm i -g netlify-cli && netlify login && netlify deploy --build --prod`

Then add your domain under **Domain management**.

## Updating content
- Event, guide, passes, badges and FAQ text live in `index.html`.
- Egg descriptions: `EGGS` in `src/main.js`.
- Fallback stats snapshot: `SNAPSHOT` in `netlify/functions/stats.mjs`.
- Camera shots per section: `SHOTS` in `src/world.js`.
- Day/night 3D colors: `PALETTES` in `src/world.js`. Page colors: the `:root` tokens in `src/styles.css`.

Independent fan guide. Not affiliated with Roblox Corporation or the game's developer.
