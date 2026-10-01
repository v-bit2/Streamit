import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const UPSTREAM_BASE = 'https://moviebox-api-1-u2go.onrender.com';
const FAKE_ORIGIN = 'https://cinexora-static-alpha.vercel.app';

// Every proxied request forwards to the real MovieBox/Cinexora backend with
// a spoofed Referer/Origin so it looks like it's coming from the real
// Cinexora site, not a direct/foreign request.
async function upstreamFetch(urlPath, { binary = false } = {}) {
  return fetch(`${UPSTREAM_BASE}${urlPath}`, {
    headers: {
      'Referer': `${FAKE_ORIGIN}/`,
      'Origin': FAKE_ORIGIN,
      'Accept': binary ? '*/*' : 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    },
  });
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/trending', async (req, res) => {
  try {
    const r = await upstreamFetch('/api/trending');
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: 'Upstream fetch failed', message: e.message });
  }
});

app.get('/api/homepage', async (req, res) => {
  try {
    const r = await upstreamFetch('/api/homepage');
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: 'Upstream fetch failed', message: e.message });
  }
});

app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'Missing query param: q' });
  try {
    const r = await upstreamFetch(`/api/search/${encodeURIComponent(q)}`);
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: 'Upstream fetch failed', message: e.message });
  }
});

app.get('/api/info', async (req, res) => {
  const { id, detailPath } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing query param: id' });
  let urlPath = `/api/info/${encodeURIComponent(id)}`;
  if (detailPath) urlPath += `?detailPath=${encodeURIComponent(detailPath)}`;
  try {
    const r = await upstreamFetch(urlPath);
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: 'Upstream fetch failed', message: e.message });
  }
});

app.get('/api/sources', async (req, res) => {
  const { id, season, episode, detailPath } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing query param: id' });
  const params = new URLSearchParams();
  if (season && episode) {
    params.set('season', season);
    params.set('episode', episode);
  }
  if (detailPath) params.set('detailPath', detailPath);
  const qs = params.toString();
  const urlPath = `/api/sources/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;
  try {
    const r = await upstreamFetch(urlPath);
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: 'Upstream fetch failed', message: e.message });
  }
});

app.get('/api/imgproxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing query param: url');
  try {
    const r = await upstreamFetch(`/api/imgproxy?url=${encodeURIComponent(url)}`, { binary: true });
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(r.status).send(buf);
  } catch (e) {
    res.status(502).send('Upstream fetch failed');
  }
});

// SPA fallback — only needed if you add client-side routes later; harmless now.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`StreamSimple running on port ${PORT}`);
});
