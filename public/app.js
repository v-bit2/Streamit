// NOTE: the exact shape of the upstream JSON responses hasn't been verified
// live (the sandbox that built this couldn't reach the API to test). This
// file is defensive about field names — it tries several common possibilities
// for id/title/poster/items, and logs the raw response to the console so you
// can see exactly what came back and tighten these up if something's blank.

const els = {
  statusBar: document.getElementById('statusBar'),
  homeView: document.getElementById('homeView'),
  searchView: document.getElementById('searchView'),
  detailView: document.getElementById('detailView'),
  trendingGrid: document.getElementById('trendingGrid'),
  homepageGrid: document.getElementById('homepageGrid'),
  searchGrid: document.getElementById('searchGrid'),
  detailContent: document.getElementById('detailContent'),
  searchInput: document.getElementById('searchInput'),
  backBtn: document.getElementById('backBtn'),
  brandHome: document.getElementById('brandHome'),
};

function showStatus(msg) {
  els.statusBar.textContent = msg;
  els.statusBar.classList.remove('hidden');
}
function clearStatus() {
  els.statusBar.classList.add('hidden');
}

function showView(view) {
  els.homeView.classList.toggle('hidden', view !== 'home');
  els.searchView.classList.toggle('hidden', view !== 'search');
  els.detailView.classList.toggle('hidden', view !== 'detail');
}

async function api(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && (data.error || data.message)) || `Request failed (${res.status})`);
  }
  console.log('[api]', path, data);
  return data;
}

// --- Defensive field extraction -------------------------------------------

function extractItems(payload) {
  const r = payload && payload.results ? payload.results : payload;
  if (!r) return [];
  return (
    r.subjectList ||
    r.items ||
    r.list ||
    r.data ||
    (Array.isArray(r) ? r : []) ||
    []
  );
}

function itemId(item) {
  return item.id || item.subjectId || item._id || item.detailPath || '';
}
function itemTitle(item) {
  return item.title || item.name || item.subjectTitle || 'Untitled';
}
function itemPoster(item) {
  return item.cover || item.poster || item.thumbnail || item.image || item.pic || '';
}
function itemDetailPath(item) {
  return item.detailPath || item.detail_path || '';
}

// --- Rendering ---------------------------------------------------------

function renderGrid(container, items) {
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = '<div class="empty">Nothing here yet.</div>';
    return;
  }
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'card';
    const poster = itemPoster(item);
    card.innerHTML = `
      ${poster ? `<img src="${poster}" loading="lazy" onerror="this.src='/api/imgproxy?url=${encodeURIComponent(poster)}'" />` : '<div style="aspect-ratio:2/3;background:#1a1a22;"></div>'}
      <div class="title">${itemTitle(item)}</div>
    `;
    card.addEventListener('click', () => openDetail(item));
    container.appendChild(card);
  }
}

async function loadHome() {
  showView('home');
  clearStatus();
  try {
    const trending = await api('/api/trending');
    renderGrid(els.trendingGrid, extractItems(trending));
  } catch (e) {
    showStatus(`Couldn't load trending: ${e.message}`);
  }
  try {
    const homepage = await api('/api/homepage');
    renderGrid(els.homepageGrid, extractItems(homepage));
  } catch (e) {
    showStatus(`Couldn't load homepage feed: ${e.message}`);
  }
}

async function runSearch(query) {
  if (!query.trim()) return loadHome();
  showView('search');
  clearStatus();
  els.searchGrid.innerHTML = '<div class="empty">Searching…</div>';
  try {
    const results = await api(`/api/search?q=${encodeURIComponent(query)}`);
    renderGrid(els.searchGrid, extractItems(results));
  } catch (e) {
    showStatus(`Search failed: ${e.message}`);
    els.searchGrid.innerHTML = '';
  }
}

