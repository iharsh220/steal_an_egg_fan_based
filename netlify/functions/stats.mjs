// Netlify Function (Node.js) — GET /api/stats
// Proxies Roblox's public APIs (browsers can't call them directly because of CORS) and returns
// live game stats, badge award counts and game-pass prices. Anything that fails falls back to the
// snapshot in src/data/roblox.json (refresh it with `npm run assets`).

import SNAPSHOT from '../../src/data/roblox.json';

const UNIVERSE_ID = SNAPSHOT.universeId;

async function getJson(url) {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'stealanegg-site/1.0' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

export default async function handler() {
  const [games, votes, badges, passes] = await Promise.allSettled([
    getJson(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE_ID}`),
    getJson(`https://games.roblox.com/v1/games/votes?universeIds=${UNIVERSE_ID}`),
    getJson(`https://badges.roblox.com/v1/universes/${UNIVERSE_ID}/badges?limit=100&sortOrder=Asc`),
    getJson(`https://apis.roblox.com/game-passes/v1/universes/${UNIVERSE_ID}/game-passes?passView=Full&pageSize=50`),
  ]);

  const g = games.status === 'fulfilled' ? games.value?.data?.[0] : null;
  const v = votes.status === 'fulfilled' ? votes.value?.data?.[0] : null;
  const s = SNAPSHOT.stats;

  const body = {
    live: !!g,
    checkedAt: g ? new Date().toISOString() : SNAPSHOT.checkedAt,
    playing: g?.playing ?? s.playing,
    visits: g?.visits ?? s.visits,
    favorites: g?.favoritedCount ?? s.favorites,
    maxPlayers: g?.maxPlayers ?? s.maxPlayers,
    updated: g?.updated ?? s.updated,
    upVotes: v?.upVotes ?? s.upVotes,
    downVotes: v?.downVotes ?? s.downVotes,
    rating: v && v.upVotes + v.downVotes > 0 ? Math.round((v.upVotes / (v.upVotes + v.downVotes)) * 1000) / 10 : s.rating,
    // live award counts keyed by badge id (the page already has names + icons from the snapshot)
    badges: badges.status === 'fulfilled'
      ? Object.fromEntries(badges.value.data.map((b) => [b.id, { awarded: b.statistics?.awardedCount, enabled: b.enabled, name: b.name }]))
      : null,
    passes: passes.status === 'fulfilled'
      ? Object.fromEntries(passes.value.gamePasses.map((p) => [p.id, { price: p.price, forSale: p.isForSale, name: p.name }]))
      : null,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'netlify-cdn-cache-control': 'public, s-maxage=120, stale-while-revalidate=300',
    },
  });
}

export const config = { path: '/api/stats' };
