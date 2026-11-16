#!/usr/bin/env node
// Downloads the official Roblox-hosted images + data for the game and stores them locally.
// (Roblox CDN image links expire after ~180 days, so we keep our own copies.)
//
//   npm run assets
//
// Writes:  public/images/badges/*.png, public/images/passes/*.png, public/images/art/*.webp
//          src/data/roblox.json   (snapshot used by the page + as fallback by /api/stats)

import fs from 'node:fs';

const UNIVERSE = '10563114921';
const PLACE = '107778070777162';
const headers = { accept: 'application/json', 'user-agent': 'stealanegg-site-build/1.0' };
const json = async (u) => { const r = await fetch(u, { headers }); if (!r.ok) throw new Error(`${u} → ${r.status}`); return r.json(); };
const save = async (u, file) => {
  const r = await fetch(u, { headers: { 'user-agent': headers['user-agent'] } });
  if (!r.ok) throw new Error(`${u} → ${r.status}`);
  fs.writeFileSync(`public${file}`, Buffer.from(await r.arrayBuffer()));
  return file;
};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
for (const d of ['public/images/badges', 'public/images/passes', 'public/images/art', 'src/data']) fs.mkdirSync(d, { recursive: true });

const today = new Date().toISOString().slice(0, 10);

// --- game stats ---
const g = (await json(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE}`)).data[0];
const v = (await json(`https://games.roblox.com/v1/games/votes?universeIds=${UNIVERSE}`)).data[0];

// --- badges ---
const badges = (await json(`https://badges.roblox.com/v1/universes/${UNIVERSE}/badges?limit=100&sortOrder=Asc`)).data;
const bIcons = Object.fromEntries((await json(`https://thumbnails.roblox.com/v1/badges/icons?badgeIds=${badges.map((b) => b.id).join(',')}&size=150x150&format=Png&isCircular=false`)).data.map((d) => [d.targetId, d.imageUrl]));
const badgeOut = [];
for (const b of badges) {
  badgeOut.push({
    id: b.id, name: b.name, enabled: b.enabled, awarded: b.statistics.awardedCount, created: b.created.slice(0, 10),
    icon: bIcons[b.id] ? await save(bIcons[b.id], `/images/badges/${slug(b.name)}.png`) : null,
    url: `https://www.roblox.com/badges/${b.id}/${slug(b.name)}`,
  });
}

// --- game passes ---
const passes = (await json(`https://apis.roblox.com/game-passes/v1/universes/${UNIVERSE}/game-passes?passView=Full&pageSize=50`)).gamePasses;
const pIcons = Object.fromEntries((await json(`https://thumbnails.roblox.com/v1/game-passes?gamePassIds=${passes.map((p) => p.id).join(',')}&size=150x150&format=Png&isCircular=false`)).data.map((d) => [d.targetId, d.imageUrl]));
const passOut = [];
for (const p of passes) {
  passOut.push({
    id: p.id, name: p.name, desc: p.displayDescription, price: p.price, forSale: p.isForSale,
    icon: pIcons[p.id] ? await save(pIcons[p.id], `/images/passes/${slug(p.name)}.png`) : null,
    url: `https://www.roblox.com/game-pass/${p.id}/${slug(p.name)}`,
  });
}

// --- artwork ---
const thumbs = (await json(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${UNIVERSE}&countPerUniverse=10&defaults=true&size=768x432&format=Webp&isCircular=false`)).data[0].thumbnails;
const art = [];
for (const [i, t] of thumbs.entries()) if (t.imageUrl) art.push(await save(t.imageUrl, `/images/art/thumb-${i + 1}.webp`));
const icon = (await json(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${UNIVERSE}&returnPolicy=PlaceHolder&size=512x512&format=Webp&isCircular=false`)).data[0].imageUrl;
await save(icon, '/images/art/game-icon.webp');

const out = {
  checkedAt: today, universeId: UNIVERSE, placeId: PLACE, creator: g.creator?.name,
  stats: { playing: g.playing, visits: g.visits, favorites: g.favoritedCount, maxPlayers: g.maxPlayers, upVotes: v.upVotes, downVotes: v.downVotes, rating: Math.round((v.upVotes / (v.upVotes + v.downVotes)) * 1000) / 10, updated: g.updated },
  badges: badgeOut, passes: passOut, art, icon: '/images/art/game-icon.webp',
};
fs.writeFileSync('src/data/roblox.json', JSON.stringify(out, null, 2));
console.log(`Saved ${badgeOut.length} badges, ${passOut.length} passes, ${art.length} artworks → src/data/roblox.json (checked ${today})`);
