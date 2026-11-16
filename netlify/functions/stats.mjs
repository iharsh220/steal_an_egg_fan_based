// Netlify Function (Node.js) — GET /api/stats
// Proxies Roblox's public games API (which browsers can't call directly because of CORS)
// and returns a small JSON payload. Falls back to the last checked snapshot on failure.

const UNIVERSE_ID = '10563114921';

export const SNAPSHOT = {
  live: false,
  checkedAt: '2026-09-26',
  playing: 2196742,
  visits: 5336476160,
  favorites: 5734145,
  upVotes: 2789416,
  downVotes: null,
  rating: 92.7,
  maxPlayers: 7,
};

async function getJson(url) {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'stealanegg-site/1.0' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

export default async function handler() {
  let body;
  try {
    const [games, votes] = await Promise.all([
      getJson(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE_ID}`),
      getJson(`https://games.roblox.com/v1/games/votes?universeIds=${UNIVERSE_ID}`).catch(() => null),
    ]);
    const g = games?.data?.[0];
    if (!g) throw new Error('No game data');
    const v = votes?.data?.[0];
    const up = v ? v.upVotes : SNAPSHOT.upVotes;
    const down = v ? v.downVotes : null;
    body = {
      live: true,
      checkedAt: new Date().toISOString(),
      playing: g.playing,
      visits: g.visits,
      favorites: g.favoritedCount,
      maxPlayers: g.maxPlayers,
      upVotes: up,
      downVotes: down,
      rating: v && up + down > 0 ? Math.round((up / (up + down)) * 1000) / 10 : SNAPSHOT.rating,
      updated: g.updated,
    };
  } catch (err) {
    body = { ...SNAPSHOT, error: 'live-unavailable' };
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // browsers: 60s, Netlify edge cache: 2 min (keeps Roblox API calls low)
      'cache-control': 'public, max-age=60',
      'netlify-cdn-cache-control': 'public, s-maxage=120, stale-while-revalidate=300',
    },
  });
}

export const config = { path: '/api/stats' };