async function openDetail(item) {
  showView('detail');
  clearStatus();
  const id = itemId(item);
  const detailPath = itemDetailPath(item);
  els.detailContent.innerHTML = '<div class="empty">Loading…</div>';

  let info;
  try {
    const path = `/api/info?id=${encodeURIComponent(id)}${detailPath ? `&detailPath=${encodeURIComponent(detailPath)}` : ''}`;
    info = await api(path);
  } catch (e) {
    els.detailContent.innerHTML = `<div class="empty">Couldn't load title info: ${e.message}</div>`;
    return;
  }

  const data = (info && info.results) || info || {};
  const title = itemTitle({ ...item, ...data });
  const poster = itemPoster({ ...item, ...data });
  const description = data.description || data.desc || data.summary || '';

  els.detailContent.innerHTML = `
    <div class="detail-header">
      <div class="detail-poster">
        ${poster ? `<img src="${poster}" onerror="this.src='/api/imgproxy?url=${encodeURIComponent(poster)}'" />` : ''}
      </div>
      <div class="detail-meta">
        <h1>${title}</h1>
        <p>${description}</p>
        <button class="play-btn" id="playBtn">▶ Play</button>
      </div>
    </div>
    <div class="player-wrap" id="playerWrap"></div>
  `;

  document.getElementById('playBtn').addEventListener('click', () => loadSources(id, detailPath));
}

async function loadSources(id, detailPath) {
  const wrap = document.getElementById('playerWrap');
  wrap.innerHTML = '<div class="empty">Fetching stream…</div>';
  try {
    const path = `/api/sources?id=${encodeURIComponent(id)}${detailPath ? `&detailPath=${encodeURIComponent(detailPath)}` : ''}`;
    const sources = await api(path);
    renderPlayer(wrap, sources);
  } catch (e) {
    wrap.innerHTML = `<div class="empty">Couldn't load stream: ${e.message}</div>`;
  }
}

function findStreamUrl(obj, depth = 0) {
  if (!obj || depth > 4) return null;
  if (typeof obj === 'string') {
    if (/\.(m3u8|mp4)(\?|$)/i.test(obj)) return obj;
    return null;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const found = findStreamUrl(v, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === 'object') {
    for (const key of ['url', 'm3u8', 'hls', 'src', 'stream', 'link', 'playUrl']) {
      if (obj[key] && typeof obj[key] === 'string') {
        const found = findStreamUrl(obj[key], depth + 1);
        if (found) return found;
      }
    }
    for (const v of Object.values(obj)) {
      const found = findStreamUrl(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function findEmbedUrl(obj, depth = 0) {
  if (!obj || depth > 4) return null;
  if (typeof obj === 'string' && /^https?:\/\//.test(obj) && /embed|player/i.test(obj)) return obj;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const found = findEmbedUrl(v, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === 'object') {
    for (const key of ['embed', 'iframe', 'embedUrl']) {
      if (obj[key]) {
        const found = findEmbedUrl(obj[key], depth + 1);
        if (found) return found;
      }
    }
    for (const v of Object.values(obj || {})) {
      const found = findEmbedUrl(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function renderPlayer(wrap, sources) {
  const streamUrl = findStreamUrl(sources);
  const embedUrl = !streamUrl ? findEmbedUrl(sources) : null;

  if (streamUrl) {
    wrap.innerHTML = `<video src="${streamUrl}" controls autoplay playsinline></video>`;
    return;
  }
  if (embedUrl) {
    wrap.innerHTML = `<iframe src="${embedUrl}" allowfullscreen></iframe>`;
    return;
  }
  // Couldn't confidently find a playable URL — show the raw response so you
  // can see the real field name and we can fix findStreamUrl() for it.
  wrap.innerHTML = `
    <div class="empty">Couldn't automatically detect a playable URL. Raw response below — check the console too.</div>
    <div class="raw-debug">${escapeHtml(JSON.stringify(sources, null, 2))}</div>
  `;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// --- Wiring --------------------------------------------------------------

let searchDebounce;
els.searchInput.addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const value = e.target.value;
  searchDebounce = setTimeout(() => runSearch(value), 400);
});

els.backBtn.addEventListener('click', loadHome);
els.brandHome.addEventListener('click', () => {
  els.searchInput.value = '';
  loadHome();
});

loadHome();
