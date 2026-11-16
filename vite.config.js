import { defineConfig } from 'vite';

// In local dev, serve /api/stats by running the same Netlify Function code in Node,
// so `npm run dev` behaves like production without needing the Netlify CLI.
const devApi = () => ({
  name: 'dev-netlify-functions',
  configureServer(server) {
    server.middlewares.use('/api/stats', async (_req, res) => {
      try {
        const mod = await server.ssrLoadModule('/netlify/functions/stats.mjs');
        const out = await mod.default(new Request('http://localhost/api/stats'));
        res.statusCode = out.status;
        out.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await out.text());
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
  },
});

export default defineConfig({
  plugins: [devApi()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
